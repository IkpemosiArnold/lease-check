// Prints lease-source.js to sample.pdf with headless Chrome.
// Usage: node tools/build-sample.mjs "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { pages, title } from "../lease-source.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = process.argv[2];
if (!chrome) throw new Error("Pass the path to a Chrome or Chromium binary.");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const body = pages
  .map((blocks, i) => {
    const inner = blocks
      .map((b) => (b.h ? `<h2${/^[A-Z ]+$/.test(b.h) ? ' class="caps"' : ""}>${esc(b.h)}</h2>` : `<p>${esc(b.p)}</p>`))
      .join("\n");
    return `<section class="page">${inner}<div class="foot">SAMPLE WRITTEN FOR A DEMO. NOT A REAL LEASE. Page ${i + 1} of ${pages.length}</div></section>`;
  })
  .join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: Letter; margin: 0; }
body { margin: 0; font: 12pt/1.5 "Times New Roman", Times, serif; color: #000; font-variant-ligatures: none; }
.page { width: 8.5in; height: 11in; box-sizing: border-box; padding: 1in; position: relative; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
h2 { font-size: 12pt; margin: 14pt 0 6pt; }
h2.caps { text-align: center; font-size: 13pt; margin-top: 0; }
p { margin: 0 0 8pt; text-align: left; hyphens: none; }
.foot { position: absolute; left: 1in; right: 1in; bottom: 0.6in; font-size: 8pt; color: #555; text-align: center; }
</style></head><body>${body}</body></html>`;

const work = mkdtempSync(join(tmpdir(), "lease-sample-"));
const htmlPath = join(work, "sample.html");
writeFileSync(htmlPath, html);
execFileSync(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${join(work, "profile")}`, "--no-pdf-header-footer",
  `--print-to-pdf=${join(root, "sample.pdf")}`, `file://${htmlPath}`,
], { stdio: "inherit", timeout: 60000 });
rmSync(work, { recursive: true, force: true });
console.log("Wrote sample.pdf");
