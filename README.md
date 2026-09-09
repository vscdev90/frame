# FRAME — Design within reality.

A browser-based **design feasibility platform**: it helps a private client discover what they can
realistically design and build *before* engaging an architect.

FRAME is not an AI architect, a house generator or an image generator. It generates plausible,
explainable and increasingly buildable design options, and connects every design decision to its
consequences — cost, daylight, solar load, structure, planning and feasibility.

**Live site:** GitHub Pages, deployed from this repository by `.github/workflows/pages.yml`.

> **One-time setup.** Pages has to be switched on by a repository admin before the first deploy can
> succeed: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow asks
> `configure-pages` to enable it automatically, but the Actions token is not permitted to create a
> Pages site in this repository (`Resource not accessible by integration`), so the switch has to be
> flipped by hand once. After that, every push to the deploy branch publishes automatically — re-run
> the latest workflow from the Actions tab to publish immediately.

![FRAME wordmark](assets/img/frame-wordmark.jpg)

---

## What this build is

This is a complete implementation of the product loop from the build-start specification
(`DEFINE → EXPLORE → COMPARE → ADJUST → VALIDATE → REFINE`), running entirely in the browser as a
static site so it can be hosted on GitHub Pages.

The specification recommends Next.js + FastAPI + PostgreSQL. GitHub Pages serves static files only,
so the deterministic engines that would live on the server are implemented as ES modules that run
client-side, and the project store is `localStorage` behind the same interface a REST client would
have. Nothing about the data model or the engine boundaries changes when a backend is added —
`assets/js/store.js` is the only module that would be swapped.

### Implemented

| Spec | Module | What it does |
| --- | --- | --- |
| §10 Planning engine | `data/rules.js` | Structured rule store — `rule_id`, source, condition, value, confidence. Rules are data, never prompts. |
| §11–13 Program | `engines/program.js` | Wizard answers → space objects with min/target/max area, MoSCoW priority, orientation, daylight, privacy; relationships as a graph. |
| §14 Budget | `engines/pipeline.js` | Splits total capital into construction, professional fees, levies and contingency. |
| §15–16 Directions | `engines/directions.js` | Generates and ranks design directions with Design DNA, advantages, disadvantages and risks. |
| §17 Massing | `engines/massing.js` | Generates a candidate grid, discards everything that breaks a site rule, scores the rest on four axes, keeps the strongest three. |
| §18–19 Geometry & 3D | `engines/geometry.js`, `render/viewer3d.js`, `render/iso.js` | Deterministic geometry from structured intent; WebGL viewer — orbit, pan, zoom, pinch-to-zoom on touch, keyboard control — with an isometric SVG fallback that draws the same model. |
| §20 Floorplans | `engines/layout.js` | Real semantic spaces — polygon, area, facades, windows, adjacencies — packed orientation-aware, not drawn as pictures. |
| §21 Construction | `data/construction.js` | Five systems with cost, speed, carbon, thermal, acoustic, fire, span and availability; ranked per design. |
| §22 Envelope | `engines/geometry.js` | Glazing ratio → actual openings with size, sill, frame, glass, opening type and shading. |
| §23 Consequences | `engines/consequence.js` | Every change diffed through the full pipeline: cost, daylight, solar gain, energy, structure, accessibility, feasibility. |
| §24 Cost | `engines/cost.js`, `data/costModel.js` | Quantities × rate ranges, per line: low, high, confidence and the stated assumption. Ranges, never false precision. |
| §25 Feasibility | `engines/feasibility.js` | Budget / program / site / complexity, each 0–100, each with its reasons exposed. |
| §26–27 What-if & scenarios | `engines/consequence.js` | Budget slider, eight what-if scenarios, and Conservative / Balanced / Ambitious comparison. |
| §28 Versions & decisions | `store.js` | V01, V02, … snapshots plus a decision log with reasons and status. |
| §29–31 AI architecture | `engines/assistant.js` | The deterministic half of the assistant: intent matching plus answers composed only from computed data, and a critic that says the unwelcome thing. See the note below. |
| §32 Trust & liability | throughout | Assumptions, sources and confidence are shown; limitations are stated on every page that carries a number. |
| §37 Frontend | `views/workspace.js` | The design board: program left, model centre, feasibility right, budget and cost below. |
| §38 Design brief | `views/brief.js` | Nine-section brief with print-to-PDF and a JSON export for architect handoff. |

