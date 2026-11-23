Download `index.html` from Assets and open it in a browser to work offline.

- The AfterMath picker groups curves by test time and shows them in the order activation CV → ECSA CV → N₂ LSV → O₂ LSV. It selects the latest run and its ECSA CV when available, and hides auxiliary traces and exact copies from the same experiment.
- CV scan rates up to 30 mV/s are grouped as ECSA and rates at or above 75 mV/s as activation. LSV identification uses cathodic current, plateau shape and relative current levels across comparable traces. Curves with ambiguous gas or scan rate remain available for manual selection.
- The picker reads technique metadata and defers loading full CV point arrays until selection.
- ECSA can use the measured endpoint for small offsets of up to one sampling step and 5 mV. The result shows the effective range. Turn off the option to enforce an exact window, or explicitly choose the measured overlap for a larger gap.
- Full-curve previews render fewer points for long CVs. Integration continues to use the original data.
