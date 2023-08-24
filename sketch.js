let board = [
  ["", "", ""],
  ["", "", ""],
  ["", "", ""],
];

let w;
let h;

let ai = "X";
let user = "O";
let currentPlayer = user;

function setup() {
  createCanvas(400, 400);
  w = width / 3;
  h = height / 3;
  bestMove();
}

function equals(a, b, c) {
  return a == b && b == c && a != "";
}

function checkWinner() {
  // Checking rows, columns, and diagonals for a winner
  for (let i = 0; i < 3; i++) {
    // Checking rows
    if (equals(board[i][0], board[i][1], board[i][2])) {
      return board[i][0];
    }
    // Checking columns
    if (equals(board[0][i], board[1][i], board[2][i])) {
      return board[0][i];
    }
  }

  // Checking diagonals
  if (equals(board[0][0], board[1][1], board[2][2])) {
    return board[0][0];
  }
  if (equals(board[2][0], board[1][1], board[0][2])) {
    return board[2][0];
  }

  // Checking for a tie
  let openSpots = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[i][j] === "") {
        openSpots++;
      }
    }
  }

  // Return 'tie' if all spots are filled, otherwise return null
  return openSpots === 0 ? "tie" : null;
}

//Giving control to the user and the AI
function mousePressed() {
  //Checking if it's the user's turn
  if (currentPlayer == user) {
    // Translating mouse position to grid coordinates
    let i = floor(mouseX / w);
    let j = floor(mouseY / h);
    // If cell is empty, mark if with the user's symbol
    if (board[i][j] == "") {
      board[i][j] = user;
      //AI's turn to play
      currentPlayer = ai;
      //Choosing the best possible move
      bestMove();
    }
  }
}

function draw() {
  //background color white
  background(255);
  //Set stroke thickness
  strokeWeight(4);

  //Drawing grid lines
  line(w, 0, w, height);
  line(w * 2, 0, w * 2, height);
  line(0, h, width, h);
  line(0, h * 2, width, h * 2);

  //Drawing symbols in the cells
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      let x = w * i + w / 2;
      let y = h * j + h / 2;
      let spot = board[i][j];

      textSize(32); //size of symbols

      if (spot == user) {
        ellipse(x, y, (w / 4) * 2); //Creating the circle
      } else if (spot == ai) {
        line(x - w / 4, y - w / 4, x + w / 4, y + w / 4);
        line(x + w / 4, y - w / 4, x - w / 4, y + w / 4);
      }
    }
  }

  let result = checkWinner();

  if (result != null) {
    noLoop(); //Game over so nothing happens when user clicks again

    //Displaying a result message
    let resultP = createP("");
    resultP.style("font-size", "32pt");
    if (result == "tie") {
      resultP.html("Tie!");
    } else {
      resultP.html(`${result} wins!`);
    }
  }
}