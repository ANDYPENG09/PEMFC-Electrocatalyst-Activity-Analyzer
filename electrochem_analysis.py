"""Offline ORR workbench. Currents: mA/cm2; potentials: V vs RHE.

QC thresholds are screening heuristics, not certification criteria. Missing
metrics serialize as null. Legacy formula APIs remain in electrochem_calc.
"""
from __future__ import annotations
import csv
import json
from pathlib import Path
import numpy as np

SCHEMA_VERSION = "1.0.0"
RESULT_FIELDS = ["sample_id", "ecsa_m2_g", "ehalf_V", "jlim_mA_cm2",
                 "ma_0_9V_A_mg", "sa_0_9V_mA_cm2_Pt", "tafel_mV_dec", "qc_status"]
CV_FIELDS = ["sample_id", "point_index", "potential_V_RHE", "j_mA_cm2"]
ORR_FIELDS = ["sample_id", "point_index", "potential_V_RHE", "j_raw_mA_cm2",
              "j_background_mA_cm2", "j_corrected_mA_cm2", "in_plateau"]
SUMMARY_FIELDS = ["record_type", "sample_id", "point_index", "potential_V_RHE", "j_mA_cm2",
                  "j_raw_mA_cm2", "j_background_mA_cm2", "j_corrected_mA_cm2", "in_plateau",
                  "ecsa_m2_g", "ehalf_V", "jlim_mA_cm2", "ma_0_9V_A_mg",
                  "sa_0_9V_mA_cm2_Pt", "tafel_mV_dec", "qc_status"]
DEFAULTS = dict(min_width_V=0.08, min_points=7, slope_fraction_per_V=0.15,
                max_gap_V=0.025, transport_ratio=0.8, stability_fraction=0.05,
                sensitivity_fraction=0.1)


def validate_options(cfg):
    if any(not isinstance(v,(int,float)) or not np.isfinite(v) or v<=0 for v in cfg.values()):
        raise ValueError("QC thresholds must be finite and positive")
    if cfg["min_points"]<3 or int(cfg["min_points"])!=cfg["min_points"] or cfg["transport_ratio"]>=1:
        raise ValueError("Use min_points >=3 and transport_ratio <1")


def curve(E, j):
    """Validate a single sweep; normalize descending input without mixing CV branches."""
    x, y = np.asarray(E, float), np.asarray(j, float)
    if x.ndim != 1 or y.ndim != 1 or len(x) != len(y) or len(x) < 2:
        raise ValueError("A curve needs at least two paired points")
    if not (np.isfinite(x).all() and np.isfinite(y).all()):
        raise ValueError("Curve contains non-finite data")
    d = np.diff(x)
    if np.all(d < 0):
        return x[::-1], y[::-1]
    if not np.all(d > 0):
        raise ValueError("Use one monotonic sweep with unique potentials")
    return x, y


def interpolate(x, y, target, max_gap=0.025):
    if target < x[0] or target > x[-1]:
        return None
    k = int(np.searchsorted(x, target))
    if k < len(x) and abs(x[k] - target) < 1e-12:
        return float(y[k])
    if k == 0 or x[k] - x[k-1] > max_gap:
        return None
    return float(np.interp(target, x, y))


