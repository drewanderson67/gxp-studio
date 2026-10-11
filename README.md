# GxP Studio

Offline-first PWA for GxP computerized-system work: controlled documents, change control & code/data migrations, defects/CAPA, deviations, training records, and executable test automation — with traceability, a SHA-256 hash-chained audit trail and Part 11-style e-signatures.

- `src/` — sources (`core.js`, `runner.js`, `migrate.js`, `seed.js`, `views1.js`, `views2.js`, `views3.js`, `main.js`, `style.css`, `index.tpl.html`, `sw.js`)
- `python3 build.py` → inlines everything into a single self-contained `index.html` (+ versioned `sw.js`)
- Serve: `python3 -m http.server 8080`. Data lives in `localStorage` (`gxps.v1`); demo e-signature PIN is `1234`.

Demo workspace (fictional): Northwind Biologics · LabTrack LIMS. Prototype only — not a validated system.
