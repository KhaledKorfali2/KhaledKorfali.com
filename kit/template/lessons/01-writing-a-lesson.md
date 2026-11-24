# Writing a lesson

A lesson is one text file. The first line, starting with `#`, is its title. Everything after that is the reading, written in Markdown, until one of three special headings.

## Formatting you can use

Write paragraphs as plain text with a blank line between them. You can use **bold**, *italic*, `code` and [links](https://en.wikipedia.org/wiki/Spaced_repetition).

- Lists start with a dash.
- Like this.

1. Numbered lists start with a number and a full stop.
2. Like this.

> Lines starting with `>` become a highlighted box. Use it for examples and key rules.

| Tables | Look like this |
|--------|----------------|
| A row  | Another cell   |

Code goes between lines of three backticks:

```
SELECT name FROM planets WHERE moons > 10;
```

## The three special headings

After the reading, a lesson can have any of these, in this order:

- `## Words` is a table of terms and meanings. Each word becomes a flashcard and gets an automatic quiz question.
- `## Practice` holds the questions you write yourself.
- `## Cards` holds extra flashcards as question and answer pairs.

Finishing a lesson's practice sends its flashcards to the site's Review page, which brings them back on a schedule.

## Words

| Term | Meaning |
|------|---------|
| lesson | one text file in the lessons folder |
| unit | a group of lessons listed in course.json |
| flashcard | a question and answer that comes back for review |
| drill | a quiz question the kit writes for you from a word |

## Practice

? Where does a lesson's title come from?
- The file name
+ The first line, starting with #
- course.json
! The file name is only the lesson's id. The title is the first line of the file.

? Which heading turns a table into flashcards and quiz questions?
+ ## Words
- ## Practice
- ## Cards
! Rows under ## Words become flashcards, and each one gets an automatic question.

## Cards

Q: What three special headings can end a lesson file?
A: ## Words, ## Practice and ## Cards.
