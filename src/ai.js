// Game-playing AI: iterative-deepening negamax with alpha-beta pruning,
// a Zobrist-hashed transposition table and heuristic move ordering.
//
// On 3x3 the search always reaches the end of the game, so the AI plays
// perfectly. Larger boards are too big to solve in a browser, so the search
// runs under a time budget and scores unfinished positions with a line-based
// heuristic.

import { X, O, EMPTY, opponent } from "./board.js";

export const WIN_SCORE = 1_000_000;
// Any score this close to WIN_SCORE means a forced result was found.
const WIN_THRESHOLD = WIN_SCORE - 1_000;

export const DIFFICULTIES = {
  easy: { maxDepth: 1, timeLimitMs: 150, blunderRate: 0.4 },
  medium: { maxDepth: 3, timeLimitMs: 300, blunderRate: 0.15 },
  hard: { maxDepth: Infinity, timeLimitMs: 600, blunderRate: 0 },
  unbeatable: { maxDepth: Infinity, timeLimitMs: 1500, blunderRate: 0 },
};

const EXACT = 0;
const LOWER_BOUND = 1;
const UPPER_BOUND = 2;
const MAX_TABLE_ENTRIES = 1_000_000;
const ABORT = Symbol("search aborted");

// ---------------------------------------------------------------------------
// Zobrist hashing
// ---------------------------------------------------------------------------

// Small deterministic PRNG so hash keys are reproducible across runs.
function mulberry32(seed) {
  return function next() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const zobristCache = new Map();

// Two 32-bit keys per (cell, mark). They are combined into a single 53-bit
// number so the hash can be used directly as a Map key without BigInt.
function zobristKeys(cellCount) {
  if (!zobristCache.has(cellCount)) {
    const random = mulberry32(cellCount * 7919);
    const keys = { [X]: [], [O]: [] };
    for (let i = 0; i < cellCount; i++) {
      keys[X].push([random(), random() & 0x1fffff]);
      keys[O].push([random(), random() & 0x1fffff]);
    }
    zobristCache.set(cellCount, keys);
  }
  return zobristCache.get(cellCount);
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

// weights[n] = value of an open line holding n of one player's marks.
// Grows geometrically so one near-complete line outweighs many weak ones.
function lineWeights(winLength) {
  const weights = [0];
  for (let n = 1; n <= winLength; n++) weights.push(6 ** (n - 1));
  return weights;
}

// Static score of a position from the perspective of `mark` (the side to
// move). Lines containing both marks can never be won and score nothing.
export function evaluate(board, mark, weights = lineWeights(board.winLength)) {
  const mine = board.counts[mark];
  const theirs = board.counts[opponent(mark)];
  let score = 0;

  for (let line = 0; line < mine.length; line++) {
    if (theirs[line] === 0) score += weights[mine[line]];
    else if (mine[line] === 0) score -= weights[theirs[line]];
  }

  // Having the move is worth something: it lets you extend a line first.
  return score > 0 ? Math.round(score * 1.25) : score;
}

// ---------------------------------------------------------------------------
// Move generation and ordering
// ---------------------------------------------------------------------------

// On 3x3 and 4x4 every empty cell is considered. On larger boards only cells
// next to an existing mark are worth looking at, which cuts the branching
// factor dramatically without missing any meaningful move.
export function candidateMoves(board) {
  const { size, cells } = board;
  if (board.moveCount === 0) {
    const mid = Math.floor(size / 2);
    return [board.index(mid, mid)];
  }
  if (size <= 4) return board.emptyCells();

  const result = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== EMPTY) continue;
    const row = Math.floor(i / size);
    const col = i % size;
    let nearMark = false;
    for (let dr = -1; dr <= 1 && !nearMark; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < size && c >= 0 && c < size && cells[r * size + c] !== EMPTY) {
          nearMark = true;
          break;
        }
      }
    }
    if (nearMark) result.push(i);
  }
  return result;
}

// Rough "how useful is this cell" score: extending your own open lines and
// blocking the opponent's. Used only for ordering, so speed beats precision.
function movePriority(board, cell, mark, weights) {
  const mine = board.counts[mark];
  const theirs = board.counts[opponent(mark)];
  let score = 0;
  for (const line of board.linesByCell[cell]) {
    if (theirs[line] === 0) score += weights[mine[line] + 1];
    if (mine[line] === 0) score += weights[theirs[line] + 1] * 0.9;
  }
  return score;
}

function orderMoves(board, moves, mark, weights, firstMove) {
  return moves
    .map((move) => ({
      move,
      priority: move === firstMove ? Infinity : movePriority(board, move, mark, weights),
    }))
    .sort((a, b) => b.priority - a.priority)
    .map((entry) => entry.move);
}

