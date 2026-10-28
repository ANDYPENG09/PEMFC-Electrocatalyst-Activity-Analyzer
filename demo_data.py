"""Qualitative, synthetic Pt-like CV curves for demonstrations, not measurements."""
import numpy as np


def synthetic_cv(scale=1.0, lo=0.0, hi=1.0, points_per_sweep=100, cycles=3):
    up = np.linspace(lo, hi, points_per_sweep, endpoint=False)
    down = np.linspace(hi, lo, points_per_sweep, endpoint=False)

    def peak(e, center, width):
        return np.exp(-((e-center)/width)**2)

    # Up: H desorption and onset of Pt oxidation. Down: Pt oxide reduction
    # and H adsorption. Opposite capacitive currents are deliberate.
    anodic = 0.05 + scale*(0.34*peak(up, .13, .045) +
                          0.24*peak(up, .24, .065) +
                          0.10/(1+np.exp(-(up-.91)/.03)))
    cathodic = -0.05 - scale*(0.30*peak(down, .12, .05) +
                              0.21*peak(down, .23, .065) +
                              0.20*peak(down, .74, .075))
    e = np.tile(np.r_[up, down], cycles)
    j = np.tile(np.r_[anodic, cathodic], cycles)
    return np.r_[e, lo], np.r_[j, anodic[0]]
