// UI controller: owns the current game, renders the board and hands AI turns
// to a Web Worker.

import { Board, X, O, MIN_SIZE, defaultWinLength, opponent } from "./board.js";

// The AI answers instantly on small boards; a short pause reads better.
const MIN_THINK_MS = 350;

const form = document.getElementById("settings");
const sizeSelect = document.getElementById("size");
const winLengthSelect = document.getElementById("winLength");
const statusEl = document.getElementById("status");
const boardEl = document.getElementById("board");

const worker = new Worker(new URL("./ai.worker.js", import.meta.url), { type: "module" });

let game = null;
let nextRequestId = 0;

function readSettings() {
  const data = new FormData(form);
  return {
    size: Number(data.get("size")),
    winLength: Number(data.get("winLength")),
    humanMark: data.get("humanMark"),
    firstPlayer: data.get("firstPlayer"),
    difficulty: data.get("difficulty"),
  };
}

function populateWinLengths(size, preferred) {
  const value = preferred >= MIN_SIZE && preferred <= size ? preferred : defaultWinLength(size);
  winLengthSelect.replaceChildren(
    ...Array.from({ length: size - MIN_SIZE + 1 }, (_, i) => {
      const length = MIN_SIZE + i;
      return new Option(String(length), String(length), false, length === value);
    }),
  );
}

function newGame() {
  const settings = readSettings();
  const aiMark = opponent(settings.humanMark);

  game = {
    settings,
    board: new Board(settings.size, settings.winLength),
    humanMark: settings.humanMark,
    aiMark,
    turn: settings.firstPlayer === "human" ? settings.humanMark : aiMark,
    requestId: null,
  };

  buildBoard();
  update();
  if (game.turn === game.aiMark) requestAiMove();
}

function buildBoard() {
  const { size } = game.board;
  boardEl.style.setProperty("--size", size);
  boardEl.replaceChildren(
    ...Array.from({ length: size * size }, (_, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.index = index;
      return cell;
    }),
  );
}

function describeCell(index, mark) {
  const { size } = game.board;
  const row = Math.floor(index / size) + 1;
  const col = (index % size) + 1;
  return `Row ${row}, column ${col}: ${mark ?? "empty"}`;
}

function update() {
  const { board, humanMark, aiMark, turn } = game;
  const status = board.status();
  const humansTurn = status.state === "playing" && turn === humanMark && game.requestId === null;
  const winningCells = new Set(status.line ?? []);

  boardEl.querySelectorAll(".cell").forEach((cell) => {
    const index = Number(cell.dataset.index);
    const mark = board.cells[index];
    cell.textContent = mark ?? "";
    cell.dataset.mark = mark ?? "";
    cell.classList.toggle("winning", winningCells.has(index));
    // aria-disabled (not disabled) keeps cells focusable for keyboard play.
    cell.setAttribute("aria-disabled", String(!humansTurn || mark !== null));
    cell.setAttribute("aria-label", describeCell(index, mark));
  });

  if (status.state === "won") {
    statusEl.textContent = status.winner === humanMark ? "You win!" : "The AI wins.";
  } else if (status.state === "draw") {
    statusEl.textContent = "It's a draw.";
  } else if (turn === aiMark) {
    statusEl.textContent = `AI (${aiMark}) is thinking…`;
  } else {
    statusEl.textContent = `Your turn (${humanMark})`;
  }
}

function applyMove(index, mark) {
  game.board.play(index, mark);
  game.turn = opponent(mark);
  update();
  if (game.board.status().state === "playing" && game.turn === game.aiMark) requestAiMove();
}

function requestAiMove() {
  const requestId = ++nextRequestId;
  const startedAt = performance.now();
  game.requestId = requestId;
  update();

  const currentGame = game;
  const onMessage = ({ data }) => {
    if (data.requestId !== requestId) return;
    worker.removeEventListener("message", onMessage);

    // Ignore answers for a game that was restarted while the AI was thinking.
    if (currentGame !== game) return;

    if (data.error) {
      statusEl.textContent = `AI error: ${data.error}`;
      return;
    }

    const delay = Math.max(0, MIN_THINK_MS - (performance.now() - startedAt));
    setTimeout(() => {
      if (currentGame !== game) return;
      game.requestId = null;
      applyMove(data.index, game.aiMark);
    }, delay);
  };

  worker.addEventListener("message", onMessage);
  worker.postMessage({
    requestId,
    cells: game.board.cells,
    winLength: game.board.winLength,
    mark: game.aiMark,
    difficulty: game.settings.difficulty,
  });
}

boardEl.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell || cell.getAttribute("aria-disabled") === "true") return;
  applyMove(Number(cell.dataset.index), game.humanMark);
});

// Arrow keys move focus around the grid.
boardEl.addEventListener("keydown", (event) => {
  const offsets = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  const offset = offsets[event.key];
  const cell = event.target.closest(".cell");
  if (!offset || !cell) return;

  event.preventDefault();
  const { size } = game.board;
  const index = Number(cell.dataset.index);
  const row = Math.min(size - 1, Math.max(0, Math.floor(index / size) + offset[0]));
  const col = Math.min(size - 1, Math.max(0, (index % size) + offset[1]));
  boardEl.children[row * size + col].focus();
});

sizeSelect.addEventListener("change", () => {
  populateWinLengths(Number(sizeSelect.value));
});

// Any settings change restarts the game with the new rules.
form.addEventListener("change", newGame);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  newGame();
});

populateWinLengths(Number(sizeSelect.value));
newGame();