function shuffle(array, random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

class Search {
  constructor(board, { deadline, now }) {
    this.board = board;
    this.deadline = deadline;
    this.now = now;
    this.weights = lineWeights(board.winLength);
    this.zobrist = zobristKeys(board.cellCount);
    this.table = new Map();
    this.nodes = 0;
    this.rootMoveCount = board.moveCount;

    this.hashLow = 0;
    this.hashHigh = 0;
    board.cells.forEach((mark, cell) => {
      if (mark !== EMPTY) this.toggle(cell, mark);
    });
  }

  get hash() {
    return this.hashLow + this.hashHigh * 4294967296;
  }

  toggle(cell, mark) {
    const [low, high] = this.zobrist[mark][cell];
    this.hashLow = (this.hashLow ^ low) >>> 0;
    this.hashHigh ^= high;
  }

  play(cell, mark) {
    this.board.play(cell, mark);
    this.toggle(cell, mark);
  }

  undo(cell, mark) {
    this.board.undo(cell);
    this.toggle(cell, mark);
  }

  // Returns the score for `mark`, the side to move. Win scores are offset by
  // ply so faster wins (and slower losses) are preferred. In tic-tac-toe a
  // position's ply is fixed by how many marks are on the board, so these
  // scores are safe to share through the transposition table.
  negamax(depth, alpha, beta, mark) {
    const board = this.board;
    const ply = board.moveCount - this.rootMoveCount;

    if ((++this.nodes & 1023) === 0 && this.now() > this.deadline) throw ABORT;

    // The previous move (by our opponent) completed a line.
    if (board.winningLine !== -1) return -(WIN_SCORE - ply);
    if (board.isFull()) return 0;
    if (depth === 0) return evaluate(board, mark, this.weights);

    const key = this.hash;
    const entry = this.table.get(key);
    const alphaOriginal = alpha;

    if (entry && entry.depth >= depth) {
      if (entry.flag === EXACT) return entry.score;
      if (entry.flag === LOWER_BOUND) alpha = Math.max(alpha, entry.score);
      else beta = Math.min(beta, entry.score);
      if (alpha >= beta) return entry.score;
    }

    const moves = orderMoves(board, candidateMoves(board), mark, this.weights, entry?.bestMove);
    const next = opponent(mark);
    let bestScore = -Infinity;
    let bestMove = moves[0];

    for (const move of moves) {
      this.play(move, mark);
      let score;
      try {
        score = -this.negamax(depth - 1, -beta, -alpha, next);
      } finally {
        this.undo(move, mark);
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }

    if (this.table.size >= MAX_TABLE_ENTRIES) this.table.clear();
    const flag = bestScore <= alphaOriginal ? UPPER_BOUND : bestScore >= beta ? LOWER_BOUND : EXACT;
    this.table.set(key, { depth, score: bestScore, flag, bestMove });

    return bestScore;
  }

  // Searches every root move to `depth` and returns the best one.
  searchRoot(moves, depth, mark) {
    const next = opponent(mark);
    let alpha = -Infinity;
    let best = { move: moves[0], score: -Infinity };

    for (const move of moves) {
      this.play(move, mark);
      let score;
      try {
        score = -this.negamax(depth - 1, -Infinity, -alpha, next);
      } finally {
        this.undo(move, mark);
      }
      if (score > best.score) best = { move, score };
      if (score > alpha) alpha = score;
    }
    return best;
  }
}

/**
 * Picks a move for `mark` on `board`. The board is left unchanged.
 *
 * @param {import("./board.js").Board} board
 * @param {"X" | "O"} mark side to move
 * @param {object} [options]
 * @param {keyof DIFFICULTIES} [options.difficulty]
 * @param {number} [options.maxDepth] overrides the difficulty preset
 * @param {number} [options.timeLimitMs] overrides the difficulty preset
 * @param {() => number} [options.random] injectable for deterministic tests
 * @returns {{ index: number, score: number, depth: number, nodes: number, elapsedMs: number }}
 */
export function findBestMove(board, mark, options = {}) {
  const preset = DIFFICULTIES[options.difficulty ?? "unbeatable"];
  if (!preset) throw new Error(`Unknown difficulty: ${options.difficulty}`);

  const maxDepth = options.maxDepth ?? preset.maxDepth;
  const timeLimitMs = options.timeLimitMs ?? preset.timeLimitMs;
  const random = options.random ?? Math.random;
  const now = options.now ?? (() => performance.now());

  if (board.status().state !== "playing") throw new Error("Game is already over");

  const started = now();
  const search = new Search(board.clone(), { deadline: started + timeLimitMs, now });

  // Shuffling before the (stable) priority sort breaks ties randomly, so
  // equally good openings vary from game to game.
  let rootMoves = orderMoves(board, shuffle(candidateMoves(board), random), mark, search.weights);

  if (random() < preset.blunderRate && options.maxDepth === undefined) {
    const index = rootMoves[Math.floor(random() * rootMoves.length)];
    return { index, score: 0, depth: 0, nodes: 0, elapsedMs: now() - started };
  }

  // Nothing to decide, e.g. the opening move on a large board.
  if (rootMoves.length === 1) {
    return { index: rootMoves[0], score: 0, depth: 0, nodes: 0, elapsedMs: now() - started };
  }

  const remaining = board.cellCount - board.moveCount;
  const depthLimit = Math.min(maxDepth, remaining);
  let result = { move: rootMoves[0], score: 0 };
  let completedDepth = 0;

  for (let depth = 1; depth <= depthLimit; depth++) {
    try {
      result = search.searchRoot(rootMoves, depth, mark);
    } catch (error) {
      if (error !== ABORT) throw error;
      break;
    }
    completedDepth = depth;

    // Search the previous best move first next time; it makes pruning far
    // more effective.
    rootMoves = [result.move, ...rootMoves.filter((move) => move !== result.move)];

    // A forced win or loss won't change with deeper search.
    if (Math.abs(result.score) >= WIN_THRESHOLD) break;
  }

  return {
    index: result.move,
    score: result.score,
    depth: completedDepth,
    nodes: search.nodes,
    elapsedMs: now() - started,
  };
}
