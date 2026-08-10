"""
electrochem_calc.py —— 电催化标准计算公式（与绘图解耦，纯 numpy）
=====================================================================
把 Origin / NOVA 里“看不见”的换算，全部显式写成函数并标注公式。
所有物理量约定：
    I   电流            (A)
    j   电流密度        (mA cm^-2)
    E   电位            (V)
    A   电极几何面积    (cm^2)

常用电极面积（如未另给）：
    5 mm 直径旋转圆盘电极(RDE)  A = π·r² = π·(0.25 cm)² ≈ 0.1963 cm²

⚠️ 参比电极、pH、iR 补偿电阻等请按你的实际体系核对后再用。
=====================================================================
"""
from __future__ import annotations
import numpy as np

# 5 mm 直径 RDE 圆盘几何面积（cm^2）
DEFAULT_AREA_CM2 = 0.1963

# 各参比电极相对标准氢电极(SHE)的电位偏移 @25°C（V）
REF_TO_SHE_V = {
    "AgAgCl_satKCl": 0.197,   # 饱和 KCl Ag/AgCl
    "AgAgCl_3M": 0.210,       # 3 M KCl Ag/AgCl
    "SCE": 0.241,             # 饱和甘汞电极
    "MSE": 0.640,             # 汞/硫酸亚汞
    "RHE": 0.0,               # 已经是 RHE
    "SHE": 0.0,               # 标准氢电极
}

_K, _F, _LN10 = 8.314462618, 96485.33212, 2.302585093

# numpy 2.0 将 trapz 重命名为 trapezoid；做兼容别名（同时兼容 1.x）
_trapz = getattr(np, "trapezoid", None) or getattr(np, "trapz", None)


# ----------------------------------------------------------------------
# 1) 电流 <-> 电流密度
# ----------------------------------------------------------------------
def current_to_density(I_A, area_cm2: float = DEFAULT_AREA_CM2) -> np.ndarray:
    """电流(A) 转 电流密度(mA cm^-2)。

         j [mA cm^-2] = I [A] / A [cm^2] × 1000
    """
    return np.asarray(I_A, float) / area_cm2 * 1000.0


def density_to_current(j_mA_cm2, area_cm2: float = DEFAULT_AREA_CM2) -> np.ndarray:
    """电流密度(mA cm^-2) 转 电流(A)： I = j·A / 1000"""
    return np.asarray(j_mA_cm2, float) * area_cm2 / 1000.0


# ----------------------------------------------------------------------
# 2) 电位换算到 RHE
# ----------------------------------------------------------------------
def v_to_rhe(E_meas_V, ref: str = "AgAgCl_satKCl", pH: float = 0.0,
             T: float = 298.15) -> np.ndarray:
    """把“相对某参比电极”的电位换算成相对 RHE（@温度 T）。

        E_RHE = E_meas + E_ref_vs_SHE + (kT/F)·ln(10)·pH
              = E_meas + E_ref_vs_SHE + 0.05916·pH      (25°C)

    例：E_AgAgCl = 0.10 V, pH = 1  ->  E_RHE = 0.10 + 0.197 + 0.059 = 0.356 V
    """
    if ref not in REF_TO_SHE_V:
        raise KeyError(f"未知参比电极 {ref!r}，可选: {list(REF_TO_SHE_V)}")
    slope = (_K * T / _F) * _LN10          # V/dec，25°C≈0.05916
    return np.asarray(E_meas_V, float) + REF_TO_SHE_V[ref] + slope * pH


def rhe_to_v(E_rhe_V, ref: str = "AgAgCl_satKCl", pH: float = 0.0,
             T: float = 298.15) -> np.ndarray:
    """RHE 电位反算回相对参比电极的电位（v_to_rhe 的逆运算）。"""
    if ref not in REF_TO_SHE_V:
        raise KeyError(f"未知参比电极 {ref!r}，可选: {list(REF_TO_SHE_V)}")
    slope = (_K * T / _F) * _LN10
    return np.asarray(E_rhe_V, float) - REF_TO_SHE_V[ref] - slope * pH