def detect_plateau(E, j, **options):
    """Contiguous low-derivative cathodic region; never fall back to min(j).

    Five-point running medians suppress isolated spikes for detection only.
    Statistics use original points. Require >=60% of robust cathodic amplitude,
    a resolved rising wave, and no acquisition gaps inside a candidate.
    """
    cfg = {**DEFAULTS, **options}
    validate_options(cfg)
    x, y = curve(E, j)
    smooth = np.array([np.median(y[max(0, i-2):i+3]) for i in range(len(y))])
    amplitude = -float(np.quantile(smooth, 0.1))
    if amplitude <= 0 or np.max(smooth) - np.min(smooth) < 0.3 * amplitude:
        return None
    derivative = np.empty(len(x))
    for i in range(len(x)):
        a, b = max(0, i-2), min(len(x)-1, i+2)
        derivative[i] = (smooth[b]-smooth[a])/(x[b]-x[a])
    mask = (np.abs(derivative) <= amplitude * cfg["slope_fraction_per_V"]) & (smooth < -0.6*amplitude)
    candidates, start = [], None
    for i in range(len(x)+1):
        eligible = i < len(x) and mask[i]
        gap = i > 0 and i < len(x) and x[i]-x[i-1] > cfg["max_gap_V"]
        if start is not None and (not eligible or gap):
            end = i-1
            if end-start+1 >= cfg["min_points"] and x[end]-x[start] >= cfg["min_width_V"]:
                values = y[start:end+1]
                med = float(np.median(values))
                candidates.append(dict(start_V=float(x[start]), end_V=float(x[end]),
                    jlim_mA_cm2=med, mad_mA_cm2=float(np.median(np.abs(values-med))),
                    std_mA_cm2=float(np.std(values)), count=len(values)))
            start = None
        if eligible and start is None:
            start = i
    if not candidates:
        return None
    best = max(candidates, key=lambda c: c["end_V"]-c["start_V"])
    return {**best, "candidates": candidates, "method": "contiguous_low_derivative_median"}


def half_wave(E, j, jlim):
    x, y = curve(E, j)
    if jlim is None or not np.isfinite(jlim) or jlim >= 0:
        return None
    target = jlim/2
    for i in range(len(x)-1):
        if y[i] <= target < y[i+1] and x[i+1]-x[i] <= DEFAULTS["max_gap_V"]:
            return float(x[i]+(target-y[i])*(x[i+1]-x[i])/(y[i+1]-y[i]))
    return None


def kinetic(j, jl):
    if j is None or jl is None or j >= 0 or jl >= 0 or abs(j) >= abs(jl):
        return None
    return abs(j)*abs(jl)/(abs(jl)-abs(j))


def sweeps(E, j):
    x, y = np.asarray(E, float), np.asarray(j, float)
    if len(x) != len(y) or len(x) < 2 or not (np.isfinite(x).all() and np.isfinite(y).all()):
        raise ValueError("Invalid CV points")
    out, start, direction = [], 0, 0
    for i in range(1, len(x)):
        sign = np.sign(x[i]-x[i-1])
        if sign and direction and sign != direction:
            if i-start >= 3:
                out.append((x[start:i], y[start:i]))
            start = i-1
        if sign:
            direction = sign
    if len(x)-start >= 3:
        out.append((x[start:], y[start:]))
    return out


def cv_analysis(cv, loading):
    """Last complete anodic Hupd peak, endpoint baseline; compare like-direction scans."""
    if not cv:
        return dict(ecsa_m2_g=None, stability_fraction=None, anodic_sweeps=0)
    lo, hi = cv.get("hupd_range_V", [0.05, 0.4])
    rate, q = cv.get("scan_rate_V_s", 0.02), cv.get("q_mC_cm2", 0.21)
    if not np.isfinite([rate,q,lo,hi]).all() or rate <= 0 or q <= 0 or lo >= hi:
        raise ValueError("Invalid CV integration parameters")
    branches = [(x,y) for x,y in sweeps(cv["E"], cv["j"]) if x[-1] > x[0] and x[0] <= lo and x[-1] >= hi]
    if not branches:
        return dict(ecsa_m2_g=None, stability_fraction=None, anodic_sweeps=0)
    # Remove potential holds within a CV branch; never average opposite branches.
    branches = [(x[np.r_[True, np.diff(x)>0]], y[np.r_[True, np.diff(x)>0]]) for x,y in branches]
    x,y = branches[-1]
    baseline = cv.get("baseline_mA_cm2", float(np.interp(hi,x,y)))
    if not np.isfinite(baseline):
        raise ValueError("CV baseline must be finite")
    xx = np.r_[lo, x[(x>lo)&(x<hi)], hi]
    yy = np.maximum(0, np.interp(xx,x,y)-baseline)
    sh = float(np.sum(np.diff(xx)*(yy[1:]+yy[:-1])/2))
    stability = None
    if len(branches) >= 2:
        a,b = branches[-2:]
        grid = np.linspace(max(a[0][0],b[0][0]), min(a[0][-1],b[0][-1]), 101)
        ya,yb = np.interp(grid,*a),np.interp(grid,*b)
        scale = max(float(np.sqrt(np.mean(yb**2))), 1e-12)
        stability = float(np.sqrt(np.mean((ya-yb)**2))/scale)
    return dict(ecsa_m2_g=100*sh/(q*rate*loading*1000) if loading and sh > 0 else None,
                stability_fraction=stability, anodic_sweeps=len(branches),
                SH_mA_V_cm2=sh, baseline_mA_cm2=baseline)


