# Lease Check

BuildQ's careers page describes a key term sitting on "page 74 of a second amendment to an amendment". This is a small version of that problem, built in a day.

Lease Check reads a solar lease PDF in your browser and gives each term with the page it came from and the exact sentence that says it. If the documents never state a term, it says "not found" and shows the nearest text, marked as not an answer.

## What it does

1. Reads the PDF with pdf.js, in the browser. Nothing is uploaded.
2. Splits each page into sentences and finds the lease and each amendment, in order.
3. Reads 14 terms with plain rules: parties, effective date, acreage, development period, operations term, extensions, both rents, the escalator, the tenant's termination right, assignment to a lender, the removal deadline, decommissioning security and a right of first refusal.
4. Where an amendment restates a term, the latest document wins, and the older text is listed under "Replaces" with its page.
5. Checks every term before showing it: the quote must be on the stated page word for word, and every number in the value must be in the quote.
6. Draws the page with the quote marked, so you can see it where it sits.

## Check an agent's extraction

The second panel takes a JSON list of `{term, value, page, quote}`, the shape a model might return, and runs the same check against the PDF. The verdicts, in the order they are tested:

1. **No page or quote.**
2. **No such page.**
3. **Wrong page.** The quote is real but sits on another page. The real page is named.
4. **Quote not in the document.** The closest sentence is shown when there is one.
5. **Number not in the quote.**
6. **Replaced by a later amendment.** The quote is real, but a later document changed the term. The current text is shown.

The sample extraction has four errors planted on purpose: an escalator from a section the second amendment replaced, a real quote with the wrong page, a transposed number ($54 for $45), and a decommissioning bond that appears nowhere in the documents.

## Why rules and not a model

So the page runs with no keys and no cost, and so every rule can be read. In a real pipeline a model would propose the terms and a check like this would decide which ones ship. The rules were written against the sample, so on other leases expect more "not found". I would rather it said that than guessed.

## Run the tests

```
node --test
```

Needs Node 20 or later. No dependencies.

## Open the page locally

ES modules and the PDF do not load from `file://`, so serve the folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. The page makes no network calls beyond its own files.

## The sample documents

A ground lease and two amendments, 7 pages, written for this demo. The names, land, dates and figures are made up. The text lives in `lease-source.js`; `tools/build-sample.mjs` prints it to `sample.pdf` with headless Chrome, and the tests read the same lines.

## Limits

- Text PDFs only. A scanned lease has no text layer, so every term comes back not found. There is no OCR here.
- It checks that the quote is on the page. It does not check that the value is the right reading of the quote. A person still signs off.
- A sentence that runs across a page break is read as two.
- Section numbers count as numbers, so a value of "3" would pass against a quote that starts "3. During".
- Numbers written only as words ("ninety") are not checked.

## Design

It follows the shared direction for these demos: rows split by hairlines instead of cards, Geist for the tool's own words, Newsreader for anything quoted from a document, and one underline that draws under the words a value comes from.

Taken from BuildQ's own site (buildq.ai, read 11 Nov 2026), so it feels at home there:

- The accent is BuildQ's copper (#e5a269 in dark mode, a darker #9a4f1f in light mode for contrast).
- Dark mode uses BuildQ's navy-black ground (#0a0e18) and warm cream text (#ede7da).
- The words are theirs: "page and span", "not found", diligence on leases and amendments.

It is not BuildQ's product and uses no BuildQ logo, font or name as its title. The footer says who built it.

Fonts: Geist and Newsreader (SIL Open Font License), latin subsets in `fonts/`, served from this folder so the page makes no outside requests.

## Third-party code

pdf.js 5.4.296 (Apache-2.0, Mozilla), in `vendor/pdfjs`, copied from the npm tarball after checking its sha512 against the registry. OSV listed no advisories for this version on 11 Nov 2026. It loads with `isEvalSupported: false`.

## Provenance

Built on 11 Nov 2026 with AI coding agents, directed by Arnold Ikpemosi Adeyemi. Not legal advice.

## Licence

MIT. See `LICENSE`. pdf.js keeps its own licence in `vendor/pdfjs/LICENSE`.
