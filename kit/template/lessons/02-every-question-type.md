# Every question type

There are five kinds of question. Each starts on a line beginning with `?`. Open this file to see how each one below is written.

Two things work in every question:

- A line starting with `!` is the explanation shown after the learner answers.
- Lines starting with `>` are shown in a box under the question, for a quote or example to study.

## Practice

? A choice question: lines start with - for wrong answers and + for the right one.
- Wrong
+ Right
- Also wrong
! Options are shuffled each time. Add a line saying @fixed to keep your order.

? With more than one + line, the learner has to pick all of them. Which are planets?
+ Mars
+ Venus
- The Moon
- Sirius
! Mars and Venus are planets. The Moon is a moon and Sirius is a star.

?type A typed question lists every answer you will accept on lines starting with =. What is 6 × 7?
= 42
= forty two
= forty-two
! Capital letters, punctuation and extra spaces are ignored when checking.

?order An ordering question has one line of tiles separated by |. Put these in order, smallest first.
> An optional x line adds decoy tiles that don't belong.
planet | star | galaxy
x teapot
! The tiles are shown shuffled; the order you write them in is the answer.

?match A matching question has one pair per line, joined by an equals sign.
Mercury = closest to the Sun
Jupiter = largest planet
Saturn = famous for its rings

?sort A sorting question lists each group, then its items.
Planets: Earth, Mars, Neptune
Stars: Sirius, Vega
! Separate items with commas, or with | if an item contains a comma.