def fit_line(x, y):
    x,y = np.asarray(x,float),np.asarray(y,float)
    dx,dy=x-x.mean(),y-y.mean()
    if len(x)<2 or np.sum(dx*dx)<1e-24:
        raise ValueError("Insufficient independent fit points")
    slope=float(np.sum(dx*dy)/np.sum(dx*dx))
    intercept=float(y.mean()-slope*x.mean())
    total=float(np.sum(dy*dy))
    r2=1-float(np.sum((y-(slope*x+intercept))**2))/total if total>1e-24 else None
    return dict(slope=slope, intercept=intercept, r2=r2)


def kl_fit(traces, potential_V=0.9, D_cm2_s=None, nu_cm2_s=None, C_mol_cm3=None):
    """Signed cathodic 1/j fit, omega=2*pi*rpm/60. jk signed; n positive.

    At least three distinct positive speeds are required. Transport constants
    use cm-based units; factor 1000 converts the Levich A/cm2 into mA/cm2.
    """
    if not np.isfinite(potential_V):
        raise ValueError("K-L potential must be finite")
    rpm, currents = [], []
    for trace in traces:
        speed=float(trace["rpm"])
        if not np.isfinite(speed) or speed<=0 or speed in rpm:
            raise ValueError("K-L requires distinct positive rpm")
        x,y=curve(trace["E"],trace["j"])
        current=interpolate(x,y,potential_V)
        if current is None or current>=0:
            raise ValueError("K-L needs a covered potential and negative ORR current at every rpm")
        rpm.append(speed)
        currents.append(current)
    if len(rpm)<3:
        raise ValueError("K-L requires at least three distinct rpm")
    xs=(2*np.pi*np.array(rpm)/60)**-0.5
    ys=1/np.array(currents)
    fit=fit_line(xs,ys)
    valid=fit["slope"] < -1e-12 and fit["intercept"] < -1e-12
    reasons=[] if valid else ["Nonphysical slope/intercept; jk and n unavailable"]
    if fit["r2"] is None or fit["r2"]<0.98:
        reasons.append("K-L R2 below 0.98 or undefined")
    n=None
    params=[D_cm2_s,nu_cm2_s,C_mol_cm3]
    if any(p is not None and (not np.isfinite(p) or p<=0) for p in params):
        raise ValueError("Transport parameters must be finite and positive")
    if valid and all(p is not None for p in params):
        n=1/(abs(fit["slope"])*1000*0.620*96485.33212*D_cm2_s**(2/3)*nu_cm2_s**(-1/6)*C_mol_cm3)
        if n>4.2 or n<1:
            reasons.append("Estimated ORR electron number outside 1–4.2; review assumptions")
    elif not all(p is not None for p in params):
        reasons.append("n unavailable: supply D, kinematic viscosity and oxygen concentration")
    return dict(**fit, potential_V=potential_V, jk_mA_cm2=1/fit["intercept"] if valid else None,
                n=n, rpm=rpm, j_mA_cm2=currents, omega_inv_sqrt=xs.tolist(),
                inverse_j=ys.tolist(), status="Invalid" if not valid else "Check recommended" if reasons else "Good",
                reasons=reasons, D_cm2_s=D_cm2_s,nu_cm2_s=nu_cm2_s,C_mol_cm3=C_mol_cm3)


