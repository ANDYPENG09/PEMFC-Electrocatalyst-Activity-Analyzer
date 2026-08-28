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
    """由实测电流 j 与扩散极限电流 j_lim 求动力学电流 j_k。

        1/j = 1/j_k + 1/j_lim   =>   j_k = j·j_lim / (j_lim − j)
    """
    j = np.asarray(j, float)
    jl = np.asarray(j_lim, float)
    return j * jl / (jl - j)


def levich_current(n: int, F_const, D_cm2_s, nu_cm2_s, w_rpm, C_bulk_mol_cm3):
    """Levich 方程理论扩散极限电流（盘电极，旋转圆盘）。

        j_lim = 0.620·n·F·D^(2/3)·ν^(-1/6)·ω^(1/2)·C_bulk
    参数：n 电子数, F 法拉第常数(C/mol), D 扩散系数(cm^2/s),
          ν 运动粘度(cm^2/s), ω 角转速(rad/s), C_bulk 体相浓度(mol/cm^3)。
    返回 j_lim（A/cm^2 量纲，调用方再乘 1000 转 mA/cm^2）。
    """
    return (0.620 * n * F_const * D_cm2_s ** (2 / 3)
            * nu_cm2_s ** (-1 / 6) * w_rpm ** 0.5 * C_bulk_mol_cm3)


# ----------------------------------------------------------------------
# 6) Tafel 斜率
# ----------------------------------------------------------------------
def tafel_slope(E, j, j_min_mA=None) -> float:
    """在动力学区对 log|j| 与 E 线性拟合，返回 Tafel 斜率 b (mV/dec)。

        η = b·log10(|j|/j0)   ->   对 (E, log10|j|) 作直线，b = 1/slope × 1000
    仅取 |j| > j_min_mA 的动力学区点参与拟合。E 应已是同一参考(如 RHE)。
    """
    E = np.asarray(E, float)
    jm = np.abs(np.asarray(j, float))
    if j_min_mA is not None:
        m = jm > abs(j_min_mA)
        E, jm = E[m], jm[m]
    if len(E) < 2:
        return float("nan")
    slope, _ = np.polyfit(E, np.log10(jm), 1)   # d(log j)/dE
    return float(1000.0 / slope)                 # mV/dec


# ----------------------------------------------------------------------
# 7) 比/质量活性（ORR 常在 0.9 V 或 0.8 V 处取值）
# ----------------------------------------------------------------------
def value_at_potential(E, y, E_target: float, tol: float = 0.01):
    """在 E≈E_target(±tol) 处线性插值取 y 值（如取 0.9 V 处的 j）。"""
    E = np.asarray(E, float)
    y = np.asarray(y, float)
    i = np.argmin(np.abs(E - E_target))
    if abs(E[i] - E_target) > tol:
        return float("nan")
    return float(y[i])


def mass_activity(j_mA_cm2_at_E, loading_mg_cm2: float) -> float:
    """质量活性 (A mg^-1)：j[A/cm^2] / 载量[mg/cm^2]。
    输入 j 为 mA/cm^2，先转 A/cm^2 再除以载量。"""
    j_A = j_mA_cm2_at_E / 1000.0
    return float(j_A / loading_mg_cm2)


# ----------------------------------------------------------------------
# 8) 多圈 CV -> 截取稳定单圈
# ----------------------------------------------------------------------
def _cv_turning_points(X: np.ndarray, min_gap: int = 5) -> np.ndarray:
    """返回电位数组的转向点（局部极小/极大）索引。min_gap 过滤掉抖动造成的
    虚假转向（相邻转向点至少间隔 min_gap 个点）。"""
    X = np.asarray(X, float)
    d = np.diff(X)
    sign = np.sign(d)
    tp = np.where(np.diff(sign) != 0)[0] + 1
    if tp.size == 0:
        return tp
    filtered = [int(tp[0])]
    for t in tp[1:]:
        if t - filtered[-1] >= min_gap:
            filtered.append(int(t))
    return np.array(filtered)


