"""Generate reproducible synthetic ORR/CV/K-L fixtures and standardized exports."""
from pathlib import Path
import json
from tests.test_analysis import sample,kl_data
from electrochem_analysis import analyze_batch,export_analysis,kl_fit,plot_comparison


def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",default="analysis_output")
    parser.add_argument("--plot",action="store_true")
    args=parser.parse_args()
    directory=Path(args.output);directory.mkdir(parents=True,exist_ok=True)
    payload=dict(samples=[sample(),sample("PtCo",.87)],kl=kl_data())
    (directory/"input.json").write_text(json.dumps(payload,indent=2),encoding="utf-8")
    result=analyze_batch(payload["samples"]);result["kl"]=kl_fit(**payload["kl"])
    export_analysis(result,directory)
    if args.plot:plot_comparison(result).savefig(directory/"comparison.png",dpi=180)
    print("Synthetic K-L n:",result["kl"]["n"])
    for s in result["samples"]:print(s["sample_id"],s["qc"]["status"],s["metrics"])


if __name__=="__main__":main()
