// UI controller: owns the current game, renders the board and hands AI turns
// to a Web Worker.

import { Board, X, MIN_SIZE, defaultWinLength, opponent } from "./board.js";
import { loadSettings, saveSettings, loadScore, saveScore } from "./storage.js";

// The AI answers instantly on small boards; a short pause reads better.
const MIN_THINK_MS = 350;

const SVG_NS = "http://www.w3.org/2000/svg";

const form = document.getElementById("settings");
const sizeSelect = document.getElementById("size");
const winLengthSelect = document.getElementById("winLength");
const statusEl = document.getElementById("status");
const boardEl = document.getElementById("board");
const resetScoreButton = document.getElementById("resetScore");
const scoreEls = {
  human: document.getElementById("score-human"),
  draw: document.getElementById("score-draw"),
  ai: document.getElementById("score-ai"),
};

const worker = new Worker(new URL("./ai.worker.js", import.meta.url), { type: "module" });

let game = null;
let score = loadScore();
let nextRequestId = 0;

// ------------------------------------------------------------------ settings

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

function applySettingsToForm(settings) {
  sizeSelect.value = String(settings.size);
  populateWinLengths(settings.size, settings.winLength);
  form.elements.difficulty.value = settings.difficulty;
  form.elements.humanMark.value = settings.humanMark;
  form.elements.firstPlayer.value = settings.firstPlayer;
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

// --------------------------------------------------------------------- game

function newGame() {
  const settings = readSettings();
  saveSettings(settings);
  const aiMark = opponent(settings.humanMark);

  game = {
    settings,
    board: new Board(settings.size, settings.winLength),
    humanMark: settings.humanMark,
    aiMark,
    turn: settings.firstPlayer === "human" ? settings.humanMark : aiMark,
    lastMove: null,
    requestId: null,
  };

  document.getElementById("humanMarkLabel").textContent = game.humanMark;
  document.getElementById("aiMarkLabel").textContent = game.aiMark;
  document.documentElement.style.setProperty("--human-color", `var(--${game.humanMark.toLowerCase()})`);
  document.documentElement.style.setProperty("--ai-color", `var(--${aiMark.toLowerCase()})`);

  buildBoard();
  update();
  if (game.turn === game.aiMark) requestAiMove();
}

function applyMove(index, mark) {
  game.board.play(index, mark);
  game.turn = opponent(mark);
  game.lastMove = index;

  const status = game.board.status();
  if (status.state !== "playing") recordResult(status);

  update();
  if (status.state === "playing" && game.turn === game.aiMark) requestAiMove();
}

function recordResult(status) {
  const key = status.state === "draw" ? "draw" : status.winner === game.humanMark ? "human" : "ai";
  score = { ...score, [key]: score[key] + 1 };
  saveScore(score);
  renderScore(key);
}

// ---------------------------------------------------------------- rendering

function buildBoard() {
  const { size } = game.board;
  boardEl.style.setProperty("--size", size);
  boardEl.replaceChildren(
    ...Array.from({ length: size * size }, (_, index) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.index = index;
      cell.dataset.mark = "";
      return cell;
    }),
  );
}

function createMark(mark) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("mark", `mark-${mark.toLowerCase()}`);

  // pathLength="1" lets the CSS draw-in animation work at any size.
  const shapes =
    mark === X
      ? [
          ["path", { d: "M18 18 L82 82" }],
          ["path", { d: "M82 18 L18 82" }],
        ]
      : [["circle", { cx: 50, cy: 50, r: 34 }]];

  for (const [tag, attributes] of shapes) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    shape.setAttribute("pathLength", "1");
    svg.append(shape);
  }
  return svg;
}

function describeCell(index, mark) {
  const { size } = game.board;
  const row = Math.floor(index / size) + 1;
  const col = (index % size) + 1;
  return `Row ${row}, column ${col}: ${mark ?? "empty"}`;
}

function markSpan(mark) {
  return `<span class="mark-${mark.toLowerCase()}">${mark}</span>`;
}

function update() {
  const { board, humanMark, aiMark, turn } = game;
  const status = board.status();
  const humansTurn = status.state === "playing" && turn === humanMark && game.requestId === null;
  const winningCells = new Set(status.line ?? []);

  boardEl.classList.toggle("game-over", status.state !== "playing");

  boardEl.querySelectorAll(".cell").forEach((cell) => {
    const index = Number(cell.dataset.index);
    const mark = board.cells[index];

    // Only touch the SVG when the mark changes so the draw-in animation
    // plays once.
    if (cell.dataset.mark !== (mark ?? "")) {
      cell.replaceChildren(...(mark ? [createMark(mark)] : []));
      cell.dataset.mark = mark ?? "";
    }

    cell.dataset.preview = humanMark;
    cell.classList.toggle("winning", winningCells.has(index));
    cell.classList.toggle("last-move", index === game.lastMove && status.state === "playing");
    // aria-disabled (not disabled) keeps cells focusable for keyboard play.
    cell.setAttribute("aria-disabled", String(!humansTurn || mark !== null));
    cell.setAttribute("aria-label", describeCell(index, mark));
  });

  statusEl.classList.toggle("thinking", status.state === "playing" && turn === aiMark);
  if (status.state === "won") {
    statusEl.innerHTML =
      status.winner === humanMark ? `You win with ${markSpan(humanMark)}!` : `${markSpan(aiMark)} wins. The AI takes it.`;
  } else if (status.state === "draw") {
    statusEl.textContent = "It's a draw.";
  } else if (turn === aiMark) {
    statusEl.innerHTML = `AI ${markSpan(aiMark)} is thinking`;
  } else {
    statusEl.innerHTML = `Your turn ${markSpan(humanMark)}`;
  }
}

function renderScore(changedKey) {
  for (const [key, el] of Object.entries(scoreEls)) {
    el.textContent = score[key];
    if (key === changedKey) {
      el.classList.remove("bump");
      void el.offsetWidth; // restart the animation
      el.classList.add("bump");
    }
  }
}

// ----------------------------------------------------------------------- AI

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

// ------------------------------------------------------------------- events

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

resetScoreButton.addEventListener("click", () => {
  score = { human: 0, draw: 0, ai: 0 };
  saveScore(score);
  renderScore();
});

const saved = loadSettings();
if (saved) applySettingsToForm(saved);
else populateWinLengths(Number(sizeSelect.value));
renderScore();
newGame();
