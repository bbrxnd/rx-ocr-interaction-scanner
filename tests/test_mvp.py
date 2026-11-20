import json
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests
from streamlit.testing.v1 import AppTest

from services.evidence import load_data, normalize, parse_names, retrieve, tfidf_scores
from services.providers import DemoProvider, JsonProvider, ProviderError, validate

APP_PATH = str(Path(__file__).resolve().parents[1] / 'app.py')


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.data = load_data()

    def test_pair_order_and_case(self):
        meds, unknown = normalize(parse_names(' ASPIRIN \nWarfarin\naspirin'), self.data)
        records, uncovered = retrieve(meds, self.data)
        self.assertEqual(unknown, [])
        self.assertEqual([r['id'] for r in records], ['E001'])
        self.assertEqual(uncovered, [])

    def test_partial_coverage(self):
        meds, _ = normalize(parse_names('warfarin\naspirin\nlisinopril'), self.data)
        records, uncovered = retrieve(meds, self.data)
        self.assertEqual(len(records), 1)
        self.assertEqual(set(uncovered), {'warfarin + lisinopril', 'aspirin + lisinopril'})

    def test_unknown_and_dose_not_guessed(self):
        meds, unknown = normalize(parse_names('warfarin 5mg\nasprin'), self.data)
        self.assertEqual(meds, [])
        self.assertEqual(unknown, ['warfarin 5mg', 'asprin'])

    def test_tfidf_relevance_and_no_overlap(self):
        scores = tfidf_scores('aspirin', ['aspirin bleeding', 'ibuprofen bleeding'])
        self.assertGreater(scores[0], scores[1])
        self.assertEqual(tfidf_scores('unknown', ['aspirin']), [0.0])
        self.assertEqual(tfidf_scores('aspirin', []), [])

    def test_list_size(self):
        for text in ['', 'aspirin', '\n'.join(str(i) for i in range(7))]:
            with self.assertRaises(ValueError):
                parse_names(text)


class ProviderTests(unittest.TestCase):
    def setUp(self):
        data = load_data()
        meds, _ = normalize(['warfarin', 'aspirin'], data)
        self.records, _ = retrieve(meds, data)
        self.payload = {'findings': [{'evidence_id': 'E001', 'explanation': 'The label reports increased bleeding risk.'}]}

    def test_demo_label(self):
        result = DemoProvider().explain(self.records)
        self.assertFalse(result.generated)
        self.assertEqual(result.findings[0]['evidence_id'], 'E001')

    def test_invalid_citations(self):
        bad = [None, {'findings': []}, {'findings': [{'evidence_id': 'E999', 'explanation': 'x'}]},
               {'findings': self.payload['findings'] * 2},
               {'findings': [{'evidence_id': 'E001', 'explanation': 'https://invented.example'}]}]
        for payload in bad:
            with self.assertRaises(ProviderError):
                validate(payload, self.records)

    @patch('services.providers.requests.post')
    def test_compatible_contract(self, post):
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(self.payload)}}]}
        self.assertTrue(JsonProvider('compatible', 'https://provider.example/v1', 'model', 'private').explain(self.records).generated)
        self.assertEqual(post.call_args.args[0], 'https://provider.example/v1/chat/completions')
        self.assertFalse(post.call_args.kwargs['allow_redirects'])
        self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer private')

    @patch('services.providers.requests.post')
    def test_ollama_contract(self, post):
        post.return_value = Mock(status_code=200)
        post.return_value.json.return_value = {'done': True, 'done_reason': 'stop', 'message': {'content': json.dumps(self.payload)}}
        self.assertTrue(JsonProvider('ollama', 'http://localhost:11434', 'local').explain(self.records).generated)
        self.assertEqual(post.call_args.args[0], 'http://localhost:11434/api/chat')

    @patch('services.providers.requests.post')
    def test_provider_failures(self, post):
        provider = JsonProvider('compatible', 'https://provider.example/v1', 'model')
        post.side_effect = requests.Timeout('not exposed')
        with self.assertRaises(ProviderError):
            provider.explain(self.records)
        post.side_effect = None
        post.return_value = Mock(status_code=200)
        for payload in [None, {}, {'choices': [{'finish_reason': 'length'}]}]:
            post.return_value.json.return_value = payload
            with self.assertRaises(ProviderError):
                provider.explain(self.records)

    def test_endpoint_validation(self):
        for url in ['http://provider.example/v1', 'https://key@provider.example/v1', 'https://provider.example/v1?key=secret']:
            with self.assertRaises(ProviderError):
                JsonProvider('compatible', url, 'model')


@patch.dict('os.environ', {'AI_PROVIDER': 'demo'})
class InterfaceTests(unittest.TestCase):
    def start(self, example=0):
        app = AppTest.from_file(APP_PATH).run()
        app.button[example].click().run()
        app.button[2].click().run()
        return app

    def test_supported_and_invalidation(self):
        app = self.start()
        self.assertFalse(app.exception)
        self.assertTrue(app.button[3].disabled)
        app.checkbox[0].check().run()
        app.button[3].click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state['result']['records'][0]['id'], 'E001')
        self.assertFalse(app.session_state['result']['explanation'].generated)
        app.text_area[0].set_value('aspirin\nlisinopril').run()
        self.assertNotIn('result', app.session_state)
        self.assertNotIn('medications', app.session_state)

    def test_uncovered_pair(self):
        app = self.start(example=1)
        app.checkbox[0].check().run()
        app.button[3].click().run()
        self.assertFalse(app.exception)
        self.assertEqual(app.session_state['result']['records'], [])
        self.assertIsNone(app.session_state['result']['explanation'])
        self.assertTrue(any('Missing evidence does not establish safety' in w.value for w in app.warning))

    def test_unknown_and_reset(self):
        app = AppTest.from_file(APP_PATH).run()
        app.text_area[0].set_value('warfarin\nasprin').run()
        app.button[2].click().run()
        self.assertFalse(app.exception)
        self.assertTrue(app.checkbox[0].disabled)
        self.assertTrue(app.button[3].disabled)
        app.button[-1].click().run()
        self.assertEqual(app.text_area[0].value, '')
        self.assertNotIn('medications', app.session_state)


if __name__ == '__main__':
    unittest.main()
