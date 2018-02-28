import random
import itertools
import re
import numpy as np
import math

print('...Loading vectors')
vectors = np.load('dataset/glove.6B.300d.npy')
# Normalizing turns out to be a bad idea, since words that are good clues
# tends to have longer vectors.
#print('...Normalizing')
#vectors /= np.linalg.norm(vectors, axis=1).reshape(-1, 1)
print('...Loading words')
word_list = [w.lower().strip() for w in open('dataset/words')]
print('...Making word to index dict')
word_to_index = {w:i for i,w in enumerate(word_list)}
print('...Loading codenames')
codenames = [w.lower().strip().replace(' ','-') for w in open('wordlist2')]
codenames = [w for w in codenames if w in word_to_index]
print('Ready!')

log_file = open('log_file', 'w')

# Total number of clues is cnt_rows*cnt_cols.
# TOtal number of marked words is cnt_agents.
cnt_rows = 5
cnt_cols = 5
cnt_agents = 8

# Agressiveness in [0, infinity).
# Higher means more agressive.
agg = .5

def word_to_vector(word):
    return vectors[word_to_index[word]]

def most_similar_to_given(clue, choices):
    clue_vector = word_to_vector(clue)
    return max(choices, key=lambda w: word_to_vector(w) @ clue_vector)

def print_words(words):
    longest = max(map(len, words))
    print()
    for row in zip(*(iter(words),)*cnt_rows):
        for word in row:
            print(word.rjust(longest), end=' ')
        print()
    print()

def find_clue(words, my_words, black_list):
    print('Thinking', end='', flush=True)

    negs = [w for w in words if w not in my_words]
    nm = (vectors @ np.array([word_to_vector(word) for word in negs]).T).max(axis=1)
    pm = vectors @ np.array([word_to_vector(word) for word in my_words]).T

    best_clue, best_score, best_k, best_g = None, -1, 0, ()
    for step, (clue, lower_bound, scores) in enumerate(zip(word_list, nm, pm)):
        if step % 20000 == 0:
            print('.', end='', flush=True)
        if max(scores)-lower_bound <= lower_bound or clue in black_list:
            continue
        ss = sorted((s,i) for i,s in enumerate(scores - lower_bound))
        real_score, j = max((s*((len(ss) - j)**agg-.99), j) for j,(s,_) in enumerate(ss))
        if real_score > best_score:
            group = [my_words[i] for _, i in ss[j:]]
            best_clue, best_score, best_k, best_g = clue, real_score, len(group), group
    print()

    return best_clue, best_score, best_g

def read_picks(words, my_words, cnt):
    picks = []
    while len(picks) < cnt:
        guess = None
        while guess not in words:
            guess = input('Your guess: ').strip().lower()
        picks.append(guess)
        if guess in my_words:
            print('Correct!')
        else:
            print('Wrong :(')
            break
    return picks

def read_clue():
    while True:
        inp = input('Clue (e.g. \'car 2\'): ').lower()
        match = re.match('(\w+)\s+(\d+)', inp)
        if match:
            clue, cnt = match.groups()
            if clue not in word_to_index:
                print('I don\'t understand that word.')
                continue
            return clue, int(cnt)

def play_spymaster():
    words = random.sample(codenames, cnt_rows*cnt_cols)
    my_words = set(random.sample(words, cnt_agents))
    used_clues = set(my_words)
    while my_words:
        print_words(words)

        clue, score, group = find_clue(words, list(my_words), used_clues)
        # Print the clue to the log_file for "debugging" purposes
        group_scores = np.array([word_to_vector(w) for w in group]) @ word_to_vector(clue)
        print(clue, group, group_scores, file=log_file, flush=True)
        # Save the clue, so we don't use it again
        used_clues.add(clue)

        print()
        print('Clue: "{} {}" (certainty {:.2f}, remaining words {})'
                .format(clue, len(group), score, len(my_words)))
        print()
        for pick in read_picks(words, my_words, len(group)):
            words[words.index(pick)] = '---'
            if pick in my_words:
                my_words.remove(pick)

def play_agent():
    words = random.sample(codenames, cnt_rows*cnt_cols)
    my_words = random.sample(words, cnt_agents)
    picked = []
    while any(w not in picked for w in my_words):
        print_words([w if w not in picked else '---' for w in words])
        print('Your words:', ', '.join(w for w in my_words if w not in picked))
        clue, cnt = read_clue()
        for _ in range(cnt):
            guess = most_similar_to_given(clue,
                    [w for w in words if w not in picked])
            picked.append(guess)
            answer = input('I guess {}? [Y/n]: '.format(guess))
            if answer == 'n':
                print('Sorry about that.')
                break
        else:
            print('I got them all!')

def main():
    while True:
        try:
            mode = input('\nWill you be agent or spymaster?: ')
        except KeyboardInterrupt:
            print('\nGoodbye!')
            break
        try:
            if mode == 'spymaster':
                play_agent()
            elif mode == 'agent':
                play_spymaster()
        except KeyboardInterrupt:
            # Catch interrupts from play functions
            pass

main()
