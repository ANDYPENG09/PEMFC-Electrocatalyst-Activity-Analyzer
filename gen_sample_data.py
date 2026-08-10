#!/usr/bin/env python3
"""Generate desensitized synthetic demo data for run_example.py.

Produces sample_data/O2LSV.csv, sample_data/CV.csv and
sample_data/EC-30-PtCo-Step1.paax from one shared data source, so the
CSV chain and the .paax chain of run_example.py agree by construction.
"""
import numpy as np
import pandas as pd
import os, urllib.parse

rng = np.random.default_rng(42)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "sample_data")
os.makedirs(OUT, exist_ok=True)

AREA_CM2 = 0.1963  # 5 mm RDE

# ---------------- shared ORR LSV data ----------------
E = np.round(np.linspace(1.05, 0.05, 201), 4)            # V vs RHE, descending
n2_j = rng.normal(0, 0.01, E.size)                        # mA/cm2, near zero
E_mid, width = 0.88, 0.045
o2_j = -5.5 / (1 + np.exp((E - E_mid) / width)) + rng.normal(0, 0.02, E.size)
corr_j = o2_j - np.interp(E, E[::-1], n2_j[::-1])         # N2-corrected

# ---------------- shared CV data (3 cycles, small currents) ----------------
def tri(vlo=0.05, vhi=1.0, n=400):
    t = np.linspace(0, 1, n)
    return vlo + (vhi - vlo) * (2 * np.abs(2 * t - 1))

def cv_i(E_v):
    hu = np.exp(-((E_v - 0.12) / 0.06) ** 2) * 5.5e-5
    hc = np.exp(-((E_v - 0.10) / 0.08) ** 2) * -4.2e-5
    ox = np.exp(-((E_v - 0.95) / 0.10) ** 2) * 2.8e-5
    red = np.exp(-((E_v - 0.78) / 0.05) ** 2) * -3.6e-5
    return hu + hc + ox + red + rng.normal(0, 5e-7, E_v.size)

cv_e = np.concatenate([tri() for _ in range(3)])
cv_iA = np.concatenate([cv_i(tri()) for _ in range(3)])

# ---------------- O2LSV.csv ----------------
lsv = pd.DataFrame({
    "O2 Potential": E,
    "N2 Current Density": np.round(n2_j, 5),
    "O2 Current Density": np.round(o2_j, 5),
    "E": np.round(corr_j, 5),
})
lsv.to_csv(os.path.join(OUT, "O2LSV.csv"), index=False)

# ---------------- CV.csv (Origin-style columns "1" / "C") ----------------
cv = pd.DataFrame({"1": np.round(cv_e, 4), "C": np.round(cv_iA, 8)})
cv.to_csv(os.path.join(OUT, "CV.csv"), index=False)

# ---------------- EC-30-PtCo-Step1.paax (Autolab NOVA DAB/XML) ----------------
def esc(s):
    return urllib.parse.quote(s)

def fmt(a):
    return ",".join(f"{v:.6g}" for v in a)

def trace(name, x, y, xqty="potential", yqty="current", xunit="V", yunit="A"):
    return (f'  <DAB_node type="trace">\n'
            f'    <name length="{len(name)}" encoding="mixed">{esc(name)}</name>\n'
            f'    <X_units qty_kind="{xqty}"><X_unit>{xunit}</X_unit></X_units>\n'
            f'    <Y_units qty_kind="{yqty}"><Y_unit>{yunit}</Y_unit></Y_units>\n'
            f'    <points quantity="{len(x)}"><X_data>{fmt(x)}</X_data>'
            f'<Y_data>{fmt(y)}</Y_data></points>\n  </DAB_node>')

xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
       '<DAB version="1.0" app="NOVA" export="demo">\n'
       + trace("O2 LSV", E, o2_j * AREA_CM2 / 1000.0)
       + trace("N2 LSV", E, n2_j * AREA_CM2 / 1000.0)
       + trace("CV 3 cycles", cv_e, cv_iA)
       + '</DAB>\n')
with open(os.path.join(OUT, "EC-30-PtCo-Step1.paax"), "w", encoding="utf-8") as f:
    f.write(xml)

print("written:", sorted(os.listdir(OUT)))
