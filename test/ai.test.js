import { test } from "node:test";
import assert from "node:assert/strict";

import { Board, X, O, opponent } from "../src/board.js";
import { findBestMove, evaluate, candidateMoves } from "../src/ai.js";

// Deterministic stand-in for Math.random.
function seeded(seed = 42) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const _ = null;

test("takes an immediate win", () => {
  // X X _ / O O _ / _ _ _  -> X to move should play 2
  const board = Board.fromCells([X, X, _, O, O, _, _, _, _]);
  assert.equal(findBestMove(board, X, { random: seeded() }).index, 2);
});

test("blocks an immediate loss", () => {
  // O O _ / _ X _ / X _ _  -> O threatens 2, X must block
  const board = Board.fromCells([O, O, _, _, X, _, X, _, _]);
  assert.equal(findBestMove(board, X, { random: seeded() }).index, 2);
});

test("prefers winning now over winning later", () => {
  // X can win at 2 immediately, or set up other wins; must take the fast one.
  const board = Board.fromCells([X, X, _, _, X, O, O, _, O]);
  const result = findBestMove(board, X, { random: seeded() });
  assert.ok([2, 7].includes(result.index), `expected an immediate win, got ${result.index}`);
  const after = board.clone();
  after.play(result.index, X);
  assert.equal(after.status().winner, X);
});

test("does not modify the board it is given", () => {
  const board = Board.fromCells([X, _, _, _, O, _, _, _, _]);
  const before = [...board.cells];
  findBestMove(board, X, { random: seeded() });
  assert.deepEqual(board.cells, before);
});

test("perfect play on 3x3 is a draw", () => {
  const board = new Board(3);
  let mark = X;
  while (board.status().state === "playing") {
    board.play(findBestMove(board, mark, { random: seeded() }).index, mark);
    mark = opponent(mark);
  }
  assert.equal(board.status().state, "draw");
});

// Plays every possible opponent line against the AI and checks it never loses.
function assertNeverLoses(aiMark) {
  let gamesPlayed = 0;

  function explore(board, toMove) {
    const status = board.status();
    if (status.state !== "playing") {
      gamesPlayed++;
      assert.notEqual(status.winner, opponent(aiMark), `AI lost: ${board.cells.map((c) => c ?? ".").join("")}`);
      return;
    }
    if (toMove === aiMark) {
      const { index } = findBestMove(board, aiMark, { random: seeded() });
      board.play(index, aiMark);
      explore(board, opponent(toMove));
      board.undo(index);
    } else {
      for (const cell of board.emptyCells()) {
        board.play(cell, toMove);
        explore(board, opponent(toMove));
        board.undo(cell);
      }
    }
  }

  explore(new Board(3), X);
  return gamesPlayed;
}

test("never loses on 3x3 when moving first", () => {
  assert.ok(assertNeverLoses(X) > 0);
});

test("never loses on 3x3 when moving second", () => {
  assert.ok(assertNeverLoses(O) > 0);
});

test("finds and blocks wins on a 5x5 four-in-a-row board", () => {
  const win = new Board(5, 4);
  [0, 1, 2].forEach((cell) => win.play(cell, O));
  [12, 13, 18].forEach((cell) => win.play(cell, X));
  // O can complete the top row at cell 3.
  assert.equal(findBestMove(win, O, { random: seeded(), timeLimitMs: 300 }).index, 3);

  // With X to move instead, X must block at 3.
  assert.equal(findBestMove(win, X, { random: seeded(), timeLimitMs: 300 }).index, 3);
});

test("stays within its time budget on a 7x7 board", () => {
  const board = new Board(7, 5);
  [24, 25, 17].forEach((cell) => board.play(cell, X));
  [31, 18, 23].forEach((cell) => board.play(cell, O));
  const result = findBestMove(board, X, { random: seeded(), timeLimitMs: 200 });
  assert.ok(board.isEmpty(result.index));
  assert.ok(result.elapsedMs < 400, `took ${result.elapsedMs}ms`);
  assert.ok(result.depth >= 2, `only reached depth ${result.depth}`);
});

test("evaluate favours the side with stronger open lines", () => {
  const board = new Board(5, 4);
  [6, 7, 8].forEach((cell) => board.play(cell, X));
  board.play(24, O);
  assert.ok(evaluate(board, X) > 0);
  assert.ok(evaluate(board, O) < 0);
});

test("candidateMoves stays near existing marks on large boards", () => {
  const board = new Board(7, 5);
  assert.deepEqual(candidateMoves(board), [24]); // empty board: centre only
  board.play(0, X);
  assert.deepEqual(candidateMoves(board).sort((a, b) => a - b), [1, 7, 8]);
});
