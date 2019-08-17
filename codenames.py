import random
import re
import numpy as np
import math

from typing import List, Tuple, Iterable

# This file stores the "solutions" the bot had intended,
# when you play as agent and the bot as spymaster.
log_file = open("log_file", "w")


class Reader:
    def read_picks(
        self, words: List[str], my_words: Iterable[str], cnt: int
    ) -> List[str]:
        """
        Query the user for guesses.
        :param words: Words the user can choose from.
        :param my_words: Correct words.
        :param cnt: Number of guesses the user has.
        :return: The words picked by the user.
        """
        raise NotImplementedError

    def read_clue(self, word_set: Iterable[str]) -> Tuple[str, int]:
        """
        Read a clue from the (spymaster) user.
        :param word_set: Valid words
        :return: The clue and number given.
        """
        raise NotImplementedError

    def print_words(self, words: List[str], nrows: int):
        """
        Prints a list of words as a 2d table, using `nrows` rows.
        :param words: Words to be printed.
        :param nrows: Number of rows to print.
        """
        raise NotImplementedError


class TerminalReader(Reader):
    def read_picks(
        self, words: List[str], my_words: Iterable[str], cnt: int
    ) -> List[str]:
        picks = []
        while len(picks) < cnt:
            guess = None
            while guess not in words:
                guess = input("Your guess: ").strip().lower()
            picks.append(guess)
            if guess in my_words:
                print("Correct!")
            else:
                print("Wrong :(")
                break
        return picks

    def read_clue(self, word_set) -> Tuple[str, int]:
        while True:
            inp = input("Clue (e.g. 'car 2'): ").lower()
            match = re.match("(\w+)\s+(\d+)", inp)
            if match:
                clue, cnt = match.groups()
                if clue not in word_set:
                    print("I don't understand that word.")
                    continue
                return clue, int(cnt)

    def print_words(self, words: List[str], nrows: int):
        longest = max(map(len, words))
        print()
        for row in zip(*(iter(words),) * nrows):
            for word in row:
                print(word.rjust(longest), end=" ")
            print()
        print()