def analyze_sample(sample):
    """Input: sample_id, orr:{E,j}, optional n2/cv, loading_mg_cm2, metadata.

    Use legacy v_to_rhe/ir_correct before this API if raw potentials need correction.
    Store the correction settings in metadata. Never extrapolate background.
    """
    sid=str(sample["sample_id"])
    cfg={**DEFAULTS, **sample.get("qc_options",{})}
    validate_options(cfg)
    loading=sample.get("loading_mg_cm2")
    if loading is not None and (not np.isfinite(loading) or loading<=0):
        raise ValueError("Pt loading must be finite and positive")
    x,raw=curve(sample["orr"]["E"],sample["orr"]["j"])
    checks=[]
    def check(code,status,reason,value=None):
        checks.append(dict(code=code,status=status,reason=reason,value=value))
    bg=None
    if sample.get("n2"):
        nx,ny=curve(sample["n2"]["E"],sample["n2"]["j"])
        values=[interpolate(nx,ny,e) for e in x]
        if any(v is None for v in values):
            check("n2_background","Invalid","N2 does not cover the full O2 sweep without gaps")
        else:
            bg=np.array(values)
            check("n2_background","Good","N2 background subtracted")
    else:
        check("n2_background","Check recommended","N2 background unavailable; ORR remains uncorrected")
    y=raw-bg if bg is not None else raw.copy()
    plateau=detect_plateau(x,y,**cfg)
    jl=plateau["jlim_mA_cm2"] if plateau else None
    check("plateau","Good" if plateau else "Invalid",
          "Continuous low-derivative cathodic plateau detected" if plateau else "No resolved diffusion plateau; no min(j) fallback",plateau)
    cv=cv_analysis(sample.get("cv"),loading)
    stability=cv["stability_fraction"]
    check("cv_stability","Good" if stability is not None and stability<=cfg["stability_fraction"] else "Check recommended",
          "Last two comparable anodic sweeps RMS difference" if stability is not None else "At least two complete anodic sweeps required",stability)
    j09=interpolate(x,y,0.9)
    ratio=abs(j09/jl) if j09 is not None and jl else None
    jk=kinetic(j09,jl)
    check("transport_0_9V","Invalid" if jk is None else "Check recommended" if ratio>=cfg["transport_ratio"] else "Good",
          "0.9 V missing, wrong current sign, or |j| >= |jlim|" if jk is None else "|j(0.9V)| / |jlim|; review at >=0.8",ratio)
    variants=[]
    if plateau:
        vals=y[(x>=plateau["start_V"])&(x<=plateau["end_V"])]
        variants=[float(np.quantile(vals,q)) for q in (0.1,0.9)]
        for factor in (0.5,1.5):
            alt=detect_plateau(x,y,**{**cfg,"slope_fraction_per_V":cfg["slope_fraction_per_V"]*factor})
            if alt:
                variants.extend(c["jlim_mA_cm2"] for c in alt["candidates"])
    jl_sens=max((abs(v-jl)/abs(jl) for v in variants),default=None)
    ks=[kinetic(j09,v) for v in variants]
    ma_sens=max((abs(k-jk)/jk for k in ks if k is not None),default=None) if jk else None
    singular=bool(ks) and any(k is None for k in ks)
    check("plateau_sensitivity","Invalid" if singular else "Good" if ma_sens is not None and max(jl_sens,ma_sens)<=cfg["sensitivity_fraction"] else "Check recommended",
          "Compare plateau P10/P90 and derivative thresholds x0.5/x1.5; MA sensitivity equals jk sensitivity",
          dict(jlim_relative=jl_sens,ma_relative=ma_sens,singular=singular))
    ecsa=cv["ecsa_m2_g"]
    if loading is None or ecsa is None:
        check("normalization","Check recommended","MA requires Pt loading; SA requires positive Hupd ECSA")
    ehalf=half_wave(x,y,jl)
    check("ehalf","Good" if ehalf is not None else "Invalid","Half-plateau rising crossing" if ehalf is not None else "Half-wave crossing not resolved")
    lo,hi=sample.get("tafel_range_V",[0.85,0.95])
    if not np.isfinite([lo,hi]).all() or lo>=hi:
        raise ValueError("Invalid Tafel potential range")
    tx,ty=[],[]
    for e,j in zip(x,y):
        k=kinetic(j,jl)
        if lo<=e<=hi and k and abs(j/jl)<cfg["transport_ratio"]:
            tx.append(float(np.log10(k)));ty.append(float(e))
    tf=None
    if len(tx)>=5 and max(tx)-min(tx)>=0.3:
        fit=fit_line(tx,ty)
        if fit["slope"]<0:
            tf={**fit,"slope_mV_dec":abs(fit["slope"])*1000,"count":len(tx),"range_V":[lo,hi]}
    check("tafel","Good" if tf and tf["r2"] is not None and tf["r2"]>=0.98 else "Check recommended",
          "Kinetic-current Tafel fit; >=5 points and >=0.3 decades required",tf)
    if plateau and plateau["std_mA_cm2"]/abs(jl)>0.05:
        check("plateau_dispersion","Check recommended","Plateau standard deviation exceeds 5% of |jlim|")
    status="Invalid" if any(c["status"]=="Invalid" for c in checks) else "Check recommended" if any(c["status"]=="Check recommended" for c in checks) else "Good"
    metrics=dict(ecsa_m2_g=ecsa,ehalf_V=ehalf,jlim_mA_cm2=jl,
                 ma_0_9V_A_mg=jk/1000/loading if jk and loading else None,
                 sa_0_9V_mA_cm2_Pt=jk/(ecsa*loading*10) if jk and ecsa and loading else None,
                 tafel_mV_dec=tf["slope_mV_dec"] if tf else None)
    processed_orr=[dict(zip(ORR_FIELDS,[sid,i,float(e),float(raw[i]),float(bg[i]) if bg is not None else None,float(y[i]),bool(plateau and plateau["start_V"]<=e<=plateau["end_V"])])) for i,e in enumerate(x)]
    processed_cv=[dict(zip(CV_FIELDS,[sid,i,float(e),float(j)])) for i,(e,j) in enumerate(zip(sample.get("cv",{}).get("E",[]),sample.get("cv",{}).get("j",[])))]
    return dict(sample_id=sid,metrics=metrics,qc=dict(status=status,checks=checks),plateau=plateau,
                cv=cv,tafel=tf,metadata=sample.get("metadata",{}),
                settings=dict(loading_mg_cm2=loading,qc_options=cfg,tafel_range_V=[lo,hi],
                              cv={k:v for k,v in sample.get("cv",{}).items() if k not in ("E","j")}),
                processed_cv=processed_cv,processed_orr=processed_orr)


