"""
electrochem_plot.py
=====================================================================
电催化数据出版级绘图模板（ORR / CV / LSV）
依赖: numpy, pandas, matplotlib  （无需 Origin、无需联网）

设计目标
--------
1. 把你从 Origin 导出的 CSV 直接读进来，出图风格对齐科研论文（ACS / Nature 风格）。
2. 与具体数据解耦：所有“文件路径 / 列名 / 标签 / 颜色”都集中在 CONFIG 区，
   换一批数据只改 CONFIG，不必动绘图逻辑。
3. 支持三类最常见的图：
   - ORR 线性扫描（LSV）：电位 vs 电流密度，可叠加 N2 背景、O2 原始、O2 背景校正曲线，并自动算半波电位 E1/2。
   - 循环伏安（CV）：电位 vs 电流（密度），自动识别“正向/反向”扫描并分色。
   - （可选）Tafel 半对数图。

使用方式
--------
   from electrochem_plot import *
   # 直接在 run_example.py 里看一个完整可跑的例子

⚠️ 关于单位：本模板默认电流密度单位为 mA cm^-2、电位单位为 V vs RHE。
   请务必对照你 Origin 里的列标签核实，必要时在 CONFIG 里改 ylabel。
=====================================================================
"""

from __future__ import annotations
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib import rcParams
from electrochem_calc import half_wave_potential as orr_half_wave  # 单一公式来源


# ----------------------------------------------------------------------
# 1) 全局出版级样式
# ----------------------------------------------------------------------
def set_style(theme: str = "light") -> None:
    """设置 matplotlib 全局 rcParams，对齐科研论文图表规范。"""
    base = {
        "font.family": "sans-serif",
        "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
        "mathtext.fontset": "custom",
        "mathtext.rm": "Arial",
        "mathtext.it": "Arial:italic",
        "mathtext.bf": "Arial:bold",
        "font.size": 12,
        "axes.linewidth": 1.2,
        "axes.titlesize": 13,
        "axes.labelsize": 13,
        "axes.labelpad": 6,
        "xtick.direction": "in",
        "ytick.direction": "in",
        "xtick.major.size": 5,
        "ytick.major.size": 5,
        "xtick.major.width": 1.2,
        "ytick.major.width": 1.2,
        "xtick.minor.visible": True,
        "ytick.minor.visible": True,
        "xtick.minor.size": 3,
        "ytick.minor.size": 3,
        "legend.fontsize": 11,
        "legend.frameon": False,
        "legend.loc": "best",
        "figure.dpi": 150,
        "savefig.dpi": 300,
        "savefig.bbox": "tight",
        "savefig.format": "png",
    }
    if theme == "light":
        base.update({
            "figure.facecolor": "white",
            "axes.facecolor": "white",
            "axes.edgecolor": "black",
            "axes.labelcolor": "black",
            "xtick.color": "black",
            "ytick.color": "black",
            "text.color": "black",
        })
    rcParams.update(base)


# ----------------------------------------------------------------------
# 2) 数据读取辅助
# ----------------------------------------------------------------------
def load_xy(path: str, xcol: str, ycol: str) -> tuple[np.ndarray, np.ndarray]:
    """从 CSV 读取一列 x、一列 y，自动丢弃 NaN。"""
    df = pd.read_csv(path)
    if xcol not in df.columns or ycol not in df.columns:
        raise KeyError(f"列不存在: x='{xcol}' y='{ycol}'；实际列名={list(df.columns)}")
    sub = df[[xcol, ycol]].dropna()
    return sub[xcol].to_numpy(float), sub[ycol].to_numpy(float)


def load_column(path: str, col: str) -> np.ndarray:
    df = pd.read_csv(path)
    return df[col].dropna().to_numpy(float)


# ----------------------------------------------------------------------
# 3) ORR 半波电位 E1/2 计算
#    （实现见 electrochem_calc.half_wave_potential，已在本文件顶部导入为 orr_half_wave）
# ----------------------------------------------------------------------


# ----------------------------------------------------------------------
# 4) ORR / LSV 极化曲线
# ----------------------------------------------------------------------
def plot_orr_lsv(
    curves: list[dict],
    xlabel: str = r"Potential (V vs RHE)",
    ylabel: str = r"Current Density (mA cm$^{-2}$)",
    reverse_x: bool = False,
    compute_ehalf: bool = True,
    zero_line: bool = True,
    figsize: tuple = (5.0, 4.0),
    save: str | None = None,
) -> plt.Figure:
    """
    绘制 ORR/LSV 极化曲线。

    curves: 每条曲线一个 dict，字段：
        x        : 电位数组或 (path, xcol, ycol) 由 load_xy 预读
        y        : 电流密度数组（若已预读）
        或
        path/xcol/ycol : 直接给 CSV 路径与列名（二选一）
        label    : 图例标签
        color    : 颜色
        ls       : 线型，默认 '-'
        lw       : 线宽，默认 1.8
        ehalf_of : True 时以该曲线计算并标注 E1/2（通常设为校正后的 O2 曲线）
    """
    fig, ax = plt.subplots(figsize=figsize)
    ehw = None
    for c in curves:
        if "x" in c and "y" in c:
            x, y = np.asarray(c["x"], float), np.asarray(c["y"], float)
        else:
            x, y = load_xy(c["path"], c["xcol"], c["ycol"])
        ax.plot(
            x, y,
            label=c.get("label"),
            color=c.get("color"),
            ls=c.get("ls", "-"),
            lw=c.get("lw", 1.8),
        )
        if compute_ehalf and c.get("ehalf_of"):
            ehw = orr_half_wave(x, y)

    if zero_line:
        ax.axhline(0, color="gray", lw=0.8, ls="--", zorder=0)

    if ehw is not None and not np.isnan(ehw):
        ax.axvline(ehw, color="black", lw=1.0, ls=":", zorder=1)
        ax.annotate(
            f"E$_{{1/2}}$ = {ehw:.2f} V",
            xy=(ehw, ax.get_ylim()[0]),
            xytext=(ehw + 0.02, ax.get_ylim()[0] * 0.85),
            fontsize=11,
        )

    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    if reverse_x:
        ax.invert_xaxis()
    if any(c.get("label") for c in curves):
        ax.legend()
    ax.set_title("")
    if save:
        fig.savefig(save)
    return fig


