"use strict";

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


function start() {
   // This will be today's date or the date from the URL
   const date = checkSetAndGetDateHash();

   // get all data from local storage
   const datas = JSON.parse(localStorage.getItem('datas')) || {};

   if (!(date in datas)) {
      // Data prototype
      datas[date] = {
         board: [],
         secret: [],
         revealed: [],
         hints: [], // Current and previous clues for each round
         revealedThisRound: 0,
         thinking: false,
         roundOver: true,
      };
   }

   main(date, datas);
}

function parseDate(dateStr) {
   // By adding time, javascript parses the date as local time, rather than UTC
   return new Date(dateStr + 'T00:00');
}

function toLongDate(date, includeYear = true) {
    const options = {
        year: includeYear ? 'numeric' : undefined, // Include year based on the flag
        month: 'long',
        day: 'numeric'
    };
    return parseDate(date).toLocaleDateString(undefined, options);
}

function toShortDate(date) {
   return date.getFullYear() + '-' + 
      String(date.getMonth() + 1).padStart(2, '0') + '-' + 
      String(date.getDate()).padStart(2, '0');
}

function checkSetAndGetDateHash() {
   const dateFromHash = window.location.hash.substring(1); // Remove the '#' character
   const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // Simple regex for YYYY-MM-DD format
   const today = new Date();
   const inputDate = parseDate(dateFromHash);

   // Check if the date matches the format and is not NaN, and is not in the future
   if (!dateFromHash.match(dateRegex) || isNaN(inputDate.getTime()) || inputDate > today) {
      const todayStr = toShortDate(today);
      window.location.hash = '#' + todayStr;
      return todayStr;
   }

   return dateFromHash;
}

// If the user manually changes the hash, we restart
window.addEventListener('hashchange', start);

function isGameOver(data) {
   return isWon(data) || isLost(data);
}
function isWon(data) {
   return data.secret.every(w => data.revealed.includes(w));
}
function isLost(data) {
   return data.roundOver && data.hints.length >= MAX_ROUNDS;
}

