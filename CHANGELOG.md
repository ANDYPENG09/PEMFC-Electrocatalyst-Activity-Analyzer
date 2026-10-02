# Changelog

## v1.2.2 — 2026-10-02

- Add a concise entry page with usage/download links and synthetic comparison preview.
- Move detailed numerical conventions and exports to dedicated documentation; add an explicit BO handoff guide.
- Add reproducible npm lockfile and CI for numerical/parity, DOM and standalone-build checks.
- Synchronize the existing gh-pages deployment with the validated standalone HTML; record its source commit.
- Retain v1.2.1 calculation behavior and every existing feature.


## v1.2.1 — 2026-09-23

- Share the boundary-interpolated, positive-only CV integration between the single-sample tool and workbench. Automatic baseline uses the selected upper integration limit (default 0.40 V); custom limits can therefore change previously reported ECSA.
- Compute SA from full-precision ECSA and clear it when CV inputs are cleared or invalid. Validate loading, scan rate, charge density, baseline and malformed two-column data.
- Suppress ORR metrics and corrected-current points when supplied N₂ background cannot be applied; keep independent valid CV results and comparison samples.
- Use binary-search interpolation and avoid spread-argument limits in large plateau analyses.
- Clip curves to the plot area, honor explicit axis bounds, reject inverted ranges and center labels above comparison legends.
- Verify with 15 numerical/parity tests, DOM interaction regressions, a million-point logarithmic lookup check and a 150,000-point plateau regression. PNG I/O in DOM tests remains mocked.

## v1.2.0 — 2026-09-22

- Open O₂/N₂ LSV inputs by default.
- Add persistent named sample history, renaming, restore-input actions, selection, raw JSON backup/import, duplicate-name handling and CV-only comparison.
- Include sample legends in comparison PNGs; choose CV/LSV comparisons independently.
- Select CV, LSV, Hupd, results and annotations independently in exported figures; retain 16:9 alongside compact layout.
- Reject stale plots after clearing/editing inputs, avoid N₂ endpoint extrapolation, reject internal N₂ gaps, and stop extrapolating evaluation current.
- Clip negative contributions in the manual positive-only Hupd integration; escape SVG labels and tolerate unavailable local storage.
- Add DOM interaction regressions alongside the existing 14 numerical/Python–JavaScript parity tests.

## 2026-09-18 — Offline analysis workbench / export schema 1.0.0

- Added `summary.csv`: one final CSV containing sample metrics plus exact CV and corrected LSV plot points (`metrics`, `cv_point`, `lsv_point`) while preserving all existing exports.
- Added an offline English/Chinese UI switch to the standalone `index.html`; language selection persists locally.

- Added explained Good / Check recommended / Invalid QC, including N₂ coverage, CV repeatability, transport proximity and plateau-selection sensitivity.
- Added contiguous low-derivative diffusion plateau detection, median/MAD/SD and plateau-based E1/2. Removed automatic min(j) fallback; kept explicit manual limiting-current entry and legacy-potential mode.
- Added multi-rpm CSV and JSON Koutecký–Levich analysis, fit plot, signed slope/intercept/jk, R² and optional electron number with explicit transport constants and rad/s conversion.
- Added multi-sample capture/import, ECSA/E1/2/jlim/MA/SA/Tafel comparison table, CV/ORR overlays and plot export.
- Added versioned analysis.json, results.csv, processed_cv.csv and processed_orr.csv, with explicit units, missing-value rules, settings and QC reasons.
- Kept the single-file offline browser distribution; added maintained workbench sources and an embedding/check script. Added equivalent numpy APIs and a command-line workflow.
- Preserved existing formula APIs, original Hupd/manual tools, PNG/CSV exports, CV cycle helpers, PAAX and Origin readers. `half_wave_potential` retains its call signature but now rejects unresolved plateaus rather than using an extreme point.
- Corrected the legacy example's machine-specific PAAX path and outdated README filenames; added numerical and cross-language regression tests.
- Fixed the legacy example adapters for descending-potential interpolation, CV turns containing potential holds, and the bundled CV CSV's ampere-to-density conversion. The calculation/reader APIs remain intact.
