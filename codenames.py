import random
import itertools
import re
import numpy as np
import math

print('...Loading vectors')
vectors = np.load('dataset/glove.6B.300d.npy')
print('...Normalizing')
vectors /= np.linalg.norm(vectors, axis=1).reshape(-1, 1)
print('...Loading words')
word_list = [w.lower().strip() for w in open('dataset/words')]
print('...Making word to index dict')
word_to_index = {w:i for i,w in enumerate(word_list)}
print('...Loading codenames')
codenames = [w.lower().strip().replace(' ','-') for w in open('wordlist2')]
codenames = [w for w in codenames if w in word_to_index]
print('Ready!')

log_file = open('log_file', 'w')

cnt_rows = 5
cnt_cols = 5
cnt_agents = 8
pos_weight = 2

def word_to_vector(word):
    return vectors[word_to_index[word]]

def most_similar_to_given(clue, choices):
    clue_vector = word_to_vector(clue)
    return max(choices, key=lambda w: word_to_vector(w) @ clue_vector)

def most_similar(pos, pm, negs, nm):
    gap = pos_weight * np.array(pm).min(axis=0)
    if negs:
        gap -= nm
    i = gap.argmax()
    s = gap.max()
    return word_list[i], s

def print_words(words):
    longest = max(map(len, words))
    print()
    for row in zip(*(iter(words),)*cnt_rows):
        for word in row:
            print(word.rjust(longest), end=' ')
        print()
    print()

def find_clue(words, my_words):
    my_words = list(my_words)
    best_word, best_score, best_k, best_g = None, -1, 0, ()
    negs = [w for w in words if w not in my_words]
    nm = np.array([vectors @ word_to_vector(word) for word in negs]).max(axis=0)
    pm = np.array([vectors @ word_to_vector(word) for word in my_words])
    for k in range(len(my_words), 0, -1):
        for ids in itertools.combinations(range(len(my_words)), k):
            group = [my_words[i] for i in ids]
            word, score = most_similar(group, [pm[i] for i in ids], negs, nm)
            score *= (k**.5-1)
            # Punish weird words
            score /= math.log(word_to_index[word]+2) / 10
            if score > best_score:
                best_word, best_score, best_k, best_g = word, score, k, group
                print('Thinking {} ... {:.3f}'.format(k, score), word_to_index[word])
                scores = [word_to_vector(word) @ word_to_vector(g) for g in group]
                print(word, score, group, scores, file=log_file, flush=True)
    return best_word, best_k, best_score, best_g

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
    while my_words:
        print_words(words)
        word, cnt, score, group = find_clue(words, my_words)
        print()
        print('Clue: {} {}! (Score: {})'.format(word, cnt, score))
        print()
        for pick in read_picks(words, my_words, cnt):
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
