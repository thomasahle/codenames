
// Check if the iOS version is at least 17
if (!isIOSVersionAtLeast(16)) {
   alert('Requires iOS at least v16, or Android');
}

// Start heavy promises
const root = '/website/model';
const prom = Promise.all([
   fetchVectors(root + '/vecs.gz'),
   fetchWordsGz(root + '/words.gz'),
   fetchWords(root + '/stopwords')
]);
const wlprom = fetchWords(root + '/wordlist');

const ROWS = 6;
const COLS = 3;
const SECRETS = 6;
const MAX_ROUNDS = 6;


/*
 * TODO:
 *
 * Easy:
 * X Don't use a word that's on the board
 * X Make sure the whole wordlist is included in the vecs
 * X Don't reuse hints
 * X Make hints work when we only have secrets left
 * X Don't allow clicking on something already clicked
 * X Last round must always have a large enough clue that winning is possible.
 * - Different backgorund color for when all clues are used vs making a mistake
 * - Nicer "next round" button
 *
 * Medium:
 * X A victory screen that is an overlay, like in Wordle
 * X Automatically show help the first time a user joins
 * X Write help text
 *
 * Harder:
 * - Support the user being the spy master (probably never)
 * X Scoreboard
 * X After the game, show a log of what clues the AI was going for
 * - One game a day, seeding (can go to previous days for more games)
 * - Save all user guesses
 * - Track user clicks
 * - Train model offline using gpt as guesser
 */

