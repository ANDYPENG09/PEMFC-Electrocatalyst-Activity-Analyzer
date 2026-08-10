"""
read_paax.py —— 直接读取 Autolab NOVA 的 .paax 原始数据文件（无需 Origin）
=====================================================================
.paax 是 Autolab NOVA 的 DAB(XML) 数据库格式。每个 <DAB_node type="trace">
即一条实验曲线，电位(X)/电流(Y)以逗号分隔纯文本存于 <X_data>/<Y_data>，
并带单位信息 (X_units/Y_units 的 qty_kind，如 potential / current)。

read_paax(path) -> dict:
    key   : 曲线名称（URL 解码后的 trace <name>，重名自动加后缀）
    value : {'X':ndarray, 'Y':ndarray, 'xunit':str, 'yunit':str}
            X/Y 单位见 xunit/yunit（potential->V, current->A 等）。

常用筛选：
    pot_cur = {k:v for k,v in traces.items() if v['xunit']=='potential' and v['yunit']=='current'}
=====================================================================
"""
from __future__ import annotations
import re
import urllib.parse
import numpy as np


def _decode(s: str) -> str:
    return urllib.parse.unquote(s)


def read_paax(path: str) -> dict:
    txt = open(path, encoding="utf-8", errors="replace").read()
    traces: dict = {}
    pat = re.compile(r'<DAB_node type="trace"[^>]*>(.*?)</DAB_node>', re.S)
    idx = 0
    for m in pat.finditer(txt):
        block = m.group(1)
        nm = re.search(r'<name length="\d+" encoding="mixed">(.*?)</name>', block)
        name = _decode(nm.group(1)) if nm else f"trace_{idx}"
        xu = re.search(r'<X_units[^>]*qty_kind="([^"]+)"', block)
        yu = re.search(r'<Y_units[^>]*qty_kind="([^"]+)"', block)
        xkind = xu.group(1) if xu else "?"
        ykind = yu.group(1) if yu else "?"

        Xs, Ys = [], []
        for pm in re.finditer(r"<points quantity=\"\d+\">(.*?)</points>", block, re.S):
            pb = pm.group(1)
            xm = re.search(r"<X_data>(.*?)</X_data>", pb, re.S)
            ym = re.search(r"<Y_data>(.*?)</Y_data>", pb, re.S)
            if xm and ym:
                Xs.append(np.fromstring(xm.group(1), sep=","))
                Ys.append(np.fromstring(ym.group(1), sep=","))

        X = np.concatenate(Xs) if Xs else np.array([])
        Y = np.concatenate(Ys) if Ys else np.array([])
        key = name if name not in traces else f"{name}_{idx}"
        traces[key] = {"X": X, "Y": Y, "xunit": xkind, "yunit": ykind}
        idx += 1
    return traces


def summarize(traces: dict) -> None:
    """打印所有曲线的概览，便于挑选需要的那条。"""
    print(f"{'key':<28}{'xunit':<12}{'yunit':<10}{'npts':>7}{'Ymin':>12}{'Ymax':>12}")
    for k, v in traces.items():
        Y = v["Y"]
        ymin = Y.min() if Y.size else float("nan")
        ymax = Y.max() if Y.size else float("nan")
        print(f"{k[:27]:<28}{v['xunit']:<12}{v['yunit']:<10}{Y.size:>7}{ymin:>12.4g}{ymax:>12.4g}")


if __name__ == "__main__":
    import sys
    p = sys.argv[1] if len(sys.argv) > 1 else None
    if p:
        summarize(read_paax(p))
