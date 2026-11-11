import { buildDoc, extractTerms, verifyClaim, findQuote, numbersIn, summarize, VERDICTS } from "./extract.js";
import { openPdf, renderSnippet } from "./viewer.js";
import { agentAnswer } from "./agent-sample.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const icon = (name) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
};
const wide = window.matchMedia("(min-width: 960px)");

let current = null; // { pdf, boxes, doc, items, isSample, name }
let open = null; // { key, li, render }

/** Text with some exact substrings underlined. textContent only. */
function marked(text, spans = [], kind = "pass") {
  const p = el("p", "quote");
  const hits = [];
  for (const raw of spans) {
    const s = String(raw || "").replace(/^[("'\s]+|[)"'.,;:\s]+$/g, "");
    if (!s) continue;
    const i = text.indexOf(s);
    if (i >= 0) hits.push([i, i + s.length]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  let at = 0;
  for (const [s, e] of hits) {
    if (s < at) continue;
    p.append(text.slice(at, s), el("span", `u ${kind}`, text.slice(s, e)));
    at = e;
  }
  p.append(text.slice(at));
  return p;
}

const inst = (i) => current.doc.instruments[i]?.name || "";
const instLower = (i) => inst(i).toLowerCase();

/** The PDF page with the quote marked. Draws when it scrolls near the screen. */
function pageFigure(page, quote, spans) {
  const fig = el("figure", "page-fig");
  const wait = el("div", "page-wait");
  wait.setAttribute("aria-hidden", "true");
  const cap = el("figcaption", null, `Page ${page} as the PDF draws it.`);
  fig.append(wait, cap);
  requestAnimationFrame(async () => {
    try {
      const pg = current.doc.pages[page - 1];
      const qr = findQuote(pg, quote);
      const trimmed = spans.map((x) => String(x || "").replace(/^[("'\s]+|[)"'.,;:\s]+$/g, "")).filter(Boolean);
      const sr = qr ? trimmed.map((x) => findQuote(pg, x, qr.start, qr.end)).filter(Boolean) : [];
      const avail = Math.max(240, Math.floor(fig.getBoundingClientRect().width));
      const width = avail < 520 ? Math.round(avail * 1.7) : avail;
      const canvas = await renderSnippet(current.pdf, page, current.boxes[page - 1], qr, sr, width);
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `Page ${page} of the PDF with the quote marked`);
      const scroller = el("div", "page-scroll");
      canvas.classList.add("drawn-in");
      scroller.append(canvas);
      wait.replaceWith(scroller);
      const focus = Number(canvas.dataset.focusX);
      if (width > avail && canvas.dataset.focusX !== "" && Number.isFinite(focus)) {
        scroller.scrollLeft = Math.max(0, focus - scroller.clientWidth / 2);
      }
      if (width > avail) cap.textContent = `Page ${page} as the PDF draws it. Swipe to read the full line.`;
    } catch {
      wait.replaceWith(el("p", "error", `Page ${page} could not be drawn.`));
    }
  });
  return fig;
}

function okLine(text, kind = "pass") {
  const p = el("p", `ok-line st-${kind}`);
  p.append(icon(kind === "pass" ? "check" : "cross"), el("span", null, text));
  return p;
}

function termEvidence(item) {
  const box = el("div", "evidence");
  box.append(el("p", "side-h", item.label));
  if (item.status === "found") {
    box.append(el("p", "side-title", item.value));
    box.append(el("p", "ev-h", `Page ${item.page}${current.doc.instruments.length > 1 ? `, ${inst(item.instrument)}` : ""}`));
    box.append(marked(item.quote, item.spans));
    if (item.history.length) {
      box.append(el("p", "ev-h", "Replaces"));
      const ul = el("ul", "old");
      for (const h of [...item.history].reverse()) {
        const li = el("li");
        li.append(el("s", null, h.value), ` on page ${h.page}, ${instLower(h.instrument)}`);
        ul.append(li);
      }
      box.append(ul);
    }
    const v = verifyClaim(current.doc, item, current.items);
    box.append(okLine(v.status === "pass" ? `On page ${item.page} word for word. Every number in the value is in the quote.` : v.reason, v.status === "pass" ? "pass" : "fail"));
    box.append(pageFigure(item.page, item.quote, item.spans));
  } else {
    const t = el("p", "side-title st-none");
    t.textContent = "Not found";
    box.append(t);
    box.append(el("p", "nf-note", `Not in the documents. Looked on all ${item.pagesSearched} pages for ${item.looksFor}, and left it blank rather than guess.`));
    if (item.nearest) {
      box.append(el("p", "ev-h", `Nearest text, page ${item.nearest.page}. Not used as an answer`));
      const q = marked(item.nearest.quote);
      q.style.color = "var(--muted)";
      box.append(q, pageFigure(item.nearest.page, item.nearest.quote, []));
    } else {
      box.append(el("p", "ev-h", "No sentence in the documents comes close."));
    }
  }
  return box;
}

function verdictEvidence(claim, v) {
  const box = el("div", "evidence");
  box.append(el("p", "side-h", String(claim.term ?? "Term")));
  box.append(el("p", `side-title st-${v.status === "pass" ? "pass" : "fail"}`, v.status === "pass" ? "Holds" : VERDICTS[v.status]));
  box.append(el("p", "ev-h", "Why"), el("p", "nf-note", v.reason));
  const value = String(claim.value ?? "");
  if (v.status === "number_not_in_quote") {
    const inQuote = new Set(numbersIn(claim.quote));
    const bad = (value.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) || []).filter((t) => !inQuote.has(numbersIn(t)[0]));
    const quoteNums = String(claim.quote).match(/\$\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?%/g) || [];
    box.append(el("p", "ev-h", "Value given"), marked(value, bad, "fail"));
    box.append(el("p", "ev-h", `Quote, page ${claim.page}`), marked(String(claim.quote), quoteNums, "fail"));
    box.append(pageFigure(Number(claim.page), String(claim.quote), quoteNums));
  } else if (v.status === "superseded" && v.current) {
    box.append(el("p", "ev-h", `Quote given, page ${claim.page}`));
    const old = el("p", "quote");
    old.append(el("s", null, String(claim.quote)));
    old.style.color = "var(--muted)";
    box.append(old);
    box.append(el("p", "ev-h", `Current text, page ${v.current.page}, ${instLower(v.current.instrument)}`));
    box.append(marked(v.current.quote, v.current.spans), pageFigure(v.current.page, v.current.quote, v.current.spans));
  } else if (v.status === "wrong_page") {
    box.append(el("p", "ev-h", `Said page ${claim.page}. It is on page ${v.page}`));
    box.append(marked(String(claim.quote)), pageFigure(v.page, String(claim.quote), []));
  } else if (v.status === "quote_not_found") {
    box.append(el("p", "ev-h", "Quote given"));
    box.append(marked(String(claim.quote), [String(claim.quote)], "fail"));
    if (v.closest) {
      box.append(el("p", "ev-h", `Closest sentence, page ${v.closest.page}`), marked(v.closest.quote), pageFigure(v.closest.page, v.closest.quote, []));
    } else {
      box.append(el("p", "ev-h", "No sentence in the documents comes close."));
    }
  } else if (v.status === "pass") {
    box.append(el("p", "ev-h", `Quote, page ${v.page}`), marked(String(claim.quote)), pageFigure(v.page, String(claim.quote), []));
  } else if (claim.quote) {
    box.append(el("p", "ev-h", "Quote given"), marked(String(claim.quote)));
  }
  return box;
}

/** One row. On a phone the evidence opens under it; on a wide screen it fills the side column. */
function rowItem({ key, cells, render, verdict = false }) {
  const li = el("div", "row-item");
  const btn = el("button", `row${verdict ? " verdict" : ""}`);
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  btn.append(...cells);
  const chev = icon("chev");
  chev.classList.add("chev");
  btn.append(chev);
  btn.addEventListener("click", () => toggle({ key, li, btn, render }));
  li.append(btn);
  li.dataset.key = key;
  return li;
}

function closeOpen() {
  if (!open) return;
  open.btn.setAttribute("aria-expanded", "false");
  open.li.querySelector(".evidence")?.remove();
  open = null;
  $("side").replaceChildren();
}

function show(entry, animate = true) {
  const box = entry.render();
  if (animate) box.classList.add("enter");
  entry.btn.setAttribute("aria-expanded", "true");
  if (wide.matches) $("side").replaceChildren(box);
  else entry.li.append(box);
  open = entry;
  requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("drawn")));
}

function toggle(entry) {
  const same = open && open.key === entry.key;
  closeOpen();
  if (!same) show(entry);
}

wide.addEventListener("change", () => {
  if (!open) return;
  const entry = open;
  closeOpen();
  show(entry, false);
});

function termRow(item) {
  const found = item.status === "found";
  const label = el("span", "label", item.label);
  const val = el("span", "val");
  if (found) {
    val.append(item.value);
    const n = item.history.length;
    val.append(el("span", "meta", `Page ${item.page}${n ? `, amended ${n === 1 ? "once" : n === 2 ? "twice" : `${n} times`}` : ""}`));
  } else {
    const st = el("span", "status st-none");
    st.append(icon("none"), "Not found");
    val.append(st, el("span", "meta", `Searched all ${item.pagesSearched} pages`));
  }
  return rowItem({ key: `t-${item.id}`, cells: [label, val], render: () => termEvidence(item) });
}

function renderTerms() {
  const { total, found, notFound } = summarize(current.items);
  const sum = $("summary");
  sum.replaceChildren(el("span", "sum-main", `${found} of ${total} found`));
  if (notFound) {
    const side = el("span", "sum-side");
    side.append(icon("none"), `${notFound} not found`);
    sum.append(side);
  }
  const jump = $("jump");
  if (jump) jump.hidden = false;
  const ins = current.doc.instruments;
  const extra = ins.length - 1;
  $("chain").textContent = extra > 0
    ? `Lease, then ${extra === 1 ? "one amendment" : extra === 2 ? "two amendments" : `${extra} amendments`}. Where they disagree, the latest wins.`
    : "One document, no amendments found.";

  const amended = current.items.filter((i) => i.status === "found" && i.history.length)
    .sort((a, b) => b.history.length - a.history.length);
  const missing = current.items.filter((i) => i.status !== "found");
  const once = current.items.filter((i) => i.status === "found" && !i.history.length);
  const groups = [
    ["Changed by an amendment", amended],
    ["Not in the documents", missing],
    [amended.length ? "Stated once" : "Terms", once],
  ].filter(([, list]) => list.length);
  const wrap = $("groups");
  wrap.replaceChildren(...groups.map(([h, list]) => {
    const g = el("section", "group");
    g.append(el("h2", "group-h", h));
    const rows = el("div", "rows");
    rows.append(...list.map(termRow));
    g.append(rows);
    return g;
  }));

  // Open the most amended term, so the first thing seen is a reading with its page.
  const lead = amended[0] || once[0] || missing[0];
  if (lead) {
    const li = wrap.querySelector(`[data-key="t-${lead.id}"]`);
    open = null;
    show({ key: `t-${lead.id}`, li, btn: li.querySelector(".row"), render: () => termEvidence(lead) }, false);
  }
}

/** One line a reader gets without a tap: the value, then what the PDF says. */
function shortReason(c, v) {
  const value = String(c.value ?? "");
  if (v.status === "number_not_in_quote") {
    const inQuote = new Set(numbersIn(c.quote));
    const bad = (value.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) || []).find((t) => !inQuote.has(numbersIn(t)[0])) || value;
    const says = String(c.quote).match(/\$\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?%/g) || [];
    return says.length ? `${bad}. Page ${c.page} says ${says.join(", ")}.` : `${bad} is not in the quote.`;
  }
  if (v.status === "superseded" && v.current) return `${value}. Replaced on page ${v.current.page}: ${v.current.value}.`;
  if (v.status === "wrong_page") return `Quote is on page ${v.page}, not page ${c.page}.`;
  if (v.status === "quote_not_found") return `${value}. Not in the documents.`;
  if (v.status === "bad_page") return `There is no page ${c.page}.`;
  return VERDICTS[v.status] || "Blocked";
}

function runAgentCheck() {
  const err = $("agent-error");
  let claims;
  try {
    claims = JSON.parse($("agent-in").value);
    if (!Array.isArray(claims) || claims.some((c) => !c || typeof c !== "object")) throw new Error("shape");
  } catch {
    err.textContent = "That isn't a JSON list of {term, value, page, quote} objects. Reset the sample to see the shape.";
    err.hidden = false;
    return;
  }
  err.hidden = true;
  const verdicts = claims.map((c) => verifyClaim(current.doc, c, current.items));
  const held = verdicts.filter((v) => v.status === "pass").length;
  const sum = $("agent-summary");
  sum.replaceChildren(el("span", "sum-main", `${held} of ${claims.length} hold`));
  if (claims.length - held) {
    const side = el("span", "sum-side fail");
    side.append(icon("cross"), `${claims.length - held} blocked`);
    sum.append(side);
  }
  const rows = $("agent-rows");
  if (open && open.key.startsWith("a-")) closeOpen();
  rows.classList.remove("fresh");
  rows.replaceChildren(...claims.map((c, i) => {
    const v = verdicts[i];
    const ok = v.status === "pass";
    const st = el("span", `status ${ok ? "st-pass" : "st-fail"}`);
    st.append(icon(ok ? "check" : "cross"), ok ? "Holds" : "Blocked");
    const val = el("span", "val");
    val.append(el("b", null, String(c.term ?? "Term")));
    const line = ok ? String(c.value ?? "") : shortReason(c, v);
    val.append(el("span", ok ? "sub" : "sub st-fail", line));
    return rowItem({ key: `a-${i}`, cells: [st, val], render: () => verdictEvidence(c, v), verdict: true });
  }));
  void rows.offsetWidth;
  rows.classList.add("fresh");
}

function placeholders() {
  const rows = el("div", "rows skeleton");
  rows.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i++) {
    const r = el("div", "row-item");
    r.append(el("div", "sk-row"));
    rows.append(r);
  }
  return rows;
}

async function load(src, { isSample, name }) {
  $("summary").replaceChildren(el("span", "sum-main", "Reading the PDF"));
  $("groups").replaceChildren(placeholders());
  closeOpen();
  const { pdf, pages } = await openPdf(src);
  const doc = buildDoc(pages.map((p) => p.lines));
  current = { pdf, boxes: pages.map((p) => p.boxes), doc, items: extractTerms(doc), isSample, name };
  const line = $("docline");
  line.replaceChildren();
  if (isSample) {
    const a = el("a", null, "Open the PDF");
    a.href = "sample.pdf";
    a.target = "_blank";
    a.rel = "noopener";
    line.append(`A solar ground lease and two amendments, ${doc.pages.length} pages, made up for this demo. `, a);
  } else {
    const back = el("button", "btn text", "Back to the sample");
    back.type = "button";
    back.style.minHeight = "auto";
    back.addEventListener("click", () => {
      $("own-name").textContent = "";
      loadSample();
    });
    line.append(`${name}, ${doc.pages.length} pages, read in this browser only. `, back);
  }
  $("agent-summary").replaceChildren();
  $("agent-rows").replaceChildren();
  if (!doc.pages.some((p) => p.text.trim().length > 20)) {
    $("summary").replaceChildren(el("span", "sum-main", "No text layer"));
    $("chain").textContent = "This PDF is probably a scan, so every term is not found. There is no OCR here.";
    $("groups").replaceChildren();
    return;
  }
  renderTerms();
}

function loadSample() {
  return load("sample.pdf", { isSample: true, name: "sample.pdf" }).catch(() => {
    $("summary").replaceChildren(el("span", "sum-main", "The sample did not load"));
    $("chain").textContent = "Serve this folder over http and reload.";
  });
}

const sampleJson = () => JSON.stringify(agentAnswer, null, 2);
$("agent-in").value = sampleJson();
$("agent-check").addEventListener("click", runAgentCheck);
$("agent-reset").addEventListener("click", () => {
  $("agent-in").value = sampleJson();
  $("agent-error").hidden = true;
  runAgentCheck();
});
$("own-file").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  $("own-error").hidden = true;
  $("own-name").textContent = file.name;
  try {
    await load(await file.arrayBuffer(), { isSample: false, name: file.name });
    $("summary").scrollIntoView({ block: "start", behavior: "smooth" });
  } catch (err) {
    $("own-error").textContent = /password/i.test(`${err && err.name} ${err && err.message}`)
      ? "This PDF is password protected. Remove the password and try again."
      : "This file could not be read as a PDF. Try a PDF exported from Word or a data room.";
    $("own-error").hidden = false;
    $("own-name").textContent = "";
    loadSample();
  }
  e.target.value = "";
});

loadSample();