def extract_cv_cycles(X, Y):
    """把多圈 CV 拆成若干完整循环。一个完整循环 = 相邻两个同型转向点之间
    （电位 min→max→min 或 max→min→max）。返回 list of (X_seg, Y_seg)。
    不足一圈时返回 [(X, Y)]。"""
    X = np.asarray(X, float)
    Y = np.asarray(Y, float)
    tp = _cv_turning_points(X)
    if tp.size < 3:
        return [(X, Y)]
    cycles = []
    for i in range(0, tp.size - 2, 2):
        s, e = int(tp[i]), int(tp[i + 2])
        cycles.append((X[s:e + 1], Y[s:e + 1]))
    return cycles if cycles else [(X, Y)]


def select_stable_cycle(X, Y, cycle_index: int | str = -1):
    """从多圈 CV 中选一圈。
        cycle_index:
          -1 / 'last'  : 最后一圈（通常已稳定，默认）
          'first'      : 第一圈
          'stable'     : 与各圈中位数曲线最吻合的一圈（最具代表性）
          整数         : 指定第几圈（0 起，支持负数）
    只有一圈时原样返回。"""
    cycles = extract_cv_cycles(X, Y)
    if len(cycles) <= 1:
        return np.asarray(X, float), np.asarray(Y, float)
    if isinstance(cycle_index, int):
        return cycles[cycle_index % len(cycles)]
    if cycle_index == "first":
        return cycles[0]
    if cycle_index == "stable":
        xs = np.linspace(np.min(X), np.max(X), 500)
        mats = np.array([np.interp(xs, cx, cy) for cx, cy in cycles])
        med = np.median(mats, axis=0)
        dev = np.abs(mats - med).sum(axis=1)
        return cycles[int(np.argmin(dev))]
    return cycles[-1]   # 'last' 或默认


# ----------------------------------------------------------------------
# 9) ECSA（氢欠电位沉积 Hupd 法，适用 Pt 系）
# ----------------------------------------------------------------------
def ecsa_from_hupd(E, j, v, e_lo: float = 0.05, e_hi: float = 0.4,
                   q_specific: float = 210e-6, area_cm2: float = 0.1963,
                   loading_ug_cm2: float | None = None) -> dict:
    """用 Hupd 区电荷算电化学活性面积(ECSA)。

    步骤：
      1) 把单圈 CV 拆成 正向(电位升) / 反向(电位降) 两段；
      2) 各段在 [e_lo, e_hi] 内对 j(mA/cm²) 积分 S = ∫j dE (mA·V/cm²)；
      3) S_H = (|S_正向| + |S_反向|)/2；Q_H = S_H / v (mC/cm², 几何)；
      4) ECSA_geo = Q_H·A_geo / q_specific；粗糙因子 RF = Q_H / q_specific；
      5) 若给出 Pt 载量 loading_ug_cm2，按常用公式算比表面积：
         ECSA(m²/g) = 100·S_H / (q_specific_mC·v·loading_ug_cm2)。

    参数：v 扫速(V/s)；q_specific Pt 单层 Hupd 电荷≈210 µC/cm²(0.21 mC/cm²)。
    返回含各量的 dict，单位见键名。
    """
    E = np.asarray(E, float)
    j = np.asarray(j, float)
    d = np.diff(E)
    tp = np.where(np.diff(np.sign(d)) != 0)[0]
    if tp.size > 0:
        t = int(tp[0])
        Ef, Eb, jf, jb = E[:t + 1], E[t:], j[:t + 1], j[t:]
    else:
        Ef = Eb = E
        jf = jb = j

    def _sint(Es, Js):
        m = (Es >= e_lo) & (Es <= e_hi)
        if m.sum() < 2:
            return 0.0
        return float(_trapz(Js[m], Es[m]))   # mA·V/cm² (几何)

    Sf, Sb = _sint(Ef, jf), _sint(Eb, jb)
    S_H = (abs(Sf) + abs(Sb)) / 2.0          # mA·V/cm² (几何)
    Q_H = S_H / v                            # mC/cm² (几何)
    ecsa_cm2 = Q_H * area_cm2 / q_specific
    out = {
        "S_fwd_mA_V_per_cm2": Sf,
        "S_bwd_mA_V_per_cm2": Sb,
        "S_avg_mA_V_per_cm2": S_H,
        "Q_H_mC_per_cm2_geo": Q_H,
        "q_specific_mC_per_cm2": q_specific * 1e3,
        "v_V_per_s": v,
        "region_V": (e_lo, e_hi),
        "ECSA_cm2": ecsa_cm2,
        "roughness_factor": ecsa_cm2 / area_cm2,
        "area_geo_cm2": area_cm2,
    }
    if loading_ug_cm2 is not None and loading_ug_cm2 > 0:
        # 100 为 cm²/µg -> m²/g 的换算因子
        out["ECSA_m2_per_g"] = 100.0 * S_H / (q_specific * 1e3 * v * loading_ug_cm2)
        out["loading_ug_cm2"] = loading_ug_cm2
    return out


