# Technical Support & Quality Workbench

An offline, bilingual prototype for reviewing catalyst test results, comparing test context, recording technical-support hypotheses and preparing a report. Built to demonstrate an applications and quality workflow alongside the [PEMFC Electrocatalyst Activity Analyzer](../README.md).

**[Open the workbench](https://andypeng09.github.io/PEMFC-Electrocatalyst-Activity-Analyzer/technical-support/)** · [中文说明](#中文说明)

## Start

1. Open `index.html` in a browser; no installation, network connection or upload is required. The initial scenario uses two **synthetic** samples and synthetic limits.
2. Import the analyzer's `results.csv` or try [synthetic analyzer exports](examples/analyzer-synthetic-results.csv). Imports append records; if IDs already exist, replacement of those records and their context requires confirmation. Blank measurements stay blank.
3. Select the sample and reference in turn, and enter each one's method, electrolyte, rotation, Pt loading, temperature, scan rate, reference/corrections and background treatment. A matching method ID means the user has checked protocol details such as integration and corrections. The interface withholds numerical differences when context is incomplete or mismatched, an upstream QC is `Invalid`, or synthetic and anonymized demo samples are paired. A field match does not establish full experimental equivalence.
4. Enter product- and method-specific numerical limits for the metric being reviewed. Limits are cleared when switching samples, metric, or method. They are not product certification or control limits. `qc_status` describes analysis data quality, not product acceptance. Review missing, unknown or flagged data.
5. Record the reported issue, observations, possible causes, verification and next actions. Hypotheses are not automatic root-cause findings. Case notes remain when switching samples, so review them before exporting. Print to PDF, download text, or copy the report. Save project JSON and restore it when moving between browsers; browser-local storage may be cleared by the browser.

## Data and units

The import contract follows the analyzer's `results.csv` exactly:

```text
sample_id,ecsa_m2_g,ehalf_V,jlim_mA_cm2,ma_0_9V_A_mg,sa_0_9V_mA_cm2_Pt,tafel_mV_dec,qc_status
```

Potentials are V vs RHE; ECSA is m²/gPt; jlim is signed mA/cm²; mass activity is A/mgPt; specific activity is mA/cm²Pt; Tafel slope is mV/dec. Signed jlim differences are sample minus reference, while its percentage compares absolute magnitudes. A nonnegative jlim is not compared as an ORR limiting current. Numerical comparisons use the absolute reference value as denominator and are undefined at zero. Input cells must be finite numbers or blank; duplicate IDs, inconsistent row lengths and unrecognized QC statuses are rejected.

The included **Example** results are derived from the anonymized CV/O₂/N₂ example data used in the analyzer, using its illustrative defaults: area 0.19625 cm², scan 20 mV/s, Pt loading 12.229 µg/cm², q = 0.21 mC/cm²Pt, H-upd range 0.05–0.40 V, and the upper-limit baseline. N₂ uses the last forward branch over overlapping potential range. The analyzer reports `Check recommended` because a second complete CV anodic sweep is unavailable. These are illustrative calculations, not verified test conditions or product claims; check the source protocol before interpreting them. The tool does not compare this example with the synthetic case.

## Scope and verification

This is a review aid, not a diagnostic system, laboratory accreditation, certificate of analysis, automatic disposition, or guarantee of causal inference. It does not calculate SPC control limits, process capability, or customer-specific acceptance criteria. The synthetic scenario and thresholds do not represent an actual customer case.

Run `node tests/test_core.cjs` from this directory to check the CSV parser, data-quality gating, contextual comparison, signed-current comparison and specification handling. See the parent repository for analysis methods and the export schema.

## 中文说明

这是一个离线中英文技术支持与质量复核原型，可导入电化学分析器的结果 CSV、核对样品测试条件、记录问题与排查假设，并生成文本或打印报告。初始排查案例和规格限为模拟数据；`Example` 来自已脱敏示例，计算参数仅为演示，实际测试条件需要核实。

只有两个样品的必要条件均填写且一致时，界面才显示差异；上游数据质量状态不等于产品合格。规格限由用户根据产品和方法输入；规格检查、可能原因和案例状态均需人工复核。项目数据可保存为 JSON 备份，工具本身不会上传数据。