async function main(date, datas) {
   console.log(`Starting game with date ${date}.`);

   // Element references
   const gameBoard = document.getElementById('gameBoard');
   const clueElem = document.getElementById('clue');
   const roundElem = document.getElementById('round');
   const endTurnButton = document.getElementById('endTurn');
   const remainingCluesSpan = document.getElementById('remainingClues');
   const winLoseText = document.getElementById('win-lose-text');

   let ai = {};  // matrix, words, stopwords
   const data = datas[date];

   async function init() {
      let wordlist = await wlprom;

      // Sample board data from word list, if we don't already have it in the storage.
      let usedSaved = false;
      if (data.board.length != ROWS * COLS) {
         const seed = parseDate(date).getTime() % 2147483647;
         console.log(`Sampling new board from seed ${seed}.`);
         data.board = sample(seed, wordlist, ROWS*COLS);
         data.secret = sample(seed^326236988, data.board, SECRETS);
      } else {
         console.log(`Using saved board ${data.board}.`);
         usedSaved = true;
      }
      console.log(data);
      render();

      // Wait till we've downloaded the wordvectors before we start the round.
      // Would it be better to cache the ai to localStorage?
      // It seems unnecessary as the browswer does its own caching.
      const [matrix, words, stopwords] = await prom;
      ai = {matrix, words, stopwords};

      if (isGameOver(data)) {
         console.log("Not starting new round, because game is already over.");
      }
      else if (!data.roundOver && !data.thinking) {
         console.log("Not starting new round, because we already seem to be in a round.");
      }
      else {
         newRound();
      }
   }

   function render() {
      // Since we call render every time we change something,
      // this is a good time to save the state
      localStorage.setItem('datas', JSON.stringify(datas));

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

      // Set Round indicator
      roundElem.textContent = `Round ${data.hints.length} / ${MAX_ROUNDS}`;

      // Set "n words remaining" text
      if (data.hints.length != 0) {
         const {clue, n} = data.hints[data.hints.length-1];
         let r = n - data.revealedThisRound;
         let s = `pick ${r} more word`;
         if (r != 1)
            s += "s";
         remainingCluesSpan.textContent = s;
      }
      document.body.classList.toggle("round-over", data.roundOver);
      document.body.classList.toggle("game-over", isGameOver(data));
      document.body.classList.toggle("game-lost", isLost(data));
      document.body.classList.toggle("game-win", isWon(data));
      document.body.classList.toggle("today", parseDate(date).toDateString() === new Date().toDateString());

      // Clues
      if (!ai) {
         clueElem.textContent = "Loading...";
         console.log('loading...');
      }
      else if (data.thinking) {
         clueElem.textContent = "Thinking...";
      }
      else if (isGameOver(data)) {
         let got = data.secret.filter(w => data.revealed.includes(w)).length;
         winLoseText.innerHTML = isWon(data)
            ? "Hurray! You Won!"
            : `You got ${got} out of ${SECRETS}.`;
      }
      else if (data.hints.length != 0) {
         const {clue, n} = data.hints[data.hints.length-1];
         clueElem.innerHTML = `Clue: <span>${clue.toUpperCase()} ${n}</span>`;
      }

      // Footer
      for (const span of document.getElementsByClassName("date")) {
         span.textContent = toLongDate(date);
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

      const {clue, n} = data.hints[data.hints.length-1];

      gtag('event', 'card_click', {
         'event_category': 'Game Interaction',
         'event_label': 'Card Clicked',
         // The hint
         'clue': clue,
         'clue_n': n,
         // The interaction
         'clicked': word,
         'was_correct': data.secret.includes(word) ? 1 : 0,
         // The board
         'secret': data.secret.join(','),
         'board': data.board.join(','),
         'revealed': data.revealed,
         // Extra data
         'hints': JSON.stringify(data.hints),
      });

      data.revealed.push(word);
      data.revealedThisRound += 1;

      if (data.revealedThisRound == n) {
         data.roundOver = true;
      }
      else if (!data.secret.includes(word)) {
         data.roundOver = true;
      }

      if (isGameOver(data)) {
         onGameOver();
      }

      render();
   }

   function newRound() {
      if (isGameOver(data)) {
         console.log("Can't start new round. Game is over.");
         return;
      }

      data.revealedThisRound = 0;
      data.roundOver = false;

      data.thinking = true;
      render();

      const board = data.board.filter(w => !data.revealed.includes(w));
      const secret = data.secret.filter(w => !data.revealed.includes(w));
      let stopwords = [...ai.stopwords];
      // Don't repeat hints
      for (let hint of data.hints) {
         stopwords.push(hint.clue);
      }

      let agg = 0.6;  // Default aggressiveness = 0.6
      let shift = .9;

      // Let's adjust aggressiveness based on how well the user is doing
      // let got = data.secret.filter(w => data.revealed.includes(w)).length;
      // let success = got / data.revealed.length;
      // if (success <= .5)
      //    agg = 0.3;

      // If this is the last round, we need to give a clue number high enough
      // that the user has a change to win.
      if (data.hints.length == MAX_ROUNDS - 1) {
         shift = .99;
         agg = 100;
      }
      const hint = makeHint(ai.matrix, ai.words, stopwords, board, secret, agg, shift);
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

   for (const link of document.getElementsByClassName("yesterdays-link")) {
      console.log(link);
      link.onclick = function() {
         const curDate = parseDate(date);
         curDate.setDate(curDate.getDate() - 1); // Subtract one day
         const yesterday = toShortDate(curDate);
         window.location.hash = '#' + yesterday;
      };
   }

   for (const link of document.getElementsByClassName("todays-link")) {
      link.onclick = function() {
         window.location.hash = '#';
      };
   }

   function onGameOver() {
      if (!isGameOver(data)) {
         console.log("Error: Game is not over.");
         return;
      }

      gtag('event', 'game_result', {
          'event_category': 'Game Interaction',
          'event_label': isWon(data) ? 'Win' : 'Lost',
          'value': isWon(data) ? 1 : 0
      });

      // Ideally we should re-render the statistics here.
      // We can't actually do this with our design.
      // But it's ok, because the game can't end while
      // the statistics are open.
   }

   init();
   initMenu(date, datas);
}

function initMenu(date, allGameDatas) {
   const statsButton = document.getElementById('stats-button');
   const statsLink = document.getElementById('stats-link');
   const helpButton = document.getElementById('help-button');
   const statsClose = document.getElementById('stats-close');
   const helpClose = document.getElementById('help-close');
   const statsModal = document.getElementById('stats-modal');
   const helpModal = document.getElementById('help-modal');
   const analysisDiv = document.getElementById('post-game-analysis');
   const shareButton = document.getElementById('shareButton');

   const data = {
      helpShown: false,
      statsShown: false,
   }
   const gameData = allGameDatas[date];

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

   for (const modal of document.getElementsByClassName("modal")) {
      // Only react on direct clicks, so we don't close the modal when
      // clicking in modal-inner.
      modal.onclick = function(event) {
         if (event.target === modal) {
            closeAll();
         }
      };
   }

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

   shareButton.onclick = function() {

      const {shareString, logString} = compileLog(gameData.hints, gameData.revealed, gameData.secret);
      let used = isWon(gameData) ? gameData.hints.length : "X";
      let copyString = `CODEWORDS ${toLongDate(date, false)}, ${used}/${MAX_ROUNDS}`;
      copyString += "\n\n" + shareString;

      // Copying the string to the clipboard
      navigator.clipboard.writeText(copyString).then(function() {
         // Show the message
         const message = document.getElementById('message');
         message.style.display = 'inline';

         // Hide the message after 2 seconds
         setTimeout(function() {
            message.style.display = 'none';
         }, 2000);
      }).catch(function(error) {
         // Handle any errors here
         console.error('Error copying text: ', error);
      });
   }

   function render() {
      statsModal.style.display = data.statsShown ? "block" : "none";
      helpModal.style.display = data.helpShown ? "block" : "none";

      // Get stats
      const played = Object.keys(allGameDatas).filter(d => isGameOver(allGameDatas[d])).length;
      const wins = Object.keys(allGameDatas).filter(d => isWon(allGameDatas[d])).length;
      document.getElementById('playedCount').textContent = played;
      let winPercentage = played > 0 ? Math.round(wins / played * 100) : 0;
      document.getElementById('winPercentage').textContent = winPercentage;
      document.getElementById('winPercentage').setAttribute("title", `Won ${wins} / ${played}`);

      // Compute streaks from dates
      const {longestStreak, longestEnd, currentStreak} = findStreaks(allGameDatas);
      document.getElementById('currentStreak').textContent = currentStreak;
      document.getElementById('maxStreak').textContent = longestStreak;
      if (longestEnd !== null && longestEnd !== undefined)
         document.getElementById('maxStreak').setAttribute("title", `Streak ended ${toShortDate(longestEnd)}`);

      // Compute guess distribution
      const distribution = new Array(MAX_ROUNDS).fill(0);
      for (const d of Object.values(allGameDatas)) {
         if (isWon(d)) {
            distribution[d.hints.length - 1]++;
         }
      }
      const guessDistributionContainer = document.getElementById('guessDistribution');
      guessDistributionContainer.innerHTML = '';
      distribution.forEach((count, index) => {
         const barContainer = document.createElement('div');
         barContainer.className = 'guessBar-container';
         barContainer.innerHTML = `<div class="row-label">${index+1}</div>`;
         const bar = document.createElement('div');
         bar.className = 'guessBar';
         const percent = count / Math.max(...distribution) * 100;
         const width = count > 0 ? `${percent.toFixed(2)}%` : '0%';
         bar.style.width = `calc(max(1rem, ${width}))`;
         bar.innerHTML = `<span>${count}</span>`;
         barContainer.appendChild(bar);
         guessDistributionContainer.appendChild(barContainer);
      });

      // Log of clues
      if (isGameOver(gameData)) {
         console.log("Making log");
         const {shareString, logString} = compileLog(gameData.hints, gameData.revealed, gameData.secret);
         analysisDiv.innerHTML = logString;
      } else {
         console.log("Making log");
         analysisDiv.innerHTML = "<p>Come back here after the game.</p>";
      }
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
         let matrix = quantizedMatrix.div(255).mul(max_val - min_val).add(min_val);

         //console.log(matrix);
         //const norms = matrix.mul(matrix).sum('row').sqrt();

         for (let i = 0; i < matrix.rows; i++) {
            let row = matrix.getRow(i);
            let norm = Math.sqrt(row.reduce((sum, value) => sum + value * value, 0));
            matrix.setRow(i, row.map(value => value / norm));
         }
         // console.log("TOP ROW");
         // console.log(matrix.getRow(0));


         // console.log(matrix);
         return matrix;
      })
      .catch(error => console.error('Error loading file:', error));
}

function sample(key, originalArray, n) {
   // Certified random coefficients from random.org
   const cs = [82304423, 346724810, 725211102, 50719932, 978969693, 1594878607];

   // Polynomial random generator
   function next() {
      let result = cs[0];
      for (let i = 1; i < cs.length; i++) {
         result = result * key + cs[i];
         result %= 2147483647;
      }
      key += 1; // Increment the key for the next call
      return result;
   }

   const array = [...originalArray];
   for (let i = 0; i < Math.min(n, array.length); i++) {
      const j = i + next() % (array.length - i);
      [array[i], array[j]] = [array[j], array[i]];
   }
   return array.slice(0, n)
}


function findVector(words, word) {
   let index = words.indexOf(word.toLowerCase());
   if (index == -1) {
      console.log(`Can't find ${word}`);
      index = 0;
   }
   return index;
}

function makeHint(matrix, words, stopwords, board, secret, aggressiveness, shift) {
   /* The algorithm uses the following formula for scoring clues:
    * gap * (n^agg - shift)
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
      let combinedScore = gap * (Math.pow(n+1, aggressiveness) - shift);
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
   let shareString = "";
   let s = "<ol class=\"log-list\">";
   let j = 0;
   for (let i = 0; i < hints.length; i++) {
      let hint = hints[i];
      s += `<li><p>Round ${i + 1} Clue: <b>${hint.clue.toUpperCase()} ${hint.n}</b></p>`;
      s += "<div class=\"card-list\">";

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

      function href(word) {
         return `href="https://www.google.com/search?q=${hint.clue}+${word}"`
      }

      let intended = hint.intendedClues;
      for (let word of intended) {
         if (!guessed.includes(word)) {
            s += `<a class="small-card" ${href(word)}>${word}<span>(Intended clue)</span></a>`;
            shareString += "⬜";  // White box
         }
      }
      for (let word of guessed) {
         if (intended.includes(word)) {
            s += `<a class="small-card good" ${href(word)}>${word}<span>(Guessed and Intended)</span></a>`;
         } else {
            s += `<a class="small-card good" ${href(word)}>${word}<span>(Guessed by chance)</span></a>`;
         }
         shareString += "🟨";  // Orange box
      }
      if (mistake !== null) {
         s += `<a class="small-card bad" ${href(mistake)}>${mistake}<span>(Incorrect)</span></a>`;
         shareString += "⬛";  // Black box
      }
      shareString += "\n";

      s += "</div></li>";
   }
   s += "</ol>";
   return {shareString, logString: s};
}

function findStreaks(datesObject) {
   // Filter the object keys based on isGameOver, then convert to date objects and sort them
   const dates = Object.keys(datesObject)
      .filter(key => isGameOver(datesObject[key]))
      .map(date => parseDate(date))
      .sort((a, b) => a - b);

   if (dates.length == 0) {
      return {
         longestStreak: 0,
         longestEnd: null,
         currentStreak: 0
      };
   }

   let longestStreak = 0;
   let currentStreak = 0;
   let longestEnd = null;
   let tempStreak = 1;

   for (let i = 1; i < dates.length; i++) {
      // Check if the current date is consecutive
      // Apparently this is OK in Javascript without leap-second issues(?)
      if (dates[i] - dates[i - 1] === 86400000) { // 86400000ms = 1 day
         tempStreak++;
      } else {
         // Update the longest streak if needed
         if (tempStreak > longestStreak) {
            longestStreak = tempStreak;
            longestEnd = dates[i - 1];
         }
         tempStreak = 1;
      }
   }

   // Check the last streak
   if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
      longestEnd = dates[dates.length - 1];
   }

   // Determine the current streak
   let today = new Date();
   today.setHours(0, 0, 0, 0); // Normalize today's date

   while (dates.filter((d) => d - today == 0).length == 1) {
      currentStreak++;
      today.setDate(today.getDate() - 1);
   }

   return {
      longestStreak,
      longestEnd,
      currentStreak
   };
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
