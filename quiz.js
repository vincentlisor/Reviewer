(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const sid = new URLSearchParams(location.search).get("s");
  const app = $("#app");
  const modeChoices = [
    { key: "all", label: "All" },
    { key: "mcq", label: "MCQ" },
    { key: "ident", label: "Identification" },
    { key: "enumer", label: "Enumeration" },
    { key: "sit", label: "Situational" }
  ];

  loadReviewers().then((list) => {
    const subj = list.find((r) => r.id === sid);
    if (!subj) {
      app.innerHTML = `<div class="notice"><h2>Subject not found</h2><p class="muted">Go back and pick a subject.</p><a class="btn" href="index.html">Back to subjects</a></div>`;
      return;
    }
    init(subj);
  });

  function init(subj) {
    document.title = subj.title + " — Jazzi Reviewer";
    $("#subjTitle").textContent = subj.title;
    document.documentElement.style.setProperty("--accent", subj.color || "#2563eb");

    let st = loadState(subj.id) || {};
    st.ans = st.ans || {};
    st.pos = st.pos || {};
    st.set = st.set || {};
    st.salt = st.salt || {};
    st.seen = st.seen || {};
    st.mode = modeChoices.some((m) => m.key === st.mode) ? st.mode : "all";
    st.randomize = typeof st.randomize === "boolean" ? st.randomize : getRandomize();
    st.section = st.section || "";

    const save = () => saveState(subj.id, st);
    const getVisibleSections = () => SECTIONS.filter((s) => (subj[s.key] || []).length && (st.mode === "all" || st.mode === s.key));
    let secs = getVisibleSections();

    function refreshSections() {
      secs = getVisibleSections();
      if (!secs.length) {
        st.section = "";
        return;
      }
      st.section = secs.some((s) => s.key === st.section) ? st.section : secs[0].key;
      secs.forEach((s) => {
        st.ans[s.key] = st.ans[s.key] || {};
        st.pos[s.key] = st.pos[s.key] || 0;
        st.set[s.key] = st.set[s.key] || [];
      });
    }

    function renderCoverageNotice() {
      const topics = Array.isArray(subj.topics) ? subj.topics.length : 0;
      const available = SECTIONS.filter((s) => (subj[s.key] || []).length).length;
      const el = $("#coverageNotice");
      if (!el) return;
      if (topics && available < 4) {
        el.innerHTML = `<strong>Coverage check:</strong> this reviewer may not cover every topic listed for this subject. Add more questions to complete the review set.`;
        el.hidden = false;
      } else {
        el.hidden = true;
        el.innerHTML = "";
      }
    }

    function renderModePanel() {
      const wrap = $("#modePicker");
      if (!wrap) return;
      wrap.innerHTML = modeChoices.map((m) => `
        <button class="mode-btn ${st.mode === m.key ? "selected" : ""}" data-mode="${m.key}" type="button">${m.label}</button>
      `).join("");
      wrap.querySelectorAll("[data-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.mode = btn.dataset.mode;
          refreshSections();
          if (!secs.length) {
            save(); renderAll();
            return;
          }
          newQuiz();
          save(); renderAll();
        });
      });
      const toggle = $("#shuffleToggle");
      if (toggle) {
        toggle.checked = !!st.randomize;
        toggle.onchange = () => {
          st.randomize = toggle.checked;
          newQuiz();
          save(); renderAll();
        };
      }
    }

    if (!secs.length) {
      app.innerHTML = `
        <div class="notice">
          <h2>No questions available</h2>
          <p class="muted">This subject does not have a question bank for the selected mode yet.</p>
          <button class="btn" id="resetModeBtn" type="button">Show all questions</button>
        </div>`;
      $("#resetModeBtn").addEventListener("click", () => {
        st.mode = "all";
        st.randomize = getRandomize();
        refreshSections();
        save();
        init(subj);
      });
      return;
    }

    app.innerHTML = `
      <div class="panel quiz-options">
        <div class="panel-h"><b>Quiz options</b>
          <label class="mini-toggle"><input id="shuffleToggle" type="checkbox" ${st.randomize ? "checked" : ""}><span>Randomize selected questions</span></label>
        </div>
        <div id="modePicker" class="mode-picker"></div>
      </div>
      <div id="coverageNotice" class="coverage-warning" hidden></div>
      <nav class="tabs" id="tabs" role="tablist"></nav>
      <div class="layout">
        <section class="main-col">
          <div class="bar"><div id="secBar"></div></div>
          <article id="qcard" class="qcard"></article>
          <div class="navrow">
            <button class="btn ghost" id="prev">← Previous</button>
            <button class="btn ghost" id="skip" title="Jump to next unanswered">Next unanswered</button>
            <button class="btn" id="next">Next →</button>
          </div>
        </section>
        <aside class="side">
          <div class="panel" id="stats"></div>
          <p class="muted small mode-note" id="modeNote"></p>
          <div class="panel">
            <div class="panel-h"><b>Questions</b></div>
            <div id="palette" class="palette"></div>
            <div class="legend"><span><i class="d ok"></i>Correct</span><span><i class="d bad"></i>Wrong</span><span><i class="d part"></i>Partial</span></div>
          </div>
        </aside>
      </div>`;

    renderModePanel();

    const cur = () => secs.find((s) => s.key === st.section) || secs[0];
    const setOf = (sec) => st.set[sec.key] || [];
    const answeredIn = (sec) => setOf(sec).filter((oi) => st.ans[sec.key][oi]).length;

    /* ---------- attempts: pick the questions for this run ---------- */
    const identity = (n) => Array.from({ length: n }, (_, i) => i);
    function shuffleArr(a) {
      a = a.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    function newAttempt(sec) {
      const n = subj[sec.key].length;
      st.ans[sec.key] = {};
      st.pos[sec.key] = 0;
      if (!st.randomize) {
        st.set[sec.key] = identity(n);
        st.salt[sec.key] = 0;
        return;
      }
      const size = quizSize(n);
      let seen = (st.seen[sec.key] || []).filter((x) => x < n);
      let pick = shuffleArr(identity(n).filter((x) => !seen.includes(x))).slice(0, size);
      if (pick.length < size) {
        const rest = shuffleArr(identity(n).filter((x) => !pick.includes(x)));
        const fill = rest.slice(0, size - pick.length);
        seen = fill.slice();
        pick = shuffleArr(pick.concat(fill));
      } else {
        seen = seen.concat(pick);
      }
      st.seen[sec.key] = seen;
      st.set[sec.key] = pick;
      st.salt[sec.key] = 1 + Math.floor(Math.random() * 1e9);
    }
    function newQuiz() {
      secs.forEach(newAttempt);
      st.rnd = st.randomize;
    }

    secs.forEach((s) => {
      st.ans[s.key] = st.ans[s.key] || {};
      st.pos[s.key] = st.pos[s.key] || 0;
      st.set[s.key] = st.set[s.key] || [];
    });
    const hasAnswers = secs.some((s) => Object.keys(st.ans[s.key] || {}).length);
    const setValid = secs.every((s) => {
      const n = subj[s.key].length, a = st.set[s.key];
      return Array.isArray(a) && a.length > 0 && a.every((x) => Number.isInteger(x) && x >= 0 && x < n) && new Set(a).size === a.length;
    });
    if (!setValid) {
      if (hasAnswers) {
        secs.forEach((s) => { st.set[s.key] = identity(subj[s.key].length); st.salt[s.key] = 0; });
        st.rnd = false;
      } else {
        newQuiz();
      }
    } else if (!hasAnswers && st.rnd !== st.randomize) {
      newQuiz();
    }
    secs.forEach((s) => { if (st.pos[s.key] >= (st.set[s.key] || []).length) st.pos[s.key] = 0; });
    save();

    function renderTabs() {
      $("#tabs").innerHTML = secs.map((s) => {
        const n = setOf(s).length;
        const done = answeredIn(s);
        return `<button role="tab" class="tab ${s.key === st.section ? "on" : ""}" data-k="${s.key}">
          <span>${s.label}</span><small>${done}/${n}</small></button>`;
      }).join("");
      document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
        st.section = b.dataset.k; save(); renderAll();
      }));
    }

    function renderStats() {
      const p = (() => {
        let total = 0;
        let answered = 0;
        let points = 0;
        secs.forEach((s) => {
          const items = setOf(s);
          total += items.length;
          items.forEach((oi) => {
            const a = st.ans[s.key][oi];
            if (a) {
              answered += 1;
              points += pointsOf(s.type, a);
            }
          });
        });
        return { total, answered, points };
      })();
      const acc = p.answered ? Math.round((p.points / p.answered) * 100) : 0;
      $("#stats").innerHTML = `
        <div class="stat-grid">
          <div><b>${p.answered}</b><span>of ${p.total} answered</span></div>
          <div><b>${(Math.round(p.points * 10) / 10)}</b><span>points</span></div>
          <div><b>${acc}%</b><span>accuracy</span></div>
        </div>`;
      const sec = cur(); const n = setOf(sec).length || 0;
      const done = n ? answeredIn(sec) : 0;
      $("#secBar").style.width = n ? Math.round((done / n) * 100) + "%" : "0%";
      $("#modeNote").innerHTML = st.randomize
        ? "🔀 <b>Randomized for this subject.</b> Press <b>↻ Retry</b> for a fresh set of the selected questions."
        : "Randomize is off — this subject is showing the full selected question set in order.";
      renderCoverageNotice();
    }

    function renderPalette() {
      const sec = cur(); const items = setOf(sec);
      $("#palette").innerHTML = items.map((oi, i) => {
        const a = st.ans[sec.key][oi];
        let c = "";
        if (a) {
          if (sec.type === "list") c = a.found >= a.need ? "ok" : a.found > 0 ? "part" : "bad";
          else c = a.ok ? "ok" : "bad";
        }
        return `<button class="pb ${c} ${i === st.pos[sec.key] ? "cur" : ""}" data-i="${i}" aria-label="Question ${i + 1}">${i + 1}</button>`;
      }).join("");
      document.querySelectorAll(".pb").forEach((b) => b.addEventListener("click", () => {
        st.pos[sec.key] = +b.dataset.i; save(); renderQuestion(); renderPalette();
      }));
      const curBtn = $(".pb.cur"); if (curBtn && curBtn.scrollIntoView) curBtn.scrollIntoView({ block: "nearest" });
    }

    function renderQuestion() {
      const sec = cur(); const items = setOf(sec);
      const i = st.pos[sec.key] || 0; const oi = items[i]; const it = subj[sec.key][oi]; const a = st.ans[sec.key][oi];
      if (!it) {
        $("#qcard").innerHTML = `<div class="notice"><h2>Nothing to review here.</h2><p class="muted">Try another quiz mode or switch back to all questions.</p></div>`;
        return;
      }
      let html = `<div class="q-meta"><span class="badge">${sec.label}</span><span class="muted">Question ${i + 1} of ${items.length}</span></div>
        <h2 class="q-text">${esc(it[0])}</h2>`;
      if (!a) html += `<p class="muted hint">${sec.hint}</p>`;

      if (sec.type === "choice") html += choiceHTML(sec, i, it, a);
      else if (sec.type === "text") html += textHTML(it, a);
      else html += listHTML(it, a);

      $("#qcard").innerHTML = html;
      bindQuestion(sec, oi, it, a);
      $("#prev").disabled = i === 0;
      $("#next").disabled = i === items.length - 1;
    }

    function optionsFor(sec, i, it) {
      return seededShuffle([it[1]].concat(it[2]), subj.id + sec.key + i + it[0] + "|" + (st.salt[sec.key] || 0));
    }

    function choiceHTML(sec, i, it, a) {
      const opts = optionsFor(sec, i, it);
      let h = `<div class="opts">`;
      opts.forEach((o, k) => {
        let cls = "opt";
        let mark = "";
        if (a) {
          if (o === it[1]) { cls += " correct"; mark = "✓"; }
          else { cls += " wrong"; mark = "✕"; }
          if (o === a.sel) cls += " picked";
        }
        h += `<button class="${cls}" data-v="${k}" ${a ? "disabled" : ""}><span class="ltr">${"ABCD"[k]}</span><span class="otext">${esc(o)}</span><span class="mark">${mark}</span></button>`;
      });
      h += `</div>`;
      if (a) {
        h += `<div class="feedback ${a.ok ? "ok" : "bad"}"><b>${a.ok ? "Correct!" : "Not quite."}</b> ${a.ok ? "" : "The right answer is <b>" + esc(it[1]) + "</b>."}</div>`;
      }
      return h;
    }

    function textHTML(it, a) {
      const main = it[1].split("|")[0];
      let h = `<div class="text-row"><input id="ans" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type your answer…" value="${a ? esc(a.val) : ""}" ${a ? "disabled" : ""}>
        ${a ? "" : `<button class="btn" id="check">Check</button>`}</div>`;
      if (!a) h += `<button class="link" id="reveal">Show answer</button>`;
      if (a) {
        h += `<div class="feedback ${a.ok ? "ok" : "bad"}"><b>${a.ok ? "Correct!" : a.revealed ? "Answer revealed." : "Not quite."}</b>
          ${a.ok ? "" : "The correct answer is <b>" + esc(main) + "</b>."}</div>`;
      }
      return h;
    }

    function listHTML(it, a) {
      const items = it[1]; const need = it[3] || items.length;
      let h = `<textarea id="ans" rows="6" placeholder="${need === items.length ? "List all " + need + " items" : "List any " + need + " items"}…" ${a ? "disabled" : ""}>${a ? esc(a.val) : ""}</textarea>
        ${a ? "" : `<div class="text-row"><button class="btn" id="check">Check</button></div><button class="link" id="reveal">Show answer</button>`}`;
      if (a) {
        const allReq = need === items.length;
        h += `<div class="feedback ${a.found >= need ? "ok" : a.found > 0 ? "part" : "bad"}"><b>${Math.min(a.found, need)} of ${need} correct.</b>
          ${a.found >= need ? " Complete!" : ""}</div>
          <ul class="checklist">${items.map((x, k) => {
            const hit = a.hits[k];
            const cls = hit ? "ok" : allReq ? "bad" : "neutral";
            return `<li class="${cls}"><span>${hit ? "✓" : allReq ? "✕" : "•"}</span>${esc(x.split("|")[0])}</li>`;
          }).join("")}</ul>
          ${allReq ? "" : `<p class="muted small">Any ${need} of the items above are accepted.</p>`}`;
      }
      return h;
    }

    function showAnswerFeedback(sec, it, a) {
      const need = it[3] || (Array.isArray(it[1]) ? it[1].length : 0);
      const isList = sec.type === "list";
      const ok = isList ? a.found >= need : a.ok;
      const title = a.revealed ? "Answer revealed" : (ok ? "Correct!" : "Not quite.");
      const text = isList
        ? `You got ${Math.min(a.found, need)} of ${need} items correct.`
        : a.revealed
          ? "This is the correct answer."
          : (ok ? "Nice work — that is the correct answer." : "The correct answer is " + esc(it[1].split("|")[0]) + ".");
      const points = [
        isList ? "Explanation: " + (it[2] || "Review the notes above.") : (it[3] || it[2] || "Review the explanation below."),
        sec.type === "choice" ? "Correct answer: " + it[1] : ""
      ].filter(Boolean);
      return confirmModal({
        icon: a.revealed ? "👀" : (ok ? "✓" : "✕"),
        title,
        text,
        points,
        ok: "Continue",
        cancel: "Review question"
      });
    }

    function bindQuestion(sec, oi, it, a) {
      const record = async (obj) => {
        st.ans[sec.key][oi] = obj;
        save();
        renderTabs();
        renderStats();
        renderPalette();
        renderQuestion();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const proceed = await showAnswerFeedback(sec, it, obj);
        if (proceed) {
          go(1);
        }
      };
      if (sec.type === "choice" && !a) {
        const opts = optionsFor(sec, st.pos[sec.key], it);
        document.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => {
          const sel = opts[+b.dataset.v];
          record({ sel, ok: sel === it[1] });
        }));
      }
      if (sec.type === "text" && !a) {
        const inp = $("#ans");
        const go = () => { if (!inp.value.trim()) { inp.focus(); return; } record({ val: inp.value.trim(), ok: checkText(inp.value, it[1]) }); };
        $("#check").addEventListener("click", go);
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
        $("#reveal").addEventListener("click", () => record({ val: inp.value.trim(), ok: false, revealed: true }));
        if (matchMedia("(hover:hover)").matches) inp.focus();
      }
      if (sec.type === "list" && !a) {
        const ta = $("#ans"); const need = it[3] || it[1].length;
        $("#check").addEventListener("click", () => {
          if (!ta.value.trim()) { ta.focus(); return; }
          const hits = checkEnum(ta.value, it[1]);
          record({ val: ta.value.trim(), hits, found: hits.filter(Boolean).length, need });
        });
        $("#reveal").addEventListener("click", () => {
          record({ val: ta.value.trim(), hits: it[1].map(() => false), found: 0, need });
        });
      }
    }

    function go(d) {
      const sec = cur(); const n = setOf(sec).length;
      const j = Math.max(0, Math.min(n - 1, (st.pos[sec.key] || 0) + d));
      st.pos[sec.key] = j; save(); renderQuestion(); renderPalette();
    }
    $("#prev").addEventListener("click", () => go(-1));
    $("#next").addEventListener("click", () => go(1));
    $("#skip").addEventListener("click", () => {
      const sec = cur(); const n = setOf(sec).length; const start = st.pos[sec.key] || 0;
      for (let k = 1; k <= n; k++) {
        const j = (start + k) % n;
        if (!st.ans[sec.key][setOf(sec)[j]]) { st.pos[sec.key] = j; save(); renderQuestion(); renderPalette(); return; }
      }
      alert("You have answered every question in this section. 🎉");
    });

    function confirmModal(o) {
      return new Promise((resolve) => {
        const d = $("#confirmModal");
        $("#cfIcon").textContent = o.icon || "↻";
        $("#cfTitle").textContent = o.title;
        $("#cfText").textContent = o.text || "";
        $("#cfList").innerHTML = (o.points || []).map((p) => `<li>${esc(p)}</li>`).join("");
        $("#cfOk").textContent = o.ok || "Confirm";
        $("#cfCancel").textContent = o.cancel || "Cancel";
        let done = false;
        const finish = (v) => {
          if (done) return; done = true;
          $("#cfOk").onclick = $("#cfCancel").onclick = null;
          d.removeEventListener("cancel", onCancel);
          d.removeEventListener("click", onBackdrop);
          if (d.open) d.close();
          resolve(v);
        };
        const onCancel = (e) => { e.preventDefault(); finish(false); };
        const onBackdrop = (e) => { if (e.target === d) finish(false); };
        $("#cfOk").onclick = () => finish(true);
        $("#cfCancel").onclick = () => finish(false);
        d.addEventListener("cancel", onCancel);
        d.addEventListener("click", onBackdrop);
        d.showModal();
        $("#cfCancel").focus();
      });
    }

    async function retryQuiz() {
      const answered = secs.reduce((n, s) => n + answeredIn(s), 0);
      const ok = await confirmModal({
        icon: "↻",
        title: "Retry this quiz?",
        text: answered ? "You have " + answered + " answered question" + (answered === 1 ? "" : "s") + " in this attempt." : "You haven't answered anything yet.",
        points: [
          "Your current answers will be cleared.",
          st.randomize ? "You'll get a new set of questions from this selected mode." : "Questions go back to the original order in this selected mode.",
          "Your saved progress for this subject will restart."
        ],
        ok: "Yes, retry",
        cancel: "Keep going"
      });
      if (!ok) return;
      newQuiz(); save();
      if ($("#results").open) $("#results").close();
      renderAll();
    }
    $("#retryBtn").addEventListener("click", retryQuiz);

    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if ("abcd".includes(e.key.toLowerCase()) && e.key.length === 1 && cur().type === "choice") {
        const btn = document.querySelectorAll(".opt:not([disabled])")["abcd".indexOf(e.key.toLowerCase())];
        if (btn) btn.click();
      }
    });

    function showResults() {
      let tp = 0, tt = 0;
      const rows = secs.map((s) => {
        const items = setOf(s); const ans = st.ans[s.key];
        let pts = 0, answered = 0;
        items.forEach((oi) => { if (ans[oi]) { answered++; pts += pointsOf(s.type, ans[oi]); } });
        tp += pts; tt += items.length;
        const pct = answered ? Math.round((pts / items.length) * 100) : 0;
        return `<div class="res-row"><div><b>${s.label}</b><span class="muted small">${answered}/${items.length} answered</span></div>
          <div class="res-score">${Math.round(pts * 10) / 10}<small>/${items.length}</small></div>
          <div class="bar slim"><div style="width:${pct}%"></div></div></div>`;
      }).join("");
      const overall = tt ? Math.round((tp / tt) * 100) : 0;
      $("#resultsBody").innerHTML = `<h2>Your results</h2><p class="muted">${esc(subj.title)}</p>
        <div class="big-score"><b>${Math.round(tp * 10) / 10}</b><span>/ ${tt} points · ${overall}%</span></div>${rows}
        <p class="muted small">Unanswered questions count as zero. Enumeration gives partial credit.</p>`;
      $("#results").showModal();
    }
    $("#finishBtn").addEventListener("click", showResults);
    $("#closeResults").addEventListener("click", () => $("#results").close());
    $("#resetAll").addEventListener("click", retryQuiz);

    function renderAll() {
      refreshSections();
      renderModePanel();
      renderTabs();
      renderStats();
      renderPalette();
      renderQuestion();
    }

    renderAll();
  }
})();
