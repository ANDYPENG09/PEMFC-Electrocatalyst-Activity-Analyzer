import csv
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import numpy as np
import electrochem_calc as legacy
from electrochem_analysis import (analyze_batch, analyze_sample, detect_plateau,
    export_analysis, half_wave, kl_fit, RESULT_FIELDS, CV_FIELDS, ORR_FIELDS)
from electrochem_analysis import load_kl_csv

ROOT=Path(__file__).resolve().parents[1]


def sample(name="Pt", center=0.85):
    e=np.linspace(0.2,1,201)
    j=-6/(1+np.exp((e-center)/0.025))
    ce=[];cj=[]
    for _ in range(3):
        for i in range(100):
            v=i/100;ce.append(v);cj.append(0.08+0.7*np.exp(-((v-0.18)/0.07)**2))
        for i in range(100,0,-1):
            ce.append(i/100);cj.append(-0.08)
    ce.append(0);cj.append(0.08)
    return dict(sample_id=name,orr=dict(E=e.tolist(),j=j.tolist()),
                n2=dict(E=e.tolist(),j=np.zeros_like(e).tolist()),
                cv=dict(E=ce,j=cj,scan_rate_V_s=0.02),loading_mg_cm2=0.02,
                metadata=dict(synthetic=True))


def kl_data():
    traces=[]
    for rpm in [400,900,1600,2500]:
        jl=1000*0.620*4*96485.33212*(1.9e-5)**(2/3)*0.01**(-1/6)*1.2e-6*np.sqrt(2*np.pi*rpm/60)
        j=-1/(1/10+1/jl)
        traces.append(dict(rpm=rpm,E=[0.895,0.9,0.905],j=[j]*3))
    return dict(traces=traces,potential_V=0.9,D_cm2_s=1.9e-5,nu_cm2_s=0.01,C_mol_cm3=1.2e-6)


