import { test } from "node:test";
import assert from "node:assert/strict";

import { isValidSettings } from "../src/storage.js";

const valid = { size: 5, winLength: 4, humanMark: "O", firstPlayer: "ai", difficulty: "hard" };

test("accepts well-formed settings", () => {
  assert.equal(isValidSettings(valid), true);
});

test("rejects corrupted or out-of-range settings", () => {
  assert.equal(isValidSettings(null), false);
  assert.equal(isValidSettings({ ...valid, size: 9 }), false);
  assert.equal(isValidSettings({ ...valid, winLength: 6 }), false);
  assert.equal(isValidSettings({ ...valid, humanMark: "Z" }), false);
  assert.equal(isValidSettings({ ...valid, firstPlayer: "nobody" }), false);
  assert.equal(isValidSettings({ ...valid, difficulty: "toString" }), false);
});
