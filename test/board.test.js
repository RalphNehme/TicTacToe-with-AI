import { test } from "node:test";
import assert from "node:assert/strict";

import { Board, X, O, computeLines, defaultWinLength, opponent } from "../src/board.js";

test("computeLines counts every winning window", () => {
  // 3x3: 3 rows + 3 cols + 2 diagonals
  assert.equal(computeLines(3, 3).length, 8);
  // 4x4, 3 in a row: 8 horizontal + 8 vertical + 4 + 4 diagonal
  assert.equal(computeLines(4, 3).length, 24);
  // 5x5, 4 in a row: 10 + 10 + 4 + 4
  assert.equal(computeLines(5, 4).length, 28);
});

test("defaultWinLength scales with board size", () => {
  assert.equal(defaultWinLength(3), 3);
  assert.equal(defaultWinLength(4), 4);
  assert.equal(defaultWinLength(5), 4);
  assert.equal(defaultWinLength(7), 5);
});

test("opponent flips marks", () => {
  assert.equal(opponent(X), O);
  assert.equal(opponent(O), X);
});

test("rejects invalid dimensions", () => {
  assert.throws(() => new Board(2), RangeError);
  assert.throws(() => new Board(8), RangeError);
  assert.throws(() => new Board(4, 5), RangeError);
  assert.throws(() => new Board(4, 2), RangeError);
});

test("detects row, column and diagonal wins", () => {
  const cases = [
    [0, 1, 2],
    [0, 3, 6],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const cells of cases) {
    const board = new Board(3);
    cells.forEach((cell) => board.play(cell, X));
    const status = board.status();
    assert.equal(status.state, "won");
    assert.equal(status.winner, X);
    assert.deepEqual([...status.line].sort(), [...cells].sort());
  }
});

test("detects a draw on a full board", () => {
  // X O X / X O O / O X X
  const board = Board.fromCells([X, O, X, X, O, O, O, X, X]);
  assert.deepEqual(board.status(), { state: "draw" });
});

test("supports K-in-a-row on larger boards", () => {
  const board = new Board(5, 4);
  [6, 12, 18].forEach((cell) => board.play(cell, O));
  assert.equal(board.status().state, "playing");
  board.play(24, O);
  assert.equal(board.status().winner, O);
});

test("undo restores the exact previous state", () => {
  const board = new Board(3);
  board.play(0, X);
  board.play(1, X);
  const before = JSON.stringify({ cells: board.cells, x: [...board.counts[X]] });

  board.play(2, X);
  assert.equal(board.status().state, "won");
  board.undo(2);

  assert.equal(board.status().state, "playing");
  assert.equal(JSON.stringify({ cells: board.cells, x: [...board.counts[X]] }), before);
});

test("refuses moves on taken cells or after the game ends", () => {
  const board = new Board(3);
  board.play(4, X);
  assert.throws(() => board.play(4, O));
  [0, 1, 2].forEach((cell) => board.play(cell, O));
  assert.throws(() => board.play(8, X), /over/);
});

test("clone is independent of the original", () => {
  const board = new Board(4, 3);
  board.play(5, X);
  const copy = board.clone();
  copy.play(6, O);
  assert.equal(board.isEmpty(6), true);
  assert.equal(copy.winLength, 3);
});
