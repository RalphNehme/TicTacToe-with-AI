// Core game rules for an N x N board where K marks in a row win.
//
// The board is stored as a flat array and keeps per-line mark counts up to
// date on every play/undo. That makes win detection O(lines through a cell)
// and gives the AI cheap access to line state for its evaluation.

export const X = "X";
export const O = "O";
export const EMPTY = null;

export const MIN_SIZE = 3;
export const MAX_SIZE = 7;

export function opponent(mark) {
  return mark === X ? O : X;
}

// Sensible default win length for each board size; mirrors common variants
// (e.g. 5x5 four-in-a-row) and keeps larger boards from always ending drawn.
export function defaultWinLength(size) {
  if (size <= 3) return 3;
  if (size <= 5) return 4;
  return 5;
}

const lineCache = new Map();

// Every horizontal, vertical and diagonal window of `winLength` cells.
export function computeLines(size, winLength) {
  const key = `${size}:${winLength}`;
  if (lineCache.has(key)) return lineCache.get(key);

  const lines = [];
  const directions = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal
    [1, -1], // anti-diagonal
  ];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      for (const [dr, dc] of directions) {
        const endRow = row + dr * (winLength - 1);
        const endCol = col + dc * (winLength - 1);
        if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;

        const line = [];
        for (let step = 0; step < winLength; step++) {
          line.push((row + dr * step) * size + (col + dc * step));
        }
        lines.push(line);
      }
    }
  }

  lineCache.set(key, lines);
  return lines;
}

export class Board {
  constructor(size = 3, winLength = defaultWinLength(size)) {
    if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
      throw new RangeError(`Board size must be between ${MIN_SIZE} and ${MAX_SIZE}`);
    }
    if (!Number.isInteger(winLength) || winLength < 3 || winLength > size) {
      throw new RangeError(`Win length must be between 3 and the board size (${size})`);
    }

    this.size = size;
    this.winLength = winLength;
    this.cells = new Array(size * size).fill(EMPTY);
    this.moveCount = 0;

    this.lines = computeLines(size, winLength);
    this.linesByCell = Array.from({ length: size * size }, () => []);
    this.lines.forEach((line, lineIndex) => {
      for (const cell of line) this.linesByCell[cell].push(lineIndex);
    });
    this.counts = { [X]: new Int8Array(this.lines.length), [O]: new Int8Array(this.lines.length) };

    // Index of the line completed by the most recent move, or -1.
    this.winningLine = -1;
  }

  static fromCells(cells, winLength) {
    const size = Math.round(Math.sqrt(cells.length));
    if (size * size !== cells.length) throw new RangeError("Cells must form a square board");
    const board = new Board(size, winLength);
    cells.forEach((mark, index) => {
      if (mark !== EMPTY) board.play(index, mark);
    });
    return board;
  }

  clone() {
    return Board.fromCells(this.cells, this.winLength);
  }

  get cellCount() {
    return this.cells.length;
  }

  index(row, col) {
    return row * this.size + col;
  }

  isEmpty(index) {
    return this.cells[index] === EMPTY;
  }

  isFull() {
    return this.moveCount === this.cells.length;
  }

  emptyCells() {
    const result = [];
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === EMPTY) result.push(i);
    }
    return result;
  }

  play(index, mark) {
    if (mark !== X && mark !== O) throw new TypeError(`Invalid mark: ${mark}`);
    if (!this.isEmpty(index)) throw new Error(`Cell ${index} is already taken`);
    if (this.winningLine !== -1) throw new Error("Game is already over");

    this.cells[index] = mark;
    this.moveCount++;

    const counts = this.counts[mark];
    for (const lineIndex of this.linesByCell[index]) {
      if (++counts[lineIndex] === this.winLength) this.winningLine = lineIndex;
    }
  }

  // Reverts a play(). Only valid for the most recent move, which is how the
  // search uses it.
  undo(index) {
    const mark = this.cells[index];
    if (mark === EMPTY) throw new Error(`Cell ${index} is empty`);

    this.cells[index] = EMPTY;
    this.moveCount--;
    this.winningLine = -1;

    const counts = this.counts[mark];
    for (const lineIndex of this.linesByCell[index]) counts[lineIndex]--;
  }

  // { state: "playing" | "won" | "draw", winner?: mark, line?: cell indices }
  status() {
    if (this.winningLine !== -1) {
      const line = this.lines[this.winningLine];
      return { state: "won", winner: this.cells[line[0]], line };
    }
    if (this.isFull()) return { state: "draw" };
    return { state: "playing" };
  }
}
