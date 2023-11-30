// Start heavy promises
const root = '/codenames/website/model';
// const root = '/model';
const prom = Promise.all([
   fetchVectors(root + '/vecs.gz'),
   fetchWordsGz(root + '/words.gz'),
   fetchWords(root + '/stopwords')
]);
const wlprom = fetchWords(root + '/wordlist');

const ROWS = 4;
const COLS = 4;
const SECRETS = 5;

/*
 * TODO:
 *
 * Easy:
 * X Don't use a word that's on the board
 * X Make sure the whole wordlist is included in the vecs
 * - Don't reuse hints
 * - Different backgorund color for when all clues are used vs making a mistake
 * - Make hints work when we only have secrets left
 *
 * Medium:
 * - One game a day, seeding
 *
 * Harder:
 * - Support the user being the spy master
 * - Save all user guesses
 * - Scoreboard
 * - After the game, show a log of what clues the AI was going for
 */

async function start() {
   // Element references
   const gameBoard = document.getElementById('gameBoard');
   const clueElem = document.getElementById('clue');
   const roundElem = document.getElementById('round');
   const endTurnButton = document.getElementById('endTurn');

   const data = {
      ai: {},  // matrix, words, stopwords
      board: [],
      secret: [],
      revealed: [],
      hints: [], // Current and previous clues for each round
      revealedThisRound: 0,
      thinking: false,
      roundOver: false,
   };

   function isGameOver() {
      return data.secret.every(w => data.revealed.includes(w));
   }

   function render() {
      // Render board
      if (data.board.length > 0) {
         gameBoard.innerHTML = ''; // Clear existing board
         data.board.forEach(word => {
            const cardElement = document.createElement('div');
            cardElement.className = 'card';
            cardElement.textContent = word;
            cardElement.onclick = () => handleCardClick(word);

            if (data.revealed.includes(word)) {
               cardElement.classList.add(data.secret.includes(word) ? "good" : "bad");
            }

            gameBoard.appendChild(cardElement);
         });
      }

      // Other
      roundElem.textContent = `Round ${data.hints.length}`;

      // Next round
      if (data.roundOver) {
         endTurnButton.textContent = "Next round";
      }
      else if (data.hints.length != 0) {
         const {clue, n} = data.hints[data.hints.length-1];
         endTurnButton.textContent = `Remaining: ${n - data.revealedThisRound}`;
      }
      document.body.classList.toggle("round-over", data.roundOver);
      document.body.classList.toggle("game-over", isGameOver());

      // Clues
      if (!data.ai) {
         clueElem.textContent = "Loading...";
      }
      else if (data.thinking) {
         clueElem.textContent = "Thinking...";
      }
      else if (data.hints.length != 0) {
         const {clue, n} = data.hints[data.hints.length-1];
         clueElem.textContent = `Clue: ${clue.toUpperCase()} ${n} `;
      }
   }

   function handleCardClick(word) {
      console.log("Card clicked:", word);
      if (data.roundOver) {
         console.log("Round over, please start next round.");
         return;
      }

      data.revealed.push(word);
      data.revealedThisRound += 1;

      const {clue, n} = data.hints[data.hints.length-1];
      if (data.revealedThisRound == n) {
         data.roundOver = true;
      }
      else if (!data.secret.includes(word)) {
         data.roundOver = true;
      }

      render();
   }

   function newRound() {
      if (isGameOver()) {
         console.log("Can't start new round. Game is over.");
         return;
      }

      data.revealedThisRound = 0;
      data.roundOver = false;

      data.thinking = true;
      render();

      console.log(data.ai);
      const board = data.board.filter(w => !data.revealed.includes(w));
      const secret = data.secret.filter(w => !data.revealed.includes(w));
      hint = makeHint(data.ai.matrix, data.ai.words, data.ai.stopwords, board, secret);
      data.hints.push(hint);

      data.thinking = false;
      render();
   }

   endTurnButton.onclick = function() {
      newRound();
   }

   async function init() {
      let wordlist = await wlprom;
      // TODO: Seed
      shuffle(wordlist);
      const board = wordlist.slice(0, ROWS*COLS)
      const secret = board.slice(0, SECRETS)
      shuffle(board);
      console.log(secret);

      data.board = board;
      data.secret = secret;
      render();

      const [matrix, words, stopwords] = await prom;
      data.ai = {matrix, words, stopwords};
      newRound();
   }

   init();
}

