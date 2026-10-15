// Runs the search off the main thread so the page stays responsive while the
// AI thinks on larger boards.

import { Board } from "./board.js";
import { findBestMove } from "./ai.js";

self.addEventListener("message", ({ data }) => {
  const { requestId, cells, winLength, mark, difficulty } = data;
  try {
    const board = Board.fromCells(cells, winLength);
    const result = findBestMove(board, mark, { difficulty });
    self.postMessage({ requestId, ...result });
  } catch (error) {
    self.postMessage({ requestId, error: error.message });
  }
});