# ----------------------------------------------------------------------
# 3) iR 降校正
# ----------------------------------------------------------------------
def ir_correct(E_V, I_A, Ru_ohm: float) -> np.ndarray:
    """未补偿电阻(R_u)引起的 iR 降校正。

        E_corrected = E_measured − I·R_u        (I:A, R_u:Ω, 返回:V)
    """
    return np.asarray(E_V, float) - np.asarray(I_A, float) * Ru_ohm


# ----------------------------------------------------------------------
# 4) 半波电位 E1/2（ORR 活性核心指标）
# ----------------------------------------------------------------------
def half_wave_potential(E, j) -> float:
    """半波电位 E1/2（V）。约定 j 为阴极电流密度(负值)，
    j_lim = min(j)（最负的扩散极限电流）；E1/2 取 j = j_lim/2 处电位，
    在上升的阴极波上线性插值。找不到交叉点返回 nan。
    """
    E = np.asarray(E, float)
    j = np.asarray(j, float)
    j_lim = np.nanmin(j)
    target = j_lim / 2.0
    order = np.argsort(E)
    Es, js = E[order], j[order]
    for i in range(len(Es) - 1):
        a, b = js[i], js[i + 1]
        if (a <= target <= b) or (b <= target <= a):
            return float(Es[i] + (target - a) * (Es[i + 1] - Es[i]) / (b - a))
    return float("nan")


# ----------------------------------------------------------------------
# 5) Koutecký–Levich 动力学电流
# ----------------------------------------------------------------------
def koutecky_levich(j, j_lim) -> np.ndarray:
    """由实测电流 j 与扩散极限电流 j_lim 求动力学电流（Koutecký–Levich）。

        j_k = |j|·|j_lim| / (|j_lim| − |j|)

    输入为带符号电流密度（mA cm^-2，阴极反应为负），j_lim 为扩散极限
    （取最负值）。返回与输入同符号的动力学电流密度；分母趋近 0 处返回 nan。
    """
    j = np.asarray(j, float)
    j_lim = np.asarray(j_lim, float)
    aj, al = np.abs(j), np.abs(j_lim)
    with np.errstate(divide="ignore", invalid="ignore"):
        jk = aj * al / (al - aj)
    jk = np.where(np.isfinite(jk), jk, np.nan)
    return np.sign(j) * jk


# ----------------------------------------------------------------------
# 6) CV 循环切分与稳定圈选择
# ----------------------------------------------------------------------
def extract_cv_cycles(x, y):
    """把完整 CV（多圈三角波）按电位转向点切分为单圈循环。

    返回 [(x0, y0), (x1, y1), ...]，每圈从电位极小点（谷）到下一个谷；
    无法识别转向时返回 [(x, y)] 整体。
    """
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    d = np.diff(x)
    sign = np.sign(d)
    # 转向点：相邻非零符号变化的位置（x 索引）
    turns = [
        i + 1
        for i in range(len(sign) - 1)
        if sign[i] != 0 and sign[i + 1] != 0 and sign[i] != sign[i + 1]
    ]
    if len(turns) < 2:
        return [(x, y)]
    # 谷：转向后方向由降变升（电位极小点）
    valleys = [t for t in turns if sign[t - 1] < 0 < sign[t]]
    if len(valleys) < 2:
        return [(x, y)]
    cycles = []
    for k in range(len(valleys) - 1):
        a, b = valleys[k], valleys[k + 1]
        cycles.append((x[a:b + 1], y[a:b + 1]))
    return cycles


def select_stable_cycle(x, y, cycle_index: int = -1):
    """从多圈 CV 中选取稳定的一圈（默认最后一圈）。

    cycle_index >= 0 时按绝对索引取；负数按从后往前（-1 = 最后一圈）。
    越界时自动夹取到有效范围。
    """
    cycles = extract_cv_cycles(x, y)
    idx = cycle_index if cycle_index >= 0 else len(cycles) + cycle_index
    idx = max(0, min(idx, len(cycles) - 1))
    return cycles[idx]