function fetchWords(path) {
   return fetch(path)
      .then(response => response.text())
      .then(text => text.split('\n').filter(word => word.trim().length > 0))
      .catch(error => {
         console.error('Error fetching or processing the file:', error);
      });
}

function fetchWordsGz(path) {
   return fetch(path)
      .then(response => response.body)
      .then(stream => {
         const decompressionStream = new DecompressionStream('gzip');
         const decompressedStream = stream.pipeThrough(decompressionStream);
         return new Response(decompressedStream).text();
      })
      .then(text => text.split('\n'))
      .catch(error => {
         console.error('Error fetching or processing the file:', error);
      });
}

function fetchVectors(path) {
   return fetch(path)
      .then(response => response.body)
      .then(stream => {
         const decompressionStream = new DecompressionStream('gzip');
         const decompressedStream = stream.pipeThrough(decompressionStream);
         return new Response(decompressedStream).arrayBuffer();
      })
      .then(decompressedBuffer => {
         const dim = 300;
         //const rows = 20000;
         const rows = 9910;
         const byteArray = new Uint8Array(decompressedBuffer);
         // console.log(byteArray);
         const min_val=-2.645588700353074;
         const max_val=2.6333964024164196;
         //min=-2.6348934823495345, max=2.6430343918786767
         const quantizedMatrix = mlMatrix.Matrix.from1DArray(rows, dim, byteArray);
         const matrix = quantizedMatrix.div(255).mul(max_val - min_val).add(min_val);
         // console.log(matrix);
         return matrix;
      })
      .catch(error => console.error('Error loading file:', error));
}

function shuffle(array) {
   for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
   }
}


function findVector(words, word) {
   let index = words.indexOf(word.toLowerCase());
   if (index == -1) {
      console.log(`Can't find ${word}`);
      index = 0;
   }
   return index;
}

function makeHint(matrix, words, stopwords, board, secret) {
   console.log("Thinking...");
   console.log(matrix);

   const avoids = board.filter(word => !secret.includes(word));
   console.log(avoids);
   const badVectors = new mlMatrix.MatrixRowSelectionView(matrix,
      avoids.map(word => findVector(words, word)));
   const goodVectors = new mlMatrix.MatrixRowSelectionView(matrix,
      secret.map(word => findVector(words, word)));

   // For any clue (row) vector, we want to find the largest IP with a bad
   // vector, since since that sets a lower bound on the IPs we are willing
   // to accept. This comes from the "zero bad vectors accepted" requirement.
   const nm = matrix.mmul(badVectors.transpose()).max('row');
   // For the good vectors, we want to know the IP with each one, so this is
   // a matrix of shape |words| x |secret|
   const pm = matrix.mmul(goodVectors.transpose());

   // let weirdness = [math.log(i + 1) + 1 for i in range(len(self.word_list))]
   let agg = .6;  // Agressiveness

   let best = {};
   for (let step = 0; step < words.length; step++) {
      const clue = words[step];
      const lowerBound = nm[step] || 0;
      const scores = pm.getRow(step);

      // If the best score is lower than the lower bound, there is no reason
      // to even try it.
      if (stopwords.includes(clue)) {
         // TODO: Also check for previously used cluses
         continue;
      }
      if (board.includes(clue.toUpperCase())) {
         // Don't use something directly present on the board
         continue;
      }

      // Order scores by highest to lowest inner product with the clue.
      const ss = scores
         .map((score, i) => ({ score, index: i }))
         .sort((a, b) => b.score - a.score);

      for (let j = 0; j < ss.length; j++) {
         const gap = ss[j].score - lowerBound;

         // Save that we can achieve gap s-lowerBound with n=j+1
         if (!best[j] || gap > best[j].gap) {
            best[j] = {gap, clue, scores, lowerBound};
         }
      }
   }

   let combinedBest = {combinedScore: -10000};
   for (let [n, {gap, clue, scores, lowerBound}] of Object.entries(best)) {
      n = parseInt(n);
      console.log(`N: ${n+1}, Gap: ${gap}, Clue: ${clue}, Lb: ${lowerBound}`);
      console.log(scores);
      let combinedScore = gap * (Math.pow(n+1, agg) - 0.99);
      console.log(`Combined Score: ${combinedScore}`);

      if (combinedScore > combinedBest.combinedScore) {
         combinedBest = {n: n+1, clue, combinedScore};
      }
   }

   return combinedBest;
}