def analyze_batch(samples):
    ids=[str(s["sample_id"]) for s in samples]
    if not ids or any(not s.strip() for s in ids) or len(set(ids))!=len(ids):
        raise ValueError("Provide nonempty, unique sample IDs")
    results=[analyze_sample(s) for s in samples]
    return dict(schema_version=SCHEMA_VERSION,units=dict(potential="V vs RHE",current_density="mA/cm2",loading="mgPt/cm2"),samples=results)


def summary_rows(analysis):
    """Rows for the final human-readable CSV: metrics plus exact CV/LSV plotted points."""
    rows=[]
    for s in analysis["samples"]:
        rows.append(dict(record_type="metrics",sample_id=s["sample_id"],**s["metrics"],qc_status=s["qc"]["status"]))
        for r in s["processed_cv"]:
            rows.append(dict(record_type="cv_point",sample_id=s["sample_id"],point_index=r["point_index"],
                             potential_V_RHE=r["potential_V_RHE"],j_mA_cm2=r["j_mA_cm2"]))
        for r in s["processed_orr"]:
            rows.append(dict(record_type="lsv_point",sample_id=s["sample_id"],point_index=r["point_index"],
                             potential_V_RHE=r["potential_V_RHE"],j_mA_cm2=r["j_corrected_mA_cm2"],
                             j_raw_mA_cm2=r["j_raw_mA_cm2"],j_background_mA_cm2=r["j_background_mA_cm2"],
                             j_corrected_mA_cm2=r["j_corrected_mA_cm2"],in_plateau=r["in_plateau"]))
    return rows


