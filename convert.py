#!/usr/bin/python

import sys
import struct
import numpy as np

# Based on the preprocessing in https://github.com/FALCONN-LIB/FALCONN

matrix = []
words = []
with open('dataset/glove.6B.300d.txt', 'r') as inf:
    for counter, line in enumerate(inf):
        word, *rest = line.split()
        words.append(word)
        row = list(map(float, rest))
        assert len(row) == 300
        matrix.append(np.array(row, dtype=np.float32))
        if counter % 10000 == 0:
            sys.stdout.write('%d points processed...\n' % counter)

np.save('dataset/glove.6B.300d', np.array(matrix))

with open('dataset/words', 'w') as ouf:
    ouf.write('\n'.join(words))
