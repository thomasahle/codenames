Play Codenames with Glove
=========================

This repository implements a simple single-player version of the codenames game
by Vlaada Chvátil.
You can play as the agent or the spymaster, and the Glove word vectors will
take the role of your partner, as you try to find the 8 marked words in as few
rounds as possible.

<pre>
$ <b>git clone git@github.com:thomasahle/codenames.git</b>
...

$ <b>sh get_glove.sh</b>
...

$ <b>python3 codenames.py</b>
...Loading vectors
...Loading words
...Making word to index dict
...Loading codenames
Ready!

Will you be agent or spymaster?: <b>agent</b>

     buck       bat   pumpkin    charge      iron
     well      boot     chick superhero     glove
   stream   germany      sock    dragon scientist
     duck     bugle    school       ham   mammoth
   bridge      fair  triangle   capital      horn

Thinking....................

Clue: "golden 6" (certainty 7.78, remaining words 8)

Your guess: <b>bridge</b>
Correct!
</pre>

How it works
============
The bot decides what words go well together, by comparing their vectors in the GloVe trained on Wikipedia text.
This means that words that often occour in the same articles and sentences are judged to be similar.
In the example about, golden is of course similar to bridge by association with the Golden Gate Bridge.
Other words that were found to be similar were 'dragon', 'triangle', 'duck', 'iron' and 'horn'.

However, in Codenames the task is not merely to find words that describe other words well.
You also need to make sure that 'bad words' are as different as possible from your clue.
To achieve this, the bot tries to find a word that maximizes the similarity gap between the marked words and the bad words.

If you want the bot to be more aggressive in its clues (choosing larger groups), try changing the `agg = .5` value near the top of `codenames.py` to a larger value, such as `.8` or `1.5`. 
