# PEMFC Electrocatalyst Activity Analyzer

A self-contained, offline electrochemistry calculator for **PEM fuel cell catalyst characterization** — compute ECSA (H-upd), mass activity (MA), and specific activity (SA) from cyclic voltammetry (CV) and linear sweep voltammetry (LSV) data, directly in your browser with zero dependencies.

![Apple-style UI](https://img.shields.io/badge/UI-Apple%20HIG-blue) ![Offline](https://img.shields.io/badge/Offline-100%25-brightgreen) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **ECSA via H-upd method** — Integrates the hydrogen underpotential deposition (H-upd) desorption peak from forward-scan CV, with automatic baseline subtraction (end-point horizontal baseline, compatible with Origin).
- **ORR mass / specific activity** — Paste O₂ and N₂ LSV curves; auto N₂ background correction, Savitzky-Golay smoothing, kinetic current via Koutecký–Levich equation.
- **Full CV cycle export** — Plots show the complete anodic + cathodic sweep; H-upd integration region highlighted; baseline and peak area clearly visualized.
- **Three-standard compatibility** — Based on GB/T 20042.4-2025, methods compatible with US DOE and EU JRC/IEC protocols (q = 0.21 mC/cm²).
- **Ink-concentration loading** — Catalyst loading auto-calculated from ink concentration (mg/mL), drop volume (µL), RDE area, and Pt weight fraction (30%/50% preset buttons).
- **Single-file HTML app** — English UI, no server, no build step, no internet required. Works offline.
- **Python toolchain included** — Formula module, publication-style plotting, Autolab `.paax` parser, and Origin `.opju` exporter for local batch workflows.

## Quick Start (browser)

1. Open `index.html` in any modern browser.
2. Click **Load Example Data** to see a pre-filled demo (EC-30-PtCo sample).
3. Or paste your own CV data (potential V, current A) into the CV textarea.
4. Click **Calculate ECSA** → results appear instantly with SVG charts.

## Quick Start (Python toolchain)

```bash
pip install numpy pandas matplotlib
python run_example.py          # runs both CSV and .paax chains, writes PNG figures
```

`run_example.py` demonstrates two equivalent data paths:

- **A) CSV chain** — reads the CSV files exported from Origin/NOVA directly.
- **B) `.paax` chain** — reads the raw Autolab NOVA `.paax` file, converts current to current density with `electrochem_calc`, and plots — no Origin needed. A consistency check confirms the two chains agree (deviation ≈ 0 on the bundled demo data).

The demo files under `sample_data/` are desensitized synthetic data (regenerate with `python gen_sample_data.py`); replace them with your own exports.

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
├── index.html                  # Single-file HTML app (English UI, offline)
├── electrochem_calc.py         # Formula module (unit conversion, RHE, iR, E1/2, K-L, CV cycle split)
├── electrochem_plot.py         # Publication-style matplotlib plotting (ORR LSV / CV / Tafel)
├── read_paax.py                # Autolab NOVA .paax raw-file parser
├── extract_origin.py           # Origin .opju worksheet exporter (needs Origin + originpro)
├── run_example.py              # Demo runner: CSV chain + .paax chain + consistency check
├── gen_sample_data.py          # Regenerates the desensitized synthetic sample_data
├── sample_data/                # Demo data: O2LSV.csv, CV.csv, EC-30-PtCo-Step1.paax
├── LICENSE                     # MIT License
└── .gitignore
```

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
