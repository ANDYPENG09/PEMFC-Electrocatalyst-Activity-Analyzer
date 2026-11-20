Download `index.html` from the release assets and open it in a browser. The workbench runs offline.

## Fixes

- Import real Pine AfterMath `.paax` archives, including units stored inside trace data blocks.
- Show study names in the trace selector and fill the CV scan rate when it is available in the archive.
- Show the measured anodic sweep range when ECSA integration limits are outside the data. When the gap is within one recorded step, **Use measured integration limits** applies the available interval and recalculates.
- Includes the H-upd baseline and plotting corrections and the updated examples documented in the changelog.

After importing, verify the potential reference and Pt loading. Use consistent integration limits when comparing ECSA across samples.

## Validation

Verified with an AfterMath archive and an independent H-upd integration. The automated numerical, UI and standalone build checks passed.
