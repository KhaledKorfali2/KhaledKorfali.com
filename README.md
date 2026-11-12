# khaledkorfali.com

Personal project site of Khaled Korfali: 22 interactive projects that run entirely in the browser. They are written in JavaScript with no build step, and use WebAssembly builds of SQLite, PostgreSQL (PGlite), Python with pandas (Pyodide) and the OpenCascade CAD kernel (replicad) where a course needs a real engine. Three.js, MediaPipe and Tesseract.js power the 3D views, face and hand tracking, and text recognition. Live at <https://khaledkorfali.com>.

## Security

- [Breach](https://khaledkorfali.com/projects/breach/index.html): Learn cybersecurity by doing: capture flags from simulated websites, packet captures, logs and code, across 17 tracks mapped to ten certifications from ISC2 CC and Security+ up to CISSP.

## Programming and courses

- [Quarry](https://khaledkorfali.com/projects/quarry/index.html): Learn databases by doing: write real queries in live consoles and capture a flag for every skill. A full MySQL course from your first SELECT to production data fixes, plus PostgreSQL, SQLite, pandas, document databases and vector search.
- [Datum](https://khaledkorfali.com/projects/datum/index.html): Learn CAD by building the part: sketch, extrude, cut, fillet and shell on a real CAD kernel until your solid matches the target, then export it for 3D printing.
- [Pattern Trace](https://khaledkorfali.com/projects/interview-prep/index.html): Spot the pattern in 150+ LeetCode problems, with spaced repetition and step-through visualisations.
- [Vim System](https://khaledkorfali.com/projects/cs-courses/vim-sim-index.html): An interactive course that teaches Vim motions and operators in the browser.
- [Linux File System](https://khaledkorfali.com/projects/cs-courses/fs-sim-index.html): Learn the shell by navigating a simulated Linux file system.
- [Git System](https://khaledkorfali.com/projects/cs-courses/git-sim-index.html): See commits, branches and merges take shape as you type git commands.
- [Sorting Algorithm Simulator](https://khaledkorfali.com/projects/sorting-simulator/index.html): Step through sorting algorithms and watch every comparison and swap.
- [Graph Algorithm Simulator](https://khaledkorfali.com/projects/graph-simulator/index.html): Build a graph and watch BFS, Dijkstra, A*, Kruskal and more run step by step.
- [Frontend Playground](https://khaledkorfali.com/projects/frontend-playground/index.html): Guided HTML, CSS and JavaScript lessons with a live preview.
- [Logic Gate Simulator](https://khaledkorfali.com/projects/gatevis/index.html): Wire up logic gates and watch signals propagate through the circuit.
- [Noosphere](https://khaledkorfali.com/projects/noosphere/index.html): An interactive particle field that responds to your cursor or touch.
- [Wire: How Networks Work](https://khaledkorfali.com/projects/web-protocol-comparer/index.html): An interactive networking course: watch real packets as you learn TCP, TLS, HTTP/2, HTTP/3 and more.

## Simulations

- [Falling Sand Simulator](https://khaledkorfali.com/projects/falling-sand/index.html): A particle sandbox of sand, water, fire and smoke interacting cell by cell.
- [Boid Simulator](https://khaledkorfali.com/projects/boid-simulator/index.html): Flocking behaviour from three simple rules: separation, alignment, cohesion.
- [Facepaint](https://khaledkorfali.com/projects/facepaint/index.html): Draw with your face using your webcam: open your mouth to paint.
- [Conway's Game of Life](https://khaledkorfali.com/projects/game-of-life/index.html): The classic cellular automaton: draw a pattern and let it evolve.

## Arabic learning

- [Arabic Letter Quiz](https://khaledkorfali.com/projects/arabic-letter-quiz/index.html): Drill the 28 letters of the Arabic alphabet and their forms.
- [Arabic Flashcards](https://khaledkorfali.com/projects/arabic-flashcards/index.html): Flip through Arabic letters and their isolated, initial, medial and final forms.
- [Arabic Word Guess](https://khaledkorfali.com/projects/arabic-word-guess/index.html): A Wordle-style game for guessing Qur'anic Arabic words letter by letter.
- [Arabic Word Breakdown](https://khaledkorfali.com/projects/arabic-breakdown/index.html): Paste or scan Arabic text and hear it broken down letter by letter.
- [Surah Quiz](https://khaledkorfali.com/projects/surah-quiz/index.html): Test your knowledge of the 114 surahs: names, numbers and order.

## Running it locally

There is nothing to build or install. Serve the folder with any static file server and open it:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>. Opening the files directly with `file://` does not work, because the projects use ES modules and WebAssembly.

## Layout

- `index.html`, `projects.html`, `styles.css`, `script.js`: the home page and project list. The project list lives in `script.js`.
- `projects/<name>/`: one self-contained folder per project.
- `screenshots/`: the card images.
- Third-party code is vendored under each project's `vendor/` folder with its licence.
- `projects/quarry/test/` and `projects/datum/test/`: Node.js suites that solve every challenge (`node test/run.mjs`), plus in-browser end-to-end tests.

## Licence

See [LICENSE](LICENSE). Vendored libraries keep their own licences.
