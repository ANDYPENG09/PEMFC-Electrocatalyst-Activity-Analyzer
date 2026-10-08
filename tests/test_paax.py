import tempfile
import unittest
from pathlib import Path
import numpy as np
from read_paax import read_paax


class PaaxTests(unittest.TestCase):
    def read_text(self, text):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'input.paax'
            path.write_text(text)
            return read_paax(str(path))

    def test_bundled_demo(self):
        result = read_paax('sample_data/EC-30-PtCo-Step1.paax')
        self.assertGreaterEqual(len(result), 3)
        for trace in result.values():
            self.assertEqual(trace['X'].size, trace['Y'].size)
            self.assertEqual(trace['xunit'], 'potential')
            self.assertEqual(trace['yunit'], 'current')

    def test_blocks_names_and_attribute_order(self):
        trace = '<DAB_node other="a" type="trace"><name encoding="mixed">CV%20%26</name><X_units qty_kind="potential"/><Y_units qty_kind="current"/><points quantity="2"><X_data>0.1,0.2</X_data><Y_data>1,2</Y_data></points><points quantity="1"><X_data>0.3</X_data><Y_data>3</Y_data></points></DAB_node>'
        result = self.read_text('<DAB>'+trace+trace+'</DAB>')
        self.assertEqual(list(result), ['CV &', 'CV & (2)'])
        np.testing.assert_equal(result['CV &']['X'], [0.1, 0.2, 0.3])

    def test_malformed_data_rejected(self):
        for x, y, count in [('1,2', '3', '2'), ('1,bad', '2,3', '2'), ('1,', '2,3', '2'), ('1,nan', '2,3', '2'), ('1,2', '2,3', '3')]:
            with self.subTest(x=x, y=y, count=count), self.assertRaises(ValueError):
                self.read_text(f'<DAB><DAB_node type="trace"><points quantity="{count}"><X_data>{x}</X_data><Y_data>{y}</Y_data></points></DAB_node></DAB>')
        for xml in ['<DAB>', '<DAB/>', '<!DOCTYPE DAB><DAB/>']:
            with self.assertRaises(ValueError):
                self.read_text(xml)
