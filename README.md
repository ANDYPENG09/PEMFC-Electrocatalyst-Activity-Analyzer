# PEMFC Electrocatalyst Activity Analyzer

A self-contained, offline electrochemistry calculator for **PEM fuel cell catalyst characterization** — compute ECSA (H-upd), mass activity (MA), and specific activity (SA) from cyclic voltammetry (CV) and linear sweep voltammetry (LSV) data, directly in your browser with zero dependencies.

![Apple-style UI](https://img.shields.io/badge/UI-Apple%20HIG-blue) ![Offline](https://img.shields.io/badge/Offline-100%25-brightgreen) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **ECSA via H-upd method** — Integrates the hydrogen underpotential deposition (H-upd) desorption peak from forward-scan CV, with automatic baseline subtraction (end-point horizontal baseline, compatible with Origin).
- **ORR mass / specific activity** — Paste O₂ and N₂ LSV curves; auto N₂ background correction, Savitzky-Golay smoothing, kinetic current via Koutecký–Levich equation.
- **Full CV cycle export** — Plots show the complete anodic + cathodic sweep; H-upd integration region highlighted; baseline and peak area clearly visualized.
- **Three-standard compatibility** — Based on GB/T 20042.4-2025, methods compatible with US DOE and EU JRC/IEC protocols (q = 0.21 mC/cm²).
- **Ink-concentration loading** — Catalyst loading auto-calculated from ink concentration (mg/mL), drop volume (µL), RDE area, and Pt weight fraction (30%/50% preset buttons).
- **Analysis workbench** — Automatic diffusion plateau, explained QC, multi-rpm K–L fitting, multi-sample comparison and versioned JSON/CSV exports in the same offline page and Python core.
- **Pure frontend** — Single HTML file, no server, no build step, no internet required. Works offline.

## Quick Start

1. Open `index.html` in any modern browser. The file includes its scripts and works directly from disk, without a server or internet.
2. Click **Load Example Data** to see a pre-filled demo (EC-30-PtCo sample).
3. Or paste your own CV data (potential V, current A) into the CV textarea.
4. Click **Calculate ECSA** → results appear instantly with SVG charts.

## Formulas

### ECSA (H-upd)

$$
\text{ECSA} = \frac{100 \cdot S_H}{q \cdot v \cdot m_{\text{Pt}}}
$$

| Symbol | Meaning | Default |
|--------|---------|---------|
| $S_H$ | H-upd desorption peak area (mA·V/cm²) | Auto from CV |
| $q$ | H-upd charge constant | 0.21 mC/cm² |
| $v$ | Scan rate (V/s) | 0.02 (20 mV/s) |
| $m_{\text{Pt}}$ | Pt loading (µg/cm²) | From ink params |

### Mass Activity (MA)

$$
j_k = \frac{|j| \cdot |j_{\text{lim}}|}{|j_{\text{lim}}| - |j|}, \quad
\text{MA} = \frac{j_k}{1000 \cdot m_{\text{Pt, mg}}}
$$

### Specific Activity (SA)

$$
\text{SA} = \frac{j_k}{\text{ECSA}_{\text{m²/g}} \cdot m_{\text{Pt, g/cm²}} \cdot 10^4}
$$

## Data Format

Two-column tab/space/comma-separated text:

```
Potential(V)  Current(A)
0.05          -4.4185E-5
0.10           2.8e-5
...
```

- **CV**: Forward + reverse sweep (full cycle). The calculator auto-detects the anodic sweep and selects the H-upd region [0.05, 0.40] V.
- **LSV**: Paste O₂ curve and N₂ background separately; N₂ is interpolated and subtracted automatically.

## File Structure

```
PEMFC-Electrocatalyst-Activity-Analyzer/
├── README.md                          # This file
├── LICENSE                            # MIT License
├── index.html                        # Standalone offline calculator + workbench
├── electrochem_analysis.py           # QC, plateau, K-L, batch, exports, CLI
├── web/                              # Maintained JS/HTML workbench sources
├── build_html.py                     # Embed sources into index.html (developers only)
├── tests/                            # Numerical, legacy, export and JS/Python parity tests
├── electrochem_calc.py                # Python helper (formula functions)
├── electrochem_plot.py                # Python matplotlib plotting
├── read_paax.py                       # Autolab .paax parser
├── extract_origin.py                  # Origin .opju extractor
└── run_example.py                     # Demo runner
```

## New workbench (HTML and Python)

The original manual ECSA, MA/SA, loading, smoothing, plot/PNG/CSV controls and Python formula/plot/PAAX/Origin utilities remain available. Automatic LSV extraction now defaults to a **continuous plateau median**, with an explicit **Manual potential (legacy)** selector retained. `half_wave_potential(E, j)` keeps its two-argument API, uses the detected plateau, and returns `nan` when no reliable plateau/crossing exists. An optional third `j_lim` argument permits an explicit value. No automatic path substitutes `min(j)`.

### Browser workflow

1. Fill the original CV/O₂/N₂ text areas and units/loading settings.
2. In **Analysis Workbench**, enter a unique sample ID and choose the input potential reference, pH and additional uncompensated Ru. Click **Analyze & add current sample**. RHE inputs receive no pH shift; other references use the 25 °C Nernst term. The correction is `E_RHE − I_A * Ru`. Leave Ru at zero for already corrected curves.
3. Repeat with another sample, or select multiple input JSON files. Each file may contain one sample object or `{ "samples": [...] }`. Captures are independent snapshots; remove and recapture a sample to update it. **Load two-sample demo** creates labeled synthetic data.
4. Read ECSA, E1/2, jlim, MA@0.9 V, SA@0.9 V and Tafel in the comparison table. Expand each sample's QC details; inspect the CV/ORR overlays and download plots or the four standardized files.
5. In **Multi-rpm Koutecký–Levich**, paste/import one or more CSV files using the columns below and click **Fit K–L**. The separate K–L demo recovers n = 4 and signed jk = −10 mA/cm². A current fit is also included in the workbench's `analysis.json` export; changing K–L inputs invalidates it until refitted.

### QC and numerical conventions

These defaults are **screening heuristics, not standards certification**. `Good` means the available checks passed, `Check recommended` indicates missing evidence or a suspect result, and `Invalid` indicates a failed required condition. Inspect `qc.checks`; do not automatically train/optimize from an Invalid sample.

| Check | Default rule |
|---|---|
| Diffusion plateau | Five-point running median for detection; low `abs(dj/dE)` ≤ 0.15 × robust cathodic amplitude per V; ≥7 contiguous points spanning ≥0.08 V; no gaps >0.025 V; cathodic magnitude ≥60% of robust amplitude. A resolved rising wave is required to reject flat baselines. |
| Plateau result | Choose widest candidate, use **original current median**, report potential bounds, MAD, standard deviation and all candidate regions. Standard deviation >5% of magnitude prompts review. |
| N₂ background | Missing background prompts review; partial coverage or gaps mark Invalid. No extrapolation. With incomplete background, the whole ORR curve remains uncorrected and is clearly flagged. |
| CV stability | RMS difference of last two complete, comparable **anodic** sweeps / RMS of last sweep; >5% prompts review. One sweep cannot establish stability. |
| 0.9 V transport | `abs(j/jlim) >= 0.8` prompts review; missing potential, noncathodic current or `abs(j) >= abs(jlim)` is Invalid and gives no MA/SA. |
| Plateau sensitivity | Recompute using plateau P10/P90 and derivative thresholds ×0.5/×1.5, including alternative candidates. >10% relative jlim or MA change prompts review; singular kinetic correction is Invalid. |
| E1/2 | Interpolated rising crossing of signed plateau median / 2. Missing crossing is Invalid. |
| Tafel | Fit E vs log10(abs(jk)) in configurable 0.85–0.95 V range, excluding transport ratio ≥0.8. Require ≥5 points and ≥0.3 decades; report positive magnitude in mV/dec. R² <0.98 prompts review. |

`qc_options` can override `min_width_V`, `min_points`, `slope_fraction_per_V`, `max_gap_V`, `transport_ratio`, `stability_fraction`, and `sensitivity_fraction`. Thresholds and integration settings are saved in every sample's export. Potentials must be finite, unique and monotonic for ORR/N₂/K–L sweeps; descending sweeps are accepted. New workbench analysis does not smooth measurement values: detection smoothing never changes exported currents. The original LSV tool retains its Savitzky–Golay smoothing.

New workbench ECSA uses the **last complete anodic Hupd sweep**, a horizontal endpoint baseline at the upper integration bound, positive baseline-subtracted area and interpolated bounds. The original HTML Origin-style integration and Python `ecsa_from_hupd` (two-sweep mean area) remain unchanged; these distinct methods can produce different ECSA. Workbench ECSA is identical in JS and Python. Use `baseline_mA_cm2` to specify a manual baseline. Original multi-cycle selection functions remain available; workbench stability compares like-direction sweeps rather than interpolating across an entire nonmonotonic cycle.

### Multi-rpm K–L import

```csv
rpm,potential_V_RHE,j_mA_cm2
400,0.895,-1.50
400,0.905,-1.40
900,0.895,-1.90
900,0.905,-1.80
1600,0.895,-2.20
1600,0.905,-2.10
```

Supply **already background/potential-corrected current densities**, not raw amperes. At least three distinct positive rpm are required. Interpolate without extrapolation at the specified potential, use `omega = 2*pi*rpm/60` in rad/s, and regress **signed `1/j` vs `omega^(-1/2)`**. Return slope, intercept, R², signed `jk = 1/intercept`, the sampled points, reasons and status. Cathodic ORR requires negative slope and intercept. Nonphysical fits return no jk/n; R² <0.98 prompts review. An estimated n outside 1–4.2 prompts review and is not a mechanistic diagnosis.

Optional n requires all three positive constants: `D_cm2_s`, `nu_cm2_s` (kinematic viscosity), `C_mol_cm3` (dissolved oxygen concentration). The conversion is `n = 1 / (abs(slope)*1000*0.620*F*D^(2/3)*nu^(-1/6)*C)`, with F = 96485.33212 C/mol. No electrolyte constants are silently assumed. See [Pine Research K–L analysis](https://pineresearch.com/support-article/koutecky-levich-analysis-rde/) and [RDE theory and rotation units](https://pineresearch.com/support-article/rotating-disk-electrode-rde-theory/).

### Python workflow

```bash
pip install -r requirements.txt
python run_analysis_example.py --plot
python electrochem_analysis.py analysis_output/input.json --output my_results --plot
# Optional multi-rpm CSV replaces the kl.traces field of the input JSON:
python electrochem_analysis.py analysis_output/input.json --kl-csv speeds.csv --output my_results --plot
python -X utf8 run_example.py
python -m unittest discover -s tests -v
```

Only numpy is required for numerical analysis; pandas/matplotlib serve the existing data and plotting tools. Node.js is required only for the JS/Python parity test. `plot_comparison()` and `plot_kl()` return matplotlib figures. The bundled legacy example now resolves its PAAX file relative to the repository.

Input JSON shape (short arrays below illustrate the structure; real plateau analysis requires densely sampled full curves):

```json
{
  "samples": [{
    "sample_id": "PtCo-01",
    "loading_mg_cm2": 0.02,
    "orr": {"E": [0.2, 0.204, 0.208], "j": [-5.9, -5.9, -5.9]},
    "n2": {"E": [0.2, 0.204, 0.208], "j": [0.01, 0.01, 0.01]},
    "cv": {"E": [0.05, 0.2, 0.4, 0.2, 0.05], "j": [0.1, 0.8, 0.1, -0.2, -0.1], "scan_rate_V_s": 0.02, "hupd_range_V": [0.05, 0.4], "q_mC_cm2": 0.21},
    "tafel_range_V": [0.85, 0.95],
    "metadata": {"rotation_rpm": 1600, "reference": "RHE", "additional_Ru_ohm": 0}
  }]
}
```

Python JSON input potentials must already be **V vs RHE**, currents **mA/cm²**, and loading **mgPt/cm²**. Existing `v_to_rhe`, `rhe_to_v`, `ir_correct`, and `current_to_density` are available for preprocessing; record the settings in `metadata`. Optional `kl` uses `{ "traces": [{"rpm": 400, "E": [...], "j": [...]}], "potential_V": 0.9, "D_cm2_s": ..., "nu_cm2_s": ..., "C_mol_cm3": ... }`.

### Stable export contract — schema_version 1.0.0

| File | Structure / columns in stable order |
|---|---|
| `analysis.json` | `schema_version`, `units`, `samples`; optional `kl`. Each sample includes `sample_id`, `metrics`, `qc`, `plateau`, `cv`, `tafel`, `metadata`, `settings`, `processed_cv`, `processed_orr`. |
| `results.csv` | `sample_id,ecsa_m2_g,ehalf_V,jlim_mA_cm2,ma_0_9V_A_mg,sa_0_9V_mA_cm2_Pt,tafel_mV_dec,qc_status` |
| `processed_cv.csv` | `sample_id,point_index,potential_V_RHE,j_mA_cm2` (all supplied CV points, acquisition order) |
| `processed_orr.csv` | `sample_id,point_index,potential_V_RHE,j_raw_mA_cm2,j_background_mA_cm2,j_corrected_mA_cm2,in_plateau` (ascending E) |

UTF-8, decimal point, no localized column names. Unavailable numbers are JSON `null` / empty CSV cells, never NaN/Infinity/zero placeholders. CSV booleans are `True`/`False`. IDs join all four files. `qc.checks` contains stable check codes, status, reason and values. An absent N₂ background is null, not a measured zero. A consumer such as `bayesian-optimization-electrocatalyst` should join by `sample_id`, validate `schema_version`, inspect `qc_status`, and filter missing objectives. This change does not modify or claim a tested integration with that other repository. Breaking field/unit changes require a schema major version bump.

### Development

Edit `web/analysis.js`, `web/workbench.js`, or `web/workbench.html`, then run `python build_html.py`. Commit the regenerated `index.html` so users still need only one file. `python build_html.py --check` detects drift. Existing page code remains in `index.html`. Tests cover analytic ORR metrics, outliers/no plateau, background coverage, CV stability, transport checks, invalid inputs, K–L units, exports, legacy formulas and full JS/Python output parity.

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Chrome / Edge | ✅ Fully supported |
| Safari | ✅ Fully supported |
| Firefox | ✅ Fully supported |

## License

MIT License — see [LICENSE](LICENSE) for details.

## Author

**ANDYPENG09**

## Acknowledgments

- Integration method validated against GB/T 20042.4-2025 (China National Standard for PEM Fuel Cell Electrocatalyst Testing).
- Baseline convention matches Origin's H-upd integration gadget (end-point horizontal baseline).
- Savitzky-Golay smoothing for LSV noise reduction (window=7, 2nd-order polynomial).
