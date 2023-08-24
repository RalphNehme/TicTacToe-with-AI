function bestMove() {
  
  // AI to make its turn
  let bestScore = -Infinity;
  let move;
  //Looping through available spots on the board
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      // Checking if the spot is available
      if (board[i][j] == "") {
        board[i][j] = ai;
        //Calculating the score of the move
        let score = minimax(board, 0, false);
        //Undo the move and explore other possibilities
        board[i][j] = "";
        if (score > bestScore) {
          bestScore = score;
          move = { i, j };
        }
      }
    }
  }
  board[move.i][move.j] = ai;
  currentPlayer = user;
}

//Score 1 if X (AI) wins, -1 if user wins or 0 if tie
let scores = {
  X: 1,
  O: -1,
  tie: 0,
};

//Minimax Search Algorithm implementation

function minimax(board, depth, isMaximizing) {
  let result = checkWinner();
  if (result !== null) {
    return scores[result];
  }

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        // Checking if next spot is available aka emtpy
        if (board[i][j] == '') {
          board[i][j] = ai;
          let score = minimax(board, depth + 1, false);
          board[i][j] = '';
          //Checking best possible move
          bestScore = max(score, bestScore);
        }
      }
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        // Checking if next spot is available
        if (board[i][j] == '') {
          board[i][j] = user;
          let score = minimax(board, depth + 1, true);
          board[i][j] = '';
          bestScore = min(score, bestScore);
        }
      }
    }
    return bestScore;
  }
}