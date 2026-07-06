/* 生化学 長文穴埋め問題サイト — アプリロジック */
(function () {
  "use strict";

  var BANK = window.QUESTION_BANK;
  var chapters = BANK.chapters;
  var allQuestions = BANK.questions;

  /* ------- 状態 ------- */
  var state = {
    chapterId: "all",      // 選択中の章 ("all" = 全範囲)
    mode: "type",          // "type"(記述) | "bank"(選択)
    order: [],             // 出題順（質問インデックスの配列）
    pos: 0,                // 現在の出題位置
    graded: false,         // 採点済みか
    inputs: {},            // blankKey -> 入力値
    results: {},           // blankKey -> bool
    stats: { answered: 0, correctBlanks: 0, totalBlanks: 0, perfect: 0 }
  };

  /* ------- 文字列正規化（採点用） ------- */
  function normalize(s) {
    if (s == null) return "";
    s = String(s);
    // 全角英数字・記号 → 半角
    s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
    });
    // 全角スペース→半角、前後・内部空白を除去
    s = s.replace(/　/g, " ");
    s = s.toLowerCase();
    // 空白・各種ハイフン/長音・記号のゆらぎを除去
    s = s.replace(/[\s]/g, "");
    s = s.replace(/[-‐-‒–—―ー−'’`.,、。／\/()（）]/g, "");
    // カタカナの濁点結合などは触らない（別解でカバー）
    return s;
  }

  function acceptedList(blank) {
    var arr = [blank.a];
    if (blank.alt) arr = arr.concat(blank.alt);
    return arr.map(normalize).filter(function (x) { return x.length > 0; });
  }

  function isCorrect(blank, value) {
    var v = normalize(value);
    if (!v) return false;
    return acceptedList(blank).indexOf(v) !== -1;
  }

  /* ------- 出題対象の抽出・シャッフル ------- */
  function questionsForChapter(chId) {
    var list = [];
    for (var i = 0; i < allQuestions.length; i++) {
      if (chId === "all" || allQuestions[i].chapter === chId) list.push(i);
    }
    return list;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function blanksOf(q) {
    return q.segments.filter(function (s) { return typeof s === "object"; });
  }

  /* ------- セッション開始 ------- */
  function startSession(chId) {
    state.chapterId = chId;
    state.order = questionsForChapter(chId);
    shuffle(state.order);
    state.pos = 0;
    state.stats = { answered: 0, correctBlanks: 0, totalBlanks: 0, perfect: 0 };
    resetCurrent();
    showView("quiz");
    renderQuiz();
  }

  function resetCurrent() {
    state.graded = false;
    state.inputs = {};
    state.results = {};
  }

  function currentQuestion() {
    return allQuestions[state.order[state.pos]];
  }

  /* ------- 描画: ホーム ------- */
  function renderHome() {
    var wrap = document.getElementById("chapter-list");
    wrap.innerHTML = "";

    var totalQ = allQuestions.length;
    var totalB = allQuestions.reduce(function (n, q) { return n + blanksOf(q).length; }, 0);

    var allCard = chapterCard({
      id: "all",
      no: "全",
      title: "全範囲からランダム出題",
      subtitle: "全" + chapters.length + "章 / " + totalQ + "問 / 空欄" + totalB + "個",
      count: totalQ
    });
    wrap.appendChild(allCard);

    chapters.forEach(function (ch) {
      var qs = questionsForChapter(ch.id);
      var nb = qs.reduce(function (n, idx) { return n + blanksOf(allQuestions[idx]).length; }, 0);
      wrap.appendChild(chapterCard({
        id: ch.id,
        no: ch.no,
        title: ch.title,
        subtitle: ch.subtitle,
        count: qs.length,
        blanks: nb
      }));
    });
  }

  function chapterCard(info) {
    var el = document.createElement("button");
    el.className = "chapter-card" + (info.id === "all" ? " chapter-card--all" : "");
    el.type = "button";
    var meta = info.id === "all"
      ? "🔀 " + info.subtitle
      : "🔀 ランダム出題 · " + info.count + "問 · 空欄" + info.blanks + "個";
    el.innerHTML =
      '<span class="chapter-no">' + escapeHtml(info.no) + '</span>' +
      '<span class="chapter-body">' +
        '<span class="chapter-title">' + escapeHtml(info.title) + '</span>' +
        '<span class="chapter-sub">' + escapeHtml(info.id === "all" ? "" : info.subtitle) + '</span>' +
        '<span class="chapter-meta">' + escapeHtml(meta) + '</span>' +
      '</span>' +
      '<span class="chapter-arrow" aria-hidden="true">→</span>';
    el.addEventListener("click", function () { startSession(info.id); });
    return el;
  }

  /* ------- 描画: 出題 ------- */
  function renderQuiz() {
    var q = currentQuestion();
    var total = state.order.length;

    // ヘッダ情報
    var ch = chapters.filter(function (c) { return c.id === q.chapter; })[0];
    document.getElementById("quiz-chapter").textContent = ch ? (ch.no + "　" + ch.title) : "";
    document.getElementById("quiz-progress").textContent = (state.pos + 1) + " / " + total;
    document.getElementById("quiz-title").textContent = q.title;
    document.getElementById("quiz-source").textContent = q.source || "";

    // 進捗バー
    var pct = total ? Math.round(((state.pos) / total) * 100) : 0;
    document.getElementById("progress-fill").style.width = pct + "%";

    // 本文の組み立て
    var passage = document.getElementById("passage");
    passage.innerHTML = "";
    var blankIndex = 0;

    // 選択モード用の語群
    var bankWords = null;
    if (state.mode === "bank") {
      bankWords = blanksOf(q).map(function (b) { return b.a; });
      bankWords = shuffle(bankWords.slice());
    }

    q.segments.forEach(function (seg) {
      if (typeof seg === "string") {
        // 改行を <br> に
        var parts = seg.split("\n");
        parts.forEach(function (p, i) {
          if (i > 0) passage.appendChild(document.createElement("br"));
          passage.appendChild(document.createTextNode(p));
        });
      } else {
        blankIndex++;
        var key = "b" + blankIndex;
        passage.appendChild(buildBlank(seg, key, blankIndex, bankWords));
      }
    });

    // 語群パネル
    var bankPanel = document.getElementById("word-bank");
    if (state.mode === "bank" && bankWords) {
      bankPanel.hidden = false;
      bankPanel.innerHTML = '<div class="word-bank-label">語群（クリックで空欄に入力）</div>';
      var chips = document.createElement("div");
      chips.className = "chips";
      bankWords.forEach(function (w) {
        var c = document.createElement("button");
        c.type = "button";
        c.className = "chip";
        c.textContent = w;
        c.addEventListener("click", function () { fillActiveBlank(w, c); });
        chips.appendChild(c);
      });
      bankPanel.appendChild(chips);
    } else {
      bankPanel.hidden = true;
      bankPanel.innerHTML = "";
    }

    // ボタン状態
    state.graded = false;
    state.inputs = {};
    state.results = {};
    document.getElementById("btn-grade").hidden = false;
    document.getElementById("btn-next").hidden = true;
    document.getElementById("btn-retry").hidden = true;
    document.getElementById("score-line").hidden = true;
    var ak = document.getElementById("answer-key");
    ak.hidden = true; ak.innerHTML = "";
    var eb = document.getElementById("explain-box");
    eb.hidden = true; eb.innerHTML = "";

    // 前へボタン
    document.getElementById("btn-prev").disabled = (state.pos === 0);

    // モードトグルの見た目
    syncModeToggle();

    // 最初の空欄にフォーカス
    var first = passage.querySelector(".blank-input");
    if (first && state.mode === "type") first.focus();
  }

  function buildBlank(blank, key, num, bankWords) {
    var span = document.createElement("span");
    span.className = "blank";
    span.setAttribute("data-key", key);

    var input = document.createElement("input");
    input.type = "text";
    input.className = "blank-input";
    input.setAttribute("data-key", key);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("aria-label", "空欄 " + num);
    // 幅の目安を正答長から
    var w = Math.max(4, Math.min(20, blank.a.length + 2));
    input.style.width = (w + 1) + "ch";

    if (state.mode === "bank") {
      input.readOnly = true;
      input.placeholder = "①".length ? ("(" + num + ")") : "";
      input.classList.add("blank-input--bank");
      input.addEventListener("focus", function () { setActiveBlank(input); });
      input.addEventListener("click", function () { setActiveBlank(input); });
    } else {
      input.placeholder = "?";
      input.addEventListener("input", function () {
        state.inputs[key] = input.value;
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (state.graded) { goNext(); return; }
          // 次の空欄へ / 最後なら採点
          var inputs = Array.prototype.slice.call(document.querySelectorAll(".blank-input"));
          var i = inputs.indexOf(input);
          if (i > -1 && i < inputs.length - 1) inputs[i + 1].focus();
          else gradeCurrent();
        }
      });
    }

    var badge = document.createElement("span");
    badge.className = "blank-num";
    badge.textContent = num;

    span.appendChild(badge);
    span.appendChild(input);

    // 採点後に正答を表示する領域
    var ans = document.createElement("span");
    ans.className = "blank-answer";
    ans.setAttribute("data-key", key);
    span.appendChild(ans);

    // ヒント
    if (blank.hint) {
      var h = document.createElement("span");
      h.className = "blank-hint";
      h.textContent = "（" + blank.hint + "）";
      span.appendChild(h);
    }

    return span;
  }

  /* ------- 選択モード: アクティブ空欄への入力 ------- */
  var activeBlankInput = null;
  function setActiveBlank(input) {
    if (state.graded) return;
    activeBlankInput = input;
    Array.prototype.forEach.call(document.querySelectorAll(".blank-input"), function (el) {
      el.classList.toggle("blank-input--active", el === input);
    });
  }
  function fillActiveBlank(word, chip) {
    if (state.graded) return;
    var input = activeBlankInput;
    if (!input) {
      // 最初の空の空欄を探す
      input = Array.prototype.filter.call(document.querySelectorAll(".blank-input"), function (el) {
        return !el.value;
      })[0] || document.querySelector(".blank-input");
    }
    if (!input) return;
    input.value = word;
    state.inputs[input.getAttribute("data-key")] = word;
    // 次の空の空欄へ自動移動
    var inputs = Array.prototype.slice.call(document.querySelectorAll(".blank-input"));
    var next = null;
    var start = inputs.indexOf(input);
    for (var k = 1; k <= inputs.length; k++) {
      var cand = inputs[(start + k) % inputs.length];
      if (!cand.value) { next = cand; break; }
    }
    if (next) setActiveBlank(next); else setActiveBlank(input);
  }

  /* ------- 採点 ------- */
  function gradeCurrent() {
    if (state.graded) return;
    var q = currentQuestion();
    var blanks = blanksOf(q);
    var correct = 0;
    var blankIndex = 0;
    var keyRows = [];

    q.segments.forEach(function (seg) {
      if (typeof seg !== "object") return;
      blankIndex++;
      var key = "b" + blankIndex;
      var input = document.querySelector('.blank-input[data-key="' + key + '"]');
      var val = input ? input.value : "";
      var ok = isCorrect(seg, val);
      state.results[key] = ok;
      if (ok) correct++;

      // 見た目
      input.classList.remove("blank-input--active");
      input.classList.toggle("is-correct", ok);
      input.classList.toggle("is-wrong", !ok);
      input.readOnly = true;
      input.disabled = false;

      var ans = document.querySelector('.blank-answer[data-key="' + key + '"]');
      if (ok) {
        ans.textContent = "✓";
        ans.className = "blank-answer is-correct";
      } else {
        ans.textContent = "→ " + seg.a;
        ans.className = "blank-answer is-wrong";
      }

      keyRows.push({ num: blankIndex, ok: ok, user: val, a: seg.a, alt: seg.alt || [] });
    });

    state.graded = true;

    // 解答と別解の一覧、および解説を表示
    renderAnswerKey(keyRows);
    renderExplain(q);

    // 統計
    state.stats.answered++;
    state.stats.totalBlanks += blanks.length;
    state.stats.correctBlanks += correct;
    if (correct === blanks.length) state.stats.perfect++;

    // スコア表示
    var line = document.getElementById("score-line");
    line.hidden = false;
    var pct = blanks.length ? Math.round((correct / blanks.length) * 100) : 0;
    var cls = correct === blanks.length ? "score-line--perfect" : (pct >= 60 ? "score-line--ok" : "score-line--low");
    line.className = "score-line " + cls;
    line.textContent = "この問題: " + correct + " / " + blanks.length + " 正解（" + pct + "%）"
      + (correct === blanks.length ? "　🎉 全問正解！" : "");

    // ボタン切り替え
    document.getElementById("btn-grade").hidden = true;
    document.getElementById("btn-retry").hidden = false;
    var isLast = (state.pos >= state.order.length - 1);
    document.getElementById("btn-next").hidden = false;
    document.getElementById("btn-next").textContent = isLast ? "結果を見る" : "次の問題 →";

    // 語群を無効化
    Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (c) {
      c.disabled = true;
    });

    // 進捗バー更新
    var pctBar = state.order.length ? Math.round(((state.pos + 1) / state.order.length) * 100) : 0;
    document.getElementById("progress-fill").style.width = pctBar + "%";
  }

  // 採点後に「解答と別解」の一覧を描画する
  function renderAnswerKey(rows) {
    var ak = document.getElementById("answer-key");
    ak.hidden = false;
    var html = '<div class="ak-title">解答と別解（英語や別の言い方でも正解）</div>';
    rows.forEach(function (r) {
      // 別解は表示上の重複を軽く除いて全て見せる
      var alts = (r.alt || []).filter(function (x) { return normalize(x) !== normalize(r.a); });
      html += '<div class="ak-row ' + (r.ok ? "ak-ok" : "ak-ng") + '">'
        + '<span class="ak-n">' + r.num + '</span>'
        + '<span class="ak-body">'
        + '<span class="ak-mark">' + (r.ok ? "✓" : "✗") + '</span>'
        + '<span class="ak-a">' + escapeHtml(r.a) + '</span>'
        + (r.ok ? "" : '<span class="ak-user">あなたの解答: ' + escapeHtml(r.user || "（未入力）") + '</span>')
        + (alts.length ? '<span class="ak-alts">別解: ' + escapeHtml(alts.join(" / ")) + '</span>' : "")
        + '</span>'
        + '</div>';
    });
    ak.innerHTML = html;
  }

  // 採点後に解説を描画する
  function renderExplain(q) {
    var eb = document.getElementById("explain-box");
    if (q && q.explain) {
      eb.hidden = false;
      eb.innerHTML = '<span class="explain-label">解説</span>'
        + '<span class="explain-text">' + escapeHtml(q.explain).replace(/\n/g, "<br>") + '</span>';
    } else {
      eb.hidden = true;
      eb.innerHTML = "";
    }
  }

  function retryCurrent() {
    renderQuiz();
  }

  function goNext() {
    if (state.pos >= state.order.length - 1) {
      showResults();
      return;
    }
    state.pos++;
    renderQuiz();
  }

  function goPrev() {
    if (state.pos === 0) return;
    state.pos--;
    renderQuiz();
  }

  /* ------- 結果画面 ------- */
  function showResults() {
    var s = state.stats;
    var pctB = s.totalBlanks ? Math.round((s.correctBlanks / s.totalBlanks) * 100) : 0;
    document.getElementById("result-perfect").textContent = s.perfect + " / " + s.answered;
    document.getElementById("result-blanks").textContent = s.correctBlanks + " / " + s.totalBlanks + "（" + pctB + "%）";

    var msg = document.getElementById("result-message");
    if (pctB >= 90) msg.textContent = "素晴らしい！ ほぼ完璧です。";
    else if (pctB >= 70) msg.textContent = "良い調子。間違えた箇所を復習しましょう。";
    else if (pctB >= 40) msg.textContent = "もう一歩。まとめノートを見直して再挑戦を。";
    else msg.textContent = "基礎から確認しましょう。焦らず繰り返しが大切です。";

    var ring = document.getElementById("result-ring");
    ring.style.background = "conic-gradient(var(--accent) " + pctB + "%, var(--ring-track) 0)";
    document.getElementById("result-ring-val").textContent = pctB + "%";

    showView("result");
  }

  /* ------- ビュー切替 ------- */
  function showView(name) {
    ["home", "quiz", "result"].forEach(function (v) {
      document.getElementById("view-" + v).hidden = (v !== name);
    });
    window.scrollTo(0, 0);
  }

  /* ------- モードトグル ------- */
  function setMode(mode) {
    state.mode = mode;
    syncModeToggle();
    if (!document.getElementById("view-quiz").hidden) renderQuiz();
  }
  function syncModeToggle() {
    document.getElementById("mode-type").classList.toggle("is-active", state.mode === "type");
    document.getElementById("mode-bank").classList.toggle("is-active", state.mode === "bank");
    document.getElementById("mode-type").setAttribute("aria-pressed", state.mode === "type");
    document.getElementById("mode-bank").setAttribute("aria-pressed", state.mode === "bank");
  }

  /* ------- ユーティリティ ------- */
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ------- 初期化 ------- */
  function init() {
    renderHome();
    showView("home");

    document.getElementById("btn-grade").addEventListener("click", gradeCurrent);
    document.getElementById("btn-next").addEventListener("click", goNext);
    document.getElementById("btn-prev").addEventListener("click", goPrev);
    document.getElementById("btn-retry").addEventListener("click", retryCurrent);
    document.getElementById("btn-home").addEventListener("click", function () { showView("home"); });
    document.getElementById("btn-home-2").addEventListener("click", function () { showView("home"); });
    document.getElementById("btn-restart").addEventListener("click", function () { startSession(state.chapterId); });

    document.getElementById("mode-type").addEventListener("click", function () { setMode("type"); });
    document.getElementById("mode-bank").addEventListener("click", function () { setMode("bank"); });

    // テーマ切替
    var themeBtn = document.getElementById("btn-theme");
    themeBtn.addEventListener("click", function () {
      var root = document.documentElement;
      var cur = root.getAttribute("data-theme");
      var next = cur === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("biochem-theme", next); } catch (e) {}
    });
    try {
      var saved = localStorage.getItem("biochem-theme");
      if (saved) document.documentElement.setAttribute("data-theme", saved);
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
