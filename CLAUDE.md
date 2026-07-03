# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PTO is a local, static-frontend visualization workbench for Ascend NPU operator development, compiler-pass analysis, execution swimlanes, and hardware data-path understanding. Pages are plain HTML/CSS/vanilla JS — there is **no root-level build, bundler, or test runner**. A few experiment dirs (e.g. `CANNVision-main/`) are independent Node/Vite subprojects with their own `package.json`.

## Running

Most pages fetch JSON, load ES resources, or embed iframes, so they break under `file://`. Always serve over local HTTP:

```bash
cd /Users/yin/pto
python3 -m http.server 8765   # or: npx serve .
open http://127.0.0.1:8765/launch.html
```

`launch.html` is the aggregate entry point that links every workbench, experiment, and whitepaper. New pages should be surfaced through it (experiments/archives can live in module dirs or `archive/`).

For a Node subproject, `cd` into its directory and use its own `package.json` scripts — do not assume a shared toolchain.

## Architecture

### Shared rendering stack (`js/`)
The Pass IR workbench (`pass-ir/index.html`) is the core engine; other modules reuse its scripts. These are **classic global scripts loaded in dependency order**, not ES modules. Order matters:

```
colormap.js → parser.js → layout.js → renderer.js → app.js → nav.js → controlflow*.js
```

- `parser.js` / `layout.js` / `layout-tb.js` — graph parsing and layout (LR and top-bottom variants).
- `renderer.js` — SVG/Canvas graph drawing; `colormap.js` — semantic coloring.
- `app.js` (~88KB) — the Pass IR application controller.
- `nav.js` + `nav_index_builder.js` — the inline pass navigator; `nav_index.json` is **generated and gitignored** (do not hand-edit or commit it).

`mem_viewer/` deliberately pulls in this same `colormap/parser/layout/renderer` stack to keep the compute-graph rendering consistent with Pass IR.

### Pass-cause subsystem (`js/pass_cause_*`)
A self-contained family for explaining *why* a compiler pass changed the graph: `pass_cause_diff`, `pass_cause_rules`, `pass_cause_explainer`, `pass_cause_semantic`, `pass_cause_panel`, `pass_cause_playback`, plus `*_schema` contracts and `pass_cause_standalone.js` (a bundled standalone build). Treat the schema files as the data contract when changing diff/explainer logic.

### Path handling: `PTO_BASE_PREFIX`
Pages run both locally and on GitHub Pages (`yinyucheng0601.github.io/compute-graph-viewer/`). Resource paths are resolved through `window.PTO_BASE_PREFIX` (see `nav.js`, `renderer.js`). When adding cross-module links or fetches, route them through this prefix rather than hardcoding absolute paths. Related globals: `PTO_PASS_IR_ENTRY`, `PTO_DISABLE_NAV_AUTOLOAD`.

## Design system (mandatory)

The visual system lives in the **git submodule** `vendor/pto-design-system/` (the `pto-design-system` skill). After cloning, run `git submodule update --init`. This is the runtime source of truth; root-level `tokens/`, `css/`, `patterns/`, `design-system-share/` are only legacy/compat artifacts emitted by sync scripts.

Rule: **consume the existing system — do not invent new buttons, toggles, badges, cards, panels, spacing, or colors.**

Launch/index pages should be sparse and product-level: keep card proportions stable with explicit aspect ratios, use polished navigation copy instead of "test/demo/draft" phrasing, and avoid low-value tag piles. Organize by clear sections, concise card titles, and meaningful actions; reserve badges only for true status or decision-critical metadata.

- Tokens via CSS variables: `vendor/pto-design-system/tokens/{foundation,semantic,components}.css` (e.g. `var(--surface-2)`, `var(--foreground-secondary)`, `var(--space-3)`).
- Classes: `vendor/pto-design-system/css/style.css`.
- Reusable graphics (swimlane task bar, memory-architecture layout, AIC/AIV core objects, Pass IR graph node, IDE frame, playback control) are **patterns** under `vendor/pto-design-system/patterns/`, registered in `patterns/patterns.json`. Before building layout/viz-heavy work, read the matched `patterns/<id>/pattern.json` — it defines allowed overrides, forbidden overrides, and required APIs.
- New shared graphic → add a `pattern.html` / `pattern.css` / `pattern.js` / `pattern.json` set and update `patterns.json`. Don't scatter duplicate SVG/Canvas/DOM graphics across pages.
- Read `vendor/pto-design-system/DESIGN.md` and `references/quick-reference.md` first for full spec and a token cheat sheet.

## Working in this repo

- The tree contains many in-flight prototypes and mid-migration dirs. Run `git status` before editing and **do not opportunistically clean up unrelated files.**
- Module entry points and their purposes are catalogued in `README.md`; per-change history is in `CHANGELOG.md` (reverse-chronological, one line per change — append here when making notable changes).
- `js/test-syntax.js`, `nav_index.json`, and various `output_*` dirs are gitignored generated/scratch artifacts.