async function start() {
   // Element references
   const gameBoard = document.getElementById('gameBoard');
   const clueElem = document.getElementById('clue');
   const roundElem = document.getElementById('round');
   const endTurnButton = document.getElementById('endTurn');
   const analysisDiv = document.getElementById('post-game-analysis');
   const winLoseText = document.getElementById('win-lose-text');

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
      return isWon() || isLost();
   }
   function isWon() {
      return data.secret.every(w => data.revealed.includes(w));
   }
   function isLost() {
      return data.roundOver && data.hints.length >= MAX_ROUNDS;
   }

   function render() {
      // Render board
      if (data.board.length > 0) {
         gameBoard.innerHTML = ''; // Clear existing board
         gameBoard.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
         data.board.forEach(word => {
            const cardElement = document.createElement('div');
            cardElement.className = 'card';

            const cardSpan = document.createElement('span');
            cardSpan.textContent = word;
            cardElement.appendChild(cardSpan);

            cardElement.onclick = () => handleCardClick(word);

            if (data.revealed.includes(word)) {
               cardElement.classList.add(data.secret.includes(word) ? "good" : "bad");
               cardElement.classList.add("revealed");
            }

            gameBoard.appendChild(cardElement);

            // Reduce size if too large
            if (cardElement.scrollWidth > cardElement.clientWidth) {
               cardElement.style.fontSize = "80%";
            }
         });
      }

      // Other
      roundElem.textContent = `Round ${data.hints.length} / ${MAX_ROUNDS}`;

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
      document.body.classList.toggle("game-lost", isLost());
      document.body.classList.toggle("game-win", isWon());

      // Clues
      if (!data.ai) {
         clueElem.textContent = "Loading...";
         console.log('loading...');
      }
      else if (data.thinking) {
         clueElem.textContent = "Thinking...";
      }
      else if (isGameOver()) {
         winLoseText.innerHTML = isWon() ? "Congratulations, You Won!" : "Sorry, You Lost";
      }
      else if (data.hints.length != 0) {
         const {clue, n} = data.hints[data.hints.length-1];
         clueElem.innerHTML = `Clue: <span>${clue.toUpperCase()} ${n}</span>`;
      }

      // Footer
      if (isGameOver()) {
         let s = compileLog(data.hints, data.revealed, data.secret);
         analysisDiv.innerHTML = s;
      }
   }

   function handleCardClick(word) {
      console.log("Card clicked:", word);
      if (data.roundOver) {
         console.log("Round over, please start next round.");
         return;
      }
      if (data.thinking) {
         console.log("Please wait...");
         return;
      }
      if (data.revealed.includes(word)) {
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

      if (isGameOver()) {
         onGameOver();
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

      const board = data.board.filter(w => !data.revealed.includes(w));
      const secret = data.secret.filter(w => !data.revealed.includes(w));
      let stopwords = [...data.ai.stopwords];
      // Don't repeat hints
      for (let hint of data.hints) {
         stopwords.push(hint.clue);
      }

      let agg = 0.6;  // Default aggressiveness = 0.6
      // If this is the last round, we need to give a clue number high enough
      // that the user has a change to win.
      if (data.hints.length == MAX_ROUNDS - 1) {
         agg = 100;
      }
      hint = makeHint(data.ai.matrix, data.ai.words, stopwords, board, secret, agg);
      data.hints.push(hint);

      data.thinking = false;
      render();
   }

   endTurnButton.onclick = function() {
      if (data.roundOver) {
         newRound();
      } else {
         console.log("Just finish the round yourself.");
      }
   }

   function onGameOver() {
      if (!isGameOver()) {
         console.log("Error: Game is not over.");
         return;
      }

      let played = parseInt(localStorage.getItem('played') || '0') + 1;
      localStorage.setItem('played', played);

      if (isWon()) {
         let wins = parseInt(localStorage.getItem('wins') || '0') + 1;
         localStorage.setItem('wins', wins);

         let rounds = data.hints.length;
         let guessDistribution = JSON.parse(localStorage.getItem('guessDistribution'))
            || new Array(MAX_ROUNDS).fill(0);
         guessDistribution[rounds - 1] = (guessDistribution[rounds - 1] || 0) + 1;
         localStorage.setItem('guessDistribution', JSON.stringify(guessDistribution));
      }

      // Ideally we should re-render the statistics here.
      // We can't actually do this with our design.
      // But it's ok, because the game can't end while
      // the statistics are open.
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
   initMenu();
}

function initMenu() {
   const statsButton = document.getElementById('stats-button');
   const statsLink = document.getElementById('stats-link');
   const helpButton = document.getElementById('help-button');
   const statsClose = document.getElementById('stats-close');
   const helpClose = document.getElementById('help-close');
   const statsModal = document.getElementById('stats-modal');
   const helpModal = document.getElementById('help-modal');

   data = {
      helpShown: false,
      statsShown: false,
   }

   statsButton.onclick = function() {
      data.statsShown = true;
      render();
   }

   statsLink.onclick = function() {
      data.statsShown = true;
      render();
   }

   statsClose.onclick = closeAll;

   helpButton.onclick = function() {
      data.helpShown = true;
      render();
   }

   helpClose.onclick = closeAll;

   Array.from(document.getElementsByClassName("modal")).forEach(modal => {
      // Only react on direct clicks, so we don't close the modal when
      // clicking in modal-inner.
      modal.onclick = function(event) {
         if (event.target === modal) {
            closeAll();
         }
      };
   });

   document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
         closeAll();
      }
   });

   function closeAll() {
      data.statsShown = false;
      data.helpShown = false;
      render();
   }

   function render() {
      statsModal.style.display = data.statsShown ? "block" : "none";
      helpModal.style.display = data.helpShown ? "block" : "none";

      // Get stats
      let played = localStorage.getItem('played') || 0;
      let winPercentage = played > 0 ? (localStorage.getItem('wins') / played * 100).toFixed(0) : 0;
      let currentStreak = localStorage.getItem('currentStreak') || 0;
      let maxStreak = localStorage.getItem('maxStreak') || 0;
      document.getElementById('playedCount').textContent = played;
      document.getElementById('winPercentage').textContent = winPercentage;
      document.getElementById('currentStreak').textContent = currentStreak;
      document.getElementById('maxStreak').textContent = maxStreak;

      // Create bars
      let distribution = JSON.parse(localStorage.getItem('guessDistribution'))
         || new Array(MAX_ROUNDS).fill(0);
      let guessDistributionContainer = document.getElementById('guessDistribution');
      guessDistributionContainer.innerHTML = '';
      distribution.forEach((count, index) => {
         let barContainer = document.createElement('div');
         barContainer.className = 'guessBar-container';
         barContainer.innerHTML = `<div class="row-label">${index+1}</div>`;
         let bar = document.createElement('div');
         bar.className = 'guessBar';
         let percent = count / Math.max(...distribution) * 100;
         let width = count > 0 ? `${percent.toFixed(2)}%` : '0%';
         bar.style.width = `calc(max(1rem, ${width}))`;
         bar.innerHTML = `<span>${count}</span>`;
         barContainer.appendChild(bar);
         guessDistributionContainer.appendChild(barContainer);
      });
   }

   // Show help on first visit
   if (localStorage.getItem('hasVisited') === null) {
      data.helpShown = true;
      render();
      localStorage.setItem('hasVisited', 'true');
   }
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