class Codenames:
    def __init__(self, cnt_rows=5, cnt_cols=5, cnt_agents=8, agg=.6):
        """
        :param cnt_rows: Number of rows to show.
        :param cnt_cols: Number of columns to show.
        :param cnt_agents: Number of good words.
        :param agg: Agressiveness in [0, infinity). Higher means more aggressive.
        """
        self.cnt_rows = cnt_rows
        self.cnt_cols = cnt_cols
        self.cnt_agents = cnt_agents
        self.agg = agg

        # Other
        self.vectors = np.array([])
        self.word_list = []
        self.weirdness = []
        self.word_to_index = {}
        self.codenames = []

    def load(self, datadir):
        # Glove word vectors
        print("...Loading vectors")
        self.vectors = np.load(f"{datadir}/glove.6B.300d.npy")

        # List of all glove words
        print("...Loading words")
        self.word_list = [w.lower().strip() for w in open(f"{datadir}/words")]
        self.weirdness = [math.log(i + 1) + 1 for i in range(len(self.word_list))]

        # Indexing back from word to indices
        print("...Making word to index dict")
        self.word_to_index = {w: i for i, w in enumerate(self.word_list)}

        # All words that are allowed to go onto the table
        print("...Loading codenames")
        self.codenames: List[str] = [
            word
            for word in (w.lower().strip().replace(" ", "-") for w in open("wordlist2"))
            if word in self.word_to_index
        ]

        print("Ready!")

    def word_to_vector(self, word: str) -> np.ndarray:
        """
        :param word: To be vectorized.
        :return: The vector.
        """
        return self.vectors[self.word_to_index[word]]

    def most_similar_to_given(self, clue: str, choices: List[str]) -> str:
        """
        :param clue: Clue from the spymaster.
        :param choices: Choices on the table.
        :return: Which choice to go for.
        """
        clue_vector = self.word_to_vector(clue)
        return max(choices, key=lambda w: self.word_to_vector(w) @ clue_vector)

    def find_clue(
        self, words: List[str], my_words: List[str], black_list: Iterable[str]
    ) -> Tuple[str, float, List[str]]:
        """
        :param words: Words on the board.
        :param my_words: Words we want to guess.
        :param black_list: Clues we are not allowed to give.
        :return: (The best clue, the score, the words we expect to be guessed)
        """
        print("Thinking", end="", flush=True)

        # Words to avoid the agent guessing.
        negs = [w for w in words if w not in my_words]
        # Worst (highest) inner product with negative words
        nm = (
            self.vectors @ np.array([self.word_to_vector(word) for word in negs]).T
        ).max(axis=1)
        # Inner product with positive words
        pm = self.vectors @ np.array([self.word_to_vector(word) for word in my_words]).T

        best_clue, best_score, best_k, best_g = None, -1, 0, ()
        for step, (clue, lower_bound, scores) in enumerate(zip(self.word_list, nm, pm)):
            if step % 20000 == 0:
                print(".", end="", flush=True)

            # If the best score is lower than the lower bound, there is no reason
            # to even try it.
            if max(scores) <= lower_bound or clue in black_list:
                continue

            # Order scores by lowest to highest inner product with the clue.
            ss = sorted((s, i) for i, s in enumerate(scores))
            # Calculate the "real score" by
            #    (lowest score in group) * [ (group size)^aggressiveness - 1].
            # The reason we subtract one is that we never want to have a group of
            # size 1.
            # We divide by log(step), as to not show too many 'weird' words.
            real_score, j = max(
                (
                    (s - lower_bound)
                    * ((len(ss) - j) ** self.agg - .99)
                    / self.weirdness[step],
                    j,
                )
                for j, (s, _) in enumerate(ss)
            )

            if real_score > best_score:
                group = [my_words[i] for _, i in ss[j:]]
                best_clue, best_score, best_k, best_g = (
                    clue,
                    real_score,
                    len(group),
                    group,
                )

        # After printing '.'s with end="" we need a clean line.
        print()

        return best_clue, best_score, best_g

    def play_spymaster(self, reader: Reader):
        """
        Play a complete game, with the robot being the spymaster.
        """
        words = random.sample(self.codenames, self.cnt_rows * self.cnt_cols)
        my_words = set(random.sample(words, self.cnt_agents))
        used_clues = set(my_words)
        while my_words:
            reader.print_words(words, nrows=self.cnt_rows)

            clue, score, group = self.find_clue(words, list(my_words), used_clues)
            # Print the clue to the log_file for "debugging" purposes
            group_scores = np.array(
                [self.word_to_vector(w) for w in group]
            ) @ self.word_to_vector(clue)
            print(clue, group, group_scores, file=log_file, flush=True)
            # Save the clue, so we don't use it again
            used_clues.add(clue)

            print()
            print(
                'Clue: "{} {}" (certainty {:.2f}, remaining words {})'.format(
                    clue, len(group), score, len(my_words)
                )
            )
            print()
            for pick in reader.read_picks(words, my_words, len(group)):
                words[words.index(pick)] = "---"
                if pick in my_words:
                    my_words.remove(pick)

    def play_agent(self, reader: Reader):
        """
        Play a complete game, with the robot being the agent.
        """
        words = random.sample(self.codenames, self.cnt_rows * self.cnt_cols)
        my_words = random.sample(words, self.cnt_agents)
        picked = []
        while any(w not in picked for w in my_words):
            reader.print_words(
                [w if w not in picked else "---" for w in words], nrows=self.cnt_rows
            )
            print("Your words:", ", ".join(w for w in my_words if w not in picked))
            clue, cnt = reader.read_clue(self.word_to_index.keys())
            for _ in range(cnt):
                guess = self.most_similar_to_given(
                    clue, [w for w in words if w not in picked]
                )
                picked.append(guess)
                answer = input("I guess {}? [Y/n]: ".format(guess))
                if answer == "n":
                    print("Sorry about that.")
                    break
            else:
                print("I got them all!")


def main():
    cn = Codenames()
    cn.load("dataset")
    reader = TerminalReader()
    while True:
        try:
            mode = input("\nWill you be agent or spymaster?: ")
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        try:
            if mode == "spymaster":
                cn.play_agent(reader)
            elif mode == "agent":
                cn.play_spymaster(reader)
        except KeyboardInterrupt:
            # Catch interrupts from play functions
            pass


main()