class AnalysisTests(unittest.TestCase):
    def test_known_logistic_metrics(self):
        r=analyze_sample(sample())
        self.assertEqual(r["qc"]["status"],"Good")
        self.assertAlmostEqual(r["metrics"]["jlim_mA_cm2"],-6,places=4)
        self.assertAlmostEqual(r["metrics"]["ehalf_V"],0.85,places=4)
        self.assertAlmostEqual(r["metrics"]["ma_0_9V_A_mg"],6*np.exp(-2)/20,places=5)
        self.assertAlmostEqual(r["metrics"]["tafel_mV_dec"],0.025*np.log(10)*1000,places=3)
        self.assertGreater(r["metrics"]["ecsa_m2_g"],0)

    def test_plateau_spike_and_reversed(self):
        s=sample();s["orr"]["j"][20]=-60
        p=detect_plateau(**dict(E=s["orr"]["E"],j=s["orr"]["j"]))
        self.assertAlmostEqual(p["jlim_mA_cm2"],-6,places=4)
        self.assertGreater(p["std_mA_cm2"],1)
        self.assertAlmostEqual(legacy.half_wave_potential(s["orr"]["E"][::-1],s["orr"]["j"][::-1]),0.85,places=4)

    def test_no_plateau(self):
        e=np.linspace(0.2,1,201)
        for j in [-6*e,-np.ones_like(e)*6,np.zeros_like(e),6/(1+np.exp((e-.85)/.025))]:
            self.assertIsNone(detect_plateau(e,j))
        self.assertTrue(np.isnan(legacy.half_wave_potential(e,-6*e)))

    def test_background_checks(self):
        s=sample();del s["n2"]
        self.assertEqual(analyze_sample(s)["qc"]["status"],"Check recommended")
        s=sample();s["n2"]["E"]=s["n2"]["E"][20:];s["n2"]["j"]=s["n2"]["j"][20:]
        self.assertEqual(analyze_sample(s)["qc"]["status"],"Invalid")

    def test_cv_instability_and_insufficient_cv(self):
        s=sample()
        s["cv"]["j"][400:500]=[2*j for j in s["cv"]["j"][400:500]]
        r=analyze_sample(s)
        self.assertEqual(next(c for c in r["qc"]["checks"] if c["code"]=="cv_stability")["status"],"Check recommended")
        s=sample();del s["cv"]
        self.assertIsNone(analyze_sample(s)["metrics"]["sa_0_9V_mA_cm2_Pt"])

    def test_transport_and_missing_target(self):
        r=analyze_sample(sample(center=.95))
        c=next(c for c in r["qc"]["checks"] if c["code"]=="transport_0_9V")
        self.assertEqual(c["status"],"Check recommended")
        s=sample()
        for key in ["orr","n2"]:
            s[key]["E"]=s[key]["E"][:170];s[key]["j"]=s[key]["j"][:170]
        self.assertIsNone(analyze_sample(s)["metrics"]["ma_0_9V_A_mg"])

    def test_bad_curves_and_duplicate_ids(self):
        for e,j in [([0,0,1],[-1,-1,0]),([0,1,0],[-1,0,-1]),([0,1],[float('nan'),0])]:
            with self.assertRaises(ValueError):detect_plateau(e,j)
        with self.assertRaises(ValueError):analyze_batch([sample(),sample()])
        with self.assertRaises(ValueError):analyze_sample({**sample(),"loading_mg_cm2":0})

    def test_kl_units_and_physical_parameters(self):
        result=kl_fit(**kl_data())
        self.assertAlmostEqual(result["n"],4,places=10)
        self.assertAlmostEqual(result["jk_mA_cm2"],-10,places=10)
        self.assertAlmostEqual(result["r2"],1,places=12)
        self.assertEqual(result["status"],"Good")
        data=kl_data();del data["D_cm2_s"]
        self.assertIsNone(kl_fit(**data)["n"])
        data=kl_data();data["traces"][1]["rpm"]=400
        with self.assertRaises(ValueError):kl_fit(**data)
        data=kl_data();data["potential_V"]=1.1
        with self.assertRaises(ValueError):kl_fit(**data)
        data=kl_data();data["traces"]=data["traces"][:2]
        with self.assertRaises(ValueError):kl_fit(**data)

    def test_export_contract(self):
        s=sample();del s["cv"]
        analysis=analyze_batch([s,sample("PtCo",.87)])
        with tempfile.TemporaryDirectory() as d:
            export_analysis(analysis,d)
            restored=json.loads((Path(d)/"analysis.json").read_text(encoding="utf-8"))
            self.assertEqual(restored["schema_version"],"1.0.0")
            self.assertIsNone(restored["samples"][0]["metrics"]["ecsa_m2_g"])
            for name,fields in [("results.csv",RESULT_FIELDS),("processed_cv.csv",CV_FIELDS),("processed_orr.csv",ORR_FIELDS)]:
                with (Path(d)/name).open(encoding="utf-8",newline="") as f:
                    rows=csv.DictReader(f);self.assertEqual(rows.fieldnames,fields);self.assertGreater(len(list(rows)),0)

    def test_sensitivity_detects_alternative_plateau(self):
        s=sample()
        e=np.array(s["orr"]["E"])
        # A second cathodic plateau of materially different magnitude.
        j=np.array(s["orr"]["j"])
        j[(e>=.5)&(e<=.7)]=-4.5
        s["orr"]["j"]=j.tolist()
        r=analyze_sample(s)
        c=next(c for c in r["qc"]["checks"] if c["code"]=="plateau_sensitivity")
        self.assertEqual(c["status"],"Check recommended")
        self.assertGreater(c["value"]["jlim_relative"],.1)

    def test_kl_csv_and_degenerate_fit(self):
        data=kl_data()
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"kl.csv"
            with path.open("w",newline="",encoding="utf-8") as f:
                w=csv.writer(f);w.writerow(["rpm","potential_V_RHE","j_mA_cm2"])
                for t in data["traces"]:
                    w.writerows([t["rpm"],e,j] for e,j in zip(t["E"],t["j"]))
            self.assertEqual(load_kl_csv([path]),data["traces"])
        for t in data["traces"]:t["j"]=[-2]*3
        r=kl_fit(**data)
        self.assertEqual(r["status"],"Invalid")
        self.assertIsNone(r["jk_mA_cm2"])
        self.assertIsNone(r["n"])

    def test_invalid_analysis_settings(self):
        for options in [dict(min_width_V=0),dict(min_points=1),dict(transport_ratio=1),dict(slope_fraction_per_V=float('nan'))]:
            with self.assertRaises(ValueError):analyze_sample({**sample(),"qc_options":options})
        with self.assertRaises(ValueError):analyze_sample({**sample(),"tafel_range_V":[.95,.85]})
        with self.assertRaises(ValueError):kl_fit(kl_data()["traces"],potential_V=float('nan'))

    def test_legacy_formulas(self):
        self.assertAlmostEqual(float(legacy.current_to_density(-.001,.2)),-5)
        self.assertAlmostEqual(float(legacy.density_to_current(-5,.2)),-.001)
        e=legacy.v_to_rhe(.1,pH=1)
        self.assertAlmostEqual(float(legacy.rhe_to_v(e,pH=1)),.1)
        self.assertAlmostEqual(float(legacy.ir_correct(.9,-.001,10)),.91)
        self.assertAlmostEqual(float(legacy.koutecky_levich(-2,-6)),-3)
        self.assertAlmostEqual(legacy.kinetic_current_density(-2,-6),3)
        self.assertAlmostEqual(legacy.mass_activity_kinetic(3,.02),.15)
        self.assertAlmostEqual(legacy.specific_activity(3,60,.00002),.25)
        self.assertAlmostEqual(legacy.tafel_slope([.8,.86],[10,1]),-60)
        s=sample();self.assertGreater(len(legacy.extract_cv_cycles(s["cv"]["E"],s["cv"]["j"])),1)
        self.assertEqual(len(legacy.select_stable_cycle(s["cv"]["E"],s["cv"]["j"])),2)
        self.assertGreater(legacy.ecsa_from_hupd([.05,.2,.4],[1,2,1],.02,loading_ug_cm2=20)["ECSA_m2_per_g"],0)

    def test_javascript_python_parity(self):
        payload=dict(samples=[sample(),sample("PtCo",.87)],kl=kl_data())
        program="const fs=require('fs'),a=require('./web/analysis.js'),p=JSON.parse(fs.readFileSync(0,'utf8'));const r=a.analyzeBatch(p.samples);r.kl=a.klFit(p.kl.traces,p.kl.potential_V,p.kl.D_cm2_s,p.kl.nu_cm2_s,p.kl.C_mol_cm3);console.log(JSON.stringify(r));"
        result=subprocess.run(["node","-e",program],input=json.dumps(payload),text=True,capture_output=True,cwd=ROOT,check=True)
        js=json.loads(result.stdout);py=analyze_batch(payload["samples"]);py["kl"]=kl_fit(**payload["kl"])
        def compare(a,b,path="root"):
            if isinstance(a,dict):
                self.assertEqual(set(a),set(b),path)
                for k in a:compare(a[k],b[k],path+"."+k)
            elif isinstance(a,list):
                self.assertEqual(len(a),len(b),path)
                for i,(x,y) in enumerate(zip(a,b)):compare(x,y,path+f"[{i}]")
            elif isinstance(a,(float,int)) and not isinstance(a,bool):self.assertAlmostEqual(a,b,places=8,msg=path)
            else:self.assertEqual(a,b,path)
        compare(py,js)


if __name__=="__main__":unittest.main()
