import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import pandas as pd
from extract_origin import export_sheet


class OriginExportTests(unittest.TestCase):
    def test_cli_help_without_origin_installation(self):
        result = subprocess.run([sys.executable, "extract_origin.py", "--help"],
                                capture_output=True, text=True, check=True)
        self.assertIn("project", result.stdout)

    def test_export_sheet(self):
        class Sheet:
            def to_df(self):
                return pd.DataFrame({"E": [.1, .2], "I": [1., 2.]})
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            self.assertTrue(export_sheet(Sheet(), "example", out))
            self.assertEqual(pd.read_csv(out/"example.csv").shape, (2, 2))


if __name__ == "__main__":
    unittest.main()
