// Browser side: reads a PDF with pdf.js (vendored, pinned 5.4.296) and draws
// a page with the quote marked. Nothing leaves the browser.
import * as pdfjsLib from "./vendor/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

/** Group pdf.js text items into lines and record where each item sits in the page text. */
function linesFromItems(items, styles) {
  const lines = [];
  const placed = [];
  let cur = null;
  let lastX = null;
  let lastY = null;
  for (const it of items) {
    if (typeof it.str !== "string") continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
    if (it.str.length) {
      if (cur === null || (lastY !== null && Math.abs(y - lastY) > size * 0.5)) {
        cur = { text: "" };
        lines.push(cur);
        lastX = null;
      }
      if (cur.text && !/\s$/.test(cur.text) && !/^\s/.test(it.str) && lastX !== null && x - lastX > size * 0.12) cur.text += " ";
      const start = cur.text.length;
      cur.text += it.str;
      placed.push({ line: lines.length - 1, start, end: cur.text.length, it, size, family: styles?.[it.fontName]?.fontFamily || "serif" });
      lastX = x + it.width;
      lastY = y;
    }
    if (it.hasEOL) {
      cur = null;
      lastY = null;
    }
  }
  const starts = [];
  let off = 0;
  for (const l of lines) {
    starts.push(off);
    off += l.text.length + 1;
  }
  const boxes = placed.map((p) => ({
    start: starts[p.line] + p.start,
    end: starts[p.line] + p.end,
    x: p.it.transform[4],
    y: p.it.transform[5],
    w: p.it.width,
    h: p.size,
    str: p.it.str,
    family: p.family,
  }));
  return { lines: lines.map((l) => l.text), boxes };
}

/**
 * Open a PDF and read its text, page by page.
 * @param {string|ArrayBuffer} src URL or bytes
 */
export async function openPdf(src) {
  const params = typeof src === "string" ? { url: src } : { data: new Uint8Array(src) };
  const pdf = await pdfjsLib.getDocument({ ...params, isEvalSupported: false, enableXfa: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    pages.push(linesFromItems(tc.items, tc.styles));
  }
  return { pdf, pages };
}

const measurer = document.createElement("canvas").getContext("2d");

/** Where character k of a text item sits, as a share of the item's width, measured in its own font. */
function frac(b, k) {
  if (!b.str || k <= 0) return 0;
  if (k >= b.str.length) return 1;
  measurer.font = `100px ${b.family}`;
  const whole = measurer.measureText(b.str).width;
  return whole ? measurer.measureText(b.str.slice(0, k)).width / whole : k / b.str.length;
}

function rectsFor(boxes, range, viewport, pad = 0) {
  const out = [];
  if (!range) return out;
  for (const b of boxes) {
    if (b.end <= range.start || b.start >= range.end) continue;
    const s = Math.max(range.start, b.start) - b.start;
    const e = Math.min(range.end, b.end) - b.start;
    const x0 = b.x + b.w * frac(b, s);
    const x1 = b.x + b.w * frac(b, e);
    const r = viewport.convertToViewportRectangle([x0, b.y - b.h * 0.25, x1, b.y + b.h * 0.9]);
    out.push({ x: Math.min(r[0], r[2]) - pad, y: Math.min(r[1], r[3]), w: Math.abs(r[2] - r[0]) + pad * 2, h: Math.abs(r[3] - r[1]) });
  }
  return out;
}

/**
 * Draw the part of a page around the quote, quote marked light, key words marked strong.
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderSnippet(pdf, pageNo, boxes, quoteRange, spanRanges, cssWidth) {
  const page = await pdf.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const all = boxes.map((b) => rectsFor([b], { start: b.start, end: b.end }, base)[0]).filter(Boolean);
  const left = Math.max(0, Math.min(...all.map((r) => r.x)) - 14);
  const right = Math.min(base.width, Math.max(...all.map((r) => r.x + r.w)) + 14);
  const q = rectsFor(boxes, quoteRange, base);
  const top = q.length ? Math.max(0, Math.min(...q.map((r) => r.y)) - 60) : 0;
  const bottom = q.length ? Math.min(base.height, Math.max(...q.map((r) => r.y + r.h)) + 60) : base.height;

  const cropW = Math.max(50, right - left);
  const cropH = Math.max(50, bottom - top);
  const scale = cssWidth / cropW;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const vp = page.getViewport({ scale: scale * dpr });

  const full = document.createElement("canvas");
  full.width = Math.ceil(vp.width);
  full.height = Math.ceil(vp.height);
  const fctx = full.getContext("2d");
  await page.render({ canvasContext: fctx, viewport: vp }).promise;

  fctx.globalCompositeOperation = "multiply";
  fctx.fillStyle = "rgba(255, 226, 122, 0.75)";
  for (const r of rectsFor(boxes, quoteRange, vp)) fctx.fillRect(r.x, r.y, r.w, r.h);
  fctx.fillStyle = "rgba(255, 170, 40, 0.9)";
  const dprPad = Math.max(1, Math.round(dpr));
  const spanRects = spanRanges.flatMap((range) => rectsFor(boxes, range, vp, dprPad));
  for (const r of spanRects) fctx.fillRect(r.x, r.y, r.w, r.h);

  const out = document.createElement("canvas");
  const k = scale * dpr;
  out.width = Math.ceil(cropW * k);
  out.height = Math.ceil(cropH * k);
  out.style.width = `${cssWidth}px`;
  out.style.height = `${Math.round(cropH * scale)}px`;
  out.getContext("2d").drawImage(full, left * k, top * k, cropW * k, cropH * k, 0, 0, out.width, out.height);
  full.width = full.height = 0;
  // Centre of the first marked value, in CSS pixels from the crop's left edge.
  const focus = spanRects[0] ? (spanRects[0].x + spanRects[0].w / 2) / dpr - left * scale : null;
  out.dataset.focusX = focus == null ? "" : String(Math.round(focus));
  return out;
}
