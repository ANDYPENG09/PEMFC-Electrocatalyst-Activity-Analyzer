"""Rebuild the README's figures from the same data and analysis as the app."""
from pathlib import Path
import io
import json
import re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from electrochem_analysis import sweeps, hupd_region, cv_analysis

ROOT = Path(__file__).resolve().parent
matplotlib.rcParams.update({"svg.hashsalt": "pemfc-hupd-demo", "font.size": 10})


def example_curves():
    example = json.loads((ROOT/"web/example.json").read_text(encoding="utf-8"))
    points = np.loadtxt(io.StringIO(example["cv"]))
    # The example stores potential in V and current in A, as in the HTML.
    geometric_area_cm2 = .19625
    cv = {"E": points[:, 0], "j": points[:, 1] * 1000 / geometric_area_cm2}

    n2 = np.loadtxt(io.StringIO(example["n2"]))
    o2 = np.loadtxt(io.StringIO(example["o2"]))
    nx, ny = [branch for branch in sweeps(n2[:, 0], n2[:, 1]) if branch[0][-1] > branch[0][0]][-1]
    keep = (o2[:, 0] >= nx[0]) & (o2[:, 0] <= nx[-1])
    eo = o2[keep, 0]
    corrected = (o2[keep, 1] - np.interp(eo, nx, ny)) * 1000 / geometric_area_cm2
    # Match the single-sample calculator's 7-point, quadratic SG smoothing,
    # including its endpoint padding.
    corrected = np.convolve(np.pad(corrected, (3, 3), mode="edge"),
                            np.array([-2, 3, 6, 7, 6, 3, -2])/21, mode="valid")
    return cv, eo, corrected


def main():
    cv, eo, corrected = example_curves()
    fig, (cv_ax, orr_ax) = plt.subplots(1, 2, figsize=(11, 3.6))
    cv_ax.plot(cv["E"], cv["j"], color="#285e9b", lw=1.7, label="Example")
    orr_ax.plot(eo, corrected, color="#285e9b", lw=1.7, label="Example")
    cv_ax.set(title="Example CV", xlabel="Potential (V)", ylabel="Current density (mA/cm²)")
    orr_ax.set(title="Example ORR · N₂ corrected", xlabel="Potential (V)", ylabel="Current density (mA/cm²)")
    for ax in (cv_ax, orr_ax):
        ax.grid(alpha=.13)
        ax.spines[["top", "right"]].set_visible(False)
        ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(ROOT/"docs/example-comparison.svg", metadata={"Date": None})
    fig.savefig("/tmp/pemfc-example-preview.png", dpi=160)
    plt.close(fig)

    lo, hi = .05, .4
    branches = [(x,y) for x,y in sweeps(cv["E"],cv["j"]) if x[-1]>x[0] and x[0]<=lo and x[-1]>=hi]
    x,y = branches[-1]
    baseline = cv_analysis(cv, .02)["baseline_mA_cm2"]
    rx, measured, upper, _ = hupd_region(x, y, lo, hi, baseline)
    fig, (full, zoom) = plt.subplots(1, 2, figsize=(11, 4.2))
    full.plot(cv["E"], cv["j"], color="#285e9b", lw=1.8)
    full.fill_between(rx, baseline, upper, color="#2c9a6a", alpha=.3)
    full.axvline(lo, color="#7b8794", lw=.8, ls=":")
    full.axvline(hi, color="#7b8794", lw=.8, ls=":")
    full.annotate("", xy=(.60,.115), xytext=(.48,.085),
                  arrowprops={"arrowstyle":"->", "color":"#285e9b", "lw":1.5})
    full.annotate("", xy=(.45,-.13), xytext=(.57,-.18),
                  arrowprops={"arrowstyle":"->", "color":"#285e9b", "lw":1.5})
    full.set(title="Example · anonymized CV",
             xlabel="Potential (V)", ylabel="Current density (mA/cm²)",
             xlim=(0,1.22))
    zoom.plot(rx, measured, color="#285e9b", lw=2, label="Anodic sweep")
    zoom.axhline(baseline, color="#bb4242", ls="--", lw=1.4, label="Horizontal baseline")
    zoom.fill_between(rx, baseline, upper, color="#2c9a6a", alpha=.35,
                      label="Integrated H-desorption area")
    zoom.axvline(lo, color="#7b8794", lw=.8, ls=":")
    zoom.axvline(hi, color="#7b8794", lw=.8, ls=":")
    zoom.set(title="H-upd desorption integration",
             xlabel="Potential (V)", ylabel="Current density (mA/cm²)",
             xlim=(.025,.425))
    zoom.legend(fontsize=8.5, loc="upper right", frameon=False)
    for ax in (full, zoom):
        ax.grid(alpha=.13)
        ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(ROOT/"docs/ecsa-hupd.svg", metadata={"Date": None})
    fig.savefig("/tmp/pemfc-ecsa-preview.png", dpi=160)
    plt.close(fig)
    for path in [ROOT/"docs/example-comparison.svg", ROOT/"docs/ecsa-hupd.svg"]:
        path.write_text(re.sub(r"[ \t]+\n", "\n", path.read_text(encoding="utf-8")), encoding="utf-8")


if __name__ == "__main__":
    main()