### Honest limitations

- **No language model.** The spec puts an LLM behind conversation, explanation and critique
  (§29–31). A static site has no backend and therefore no model. What is built is the deterministic
  half: question-intent matching, and answers assembled from computed project data. It will say
  "this build cannot answer that" rather than guess. When a model is added it becomes the phrasing
  layer over exactly these facts — `engines/assistant.js` defines that contract.
- **No address lookup.** There is no parcel, footprint or omgevingsplan retrieval (§9). You enter
  the plot area, frontage and orientation yourself; the site drawing is built from those.
- **The rules are demo data.** `data/rules.js` holds an indicative model ruleset for a generic Dutch
  residential plot, with confidences between 0.4 and 0.7 to make that visible. It is not the
  omgevingsplan for any real address.
- **The cost rates are indicative.** Calibrated to roughly € 2,000–2,650 per m² of gross floor area
  for a standard timber-frame house, excluding VAT and land. A quantity surveyor's figure for a real
  project will differ.
- **The 3D viewer needs a CDN.** Three.js loads from jsDelivr at runtime. Where that is blocked, the
  app falls back to the isometric renderer — the same geometry, drawn as SVG — and says so in the
  viewport label.
- **Out of scope, as the spec asks:** detailed BIM, structural calculations, full building
  regulations, professional quantity surveying, construction details, Revit/IFC export and a
  contractor marketplace.

---

## Running it

No build step, no dependencies:

```bash
python3 -m http.server 8899   # then open http://localhost:8899
```

It must be served over HTTP rather than opened as a `file://` URL, because the app uses ES modules.

## Tests

```bash
node tests/smoke.mjs     # engine pipeline: directions, massing, cost, feasibility, what-if
node tests/gestures.mjs  # pinch-zoom and pan maths for the 3D viewer, no WebGL needed
node tests/browser.mjs   # end-to-end walk of the whole product loop in Chromium
```

The browser test drives the real UI — wizard, workspace, every panel, the what-if engine, the
assistant, versioning, comparison and the brief — and fails on any console error, page error or
unexpected failed request. It also loads every route, and every workspace panel, at 390 × 844 and
fails if anything overflows horizontally. Both suites run in CI on every push, and the site only
deploys if they pass.

## Responsive behaviour

The layout is built for a phone as well as a desktop. Below 1000px the two- and three-column
layouts collapse; below 760px the design board's side navigation becomes a scrolling row of chips,
the program list collapses behind a disclosure so the model stays above the fold, wide tables scroll
inside themselves, and key/value pairs stack. In the 3D viewer one finger orbits, two fingers pinch
to zoom and pan together, and a double tap reframes the model. The isometric renderer fits its own subject rather
than a fixed frame, so a drawing reads at thumbnail size as well as full width.

## Structure

```
index.html                  Shell; hash routing so every route is a static file
assets/css/app.css          Design system: minimal, calm, large type, subtle borders
assets/js/app.js            Router and page chrome
assets/js/store.js          Project store, versions, decision log, export
assets/js/data/             Rule store, construction systems, cost rates
assets/js/engines/          Program, directions, massing, geometry, layout,
                            cost, feasibility, consequence, pipeline, assistant
assets/js/render/           Isometric SVG, floorplans and elevations, WebGL viewer
assets/js/views/            Landing, wizard, workspace, compare, brief
tests/                      Engine smoke test and end-to-end browser test
```

The pipeline (`engines/pipeline.js`) is one pure function from project data to a full evaluation.
That is what makes the event chain in §36 — `WINDOW_CHANGED → GEOMETRY_CHANGED → QUANTITY_CHANGED →
COST_CHANGED → FEASIBILITY_CHANGED` — trivially correct: it simply re-runs, and every number on
screen comes from the same evaluation.

---

FRAME provides design exploration and preliminary feasibility information and does not replace
professional architectural, structural, planning, legal, financial or building-control advice.
