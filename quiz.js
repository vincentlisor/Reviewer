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

    if (Array.isArray(subj.sit) && subj.sit.length < 50) {
      const base = subj.sit.slice();
      const padded = [];
      while (padded.length < 50) {
        padded.push(base[padded.length % base.length]);
      }
      subj.sit = padded;
    }

    let st = loadState(subj.id) || {};
    st.ans = st.ans || {};
    st.pos = st.pos || {};
    st.set = st.set || {};
    st.salt = st.salt || {};
    st.seen = st.seen || {};
    st.mode = modeChoices.some((m) => m.key === st.mode) ? st.mode : "all";
    st.randomize = typeof st.randomize === "boolean" ? st.randomize : getRandomize();
    st.section = st.section || "";
    st.reviewMode = !!st.reviewMode;

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
        <div class="reviewer-row"><button class="btn ghost" id="reviewerBtn" type="button">View reviewer</button></div>
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

    const reviewerBtn = document.getElementById("reviewerBtn");
    if (reviewerBtn) {
      reviewerBtn.onclick = () => {
        st.reviewMode = true;
        save();
        init(subj);
      };
    }

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
      const size = quizSize(n, sec.key);
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
      const n = subj[s.key].length;
      const a = st.set[s.key];
      const expected = st.randomize ? quizSize(n, s.key) : n;
      return Array.isArray(a) && a.length === expected && a.length > 0 && a.every((x) => Number.isInteger(x) && x >= 0 && x < n) && new Set(a).size === a.length;
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

    function describeClassificationItem(groupLabel, item) {
      const name = String(item || "").split("|")[0].trim();
      const lower = name.toLowerCase();
      const labelLower = String(groupLabel || "").toLowerCase();

      const genericMap = {
        thiazide: "Thiazides reduce sodium and water reabsorption in the early distal tubule, helping lower blood pressure and reduce edema.",
        loop: "Loop diuretics act in the loop of Henle and are strong drugs used for rapid fluid removal in edema and heart failure.",
        "carbonic anhydrase inhibitors": "Carbonic anhydrase inhibitors reduce bicarbonate reabsorption, helping lower intraocular pressure and manage altitude sickness.",
        "potassium-sparing": "Potassium-sparing diuretics help the body excrete sodium while retaining potassium, which is useful in heart failure and hypertension.",
        osmotic: "Osmotic diuretics pull fluid into the renal tubules and bloodstream, reducing intracranial and intraocular pressure.",
        vasodilators: "Vasodilators widen blood vessels to reduce preload and afterload, improving blood flow and lowering blood pressure.",
        diuretics: "Diuretics help remove excess sodium and water, reducing swelling and lowering blood pressure.",
        "beta blockers": "Beta blockers slow heart rate and decrease cardiac workload, helping with angina, heart failure, and hypertension.",
        "beta-1": "Beta-1 blockers mainly act on the heart to slow the heart rate and reduce contractility.",
        "beta-2": "Beta-2 blockers affect bronchial smooth muscle and can be important in patients with asthma or lung disease.",
        "alpha-1 blockers": "Alpha-1 blockers relax vascular smooth muscle, reducing blood pressure and easing urinary obstruction in BPH.",
        "alpha-1 blocker": "Alpha-1 blockers relax vascular smooth muscle and the bladder neck, improving urine flow and blood pressure control.",
        statins: "Statins inhibit cholesterol synthesis in the liver, lowering low-density lipoprotein and reducing cardiovascular risk.",
        "cholesterol absorption inhibitors": "Cholesterol absorption inhibitors reduce absorption of dietary cholesterol in the intestine to lower LDL levels.",
        "bile acid sequestrants": "Bile acid sequestrants bind bile acids in the gut, forcing the liver to use more cholesterol and lower LDL.",
        fibrates: "Fibrates lower triglycerides and help raise HDL cholesterol, especially in patients with hypertriglyceridemia.",
        "pcsk9 inhibitors": "PCSK9 inhibitors block LDL receptor breakdown, increasing LDL clearance and substantially lowering cholesterol levels.",
        "ace inhibitors": "ACE inhibitors prevent angiotensin II formation, causing vasodilation and sodium and water loss to lower blood pressure.",
        "arbs": "ARBs block angiotensin II receptors, lowering blood pressure and reducing pressure on the heart and kidneys.",
        "calcium channel blockers": "Calcium channel blockers relax smooth muscle and reduce cardiac contraction, helping control blood pressure and angina.",
        "centrally acting alpha-2 agonists": "Central alpha-2 agonists reduce sympathetic outflow, lowering blood pressure and heart rate.",
        "direct vasodilators": "Direct vasodilators relax blood vessel smooth muscle to rapidly lower blood pressure or relieve vascular spasm.",
        "catecholamines": "Catecholamines stimulate adrenergic receptors and are used to support heart function or raise blood pressure in shock.",
        "cardiac glycosides": "Cardiac glycosides improve heart contraction and slow the heart rate, which helps in heart failure and atrial fibrillation.",
        "phosphodiesterase inhibitors": "Phosphodiesterase inhibitors increase cardiac contractility and are used for short-term support in heart failure.",
        "nitrates": "Nitrates dilate veins and coronary arteries, reducing oxygen demand and relieving angina.",
        "urinary anti-infectives": "Urinary anti-infectives help clear bacteria from the urinary tract and reduce symptoms of infection.",
        "urinary antispasmodics": "Urinary antispasmodics relax the detrusor muscle to reduce bladder spasms and urgency.",
        "5-alpha reductase inhibitors": "5-alpha reductase inhibitors block conversion of testosterone to DHT, shrinking the prostate and improving urine flow.",
        "alpha-adrenergic blockers": "Alpha-adrenergic blockers relax the smooth muscle of the bladder neck and prostate, improving urine flow in BPH.",
        "bladder protectants": "Bladder protectants coat and protect the urinary lining, reducing irritation and pain in interstitial cystitis.",
        "urinary tract analgesics": "Urinary tract analgesics relieve pain and burning in the urinary tract while the infection is being treated."
      };

      for (const [key, text] of Object.entries(genericMap)) {
        if (labelLower.includes(key) || lower.includes(key)) return text;
      }

      if (lower.includes("thiazide")) return genericMap.thiazide;
      if (lower.includes("loop")) return genericMap.loop;
      if (lower.includes("carbonic") || lower.includes("anhydrase")) return genericMap["carbonic anhydrase inhibitors"];
      if (lower.includes("potassium") || lower.includes("spironolactone") || lower.includes("triamterene") || lower.includes("amiloride")) return genericMap["potassium-sparing"];
      if (lower.includes("osmotic") || lower.includes("mannitol")) return genericMap.osmotic;
      if (lower.includes("vasodilator")) return genericMap.vasodilators;
      if (lower.includes("diuretic")) return genericMap.diuretics;
      if (lower.includes("beta") && lower.includes("blocker")) return genericMap["beta blockers"];
      if (lower.includes("alpha") && lower.includes("blocker")) return genericMap["alpha-1 blockers"];
      if (lower.includes("statin")) return genericMap.statins;
      if (lower.includes("ezetimibe") || lower.includes("absorption")) return genericMap["cholesterol absorption inhibitors"];
      if (lower.includes("bile")) return genericMap["bile acid sequestrants"];
      if (lower.includes("fibrate")) return genericMap.fibrates;
      if (lower.includes("pcsk9") || lower.includes("monoclonal")) return genericMap["pcsk9 inhibitors"];
      if (lower.includes("ace") || lower.includes("captopril") || lower.includes("lisinopril")) return genericMap["ace inhibitors"];
      if (lower.includes("arb") || lower.includes("sartan")) return genericMap.arbs;
      if (lower.includes("calcium") || lower.includes("channel")) return genericMap["calcium channel blockers"];
      if (lower.includes("nitrate") || lower.includes("nitroglycerin")) return genericMap.nitrates;
      if (lower.includes("digoxin") || lower.includes("milrinone")) return genericMap["cardiac glycosides"];
      if (lower.includes("finasteride") || lower.includes("dutasteride") || lower.includes("5-alpha")) return genericMap["5-alpha reductase inhibitors"];
      if (lower.includes("tamsulosin") || lower.includes("alfuzosin") || lower.includes("silodosin")) return genericMap["alpha-adrenergic blockers"];
      return "This group includes the major drug examples used to manage the condition and should be reviewed together as a set.";
    }

    function buildTypeGroups(subj) {
      const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
      const groups = [];
      const seen = new Set();

      (subj.enumer || []).forEach((entry) => {
        const question = String(entry[0] || "");
        const items = Array.isArray(entry[1]) ? entry[1] : [];
        const explanation = String(entry[2] || "").trim();
        if (!items.length) return;

        const match = question.match(/(?:\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(?:type|types|class|classes|group|groups|kind|kinds|category|categories)\s+(?:of|for)\s+(.+?)(?:\s+in\s+|\s+the\s+|\.|$)/i);
        if (!match) return;

        const rawLabel = match[1].trim();
        if (!rawLabel || rawLabel.length > 80) return;

        const countMatch = question.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:type|types|class|classes|group|groups|kind|kinds|category|categories)\b/i);
        const count = countMatch ? (wordMap[countMatch[1].toLowerCase()] || Number.parseInt(countMatch[1], 10) || items.length) : items.length;
        const title = rawLabel.replace(/\s+(?:in|the|reviewer|figure|pdf).*$/i, "").trim();
        const label = `${count} ${count === 1 ? (question.toLowerCase().includes("class") ? "class" : "type") : (question.toLowerCase().includes("class") ? "classes" : "types")} of ${title}`;
        const key = `${label}|${items.slice(0, count).map((x) => String(x).split("|")[0]).join("|")}`;
        if (seen.has(key)) return;
        seen.add(key);

        groups.push({
          label,
          items: items.slice(0, count).map((x) => {
            const name = String(x).split("|")[0].trim();
            return {
              name,
              description: describeClassificationItem(label, name)
            };
          }),
          explanation: explanation || "These are the main categories to review for this topic."
        });
      });

      return groups.slice(0, 6);
    }

    function renderReviewerView() {
      const sections = SECTIONS.filter((s) => (subj[s.key] || []).length);
      const typeGroups = buildTypeGroups(subj);
      const allRows = sections.flatMap((sec) =>
        (subj[sec.key] || []).map((it, idx) => {
          const term = sec.type === "choice"
            ? String(it[1]).split("|")[0]
            : sec.type === "text"
              ? String(it[1]).split("|")[0]
              : Array.isArray(it[1])
                ? it[1].map((x) => String(x).split("|")[0]).join(", ")
                : String(it[1]).split("|")[0];
          const meaning = sec.key === "sit"
            ? applySituationalNames((it[3] || it[2] || ""), idx)
            : (it[3] || it[2] || "");
          return { term, meaning };
        })
      );

      app.innerHTML = `
        <div class="panel reviewer-header">
          <div class="panel-h"><b>Reviewer</b></div>
          <p class="muted">${esc(subj.title)} — concise study notes and explanations.</p>
          <button class="btn ghost" id="exitReviewerBtn" type="button">← Back to quiz</button>
        </div>
        ${typeGroups.length ? `
          <section class="reviewer-section">
            <h2>Quick classification</h2>
            <div class="reviewer-groups">
              ${typeGroups.map((group) => `
                <div class="reviewer-group">
                  <h3>${esc(group.label)}</h3>
                  <p class="reviewer-group-note">${esc(group.explanation)}</p>
                  <div class="reviewer-class-list">
                    ${group.items.map((item) => `
                      <div class="reviewer-class-item">
                        <div class="reviewer-class-name">${esc(item.name)}</div>
                        <div class="reviewer-class-desc">${esc(item.description)}</div>
                      </div>
                    `).join("")}
                  </div>
                </div>
              `).join("")}
            </div>
          </section>
        ` : ""}
        <section class="reviewer-section">
          <div class="reviewer-grid">${allRows.map((row) => `
            <div class="reviewer-item">
              <div class="reviewer-word"><span class="reviewer-tag">Term</span>${esc(row.term)}</div>
              <div class="reviewer-meaning"><span class="reviewer-tag">Meaning</span><span>${esc(row.meaning)}</span></div>
            </div>`).join("")}
          </div>
        </section>
      `;
      const exit = document.getElementById("exitReviewerBtn");
      if (exit) {
        exit.onclick = () => {
          st.reviewMode = false;
          save();
          init(subj);
        };
      }
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

    const situationalNames = ["RVJ", "Jazzmine", "Killua", "Night", "Lilith", "Swim", "Kimmzy", "SprainedEmu", "Saanbibi", "Sanc", "Yuya", "Mitsuki", "Guren", "Shao"];
    function applySituationalNames(text, idx) {
      if (!text || typeof text !== "string") return text;
      const name = situationalNames[(idx || 0) % situationalNames.length];
      return text
        .replace(/\bA client\b/gi, name)
        .replace(/\bthe client\b/gi, name)
        .replace(/\bclient\b/gi, name)
        .replace(/\bthe patient\b/gi, name)
        .replace(/\bpatient\b/gi, name);
    }

    function renderQuestion() {
      const sec = cur(); const items = setOf(sec);
      const i = st.pos[sec.key] || 0; const oi = items[i]; const it = subj[sec.key][oi]; const a = st.ans[sec.key][oi];
      if (!it) {
        $("#qcard").innerHTML = `<div class="notice"><h2>Nothing to review here.</h2><p class="muted">Try another quiz mode or switch back to all questions.</p></div>`;
        return;
      }
      const qText = sec.key === "sit" ? applySituationalNames(it[0], oi) : it[0];
      let explainText = "";
      if (sec.type === "choice") {
        explainText = sec.key === "sit" ? applySituationalNames((it[3] || it[2] || ""), oi) : (it[3] || "");
      } else if (sec.type === "text") {
        explainText = it[2] || "";
      } else {
        explainText = it[2] || "";
      }
      let html = `<div class="q-meta"><span class="badge">${sec.label}</span><span class="muted">Question ${i + 1} of ${items.length}</span></div>
        <h2 class="q-text">${esc(qText)}</h2>`;
      if (!a) html += `<p class="muted hint">${sec.hint}</p>`;

      if (sec.type === "choice") html += choiceHTML(sec, i, it, a, explainText);
      else if (sec.type === "text") html += textHTML(it, a, explainText);
      else html += listHTML(it, a, explainText);

      $("#qcard").innerHTML = html;
      bindQuestion(sec, oi, it, a);
      $("#prev").disabled = i === 0;
      $("#next").disabled = i === items.length - 1;
    }

    function optionsFor(sec, i, it) {
      return seededShuffle([it[1]].concat(it[2]), subj.id + sec.key + i + it[0] + "|" + (st.salt[sec.key] || 0));
    }

    function choiceHTML(sec, i, it, a, explainText) {
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
        h += `<div class="feedback ${a.ok ? "ok" : "bad"}"><b>${a.ok ? "Correct!" : "Not quite."}</b> ${a.ok ? "" : "The right answer is <b>" + esc(it[1]) + "</b>."}</div>
              <div class="explain"><h4>Why is this the answer</h4><p>${esc(explainText || it[3] || "")}</p></div>`;
      }
      return h;
    }

    function textHTML(it, a, explainText) {
      const main = it[1].split("|")[0];
      let h = `<div class="text-row"><input id="ans" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type your answer…" value="${a ? esc(a.val) : ""}" ${a ? "disabled" : ""}>
        ${a ? "" : `<button class="btn" id="check">Check</button>`}</div>`;
      if (!a) h += `<button class="link" id="reveal">Show answer</button>`;
      if (a) {
        h += `<div class="feedback ${a.ok ? "ok" : "bad"}"><b>${a.ok ? "Correct!" : a.revealed ? "Answer revealed." : "Not quite."}</b>
          ${a.ok ? "" : "The correct answer is <b>" + esc(main) + "</b>."}</div>
          <div class="explain"><h4>Why is this the answer</h4><p>${esc(explainText || it[2] || "")}</p></div>`;
      }
      return h;
    }

    function listHTML(it, a, explainText) {
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
          ${allReq ? "" : `<p class="muted small">Any ${need} of the items above are accepted.</p>`}
          <div class="explain"><h4>Why is this the answer</h4><p>${esc(explainText || it[2] || "")}</p></div>`;
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
      const record = (obj) => { st.ans[sec.key][oi] = obj; save(); renderTabs(); renderStats(); renderPalette(); renderQuestion(); };
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
      if (st.reviewMode) {
        renderReviewerView();
        return;
      }
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
