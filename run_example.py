"""
run_example.py —— 电催化绘图模板的“用户入口”
=====================================================================
演示两条数据链路，二者都应得到一致的图：
  A) CSV 链路   : 直接用 Origin/NOVA 导出的 CSV（无需公式换算）。
  B) .paax 链路 : 直接读 Autolab NOVA 原始文件，然后用 electrochem_calc
                  里的公式做 电流->电流密度 换算，再出图（彻底不依赖 Origin）。

你平时只需要改下面 CONFIG 区块里的路径与参数即可。
=====================================================================
"""
import os
import numpy as np
from electrochem_plot import set_style, plot_orr_lsv, plot_cv, load_xy, save_fig
from electrochem_calc import current_to_density, select_stable_cycle, extract_cv_cycles
from read_paax import read_paax

# ============================ CONFIG ============================
HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, "sample_data")

# —— 电极 / 体系参数（⚠️ 请按你的实际体系核对）——
ELECTRODE_AREA_CM2 = 0.1963     # 5 mm 直径 RDE 圆盘几何面积
REF_ELECTRODE = "AgAgCl_satKCl" # 参比电极类型（见 electrochem_calc.REF_TO_SHE_V）
PH = 1.0                       # 电解液 pH（用于 RHE 换算；若电位已为 RHE 可忽略）
IR_RU_OHM = 0.0                # 未补偿电阻 R_u (Ω)；做了 90% iR 补偿则填对应值

# —— A) CSV 链路文件 ——
LSV_CONFIG = [
    {"path": os.path.join(SAMPLE, "O2LSV.csv"), "xcol": "O2 Potential",
     "ycol": "N2 Current Density", "label": "N2", "color": "gray", "ls": "--"},
    {"path": os.path.join(SAMPLE, "O2LSV.csv"), "xcol": "O2 Potential",
     "ycol": "O2 Current Density", "label": "O2 (raw)", "color": "#9ecae1"},
    {"path": os.path.join(SAMPLE, "O2LSV.csv"), "xcol": "O2 Potential",
     "ycol": "E", "label": "O2 (N2-corrected)", "color": "#1f77b4",
     "lw": 2.2, "ehalf_of": True},
]
CV_CSV = os.path.join(SAMPLE, "CV.csv")
CV_XCOL, CV_YCOL = "1", "C"

# —— B) .paax 原始文件链路（示例文件在 sample_data/；换成你自己的 .paax 路径即可）——
PAAX = os.path.join(SAMPLE, "EC-30-PtCo-Step1.paax")

OUT_LSV = os.path.join(HERE, "ORR_LSV.png")
OUT_CV = os.path.join(HERE, "CV.png")
OUT_LSV_PAAX = os.path.join(HERE, "ORR_LSV_from_paax.png")
OUT_CV_PAAX = os.path.join(HERE, "CV_from_paax.png")
# ===============================================================


def _pick_traces(traces: dict):
    """从 .paax 中挑出 O2 LSV / N2 LSV / CV 三条曲线。"""
    pc = {k: v for k, v in traces.items()
          if v["xunit"] == "potential" and v["yunit"] == "current"}

    def is_cv(v):
        x = v["X"]
        d = np.diff(x)
        return np.sum(d[:-1] * d[1:] < 0) >= 1  # 至少一个转向（三角波）

    cv_keys = [k for k in pc if is_cv(pc[k]) and np.max(np.abs(pc[k]["Y"])) < 1e-4]
    o2_key = min(pc, key=lambda k: pc[k]["Y"].min())            # 最负的 => O2
    n2_key = min((k for k in pc if k != o2_key and k not in cv_keys),
                 key=lambda k: np.max(np.abs(pc[k]["Y"])))      # 背景 => N2
    cv_key = max(cv_keys, key=lambda k: pc[k]["Y"].size) if cv_keys else None
    return pc[o2_key], pc[n2_key], (pc[cv_key] if cv_key else None)


def main():
    set_style()

    # ---------- A) CSV 链路 ----------
    fig_lsv = plot_orr_lsv(LSV_CONFIG)
    save_fig(fig_lsv, OUT_LSV)
    xc_raw, yc_raw = load_xy(CV_CSV, CV_XCOL, CV_YCOL)
    xc, yc = select_stable_cycle(xc_raw, yc_raw)   # 只取稳定的一圈
    fig_cv = plot_cv(xc, yc, label="PtCo", color="#2ca02c")
    save_fig(fig_cv, OUT_CV)

    # ---------- B) .paax 链路（公式换算）----------
    traces = read_paax(PAAX)
    o2, n2, cv = _pick_traces(traces)

    # 关键公式：电流(A) -> 电流密度(mA cm^-2)： j = I / A * 1000
    o2_j = current_to_density(o2["Y"], ELECTRODE_AREA_CM2)   # O2 电流密度
    n2_j = current_to_density(n2["Y"], ELECTRODE_AREA_CM2)   # N2 背景密度
    # 背景校正：把 N2 插值到 O2 的电位网格上相减（电位降序存储，先反转为升序）
    n2_j_on_o2 = np.interp(o2["X"], n2["X"][::-1], n2_j[::-1])
    o2_j_corr = o2_j - n2_j_on_o2                            # 校正后 O2

    fig_lsv2 = plot_orr_lsv([
        {"x": o2["X"], "y": n2_j_on_o2, "label": "N2", "color": "gray", "ls": "--"},
        {"x": o2["X"], "y": o2_j, "label": "O2 (raw)", "color": "#9ecae1"},
        {"x": o2["X"], "y": o2_j_corr, "label": "O2 (N2-corrected)",
         "color": "#1f77b4", "lw": 2.2, "ehalf_of": True},
    ])
    save_fig(fig_lsv2, OUT_LSV_PAAX)

    if cv is not None:
        n_cycles = len(extract_cv_cycles(cv["X"], cv["Y"]))
        cv_X, cv_Y = select_stable_cycle(cv["X"], cv["Y"], cycle_index=-1)  # 取稳定单圈(默认最后一圈)
        cv_j = current_to_density(cv_Y, ELECTRODE_AREA_CM2)
        fig_cv2 = plot_cv(cv_X, cv_j, label="PtCo", color="#2ca02c")
        save_fig(fig_cv2, OUT_CV_PAAX)
        print(f"[CV] 共识别 {n_cycles} 圈，取最后一圈（稳定圈）绘图")

    # ---------- 一致性校验：.paax 公式结果 vs CSV ----------
    csv_o2 = load_xy(os.path.join(SAMPLE, "O2LSV.csv"), "O2 Potential", "O2 Current Density")
    _ord = np.argsort(csv_o2[0])                       # CSV 电位同样可能降序
    csv_o2j = np.interp(o2["X"], csv_o2[0][_ord], csv_o2[1][_ord])  # 插值到 paax 网格
    err = np.max(np.abs(o2_j - csv_o2j))
    print(f"[校验] .paax公式电流密度 与 CSV 电流密度 最大偏差 = {err:.4f} mA/cm² "
          f"(面积={ELECTRODE_AREA_CM2} cm²)")

    print("✅ 出图完成：")
    for p in (OUT_LSV, OUT_CV, OUT_LSV_PAAX, OUT_CV_PAAX):
        print("   ", p)


if __name__ == "__main__":
    main()
