import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDoc, extractTerms, verifyClaim, findQuote, numbersIn, isHeading } from "./extract.js";
import { pageLines } from "./lease-source.js";
import { agentAnswer } from "./agent-sample.js";

const doc = buildDoc(pageLines());
const items = extractTerms(doc);
const byId = Object.fromEntries(items.map((i) => [i.id, i]));

test("finds the lease and both amendments, in order, with their dates", () => {
  assert.deepEqual(
    doc.instruments.map((i) => [i.name, i.page, i.date]),
    [["Lease", 1, "March 4, 2024"], ["First Amendment", 6, "August 19, 2024"], ["Second Amendment", 7, "May 12, 2025"]],
  );
});

test("a later amendment wins, and the older text is kept as history", () => {
  assert.equal(byId.opsrent.value, "$1,050 per acre per year");
  assert.equal(byId.opsrent.page, 6);
  assert.deepEqual(byId.opsrent.history.map((h) => [h.page, h.value]), [[3, "$900 per acre per year"]]);

  assert.equal(byId.escalator.value, "1.75% a year");
  assert.equal(byId.escalator.page, 7);
  assert.deepEqual(byId.escalator.history.map((h) => h.page), [3, 6]);

  assert.equal(byId.acres.value, "398.2 acres");
  assert.equal(byId.devperiod.page, 7);
  assert.match(byId.devperiod.value, /6th anniversary/);
});

test("terms the lease only states once come from the lease", () => {
  assert.equal(byId.effective.value, "March 4, 2024");
  assert.equal(byId.effective.page, 1);
  assert.equal(byId.opsterm.value, "25 years from commercial operation");
  assert.equal(byId.extensions.value, "2 extensions of 5 years each");
  assert.equal(byId.termination.value, "Any time, on 90 days' notice");
  assert.equal(byId.termination.page, 4);
  assert.equal(byId.removal.value, "12 months after the lease ends");
});

test("terms the documents never state come back not found, not guessed", () => {
  assert.equal(byId.security.status, "not_found");
  assert.equal(byId.security.value, undefined);
  assert.equal(byId.security.nearest.page, 5);
  assert.equal(byId.rofr.status, "not_found");
  assert.equal(byId.rofr.nearest, null);
});

test("every found term passes its own check: quote on its page, numbers in the quote", () => {
  for (const item of items.filter((i) => i.status === "found")) {
    const v = verifyClaim(doc, item, items);
    assert.equal(v.status, "pass", `${item.label}: ${v.reason}`);
    for (const span of item.spans) assert.ok(item.quote.includes(span), `${item.label}: span "${span}" not in quote`);
  }
});

test("the sample agent extraction: two pass, four planted errors blocked", () => {
  const got = agentAnswer.map((c) => verifyClaim(doc, c, items).status);
  assert.deepEqual(got, ["pass", "superseded", "wrong_page", "number_not_in_quote", "quote_not_found", "pass"]);
});

test("wrong page names the page the quote is really on", () => {
  const v = verifyClaim(doc, agentAnswer[2], items);
  assert.equal(v.page, 4);
});

test("a superseded quote points at the text that replaced it", () => {
  const v = verifyClaim(doc, agentAnswer[1], items);
  assert.equal(v.current.page, 7);
  assert.match(v.reason, /second amendment/);
});

test("missing page, missing quote and a page past the end are blocked", () => {
  assert.equal(verifyClaim(doc, { value: "x", quote: "" , page: 1 }).status, "no_quote");
  assert.equal(verifyClaim(doc, { value: "x", quote: "Lease" }).status, "no_quote");
  assert.equal(verifyClaim(doc, { value: "x", quote: "Lease", page: 9 }).status, "bad_page");
});

test("quotes match word for word, ignoring only spacing, case and curly quotes", () => {
  const p4 = doc.pages[3];
  assert.ok(findQuote(p4, "tenant may   terminate THIS lease"));
  assert.ok(findQuote(p4, "ninety (90) days’ prior written notice"));
  assert.equal(findQuote(p4, "Tenant may cancel this Lease"), null);
  assert.ok(findQuote(p4, "without Landlord's consent"), "span ending inside a token");
});

test("numbers: commas dropped, ordinals read", () => {
  assert.deepEqual(numbersIn("$1,050 per acre"), ["1050"]);
  assert.deepEqual(numbersIn("sixth (6th) anniversary"), ["6"]);
  assert.deepEqual(numbersIn("(1.75%)"), ["1.75"]);
});

test("headings are told apart from wrapped lines", () => {
  assert.ok(isHeading("SECOND AMENDMENT TO SOLAR GROUND LEASE AGREEMENT"));
  assert.ok(isHeading("5. Termination by Tenant"));
  assert.ok(!isHeading("2.3 Tenant may extend the Operations Term for two (2) additional periods of five (5)"));
  assert.ok(!isHeading("in advance."));
});

test("a document with no text finds nothing and invents nothing", () => {
  const empty = buildDoc([[""], [""]]);
  const res = extractTerms(empty);
  assert.ok(res.every((r) => r.status === "not_found"));
});
