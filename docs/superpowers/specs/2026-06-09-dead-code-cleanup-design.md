# Dead Code Cleanup — Design Spec

**Date:** 2026-06-09
**Scope:** Repo-wide purge of unreferenced files, zombie comments, archived plan docs, and obvious dead internals.

## Goal

Reduce maintenance surface by removing code paths that no longer execute, while preserving media assets and historical specs that may still be referenced.

## In Scope

### A. Orphaned code files (delete)
No live `{% render %}`, `asset_url`, or `{% sections %}` reference:

**Assets:**
- `assets/japanjunky-homepage.css`
- `assets/japanjunky-wm.css`
- `assets/japanjunky-wm.js`
- `assets/japanjunky-product-select.js`
- `assets/fragments-config.liquid`

**Sections / snippets:**
- `sections/jj-header.liquid`
- `sections/header-group.json`
- `snippets/ascii-empty-state.liquid`
- `snippets/ascii-frame.liquid`
- `snippets/ascii-icon.liquid`
- `snippets/category-list.liquid`
- `snippets/member-login-box.liquid`
- `snippets/product-card-ascii.liquid`
- `snippets/product-detail-pane.liquid`
- `snippets/product-inventory-row.liquid`
- `snippets/product-table-row.liquid`

**Root:**
- `preview-screensaver.html` (standalone dev preview, loads dead `sample3.jpg`+`glico.png`)

### B. Zombie comments (edit)
- `sections/jj-footer-win95.liquid:18` — remove "Tabs managed dynamically by japanjunky-wm.js" comment.

### C. Internal dead code (best-effort)
Quick scan of kept JS/CSS files for obviously unused functions, exports, or class selectors. Stop at first ambiguous case — no exhaustive sweep.

### D. Archive historical plans
Move into `docs/archive/`:
- `docs/plans/*` → `docs/archive/plans/`
- `docs/superpowers/plans/*` → `docs/archive/superpowers-plans/`

Keep `docs/superpowers/specs/` in place — specs document current architecture intent.

## Out of Scope

**Media kept on disk** (per user direction — cheap, may be reused):
- `glico.png`, `sample3.jpg`, `frag-test.png`, `cursor-text.png`, `tsuno-irasshaimase.mp3`
- `frag-miho1.{png,json}`, `frag-rebecca1.{png,json}`, `frag-rebecca2.{png,json}`

Exhaustive dead-CSS-class or dead-JS-function sweep (separate plan if desired).

## Risk

Low. All A-files have zero live references confirmed via grep across `*.liquid`. Internal-scan changes (C) only land if reference count = 0 across all live files.

## Commit Plan

One commit per phase:
1. `docs: archive completed plans`
2. `chore: delete orphaned assets/sections/snippets`
3. `chore: remove zombie wm.js reference in footer`
4. `chore: prune dead internals` (only if findings exist)
