"""Rebuild the README's synthetic figures from the same analysis used by the app."""
from pathlib import Path
import re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from electrochem_analysis import analyze_batch, plot_comparison, sweeps, hupd_region
from tests.test_analysis import sample

ROOT = Path(__file__).resolve().parent
matplotlib.rcParams.update({"svg.hashsalt": "pemfc-hupd-demo", "font.size": 10})


def main():
    a = sample("Synthetic Pt")
    b = sample("Synthetic PtCo", .87, .8)
    result = analyze_batch([a, b])
    fig = plot_comparison(result)
    fig.savefig(ROOT/"docs/example-comparison.svg", metadata={"Date": None})
    plt.close(fig)

    cv = a["cv"]
    x, y = sweeps(cv["E"], cv["j"])[-2]  # final complete anodic branch
    lo, hi = .05, .4
    baseline = result["samples"][0]["cv"]["baseline_mA_cm2"]
    rx, measured, upper, _ = hupd_region(x, y, lo, hi, baseline)
    fig, (full, zoom) = plt.subplots(1, 2, figsize=(11, 4.2))
    full.plot(cv["E"][:201], cv["j"][:201], color="#285e9b", lw=1.8)
    full.fill_between(rx, baseline, upper, color="#2c9a6a", alpha=.3)
    full.axvline(lo, color="#7b8794", lw=.8, ls=":")
    full.axvline(hi, color="#7b8794", lw=.8, ls=":")
    full.annotate("", xy=(.48,.05), xytext=(.34,.05),
                  arrowprops={"arrowstyle":"->", "color":"#285e9b", "lw":1.5})
    full.annotate("", xy=(.34,-.05), xytext=(.48,-.05),
                  arrowprops={"arrowstyle":"->", "color":"#285e9b", "lw":1.5})
    full.text(.14, -.43, "H adsorption", ha="center", fontsize=9)
    full.text(.75, -.32, "Pt oxide reduction", ha="center", fontsize=9)
    full.set(title="Synthetic Pt-like CV · one cycle",
             xlabel="Potential (V vs RHE)", ylabel="Current density (mA/cm²)",
             xlim=(0,1.02), ylim=(-.48,.52))
    zoom.plot(rx, measured, color="#285e9b", lw=2, label="Anodic sweep")
    zoom.axhline(baseline, color="#bb4242", ls="--", lw=1.4, label="Horizontal baseline")
    zoom.fill_between(rx, baseline, upper, color="#2c9a6a", alpha=.35,
                      label="Integrated H-desorption area")
    zoom.axvline(lo, color="#7b8794", lw=.8, ls=":")
    zoom.axvline(hi, color="#7b8794", lw=.8, ls=":")
    zoom.set(title="H-upd desorption integration",
             xlabel="Potential (V vs RHE)", ylabel="Current density (mA/cm²)",
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
