#!/usr/bin/env python3

import numpy as np
import argparse
import tqdm
import re

parser = argparse.ArgumentParser()
parser.add_argument("vectors", help="Vectors to compress")
parser.add_argument("words", help="The coresponding words, because we do filtering")
parser.add_argument("-n", default=50000, type=int, help="Number of words to include")
parser.add_argument("-f", type=str, nargs='*', help="Take only words from this file")

def quantize_8bit(data, alpha):
    # Normalize data to 0-1
    min_val = np.min(data) * alpha
    max_val = np.max(data) * alpha
    data = data.clip(min_val, max_val)
    normalized = (data - min_val) / (max_val - min_val)
    # Scale to 0-255 and convert to uint8
    quantized = (normalized * 255).astype(np.uint8)
    return quantized, min_val, max_val

def dequantize_8bit(quantized, min_val, max_val):
    # Convert back to float range 0-1
    normalized = quantized.astype(np.float32) / 255
    # Scale back to original range
    dequantized = normalized * (max_val - min_val) + min_val
    return dequantized

def main(args):
    vecs = np.load(args.vectors)
    # vecs /= np.linalg.norm(vecs, axis=1, keepdims=True)
    with open(args.words) as file:
        words = file.readlines()

    good_words = set()
    print(args.f)
    for path in args.f:
        with open(path) as file:
            good_words |= {line.lower().strip() for line in file}
    print(f'{len(good_words)=}')
    print(list(good_words)[:3])

    print(len(vecs), len(words))
    assert len(vecs) == len(words)

    included_vectors = []
    included_words = []
    seen = set()
    for vec, word in zip(vecs, tqdm.tqdm(words, total=args.n)):
        word = word.lower()
        word = re.sub('[^a-z0-9]', '', word)
        if not word or word.isdigit():
            continue
        if word in seen:
            continue
        if good_words and word not in good_words:
            continue
        seen.add(word)
        included_vectors.append(vec)
        included_words.append(word)
        if len(included_words) == args.n:
            break

    x = np.stack(included_vectors)

    best_alpha, best_err = 0, 1000
    for alpha in tqdm.tqdm(np.linspace(x.std()/np.abs(x).max(), 1)):
        compressed, min_val, max_val = quantize_8bit(x, alpha)
        restored = dequantize_8bit(compressed, min_val, max_val)
        err = np.linalg.norm(x - restored, axis=1) / np.linalg.norm(x, axis=1)
        #merr = (err**2).mean()
        merr = err.mean()
        if merr < best_err:
            best_err = merr
            best_alpha = alpha
        # print(f"{alpha}, Mean error: {merr}")
    print(f"{best_alpha=}")

    compressed, min_val, max_val = quantize_8bit(x, best_alpha)
    print("IMPORTANT:")
    print(f"min={min_val}, max={max_val}")

    restored = dequantize_8bit(compressed, min_val, max_val)
    err = np.linalg.norm(x - restored, axis=1) / np.linalg.norm(x, axis=1)
    print(f"Mean error: {err.mean()}")

    data = compressed.tobytes()
    print(f"Size: {len(data)/10**6}MB")

    with open(f'{args.vectors}.out', 'wb') as file:
        file.write(data)
    with open(f'{args.words}.out', 'w') as file:
        file.write("\n".join(included_words))

main(parser.parse_args())
