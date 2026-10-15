# Tic-Tac-Toe AI

A browser tic-tac-toe game played on boards from 3 × 3 up to 7 × 7, with a
configurable number of marks in a row needed to win. The AI uses alpha-beta
search, can't be beaten on 3 × 3 and plays strongly on larger boards.

No frameworks and no build step: plain ES modules, a Web Worker and CSS.

## Features

- **Any board from 3 × 3 to 7 × 7.** You also choose how many marks in a row
  win, e.g. four in a row on 5 × 5.
- **Choose your side.** Play X or O, and pick whether you or the AI moves first.
- **Four difficulty levels.** Easy and Medium make deliberate mistakes; Hard
  and Unbeatable search as deep as their time budget allows.
- **Never freezes the page.** The AI runs in a Web Worker.
- **Polished UI.** Animated marks, a highlighted winning line, a running score,
  light and dark themes, keyboard play (arrow keys + Enter) and screen-reader
  labels.

## Running it

ES modules and workers don't load from `file://`, so serve the folder:

```bash
npm start          # zero-dependency server on http://localhost:8080
```

Any other static server works too, and so does GitHub Pages.

## Tests

```bash
npm test
```

The suite uses Node's built-in `node:test` runner, so there's nothing to
install. Among other things it plays the AI against **every possible opponent
line on 3 × 3**, from both sides, and checks that it never loses. CI runs it on
Node 20 and 22.

## How the AI works

[`src/ai.js`](src/ai.js) implements **iterative-deepening negamax with
alpha-beta pruning**:

| Technique | Why |
| --- | --- |
| Alpha-beta pruning | Skips branches that can't change the result |
| Iterative deepening under a time budget | Always has a move ready; goes deeper when time allows |
| Zobrist-hashed transposition table | Reuses results for positions reached by different move orders |
| Move ordering (previous best move, line threats, blocks) | Strong moves first make pruning far more effective |
| Ply-adjusted win scores | Wins as quickly as possible and delays losses as long as possible |
| Neighbourhood move generation on 5 × 5+ | Only cells next to existing marks are considered, which keeps the branching factor manageable |
| Line-based static evaluation | Scores open lines geometrically by how full they are; lines with both marks are dead |

On 3 × 3 the search always reaches the end of the game, so it plays
perfectly. On larger boards it searches as deep as the difficulty's time budget
allows.

## Project layout

```
index.html            markup
style.css             theme, layout and animations
src/board.js          rules: N x N board, K-in-a-row lines, play/undo, status
src/ai.js             search, evaluation and difficulty presets
src/ai.worker.js      runs the AI off the main thread
src/storage.js        saves settings and score in localStorage
src/main.js           UI controller
scripts/serve.js      dev server
test/                 unit tests
```

The board keeps a running count of each player's marks in every line, so
checking for a win only looks at the lines through the last move, and the
evaluation never has to rescan the grid.

## License

MIT
