## How to use
Download `index.html` from Assets and open it in your browser. The standalone workbench runs offline without installation.

## Changes
- Import Autolab NOVA PAAX files directly in the HTML workbench; select traces and load them into CV, O₂ LSV, or N₂ background.
- Support multiple data blocks, duplicate trace names, unit conversion and malformed-data validation.
- Clear O₂ and N₂ inputs independently while preserving the other raw dataset. Both actions clear obsolete corrected curves and ORR results.
- Restore both datasets explicitly when restoring a saved sample.
- Harden the Python PAAX reader against malformed XML, invalid numbers and inconsistent array lengths.
- Include repository documentation and automated validation updates.

## Validation
Passed UI regressions, core regressions and all 18 Python/numerical tests. PAAX validation used synthetic fixtures; real NOVA files remain unverified. PNG image/canvas I/O is mocked in the DOM tests.

Confirm scan rate, potential reference and catalyst loading before calculation; PAAX trace names do not supply these settings.
