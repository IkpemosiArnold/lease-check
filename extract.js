// Lease Check core. Plain functions: no DOM, no network, no model.
//
// A document is a list of pages; each page is a list of text lines.
// extractTerms() reads lease terms with plain rules and returns each one
// with its page and the exact sentence it came from, or "not found".
// verifyClaim() checks any extraction (from these rules or from a model)
// against the pages: the quote must be on the stated page word for word,
// every number in the value must be in the quote, and the quote must not
// have been replaced by a later amendment.

const SINGLE = /[‘’‚‛′]/g;
const DOUBLE = /[“”„‟″]/g;
const SPACES = /[   \t]/g;

/** Curly quotes to straight, odd spaces to plain ones. Keeps every offset. */
export function normChars(s) {
  return String(s ?? "").replace(SINGLE, "'").replace(DOUBLE, '"').replace(SPACES, " ");
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const AMENDMENT_HEADING = new RegExp(`^(?:(${ORDINALS.join("|")})\\s+)?amendment\\b`, "i");
const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";
const DATE = `${MONTH} \\d{1,2}, \\d{4}`;

export function isHeading(line) {
  const t = String(line).trim();
  if (!t || t.length > 70) return false;
  if (/[.;:,"']$/.test(t)) return false;
  if (!/[a-z]/.test(t) && /[A-Z]{2}/.test(t)) return true;
  return t.length <= 50 && /^\d+(\.\d+)*\.?\s+[A-Z]/.test(t);
}

/** Sentence ranges in a page's text. Breaks at . or ; then space, at headings, and before section numbers. */
function splitSentences(text, lines, lineStarts) {
  const cuts = new Set([0, text.length]);
  lines.forEach((line, i) => {
    if (isHeading(line)) {
      cuts.add(lineStarts[i]);
      cuts.add(lineStarts[i] + line.length);
    }
  });
  for (const m of text.matchAll(/[.;]["')]?\s+/g)) {
    // "1. The Premises": the period after a section number does not end a sentence.
    if (/(?:^|\s)\d+(?:\.\d+)*\.$/.test(text.slice(Math.max(0, m.index - 12), m.index + 1))) continue;
    cuts.add(m.index + m[0].length);
  }
  for (const m of text.matchAll(/\s(\d+(?:\.\d+)*\.?)\s+(?=["A-Z])/g)) cuts.add(m.index + 1);
  const sorted = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    let s = sorted[i];
    let e = sorted[i + 1];
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) {
      const raw = text.slice(s, e);
      out.push({ start: s, end: e, text: raw.replace(/\s+/g, " "), heading: lines.some((l) => l.trim() === raw.trim() && isHeading(l)) });
    }
  }
  return out;
}

/**
 * Build the document model.
 * @param {string[][]} pagesLines one array of lines per page
 */
export function buildDoc(pagesLines) {
  const pages = pagesLines.map((rawLines, i) => {
    const lines = rawLines.map(normChars);
    const lineStarts = [];
    let text = "";
    lines.forEach((line, j) => {
      if (j) text += " ";
      lineStarts.push(text.length);
      text += line;
    });
    return { n: i + 1, lines, lineStarts, text, sentences: splitSentences(text, lines, lineStarts) };
  });

  // Instruments: the lease, then each amendment, in the order they appear.
  const instruments = [{ name: "Lease", page: 1, date: null }];
  for (const p of pages) {
    for (const s of p.sentences) {
      if (s.heading) {
        const m = s.text.match(AMENDMENT_HEADING);
        if (m) {
          const ord = m[1] ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + " " : "";
          instruments.push({ name: `${ord}Amendment`, page: p.n, date: null, start: s.start });
        }
      }
      s.instrument = instruments.length - 1;
      s.page = p.n;
    }
  }
  const dateRe = new RegExp(`\\b(?:made|entered into|dated)\\b[^.]*?(${DATE})`);
  for (const p of pages) {
    for (const s of p.sentences) {
      const inst = instruments[s.instrument];
      if (!inst.date) {
        const m = s.text.match(dateRe);
        if (m) inst.date = m[1];
      }
    }
  }
  return { pages, instruments };
}

const AMOUNT = "\\$[\\d,]+(?:\\.\\d+)?";
const WORDNUM = "[a-z][a-z\\- ]*?";

/**
 * The terms. scope "first": the original lease decides. scope "latest": the
 * last document that states the term decides, and earlier ones are history.
 */
export const TERMS = [
  {
    id: "parties", label: "Parties", scope: "first",
    re: /between (?<landlord>[A-Z][^()]*?),? \("Landlord"\),? and (?<tenant>[A-Z][^()]*?),? \("Tenant"\)/,
    value: (g) => `${g.landlord} (landlord), ${g.tenant} (tenant)`,
    spans: (g) => [g.landlord, g.tenant],
    looksFor: "the landlord and tenant named in the lease",
  },
  {
    id: "effective", label: "Effective date", scope: "first",
    re: new RegExp(`\\b(?:made|entered into|dated)\\b[^.]*?(?<date>${DATE})`),
    value: (g) => g.date, spans: (g) => [g.date],
    looksFor: "the date the lease is made",
  },
  {
    id: "acres", label: "Premises", scope: "latest",
    re: /approximately (?<acres>[\d,]+(?:\.\d+)?) acres/,
    value: (g) => `${g.acres} acres`, spans: (g) => [`${g.acres} acres`],
    looksFor: "the leased acreage",
  },
  {
    id: "devperiod", label: "Development period", scope: "latest",
    re: /Development Period[^.]*?ends on the earlier of[^.]*?(?<ord>[a-z]+ \((?<n>\d+)(?:st|nd|rd|th)\)) anniversary of the Effective Date/,
    value: (g) => `Ends by the ${g.n}${suffix(g.n)} anniversary`,
    spans: (g) => [`${g.ord} anniversary`],
    looksFor: "when the development period ends",
  },
  {
    id: "opsterm", label: "Operations term", scope: "latest",
    re: new RegExp(`Operations Term[^.]*?continues for (?<w>${WORDNUM}) \\((?<n>\\d+)\\) years`),
    value: (g) => `${g.n} years from commercial operation`,
    spans: (g) => [`${g.w} (${g.n}) years`],
    looksFor: "the length of the operations term",
  },
  {
    id: "extensions", label: "Extensions", scope: "latest",
    re: /extend[^.]*?for (?<cw>[a-z]+) \((?<count>\d+)\) additional (?:periods|terms) of (?<lw>[a-z]+) \((?<len>\d+)\) years each/,
    value: (g) => `${g.count} extensions of ${g.len} years each`,
    spans: (g) => [`${g.cw} (${g.count}) additional`, `${g.lw} (${g.len}) years each`],
    looksFor: "options to extend the term",
  },
  {
    id: "devrent", label: "Development rent", scope: "latest",
    re: new RegExp(`Development Rent of (?<amt>${AMOUNT}) per acre per year`),
    value: (g) => `${g.amt} per acre per year`, spans: (g) => [`${g.amt} per acre per year`],
    looksFor: "rent during development",
  },
  {
    id: "opsrent", label: "Operations rent", scope: "latest",
    re: new RegExp(`Operations Rent of (?<amt>${AMOUNT}) per acre per year`),
    value: (g) => `${g.amt} per acre per year`, spans: (g) => [`${g.amt} per acre per year`],
    looksFor: "rent once the project operates",
  },
  {
    id: "escalator", label: "Rent escalator", scope: "latest",
    re: /Rent shall increase by [^.]*?\((?<pct>\d+(?:\.\d+)?%)\) on each anniversary/,
    value: (g) => `${g.pct} a year`, spans: (g) => [g.pct],
    looksFor: "how rent increases",
  },
  {
    id: "termination", label: "Tenant can terminate", scope: "latest",
    re: new RegExp(`Tenant may terminate this Lease(?<when>[^.]*?) upon (?<w>${WORDNUM}) \\((?<n>\\d+)\\) days'? prior (?:written )?notice`),
    value: (g) => `${/any time/.test(g.when) ? "Any time, on" : "On"} ${g.n} days' notice`,
    spans: (g) => [`${g.w} (${g.n}) days'`],
    looksFor: "the tenant's right to end the lease",
  },
  {
    id: "lender", label: "Assignment to a lender", scope: "latest",
    re: /assign this Lease[^.]*?\bLender without Landlord's consent/,
    value: () => "Allowed without the landlord's consent",
    spans: () => ["without Landlord's consent"],
    looksFor: "whether a lender can take the lease without consent",
  },
  {
    id: "removal", label: "Removal deadline", scope: "latest",
    re: new RegExp(`Within (?<w>${WORDNUM}) \\((?<n>\\d+)\\) months after[^.]*?Tenant shall remove`),
    value: (g) => `${g.n} months after the lease ends`,
    spans: (g) => [`${g.w} (${g.n}) months`],
    looksFor: "when equipment must be removed",
  },
  {
    id: "security", label: "Decommissioning security", scope: "latest",
    re: new RegExp(`(?:decommissioning|removal|restoration)[^.]*?(?:bond|letter of credit|surety|security)[^.]*?(?<amt>${AMOUNT})|(?:bond|letter of credit|surety|security)[^.]*?(?:decommissioning|removal|restoration)[^.]*?(?<amt2>${AMOUNT})`, "i"),
    value: (g) => `${g.amt || g.amt2} in security for removal`,
    spans: (g) => [g.amt || g.amt2],
    looksFor: "a bond, letter of credit or other security for removal, with an amount",
    near: ["decommission", "remove all", "removal", "bond", "letter of credit", "surety"],
  },
  {
    id: "rofr", label: "Right of first refusal", scope: "latest",
    re: /right of first (?:refusal|offer)/i,
    value: () => "Present", spans: (g, m) => [m[0]],
    looksFor: "a right of first refusal or offer on the land",
    near: ["first refusal", "first offer", "option to purchase", "sell the Property"],
  },
];

function suffix(n) {
  const v = Number(n) % 100;
  if (v >= 11 && v <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[Number(n) % 10] || "th";
}

function allSentences(doc) {
  return doc.pages.flatMap((p) => p.sentences);
}

function itemFrom(term, hit) {
  const g = hit.m.groups || {};
  return {
    id: term.id,
    label: term.label,
    value: term.value(g, hit.m),
    page: hit.s.page,
    quote: hit.s.text,
    spans: (term.spans ? term.spans(g, hit.m) : [hit.m[0]]).filter(Boolean),
    instrument: hit.s.instrument,
  };
}

/** Read every term. Returns found items with page, quote and history, or not-found items. */
export function extractTerms(doc, terms = TERMS) {
  const sents = allSentences(doc).filter((s) => !s.heading);
  return terms.map((t) => {
    const hits = [];
    for (const s of sents) {
      const m = s.text.match(t.re);
      if (m) hits.push({ s, m });
    }
    if (!hits.length) {
      const near = (t.near || []).map((k) => k.toLowerCase());
      const nearest = near.length ? sents.find((s) => near.some((k) => s.text.toLowerCase().includes(k))) : null;
      return {
        id: t.id, label: t.label, status: "not_found",
        looksFor: t.looksFor, pagesSearched: doc.pages.length,
        nearest: nearest ? { page: nearest.page, quote: nearest.text } : null,
      };
    }
    let chosen = hits[0];
    const history = [];
    if (t.scope === "latest") {
      const top = Math.max(...hits.map((h) => h.s.instrument));
      chosen = hits.find((h) => h.s.instrument === top);
      const seen = new Set();
      for (const h of hits) {
        if (h.s.instrument < top && !seen.has(h.s.instrument)) {
          seen.add(h.s.instrument);
          history.push(itemFrom(t, h));
        }
      }
    }
    return { ...itemFrom(t, chosen), status: "found", history };
  });
}

// ---------- Matching quotes to pages ----------

const tokenKey = (w) => normChars(w).toLowerCase();

function tokens(text, from = 0, to = text.length) {
  const out = [];
  const re = /\S+/g;
  re.lastIndex = from;
  let m;
  while ((m = re.exec(text)) && m.index < to) {
    if (m.index + m[0].length > to) break;
    out.push({ key: tokenKey(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Where a quote sits on a page, word for word. Ignores spacing, letter case
 * and curly versus straight quotes, nothing else.
 * @returns {{start:number,end:number}|null} character range in page.text
 */
export function findQuote(page, quote, from = 0, to = page.text.length) {
  const q = String(quote ?? "").split(/\s+/).filter(Boolean).map(tokenKey);
  if (!q.length) return null;
  const t = tokens(page.text, from, to);
  outer: for (let i = 0; i + q.length <= t.length; i++) {
    for (let j = 0; j < q.length; j++) if (t[i + j].key !== q[j]) continue outer;
    return { start: t[i].start, end: t[i + q.length - 1].end };
  }
  // A span may start or end inside a token, for example "(1.75%)".
  const flat = normChars(page.text.slice(from, to)).toLowerCase().replace(/\s+/g, " ");
  const needle = q.join(" ");
  const k = flat.indexOf(needle);
  if (k < 0) return null;
  // Map the collapsed index back to the page text.
  let ci = 0;
  let start = -1;
  let end = -1;
  let prevSpace = false;
  for (let i = from; i < to; i++) {
    const isSpace = /\s/.test(page.text[i]);
    if (isSpace && prevSpace) continue;
    if (ci === k) start = i;
    ci++;
    if (ci === k + needle.length) { end = i + 1; break; }
    prevSpace = isSpace;
  }
  return start >= 0 && end > start ? { start, end } : null;
}

/** Numbers in a string, commas dropped: "$1,050" gives "1050", "(6th)" gives "6". */
export function numbersIn(s) {
  return (String(s ?? "").match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => String(Number(n.replace(/,/g, ""))));
}

function closestSentence(doc, quote) {
  const q = new Set(String(quote).split(/\s+/).map(tokenKey).filter((w) => w.length > 2));
  if (!q.size) return null;
  let best = null;
  for (const s of allSentences(doc)) {
    if (s.heading) continue;
    const w = new Set(s.text.split(/\s+/).map(tokenKey));
    let shared = 0;
    for (const x of q) if (w.has(x)) shared++;
    const score = shared / q.size;
    if (!best || score > best.score) best = { page: s.page, quote: s.text, score };
  }
  return best && best.score >= 0.4 ? best : null;
}

export const VERDICTS = {
  pass: "Pass",
  no_quote: "No page or quote",
  bad_page: "No such page",
  wrong_page: "Wrong page",
  quote_not_found: "Quote not in the document",
  number_not_in_quote: "Number not in the quote",
  superseded: "Replaced by a later amendment",
};

/**
 * Check one extraction against the document.
 * @param {{pages:object[]}} doc from buildDoc
 * @param {{term?:string,value?:string,page:number,quote:string}} claim
 */
export function verifyClaim(doc, claim, extracted = extractTerms(doc)) {
  const pageNo = Number(claim?.page);
  const quote = String(claim?.quote ?? "").trim();
  if (!quote || !Number.isInteger(pageNo)) return { status: "no_quote", reason: "The extraction gives no page or no quote." };
  if (pageNo < 1 || pageNo > doc.pages.length) {
    return { status: "bad_page", reason: `There is no page ${pageNo}. The document has ${doc.pages.length}.` };
  }
  const page = doc.pages[pageNo - 1];
  const range = findQuote(page, quote);
  if (!range) {
    const other = doc.pages.map((p) => ({ p, r: findQuote(p, quote) })).find((x) => x.r);
    if (other) {
      return { status: "wrong_page", reason: `The quote is real, but it is on page ${other.p.n}, not page ${pageNo}.`, page: other.p.n, range: other.r };
    }
    return { status: "quote_not_found", reason: "These words are not in the document.", closest: closestSentence(doc, quote) };
  }
  const inQuote = new Set(numbersIn(quote));
  const missing = numbersIn(claim.value).filter((n) => !inQuote.has(n));
  if (missing.length) {
    return { status: "number_not_in_quote", reason: `The quote is on page ${pageNo}, but ${missing.join(" and ")} is not in it.`, page: pageNo, range };
  }
  // Is this quote an older version of a term a later document replaced?
  for (const item of extracted) {
    if (item.status !== "found") continue;
    const old = item.history.find((h) => h.page === pageNo && findQuote(page, h.quote) && sameRange(findQuote(page, h.quote), range));
    if (old) {
      const inst = doc.instruments[item.instrument];
      return {
        status: "superseded",
        reason: `The quote is real, but the ${inst.name.toLowerCase()} on page ${item.page} replaced it: ${item.value}.`,
        page: pageNo, range, current: item,
      };
    }
  }
  const hasNumbers = numbersIn(claim.value).length > 0;
  return {
    status: "pass",
    reason: hasNumbers
      ? `The quote is on page ${pageNo} word for word, and every number in the value is in it.`
      : `The quote is on page ${pageNo} word for word. The value has no number to check.`,
    page: pageNo, range,
  };
}

function sameRange(a, b) {
  return Boolean(a && b && a.start < b.end && b.start < a.end);
}

export function summarize(items) {
  const found = items.filter((i) => i.status === "found").length;
  return { total: items.length, found, notFound: items.length - found };
}
