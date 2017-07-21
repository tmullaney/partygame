'''
Original source: https://github.com/atbaker/wikipedia-question-generator

Modified to take an input file with a list of titles for large-scale scraping.

Example:

python wikitrivia.py --input wikipedia-top-5000-titles.txt --output wikipedia-top-5000-questions.json

'''

from article import Article

import click
import json

# For now, hard-code the titles of articles you want to scrape here
SAMPLE_ARTICLES = (
    'Tony Bennett',
    'Gauls',
    'Scabbling',
    'Henry V, Duke of Carinthia',
    'Ukrainian Women\'s Volleyball Super League'
)

@click.command()
@click.option('--input', type=click.File('r'), help='Input file containing list of titles')
@click.option('--output', type=click.File('w'), help='Output to JSON file')
def generate_trivia(input, output):
    """Generates trivia questions from wikipedia articles. If no
    titles are supplied, pulls from these sample articles:

    'Tony Bennett', 'Gauls', 'Scabbling', 'Henry V, Duke of Carinthia',
    'Ukrainian Women\'s Volleyball Super League'
    """
    # Use the sample articles if the user didn't supply any
    if input is None:
        titles = SAMPLE_ARTICLES
    else:
        titles = input.readlines()
        input.close()

    # Remove trailing newline chars
    titles = [x[:-1] for x in titles]

    # Retrieve the trivia sentences
    questions = []
    i = 0
    for article in titles:
        click.echo('Analyzing [{0}]: \'{1}\''.format(i, article))
        try:
            article = Article(title=article)
            questions = questions + article.generate_trivia_sentences()
        except:
            # Seems to fail to find page for TV series... why? Also Java (programming language)
            # But also Ben Afleck. What's the pattern?
            click.echo('Error finding page. Moving on...')
        i += 1

    # Output to stdout or JSON
    if output:
        output_file = output.open()
        json.dump(questions, output_file, sort_keys=True, indent=4)
        click.echo('Output stored in {0}'.format(output.name))
    else:
      click.echo(json.dumps(questions, sort_keys=True, indent=4))

if __name__ == '__main__':
    generate_trivia()
