mkdir dataset
cd dataset
wget http://nlp.stanford.edu/data/glove.6B.zip
unzip glove.6B.zip glove.6B.300d.txt
rm globe.6B.zip
cd ..
python convert.py
