(function () {
  "use strict";
  const cards = document.getElementById("cards");
  const empty = document.getElementById("empty");
  const search = document.getElementById("search");
  let subjects = [];

  function render(filter) {
    const q = (filter || "").trim().toLowerCase();
    const list = subjects.filter((s) =>
      !q || (s.title + " " + s.code + " " + s.description + " " + (s.topics || []).join(" ")).toLowerCase().includes(q)
    );
    empty.hidden = list.length > 0;
    cards.innerHTML = list.map(card).join("");
  }

  function card(s) {
    const p = progressOf(s);
    const pct = p.total ? Math.round((p.answered / p.total) * 100) : 0;
    const acc = p.answered ? Math.round((p.points / p.answered) * 100) : null;
    const rnd = getRandomize();
    const counts = SECTIONS.map((sec) => {
      const n = (s[sec.key] || []).length;
      return `<div><b>${rnd ? quizSize(n) : n}</b><span>${sec.label}</span></div>`;
    }).join("");
    return `
    <a class="card" href="quiz.html?s=${encodeURIComponent(s.id)}" style="--accent:${esc(s.color || "#2563eb")}">
      <div class="card-top">
        <div class="card-icon">${s.icon || "📘"}</div>
        <span class="chip">${esc(s.code || "")}</span>
      </div>
      <h2>${esc(s.title)}</h2>
      <p class="muted">${esc(s.description || "")}</p>
      <div class="counts">${counts}</div>
      <div class="chips">${(s.topics || []).slice(0, 6).map((t) => `<span class="chip soft">${esc(t)}</span>`).join("")}</div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="card-foot">
        <span class="muted">${p.answered}/${p.total} answered${acc !== null ? " · " + acc + "% accuracy" : ""}</span>
        <span class="go">${p.answered ? "Continue" : "Start"} →</span>
      </div>
    </a>`;
  }

  const toggle = document.getElementById("rndToggle");
  const hint = document.getElementById("rndHint");
  function paintHint() {
    hint.textContent = getRandomize()
      ? "ON — each attempt draws a different set of questions from the bank. Press Retry inside a subject for a new set."
      : "OFF — you get every question in the original order.";
  }
  toggle.checked = getRandomize();
  paintHint();
  toggle.addEventListener("change", () => { setRandomize(toggle.checked); paintHint(); render(search.value); });

  loadReviewers().then((list) => {
    subjects = list;
    render("");
  });
  search.addEventListener("input", () => render(search.value));
  window.addEventListener("pageshow", () => { toggle.checked = getRandomize(); paintHint(); render(search.value); });
})();