# ----------------------------------------------------------------------
# 5) 循环伏安 CV
# ----------------------------------------------------------------------
def split_cv_scan(x: np.ndarray, y: np.ndarray) -> tuple:
    """
    按电位“先增后减”（一次完整三角波）自动切分为 正向扫描 / 反向扫描。
    返回 ((xf, yf), (xb, yb))；若无法识别则返回整体。
    """
    x = np.asarray(x, float)
    # 找到电位序列的转向点
    d = np.diff(x)
    sign = np.sign(d)
    # 第一个符号变化处即转向
    changes = np.where(np.diff(sign) != 0)[0]
    if len(changes) == 0:
        return (x, y), (x, y)
    turn = changes[0] + 1
    return (x[:turn + 1], y[:turn + 1]), (x[turn:], y[turn:])


def plot_cv(
    x: np.ndarray,
    y: np.ndarray,
    label: str = "CV",
    color: str = "#1f77b4",
    split: bool = True,
    xlabel: str = r"Potential (V vs RHE)",
    ylabel: str = r"Current Density (mA cm$^{-2}$)",
    figsize: tuple = (5.0, 4.0),
    save: str | None = None,
) -> plt.Figure:
    """
    绘制循环伏安图。split=True 时自动把一次三角波拆成 正向(去)/反向(回) 两段分色。
    """
    fig, ax = plt.subplots(figsize=figsize)
    if split:
        (xf, yf), (xb, yb) = split_cv_scan(x, y)
        ax.plot(xf, yf, color=color, lw=1.8, label=f"{label} (forward)")
        ax.plot(xb, yb, color=color, lw=1.8, ls="--", label=f"{label} (backward)")
    else:
        ax.plot(x, y, color=color, lw=1.8, label=label)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.legend()
    if save:
        fig.savefig(save)
    return fig


# ----------------------------------------------------------------------
# 6) Tafel 半对数图（可选）
# ----------------------------------------------------------------------
def plot_tafel(
    E: np.ndarray,
    j: np.ndarray,
    j_threshold: float = -0.05,
    xlabel: str = r"Overpotential (V)",
    ylabel: str = r"|j| (mA cm$^{-2}$)",
    figsize: tuple = (5.0, 4.0),
    save: str | None = None,
) -> plt.Figure:
    """
    半对数 Tafel 图：横轴过电位，纵轴 |j|（log）。
    仅取 |j| > j_threshold 的动力学区点参与绘图。
    """
    E = np.asarray(E, float)
    j = np.asarray(j, float)
    mask = np.abs(j) > abs(j_threshold)
    eta = E  # 此处 eta 用 E 近似，如需真实过电位请在调用前自行换算
    fig, ax = plt.subplots(figsize=figsize)
    ax.semilogy(eta[mask], np.abs(j[mask]), "o-", color="#d62728", ms=4, lw=1.5)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    if save:
        fig.savefig(save)
    return fig


# ----------------------------------------------------------------------
# 7) 保存封装
# ----------------------------------------------------------------------
def save_fig(fig: plt.Figure, path: str) -> None:
    fig.savefig(path)
    print(f"[saved] {path}")


if __name__ == "__main__":
    # 直接运行本文件 = 跑一遍示例（需同目录存在 sample_data）
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    sd = os.path.join(here, "sample_data")
    set_style()
    # ORR LSV
    fig1 = plot_orr_lsv([
        {"path": os.path.join(sd, "O2LSV.csv"), "xcol": "O2 Potential",
         "ycol": "N2 Current Density", "label": "N2", "color": "gray", "ls": "--"},
        {"path": os.path.join(sd, "O2LSV.csv"), "xcol": "O2 Potential",
         "ycol": "O2 Current Density", "label": "O2 (raw)", "color": "#9ecae1"},
        {"path": os.path.join(sd, "O2LSV.csv"), "xcol": "O2 Potential",
         "ycol": "E", "label": "O2 (N2-corrected)", "color": "#1f77b4",
         "lw": 2.2, "ehalf_of": True},
    ], save=os.path.join(here, "ORR_LSV.png"))
    save_fig(fig1, os.path.join(here, "ORR_LSV.png"))
    # CV
    xc, yc = load_xy(os.path.join(sd, "CV.csv"), "1", "C")
    fig2 = plot_cv(xc, yc, label="PtCo", color="#2ca02c",
                   save=os.path.join(here, "CV.png"))
    save_fig(fig2, os.path.join(here, "CV.png"))
    print("示例出图完成：ORR_LSV.png / CV.png")
