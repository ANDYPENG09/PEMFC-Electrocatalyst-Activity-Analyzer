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
import xml.etree.ElementTree as ET
from pathlib import Path
import urllib.parse
import numpy as np


def _decode(s: str) -> str:
    return urllib.parse.unquote(s)


def read_paax(path: str) -> dict:
    """Read ordered trace points; reject malformed XML and inconsistent numeric arrays."""
    txt = Path(path).read_text(encoding="utf-8-sig", errors="strict")
    if re.search(r"<!DOCTYPE|<!ENTITY", txt, re.I):
        raise ValueError("Unsupported PAAX XML declaration")
    try:
        root = ET.fromstring(txt)
    except ET.ParseError as exc:
        raise ValueError("Invalid PAAX XML") from exc
    traces = {}
    nodes = [node for node in root.iter("DAB_node") if node.get("type") == "trace"]
    if not nodes:
        raise ValueError("No PAAX traces found")
    for idx, node in enumerate(nodes):
        base = _decode(node.findtext("name") or f"trace_{idx}")
        name, suffix = base, 2
        while name in traces:
            name = f"{base} ({suffix})"
            suffix += 1
        xu, yu = node.find("X_units"), node.find("Y_units")
        xkind = xu.get("qty_kind", "?") if xu is not None else "?"
        ykind = yu.get("qty_kind", "?") if yu is not None else "?"
        xs, ys = [], []
        def blocks(parent):
            for child in parent:
                if child.tag == "DAB_node" and child.get("type") == "trace":
                    continue
                if child.tag == "points":
                    yield child
                else:
                    yield from blocks(child)
        for block in blocks(node):
            data = []
            for axis in ("X_data", "Y_data"):
                text = block.findtext(axis)
                if text is None:
                    raise ValueError(f"{name}: missing {axis}")
                tokens = text.strip().split(",") if text.strip() else []
                try:
                    values = np.array([float(t) for t in tokens], dtype=float)
                except ValueError as exc:
                    raise ValueError(f"{name}: invalid {axis} numeric value") from exc
                if not np.isfinite(values).all():
                    raise ValueError(f"{name}: nonfinite {axis} value")
                data.append(values)
            x, y = data
            if x.size != y.size:
                raise ValueError(f"{name}: X/Y point counts differ")
            quantity = block.get("quantity")
            if quantity is not None and (not quantity.isdecimal() or int(quantity) != x.size):
                raise ValueError(f"{name}: declared point count differs from data")
            xs.append(x); ys.append(y)
        traces[name] = {"X": np.concatenate(xs) if xs else np.array([]),
                        "Y": np.concatenate(ys) if ys else np.array([]),
                        "xunit": xkind, "yunit": ykind}
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
