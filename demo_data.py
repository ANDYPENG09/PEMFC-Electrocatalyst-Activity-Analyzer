"""Synthetic Pt/C-like CV curves for demonstrations, not measurements.

Shapes are illustrative and are not digitized from any experimental trace.
"""
import numpy as np


def synthetic_cv(scale=1.0, lo=0.025, hi=1.2, points_per_sweep=100, cycles=3):
    up = np.linspace(lo, hi, points_per_sweep, endpoint=False)
    down = np.linspace(hi, lo, points_per_sweep, endpoint=False)

    def peak(e, center, width):
        return np.exp(-((e-center)/width)**2)

    def logistic(e, center, width):
        return 1/(1+np.exp(-(e-center)/width))

    def anodic_raw(e):
        return (.035 + .025*(e-.4) + scale*(.16*peak(e,.13,.045) +
                .11*peak(e,.215,.075) + .12*logistic(e,.72,.045) -
                .025*logistic(e,.93,.045) + .04*logistic(e,1.13,.045)))

    def cathodic_raw(e):
        return (-.038 - .016*(e-.4) - scale*(.20*peak(e,.13,.05) +
                .09*peak(e,.215,.075) + .21*peak(e,.76,.12) +
                .03*peak(e,.64,.07) + .13*logistic(-e,-.075,.012)))

    # The two directions join continuously at both reversal potentials.
    # The low-potential turn includes a qualitative hydrogen-evolution tail.
    j_lo = -.17*scale-.038
    j_hi = float(anodic_raw(hi))
    anodic = anodic_raw(up) + (j_lo-anodic_raw(lo))*peak(up,lo,.012)
    cathodic = (cathodic_raw(down) + (j_lo-cathodic_raw(lo))*peak(down,lo,.018) +
                (j_hi-cathodic_raw(hi))*peak(down,hi,.04))
    e = np.tile(np.r_[up, down], cycles)
    j = np.tile(np.r_[anodic, cathodic], cycles)
    return np.r_[e, lo], np.r_[j, anodic[0]]
