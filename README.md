# Jazzi Reviewer

Open `index.html` in any browser (no server or install needed). Progress is saved in your browser.

## Add a new subject
1. Copy `cardio.js` to `mysubject.js`, change the `id`, title, colour and questions.
2. Add `"mysubject.js"` to `REVIEWER_FILES` in `js/common.js`.
A new card appears on the home page automatically.

## Question formats
- mcq / sit: `[question, rightAnswer, [wrong1, wrong2, wrong3], explanation]` (choices are shuffled automatically)
- ident: `[question, "answer|accepted alternative", explanation]`
- enumer: `[question, ["item|alt", ...], explanation, needN]` (needN optional = "any N items")

## Randomize & Retry
- On the home page, switch **Randomize questions** on. Each attempt then draws a different set of questions (about 40% of each section's bank, preferring ones you have not seen yet), so you can't just memorise them. Answer choices are reshuffled too. Change the share with `QUIZ_FRACTION` in `common.js`.
- Inside a subject, press **↻ Retry** (top bar, or in the Results popup) to clear your answers and start again. With Randomize on you get new questions; with it off you get the full bank in the original order.

## Files
Everything lives in one flat folder (no sub-folders): `index.html`, `quiz.html`, `style.css`, `common.js`, `home.js`, `quiz.js`, and one `.js` data file per subject.
