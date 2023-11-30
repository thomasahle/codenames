#!/usr/bin/env python3

import tqdm
import sys
import numpy as np
import argparse

parser = argparse.ArgumentParser(description="Process GloVe dataset.")
parser.add_argument("input", help="Path to the input GloVe text file.")
parser.add_argument("--dim", default=300, help="Expected dimension of each vector")
parser.add_argument("-v", "--output-vectors", help="Path to the output numpy matrix file.", required=True)
parser.add_argument("-w", "--output-words", help="Path to the output words file.", required=True)
args = parser.parse_args()

matrix = []
words = []
with open(args.input, 'r') as inf:
    for counter, line in enumerate(tqdm.tqdm(inf)):
        word, *rest = line.split()
        try:
            row = list(map(float, rest))
        except ValueError:
            print(f'Bad vector for {repr(word)}. Skipping')
            continue
        if len(row) != args.dim:
            print(f'Bad vector length for {repr(word)}. Skipping')
            continue
        words.append(word)
        matrix.append(np.array(row, dtype=np.float32))

np.save(args.output_vectors, np.array(matrix))

with open(args.output_words, 'w') as ouf:
    ouf.write('\n'.join(words))
