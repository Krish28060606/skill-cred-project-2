(() => {
  const $ = (id) => document.getElementById(id);

  // State
  let file = null;
  let quizData = [];
  let quizTitle = "";

  // Elements
  const dropZone = $("dropZone");
  const fileInput = $("fileInput");
  const fileStatus = $("fileStatus");
  const mcRange = $("mcRange");
  const tfRange = $("tfRange");
  const mcVal = $("mcVal");
  const tfVal = $("tfVal");
  const generateBtn = $("generateBtn");
  const exportBtn = $("exportBtn");
  const submitBtn = $("submitBtn");
  const quizOutput = $("quizOutput");
  const titleInput = $("titleInput");

  // Inject Difficulty selector in settings
  let difficultySel = document.getElementById("difficultySel");
  if (!difficultySel && generateBtn && generateBtn.parentElement) {
    const container = generateBtn.parentElement;
    const wrap = document.createElement("div");
    wrap.style.marginTop = "8px";

    const label = document.createElement("label");
    label.textContent = "Difficulty";
    label.style.display = "block";
    label.style.margin = "6px 0 4px";

    difficultySel = document.createElement("select");
    difficultySel.id = "difficultySel";
    Object.assign(difficultySel.style, {
      width: "100%",
      padding: "8px",
      borderRadius: "8px",
      border: "1px solid #d1d5db",
    });

    const opts = [
      ["easy", "Low"],
      ["moderate", "Moderate"],
      ["hard", "Difficult"],
    ];
    for (const [val, text] of opts) {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = text;
      if (val === "moderate") o.selected = true;
      difficultySel.appendChild(o);
    }

    wrap.appendChild(label);
    wrap.appendChild(difficultySel);
    container.insertBefore(wrap, generateBtn);
  }

  // Sync slider labels
  mcRange.oninput = () => (mcVal.textContent = mcRange.value);
  tfRange.oninput = () => (tfVal.textContent = tfRange.value);

  // Basic file selection
  dropZone.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    if (fileInput.files && fileInput.files.length) {
      file = fileInput.files[0];
      fileStatus.textContent = file.name;
    }
  };

  // Drag & Drop - robust implementation
  ["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
    window.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  let dragCounter = 0;

  dropZone.addEventListener("dragenter", () => {
    dragCounter++;
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragover", (e) => {
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    dropZone.classList.add("dragover");
  });

  dropZone.addEventListener("dragleave", () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) dropZone.classList.remove("dragover");
  });

  dropZone.addEventListener("drop", (e) => {
    dragCounter = 0;
    dropZone.classList.remove("dragover");

    const dt = e.dataTransfer;
    if (!dt) return;

    const files = dt.files && dt.files.length
      ? Array.from(dt.files)
      : dt.items
      ? Array.from(dt.items)
          .filter((it) => it.kind === "file")
          .map((it) => it.getAsFile())
          .filter(Boolean)
      : [];

    if (!files.length) return;
    const f = files[0];
    const isPdf = f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!isPdf) {
      alert("Please drop a PDF file.");
      return;
    }
    file = f;
    fileStatus.textContent = file.name;
  });

  // PDF text extraction using pdf.js
  async function extractText(pdfFile) {
    const buf = await pdfFile.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + " ";
    }
    return text;
  }

  // Helpers
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pickExactly = (arr, n) => {
    const out = [];
    if (!arr.length) return out;
    for (let i = 0; i < n; i++) out.push(arr[rand(arr.length)]);
    return out;
  };

  // Question generation with difficulty and exact counts
  function generateQuestions(text, mcCount, tfCount, level = "moderate") {
    // Sentences
    let sentencesAll = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.split(/\s+/).length >= 6);

    if (!sentencesAll.length) {
      sentencesAll = [
        "This document has limited text. Please use this placeholder sentence.",
      ];
    }

    // Word frequency for heuristics
    const wordList = text.toLowerCase().match(/\b[a-z][a-z\-']{2,}\b/g) || [];
    const freq = {};
    for (const w of wordList) freq[w] = (freq[w] || 0) + 1;

    // Vocabulary
    const vocab = Array.from(new Set(wordList));

    function sentencePool(level) {
      const byLen = sentencesAll.map((s) => ({ s, len: s.split(/\s+/).length }));
      let filtered;
      if (level === "easy") filtered = byLen.filter((x) => x.len >= 6 && x.len <= 16);
      else if (level === "hard") filtered = byLen.filter((x) => x.len >= 14);
      else filtered = byLen.filter((x) => x.len >= 8 && x.len <= 22);
      return filtered.length ? filtered.map((x) => x.s) : sentencesAll;
    }

    function chooseTargetWord(sentence, level) {
      const words = sentence.match(/\b[A-Za-z][A-Za-z\-']{3,}\b/g) || [];
      if (!words.length) return null;
      const infos = words.map((w) => ({
        w,
        lw: w.toLowerCase(),
        len: w.length,
        freq: freq[w.toLowerCase()] || 0,
      }));

      if (level === "easy") {
        // Prefer common, medium-length words
        infos.sort((a, b) => b.freq - a.freq || a.len - b.len);
        const top = infos.slice(0, Math.min(5, infos.length));
        return top[rand(top.length)].w;
      } else if (level === "hard") {
        // Prefer rarer, longer words
        infos.sort((a, b) => a.freq - b.freq || b.len - a.len);
        const top = infos.slice(0, Math.min(5, infos.length));
        return top[rand(top.length)].w;
      } else {
        // Moderate: middle-frequency
        infos.sort((a, b) => b.freq - a.freq);
        const midStart = Math.floor(infos.length / 3);
        const midEnd = Math.max(midStart + 1, Math.floor((2 * infos.length) / 3));
        const mid = infos.slice(midStart, midEnd);
        const pool = mid.length ? mid : infos;
        return pool[rand(pool.length)].w;
      }
    }

    function makeDistractors(correct, level) {
      if (!correct) return ["None", "N/A", "All of the above"];
      const base = String(correct).toLowerCase();
      const isCap = /^[A-Z]/.test(correct);
      const baseLen = base.length;

      let pool = vocab.filter((w) => w !== base);
      if (level === "easy") {
        pool.sort((a, b) => (freq[b] || 0) - (freq[a] || 0));
      } else if (level === "hard") {
        pool = pool.filter((w) => Math.abs(w.length - baseLen) <= 1 && w[0] === base[0]);
        if (!pool.length) pool = vocab.filter((w) => Math.abs(w.length - baseLen) <= 2);
      } else {
        pool = pool.filter((w) => Math.abs(w.length - baseLen) <= 2);
      }

      const out = new Set();
      while (out.size < 3 && pool.length) {
        out.add(pool[rand(pool.length)]);
        if (out.size >= pool.length) break;
      }
      let arr = Array.from(out);
      while (arr.length < 3 && vocab.length) {
        const w = vocab[rand(vocab.length)];
        if (!arr.includes(w) && w !== base) arr.push(w);
      }
      while (arr.length < 3) arr.push("None");
      return arr.slice(0, 3).map((w) => (isCap ? w[0].toUpperCase() + w.slice(1) : w));
    }

    // MCQ (exact count)
    let mcPool = sentencePool(level);
    if (!mcPool.length) mcPool = sentencesAll;
    const mcSentences = pickExactly(mcPool, mcCount);
    const mc = mcSentences.map((s, i) => {
      const target = chooseTargetWord(s, level);
      let questionText = s;
      let answer = "";
      if (target) {
        const re = new RegExp(`\\b${escapeRegExp(target)}\\b`);
        questionText = s.replace(re, "_____");
        answer = target;
      } else {
        questionText = s.replace(/\b(\w+)\b/, "_____");
        answer = (s.match(/\b(\w+)\b/) || ["", ""])[1] || "";
      }
      const distractors = makeDistractors(answer, level);
      const options = shuffle([answer, ...distractors]).map(String);
      return { q: `Q${i + 1}: Complete the sentence: ${questionText}`, opts: options, ans: answer };
    });

    // True/False (exact count)
    const tfSentences = pickExactly(sentencesAll, tfCount);
    const falseProb = level === "easy" ? 0.3 : level === "hard" ? 0.7 : 0.5;
    const tf = tfSentences.map((s, i) => {
      const parts = s.split(/(\W+)/);
      let madeFalse = false;
      if (Math.random() < falseProb) {
        const idxs = parts
          .map((w, idx) => ({ w, idx }))
          .filter((x) => /^[A-Za-z]{4,}$/.test(x.w));
        if (idxs.length) {
          const pick = idxs[rand(idxs.length)];
          let candidates = vocab.filter((w) => w.toLowerCase() !== pick.w.toLowerCase());
          if (level === "hard") {
            candidates = candidates.filter((w) => w[0] === pick.w[0].toLowerCase() && Math.abs(w.length - pick.w.length) <= 1);
          } else if (level === "moderate") {
            candidates = candidates.filter((w) => Math.abs(w.length - pick.w.length) <= 2);
          }
          if (candidates.length) {
            let replacement = candidates[rand(candidates.length)];
            if (/^[A-Z]/.test(pick.w)) replacement = replacement[0].toUpperCase() + replacement.slice(1);
            parts[pick.idx] = replacement;
            madeFalse = true;
          }
        }
      }
      const stmt = parts.join("");
      return { q: `Q${i + 1}: ${stmt}`, opts: ["True", "False"], ans: madeFalse ? "False" : "True" };
    });

    return [...mc, ...tf];
  }

  // Render quiz with radio inputs
  function renderQuiz(list) {
    quizOutput.innerHTML = "";

    if (quizTitle && quizTitle.trim()) {
      const t = document.createElement("h3");
      t.className = "quiz-title";
      t.textContent = quizTitle.trim();
      quizOutput.appendChild(t);
    }

    const banner = document.createElement("div");
    banner.id = "scoreBanner";
    banner.className = "score-banner";
    banner.textContent = "Attempt the test and press Submit to see your score.";
    quizOutput.appendChild(banner);

    list.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "q";
      const group = `q_${idx}`;

      const optionsHtml = item.opts
        .map(
          (o, oi) => `
          <label class="opt">
            <input type="radio" name="${group}" value="${oi}">
            <span>${o}</span>
          </label>`
        )
        .join("");

      card.innerHTML = `
        <h3>${item.q}</h3>
        <ul>${optionsHtml}</ul>
        <div class="answer" data-answer="${item.ans}" style="display:none">Correct: ${item.ans}</div>
      `;
      quizOutput.appendChild(card);
    });

    submitBtn.disabled = list.length === 0;
  }

  // Generate (supports typed text or PDF)
  generateBtn.onclick = async () => {
    const typed = (document.getElementById("textInput") && document.getElementById("textInput").value || "").trim();
    quizTitle = (document.getElementById("titleInput") && document.getElementById("titleInput").value || "").trim();
    if (!typed && !file) {
      alert("Please enter text or upload a PDF first.");
      return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = "Generating...";
    try {
      let text = typed;
      if (!text) {
        text = await extractText(file);
      }
      // Validate sufficient content before generating
      const wordCount = (String(text).match(/\b[a-zA-Z0-9'-]+\b/g) || []).length;
      if (wordCount < 20) {
        alert("Please enter relevant information to make questions.");
        generateBtn.disabled = false;
        generateBtn.textContent = "Generate Quiz";
        return;
      }
      const level = (difficultySel && difficultySel.value) || "moderate";
      quizData = generateQuestions(text, +mcRange.value, +tfRange.value, level);
      renderQuiz(quizData);
      exportBtn.disabled = false;
      submitBtn.disabled = false;
    } catch (e) {
      console.error(e);
      alert("Could not read PDF.");
    }
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate Quiz";
  };

  // Submit
  submitBtn.onclick = () => {
    if (!quizData.length) return;

    const cards = Array.from(quizOutput.querySelectorAll(".q"));
    let score = 0;

    cards.forEach((card, idx) => {
      const item = quizData[idx];
      const inputs = Array.from(card.querySelectorAll('input[type="radio"]'));
      const labels = Array.from(card.querySelectorAll("label.opt"));
      const selected = inputs.find((i) => i.checked);

      inputs.forEach((i) => (i.disabled = true));

      const ansDiv = card.querySelector(".answer");
      ansDiv.style.display = "block";

      const correctIndex = item.opts.findIndex(
        (o) => String(o).trim() === String(item.ans).trim()
      );

      if (selected) {
        const selectedIndex = inputs.indexOf(selected);
        if (selectedIndex === correctIndex) {
          score++;
          labels[selectedIndex].classList.add("correct");
        } else {
          labels[selectedIndex].classList.add("incorrect");
          if (correctIndex >= 0) labels[correctIndex].classList.add("correct");
        }
      } else {
        if (correctIndex >= 0) labels[correctIndex].classList.add("correct");
      }
    });

    const banner = document.getElementById("scoreBanner");
    if (banner) {
      banner.classList.add("show");
      banner.textContent = `Score: ${score} / ${quizData.length}`;
    } else {
      alert(`Score: ${score} / ${quizData.length}`);
    }

    submitBtn.disabled = true;
  };

  // Export (standardized layout with answer key)
  exportBtn.onclick = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = { left: 15, right: 15, top: 15, bottom: 15 };
    const contentWidth = pageWidth - margin.left - margin.right;
    const lineGap = 6;

    let y = margin.top;

    const splitTo = (text, x) =>
      doc.splitTextToSize(String(text), contentWidth - (x - margin.left));

    function ensureSpace(linesNeeded = 1) {
      if (y + linesNeeded * lineGap > pageHeight - margin.bottom) {
        doc.addPage();
        y = margin.top;
      }
    }

    function addWrapped(text, x, fontSize = 12) {
      doc.setFontSize(fontSize);
      const lines = splitTo(text, x);
      for (const line of lines) {
        ensureSpace(1);
        doc.text(line, x, y);
        y += lineGap;
      }
    }

    function sanitizeQuestionText(s) {
      return String(s).replace(/^Q\d+:\s*/, "");
    }

    // Header
    doc.setFontSize(18);
    const headerTitle = (quizTitle && String(quizTitle).trim()) ? String(quizTitle).trim() : "Quiz";
    doc.text(`Questa - ${headerTitle}`, margin.left, y);
    y += lineGap + 2;

    doc.setFontSize(12);
    doc.text("Name: ____________________________", margin.left, y);
    doc.text("Date: __________________", pageWidth / 2, y);
    y += lineGap + 2;

    // Split sections
    const mcItems = quizData.filter((q) => (q.opts || []).length > 2);
    const tfItems = quizData.filter((q) => (q.opts || []).length === 2);

    // MC Section
    if (mcItems.length) {
      doc.setFontSize(14);
      doc.text("Section A: Multiple Choice", margin.left, y);
      y += lineGap;
      doc.setFontSize(11);

      mcItems.forEach((q, idx) => {
        const qText = sanitizeQuestionText(q.q);
        addWrapped(`${idx + 1}. ${qText}`, margin.left, 12);

        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        q.opts.forEach((opt, oi) => {
          const xBox = margin.left + 4;
          const xTxt = xBox + 8;
          ensureSpace(1);
          doc.rect(xBox, y - 4.5, 4, 4);
          const lines = splitTo(`${letters[oi]}. ${opt}`, xTxt);
          for (let i = 0; i < lines.length; i++) {
            ensureSpace(1);
            doc.text(lines[i], xTxt, y);
            y += lineGap;
          }
        });
        y += 2;
      });
    }

    // TF Section
    if (tfItems.length) {
      ensureSpace(2);
      doc.setFontSize(14);
      doc.text("Section B: True / False", margin.left, y);
      y += lineGap;
      doc.setFontSize(11);

      tfItems.forEach((q, idx) => {
        const qText = sanitizeQuestionText(q.q);
        addWrapped(`${idx + 1}. ${qText}`, margin.left, 12);
        ensureSpace(1);
        const xBox1 = margin.left + 4;
        const xBox2 = margin.left + Math.max(60, contentWidth / 2);
        doc.rect(xBox1, y - 4.5, 4, 4);
        doc.text("True", xBox1 + 6, y);
        doc.rect(xBox2, y - 4.5, 4, 4);
        doc.text("False", xBox2 + 6, y);
        y += lineGap + 2;
      });
    }

    // Answer Key
    doc.addPage();
    y = margin.top;
    doc.setFontSize(16);
    doc.text("Answer Key", margin.left, y);
    y += lineGap;

    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    if (mcItems.length) {
      doc.setFontSize(13);
      doc.text("Section A: Multiple Choice", margin.left, y);
      y += lineGap;
      doc.setFontSize(11);
      mcItems.forEach((q, idx) => {
        const correctIndex = (q.opts || []).findIndex(
          (o) => String(o).trim() === String(q.ans).trim()
        );
        const ansLabel = correctIndex >= 0 ? letters[correctIndex] : "-";
        ensureSpace(1);
        doc.text(`${idx + 1}. ${ansLabel}`, margin.left, y);
        y += lineGap;
      });
      y += 2;
    }

    if (tfItems.length) {
      doc.setFontSize(13);
      doc.text("Section B: True / False", margin.left, y);
      y += lineGap;
      doc.setFontSize(11);
      tfItems.forEach((q, idx) => {
        ensureSpace(1);
        doc.text(`${idx + 1}. ${q.ans}`, margin.left, y);
        y += lineGap;
      });
    }

    doc.save("quiz.pdf");
  };
})();
