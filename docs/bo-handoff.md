# Analysis → experiment planning

Export `results.csv` from the workbench. Prepare a design CSV with a unique `sample_id` and the synthesis variables for each sample. Join them using the companion BO repository:

```bash
python scripts/import_analyzer_results.py --design design.csv --results results.csv --out joined_experiments.csv
python scripts/bo_pipeline.py --data joined_experiments.csv --config my_campaign.yaml --out next_experiment.json
```

Run these commands in the BO repository. The importer requires identical sample-ID sets and rejects duplicate IDs or overlapping non-ID column names. It preserves QC, units encoded in column names, and all design fields. The planner accepts only `Good` rows by default when `qc_status` exists. Review `Check recommended` rows manually; `Invalid` rows cannot be enabled.

| Analyzer metric | Unit | BO config example |
|---|---|---|
| `ma_0_9V_A_mg` | A/mgPt | direction: max; specify a scale in the same unit |
| `ecsa_m2_g` | m²/gPt | direction: max |
| `sa_0_9V_mA_cm2_Pt` | mA/cm²Pt | direction: max |
| `ehalf_V` | V vs RHE | direction: max |
| `qc_status` | category | accepted_qc filter; never an objective |

Preserve physical units when choosing scales and constraint thresholds. `ordering_S` and an empirical XRD relative index must not share one column: store their method and calibration provenance separately. The importer is a table join, not an automatic endorsement of the measurements.
