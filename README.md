# PEMFC Electrocatalyst Activity Analyzer

A self-contained, offline electrochemistry calculator for **PEM fuel cell catalyst characterization** — compute ECSA (H-upd), mass activity (MA), and specific activity (SA) from cyclic voltammetry (CV) and linear sweep voltammetry (LSV) data, directly in your browser with zero dependencies.

![Apple-style UI](https://img.shields.io/badge/UI-Apple%20HIG-blue) ![Offline](https://img.shields.io/badge/Offline-100%25-brightgreen) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **ECSA via H-upd method** — Integrates the hydrogen underpotential deposition (H-upd) desorption peak from forward-scan CV, with automatic baseline subtraction (end-point horizontal baseline, compatible with Origin).
- **ORR mass / specific activity** — Paste O₂ and N₂ LSV curves; auto N₂ background correction, Savitzky-Golay smoothing, kinetic current via Koutecký–Levich equation.
- **Full CV cycle export** — Plots show the complete anodic + cathodic sweep; H-upd integration region highlighted; baseline and peak area clearly visualized.
- **Three-standard compatibility** — Based on GB/T 20042.4-2025, methods compatible with US DOE and EU JRC/IEC protocols (q = 0.21 mC/cm²).
- **Ink-concentration loading** — Catalyst loading auto-calculated from ink concentration (mg/mL), drop volume (µL), RDE area, and Pt weight fraction (30%/50% preset buttons).
- **English & Chinese versions** — Both included.
- **Pure frontend** — Single HTML file, no server, no build step, no internet required. Works offline.

## Quick Start

1. Open `electrochem_calculator_en.html` (English) or `electrochem_calculator.html` (Chinese) in any modern browser.
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
electrochem_template/
├── README.md                          # This file
├── LICENSE                            # MIT License
├── electrochem_calculator.html        # Chinese version
├── electrochem_calculator_en.html     # English version
├── electrochem_calc.py                # Python helper (formula functions)
├── electrochem_plot.py                # Python matplotlib plotting
├── read_paax.py                       # Autolab .paax parser
├── extract_origin.py                  # Origin .opju extractor
└── run_example.py                     # Demo runner
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