# ----------------------------------------------------------------------
# 10) 质量活性 MA（ORR 常在 0.9 V / 0.8 V 处取值）
# ----------------------------------------------------------------------
def mass_activity_at_potential(E, j_corr, e_target: float = 0.9,
                               loading_mg_cm2: float = 0.10,
                               tol: float = 0.02) -> dict:
    """在 E≈e_target 处取电流密度 j，算质量活性。

        MA [A/mg] = j[A/cm²] / 载量[mg/cm²] ， j = j_corr[mA/cm²]/1000
    返回 dict。loading_mg_cm2 需按实际催化剂载量填写。
    """
    j_at = value_at_potential(E, j_corr, e_target, tol)
    if np.isnan(j_at):
        return {"j_at_E": float("nan"), "MA_A_per_mg": float("nan"),
                "e_target": e_target, "loading_mg_cm2": loading_mg_cm2}
    ma = (abs(j_at) / 1000.0) / loading_mg_cm2
    return {"j_at_E_mA_cm2": float(j_at), "MA_A_per_mg": float(ma),
            "e_target": e_target, "loading_mg_cm2": loading_mg_cm2}


def kinetic_current_density(j_mA_cm2, j_lim_mA_cm2) -> float:
    """由实测电流密度 j 与极限电流密度 j_lim 求动力学电流密度 j_k。

    取电流密度绝对值（阴极电流通常记为负，但计算活性取正）：
        j_k = |j|·|j_lim| / (|j_lim| − |j|)
    """
    j = abs(float(j_mA_cm2))
    jl = abs(float(j_lim_mA_cm2))
    if jl <= j:
        return float("nan")
    return j * jl / (jl - j)


def mass_activity_kinetic(j_k_mA_cm2, loading_mg_cm2: float) -> float:
    """用动力学电流密度算质量活性 (A/mg)。"""
    return abs(float(j_k_mA_cm2)) / 1000.0 / float(loading_mg_cm2)


def specific_activity(j_k_mA_cm2, ecsa_m2_per_g: float,
                      loading_g_cm2: float) -> float:
    """比活性 SA (mA/cm²_Pt)。

    ECSA(m²/g) × loading(g/cm²) 得到 m²_Pt/cm²_geo，乘以 10000 转为 cm²_Pt/cm²_geo。
    SA = j_k / (ECSA × loading × 10000)
    """
    return abs(float(j_k_mA_cm2)) / (float(ecsa_m2_per_g) * float(loading_g_cm2) * 10000.0)


if __name__ == "__main__":
    # 自检：5 mm RDE 圆盘，原始电流 -0.001121 A -> 电流密度
    I = -0.0011211
    print("j =", round(current_to_density(I), 3), "mA cm^-2  (应≈ -5.72)")
    # 自检：Ag/AgCl 0.10 V, pH=1 -> RHE
    print("E_RHE =", round(v_to_rhe(0.10, 'AgAgCl_satKCl', pH=1), 3), "V  (应≈ 0.356)")
    # 自检：RHE 0.89 V 处半波（用示例数据需另外载入）