function makeHint(matrix, words, stopwords, board, secret, aggressiveness) {
   /* The algorithm uses the following formula for scoring clues:
    * gap * (n^agg - 1)
    * Where `gap` is the gap in inner products between the worst "good" word
    * and the best "bad" word.
    * `n` is the size of the clue, and agg is the aggressiveness.
    *
    * So if agg = 0, we only look at the `gap`.
    * If agg = inf, we only care about `n`.
    * Default agg should be around 0.6.
    */
   console.log("Thinking...");

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
      let lowerBound = nm[step] || 0;
      lowerBound = Math.max(lowerBound, -1); // Very small ips don't mean anything
      const scores = pm.getRow(step);

      // TODO: Maybe sometimes it's OK to include a single bad word with a high score,
      // if the `n` is large enough?

      // If the best score is lower than the lower bound, there is no reason
      // to even try it.
      if (stopwords.includes(clue)) {
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
      let combinedScore = gap * (Math.pow(n+1, aggressiveness) - 0.99);
      console.log(`Combined Score: ${combinedScore}`);

      let indices = [...scores.keys()];
      indices.sort((a, b) => scores[b] - scores[a]);
      let largestIndices = indices.slice(0, n+1);
      let intendedClues = largestIndices.map(i => secret[i]);

      if (combinedScore > combinedBest.combinedScore) {
         combinedBest = {n: n+1, clue, intendedClues, combinedScore};
      }
   }

   return combinedBest;
}


function compileLog(hints, revealed, secret) {
   s = "<ol class=\"log-list\">";
   let j = 0;
   for (let i = 0; i < hints.length; i++) {
      let hint = hints[i];
      s += `<li><p>Round ${i + 1} Clue: <b>${hint.clue.toUpperCase()} ${hint.n}</b></p>`;
      s += "<ul class=\"card-list\">";

      let guessed = [];
      while (
         j !== revealed.length           // Finished game
         && secret.includes(revealed[j]) // Finished 
         && guessed.length != hint.n     // Finished without a mistake
      ) {
         guessed.push(revealed[j]);
         j++;
      }

      let mistake = null;
      if (j !== revealed.length && guessed.length != hint.n) {
         mistake = revealed[j];
         j++;
      }

      let intended = hint.intendedClues;
      for (let word of intended) {
         if (!guessed.includes(word)) {
            s += `<li class="small-card">${word}<span>(Intended clue)</span></li>`;
         }
      }
      for (let word of guessed) {
         if (intended.includes(word)) {
            s += `<li class="small-card good">${word}<span>(Guessed and Intended)</span></li>`;
         } else {
            s += `<li class="small-card good">${word}<span>(Guessed by chance)</span></li>`;
         }
      }
      if (mistake !== null) {
         s += `<li class="small-card bad">${mistake}<span>(Incorrect)</span></li>`;
      }

      s += "</ul></li>";
   }
   s += "</ol>";
   return s;
}

// Utils
function isIOSVersionAtLeast(version) {
   const ua = window.navigator.userAgent;
   const ios = ua.match(/OS (\d+)_/);

   if (ios && ios.length > 1) {
      const iosVersion = parseInt(ios[1], 10);
      return iosVersion >= version;
   }

   // If not iOS, we are fine
   return true;
}
