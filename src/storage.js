// Persists settings and the running score in localStorage. Storage can be
// unavailable (private browsing, blocked cookies), so every access is guarded
// and the game works without it.

import { X, O, MIN_SIZE, MAX_SIZE } from "./board.js";
import { DIFFICULTIES } from "./ai.js";

const SETTINGS_KEY = "tictactoe.settings.v1";
const SCORE_KEY = "tictactoe.score.v1";

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore: persistence is a convenience, not a requirement.
  }
}

export function isValidSettings(settings) {
  if (!settings || typeof settings !== "object") return false;
  const { size, winLength, humanMark, firstPlayer, difficulty } = settings;
  return (
    Number.isInteger(size) &&
    size >= MIN_SIZE &&
    size <= MAX_SIZE &&
    Number.isInteger(winLength) &&
    winLength >= 3 &&
    winLength <= size &&
    (humanMark === X || humanMark === O) &&
    (firstPlayer === "human" || firstPlayer === "ai") &&
    Object.hasOwn(DIFFICULTIES, difficulty)
  );
}

export function loadSettings() {
  const settings = read(SETTINGS_KEY);
  return isValidSettings(settings) ? settings : null;
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}

export function loadScore() {
  const score = read(SCORE_KEY);
  const valid = score && ["human", "draw", "ai"].every((key) => Number.isInteger(score[key]) && score[key] >= 0);
  return valid ? score : { human: 0, draw: 0, ai: 0 };
}

export function saveScore(score) {
  write(SCORE_KEY, score);
}