def export_analysis(analysis, directory):
    """Stable, UTF-8 files. Null JSON values and empty CSV cells mean unavailable."""
    directory=Path(directory)
    directory.mkdir(parents=True,exist_ok=True)
    (directory/"analysis.json").write_text(json.dumps(analysis,ensure_ascii=False,indent=2,allow_nan=False),encoding="utf-8")
    tables={"results.csv":(RESULT_FIELDS,[dict(sample_id=s["sample_id"],**s["metrics"],qc_status=s["qc"]["status"]) for s in analysis["samples"]]),
            "processed_cv.csv":(CV_FIELDS,[r for s in analysis["samples"] for r in s["processed_cv"]]),
            "processed_orr.csv":(ORR_FIELDS,[r for s in analysis["samples"] for r in s["processed_orr"]]),
            "summary.csv":(SUMMARY_FIELDS,summary_rows(analysis))}
    for name,(fields,rows) in tables.items():
        with (directory/name).open("w",newline="",encoding="utf-8") as f:
            writer=csv.DictWriter(f,fieldnames=fields)
            writer.writeheader();writer.writerows(rows)


def plot_comparison(analysis):
    import matplotlib.pyplot as plt
    fig,axes=plt.subplots(1,2,figsize=(11,4))
    for s in analysis["samples"]:
        for ax,key,ykey in [(axes[0],"processed_cv","j_mA_cm2"),(axes[1],"processed_orr","j_corrected_mA_cm2")]:
            rows=s[key]
            if rows:
                ax.plot([r["potential_V_RHE"] for r in rows],[r[ykey] for r in rows],label=s["sample_id"])
    for ax,title in zip(axes,["CV comparison","ORR comparison"]):
        ax.set(xlabel="E (V vs RHE)",ylabel="j (mA/cm²)",title=title)
        if ax.lines: ax.legend()
    fig.tight_layout()
    return fig


def load_kl_csv(paths):
    """Combine CSVs with rpm,potential_V_RHE,j_mA_cm2 columns into trace objects."""
    groups={}
    for path in paths:
        with Path(path).open(encoding="utf-8-sig",newline="") as f:
            reader=csv.DictReader(f)
            if not {"rpm","potential_V_RHE","j_mA_cm2"}.issubset(reader.fieldnames or []):
                raise ValueError("K-L CSV requires rpm,potential_V_RHE,j_mA_cm2")
            for row in reader:
                rpm=float(row["rpm"])
                trace=groups.setdefault(rpm,dict(rpm=rpm,E=[],j=[]))
                trace["E"].append(float(row["potential_V_RHE"]))
                trace["j"].append(float(row["j_mA_cm2"]))
    return list(groups.values())


def plot_kl(result):
    import matplotlib.pyplot as plt
    fig,ax=plt.subplots(figsize=(6,4))
    x=np.array(result["omega_inv_sqrt"])
    ax.scatter(x,result["inverse_j"],label="Measured")
    ax.plot(x,result["slope"]*x+result["intercept"],label="Linear fit")
    ax.set(xlabel="omega^(-1/2) (rad/s)^(-1/2)",ylabel="1/j (cm²/mA)",title="Koutecky–Levich")
    ax.legend();fig.tight_layout()
    return fig


def main():
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input",help="JSON object with samples and optional kl")
    parser.add_argument("--output",default="analysis_output")
    parser.add_argument("--plot",action="store_true")
    parser.add_argument("--kl-csv",nargs="+",help="Import multi-rpm CSV files; optional kl parameters come from input JSON")
    args=parser.parse_args()
    payload=json.loads(Path(args.input).read_text(encoding="utf-8"))
    result=analyze_batch(payload["samples"])
    kl_options=dict(payload.get("kl",{}))
    if args.kl_csv:
        kl_options["traces"]=load_kl_csv(args.kl_csv)
    if kl_options:
        result["kl"]=kl_fit(**kl_options)
    export_analysis(result,args.output)
    if args.plot:
        plot_comparison(result).savefig(Path(args.output)/"comparison.png",dpi=180)
        if "kl" in result:
            plot_kl(result["kl"]).savefig(Path(args.output)/"kl_fit.png",dpi=180)
    print(f"Exported {len(result['samples'])} samples to {args.output}")


if __name__=="__main__":
    main()
