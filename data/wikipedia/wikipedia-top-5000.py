'''
wikipedia-top-5000.py

Outputs a file listing the names of the top 5000 most popular Wikipedia pages in 2016. 
Topics can then be fed to https://github.com/atbaker/wikipedia-question-generator to 
generate questions.

'''

import os
import sys
import requests
from bs4 import BeautifulSoup

URL_5K_MOST_POPULAR_2016 = 'https://en.wikipedia.org/wiki/User:West.andrew.g/2016_Popular_pages'
OUTFILE_PATH = 'wikipedia-top-5000-titles.txt'

print('Loading page...')
r  = requests.get(URL_5K_MOST_POPULAR_2016)
data = r.text
soup = BeautifulSoup(data, 'lxml')

print('Parsing raw source...')
titles = []
for a in soup.find_all('a'):
    # Link has to be in the big table
    if a.parent.name != 'td':
        continue

    # Link must contain text
    if a.text == '':
        continue

    # Ignore boring pages
    if a.text in ['Main Page', '404.php', '-', 'Featured articles', 'lists', 'Good articles', 'assessment']:
        continue

    # Escape apostrophes and wrap in quotes
    titles.append(a.text)

print('Found ' + str(len(titles)) + ' article titles...')
outstring = '\n'.join(titles)

print('Writing to file...')
with open(OUTFILE_PATH, 'w') as outfile:
    outfile.write(outstring)

print('Done!')