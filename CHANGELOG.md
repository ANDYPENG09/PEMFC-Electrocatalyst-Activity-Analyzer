# Changelog

## 2026-09-18 — Offline analysis workbench / export schema 1.0.0

- Added explained Good / Check recommended / Invalid QC, including N₂ coverage, CV repeatability, transport proximity and plateau-selection sensitivity.
- Added contiguous low-derivative diffusion plateau detection, median/MAD/SD and plateau-based E1/2. Removed automatic min(j) fallback; kept explicit manual limiting-current entry and legacy-potential mode.
- Added multi-rpm CSV and JSON Koutecký–Levich analysis, fit plot, signed slope/intercept/jk, R² and optional electron number with explicit transport constants and rad/s conversion.
- Added multi-sample capture/import, ECSA/E1/2/jlim/MA/SA/Tafel comparison table, CV/ORR overlays and plot export.
- Added versioned analysis.json, results.csv, processed_cv.csv and processed_orr.csv, with explicit units, missing-value rules, settings and QC reasons.
- Kept the single-file offline browser distribution; added maintained workbench sources and an embedding/check script. Added equivalent numpy APIs and a command-line workflow.
- Preserved existing formula APIs, original Hupd/manual tools, PNG/CSV exports, CV cycle helpers, PAAX and Origin readers. `half_wave_potential` retains its call signature but now rejects unresolved plateaus rather than using an extreme point.
- Corrected the legacy example's machine-specific PAAX path and outdated README filenames; added numerical and cross-language regression tests.
- Fixed the legacy example adapters for descending-potential interpolation, CV turns containing potential holds, and the bundled CV CSV's ampere-to-density conversion. The calculation/reader APIs remain intact.
