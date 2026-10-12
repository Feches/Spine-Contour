"""Tests of gate arithmetic and failure handling; these are not scan fixtures."""
import copy
import importlib.util
from pathlib import Path
import sys
import zipfile

import pytest

DIRECTORY = Path(__file__).resolve().parents[3] / 'tools/accuracy'
spec = importlib.util.spec_from_file_location('gate', DIRECTORY / 'gate.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
sys.modules['gate'] = gate
spec = importlib.util.spec_from_file_location('accuracy_runner', DIRECTORY / 'run.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def fixture():
    policy = {'schema_version': 1, 'approved': True, 'dataset_id': 'arithmetic-test', 'dataset_sha256': 'a' * 64,
              'case_count': 2, 'baseline_commit': 'b' * 40, 'platform': 'darwin',
              'metrics': {'SS': {'unit': 'degrees', 'missing_error': 90, 'max_mae_increase': .5, 'max_case_error_increase': 2, 'reference_count': 2}}}
    manifest = {'schema_version': 1, 'dataset_id': 'arithmetic-test', 'reference_review': 'test only',
                'training_exclusion_review': 'test only', 'cases': [
                  {'id': name, 'reviewed': True, 'reference_source': 'arithmetic-test', 'request': {}, 'reference': {'SS': 30}}
                  for name in ['a', 'b']]}
    baseline = {'schema_version': 1, 'dataset_sha256': 'a' * 64, 'commit': 'b' * 40,
                'platform': 'darwin', 'predictions': {'a': {'SS': 31}, 'b': {'SS': 31}}}
    return policy, manifest, baseline


def test_same_and_improved_results_pass():
    p, m, b = fixture()
    assert gate.compare(p, m, b, b['predictions'])['passed']
    assert gate.compare(p, m, b, {'a': {'SS': 30}, 'b': {'SS': 30}})['passed']


def test_mean_and_individual_regressions_fail_separately():
    p, m, b = fixture()
    report = gate.compare(p, m, b, {'a': {'SS': 32}, 'b': {'SS': 32}})
    assert any('mean error regression' in f for f in report['failures'])
    p['metrics']['SS']['max_mae_increase'] = 10
    assert any('individual' in f for f in gate.compare(p, m, b, {'a': {'SS': 34}, 'b': {'SS': 30}})['failures'])


def test_missing_output_cannot_improve_mae_by_shrinking_denominator():
    p, m, b = fixture()
    report = gate.compare(p, m, b, {'a': {'SS': None}, 'b': {'SS': 30}})
    assert not report['passed']
    assert report['metrics']['SS']['count'] == 2
    assert report['metrics']['SS']['mae_with_missing_penalty'] == 45
    assert any('previously available' in f for f in report['failures'])



@pytest.mark.parametrize('mutation', [
    lambda p, m, b: p.update(approved=False),
    lambda p, m, b: p.update(metrics={}),
    lambda p, m, b: m['cases'].pop(),
    lambda p, m, b: m['cases'][1].update(id='a'),
    lambda p, m, b: m['cases'][0].update(reviewed=False),
    lambda p, m, b: m['cases'][0]['reference'].update(SS=float('nan')),
    lambda p, m, b: b.update(platform='windows'),
    lambda p, m, b: b.update(commit='wrong'),
    lambda p, m, b: b['predictions'].pop('b'),
    lambda p, m, b: b['predictions']['a'].update(SS=float('inf')),
    lambda p, m, b: p['metrics']['SS'].update(reference_count=1),
])
def test_invalid_or_incomplete_benchmarks_fail_closed(mutation):
    p, m, b = fixture(); mutation(p, m, b)
    with pytest.raises(gate.GateError):
        gate.validate(p, m, b)


def test_zero_measurement_is_valid_and_nonfinite_output_is_missing():
    assert gate.measurement({'LL': {'L1-S1': 0}}, 'LL.L1-S1') == 0
    assert gate.measurement({'SS': float('inf')}, 'SS') is None
    assert gate.measurement({}, 'SS') is None


def test_unconfigured_gate_fails_without_downloading(tmp_path):
    with pytest.raises(gate.GateError, match='not configured'):
        runner.prepare({'approved': False}, tmp_path)


def test_path_traversal_and_hash_mismatch_fail(tmp_path):
    with pytest.raises(gate.GateError):
        runner.contained(tmp_path, '../outside')
    archive = tmp_path / 'bad.zip'
    with zipfile.ZipFile(archive, 'w') as bundle:
        bundle.writestr('../escape', 'test')
    policy = {'approved': True, 'dataset_sha256': gate.sha256(archive)}
    with pytest.raises(gate.GateError, match='escapes'):
        runner.prepare(policy, tmp_path / 'out', archive)
    policy['dataset_sha256'] = '0' * 64
    with pytest.raises(gate.GateError, match='hash mismatch'):
        runner.prepare(policy, tmp_path / 'out', archive)


def test_workflow_gates_both_platforms_and_never_exposes_dataset_to_prs():
    workflow = (DIRECTORY.parents[1] / '.github/workflows/windows.yml').read_text()
    sections = workflow.split('      - name: Gate release on reference measurement accuracy\n')[1:]
    assert len(sections) == 2
    for section in sections:
        step = section.split('\n      - name:', 1)[0]
        assert "github.ref == 'refs/heads/main'" in step
        assert "github.event_name == 'push' || inputs.publish" in step
        assert 'continue-on-error' not in step
        assert 'run: python tools/accuracy/run.py' in step
    assert 'needs: [windows, macos]' in workflow


def test_recovering_missing_output_cannot_mask_other_regressions():
    p, m, b = fixture()
    b['predictions']['b']['SS'] = None
    report = gate.compare(p, m, b, {'a': {'SS': 32}, 'b': {'SS': 30}})
    assert report['metrics']['SS']['paired_count'] == 1
    assert report['metrics']['SS']['paired_mae'] == 2
    assert any('mean error regression' in f for f in report['failures'])


def test_public_report_omits_references_case_details_paths_and_error_text():
    report = runner.public_report({'passed': False, 'metrics': {},
        'cases': [{'case_id': 'private-case', 'reference': 42}],
        'predictions': {'private-case': 41}, 'private_path': '/private/scan.png',
        'failures': ['private-case could not open /private/scan.png']})
    assert report['failure_count'] == 1
    text = str(report)
    assert 'private-case' not in text and '/private/scan.png' not in text
    assert 'predictions' not in report and 'cases' not in report


def test_processing_scenarios_cannot_cancel_each_others_regression():
    p, m, b = fixture()
    rule = copy.deepcopy(p['metrics']['SS'])
    rule['reference_count'] = 1
    p['metrics'] = {'full-spine|SS': copy.deepcopy(rule), 'auto-landmarks|SS': copy.deepcopy(rule)}
    m['cases'][0]['reference'] = {'full-spine|SS': 30}
    m['cases'][1]['reference'] = {'auto-landmarks|SS': 30}
    b['predictions'] = {'a': {'full-spine|SS': 31}, 'b': {'auto-landmarks|SS': 35}}
    result = gate.compare(p, m, b, {'a': {'full-spine|SS': 32}, 'b': {'auto-landmarks|SS': 30}})
    assert not result['passed']
    assert any('full-spine|SS: mean error regression' == reason for reason in result['failures'])


def test_predict_forwards_original_bytes_to_full_pipeline(monkeypatch, tmp_path):
    # IO contract test only: the byte string is not a scan or evidence of inference accuracy.
    import types
    path = tmp_path / 'original.bin'
    path.write_bytes(b'original byte payload')
    received = {}
    class Response:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {'measurements': {'SS': 30}}
    def post(url, data, files, timeout):
        received.update(url=url, data=data, payload=files['file'][1].read())
        return Response()
    monkeypatch.setitem(sys.modules, 'httpx', types.SimpleNamespace(post=post))
    case = {'image': 'original.bin', 'request': {'modality': 'xray', 'body_part': 'auto', 'crop_localizer': True,
        'crop_method': 'search', 'view_selection': 'classifier'}, 'reference': {'auto-classifier|SS': 29}}
    assert runner.predict('http://127.0.0.1:1234', case, tmp_path) == {'auto-classifier|SS': 30}
    assert received['url'].endswith('/predict')
    assert received['payload'] == path.read_bytes()
    assert received['data']['body_part'] == 'auto'
    assert received['data']['crop_method'] == 'search'
    assert received['data']['crop_localizer'] == 'true'


def test_finalize_requires_both_platforms_and_freezes_exact_predictions(tmp_path):
    import json
    spec = importlib.util.spec_from_file_location('accuracy_finalize', DIRECTORY / 'finalize_baselines.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    p, m, b = fixture()
    p['approved'] = False
    archive = tmp_path / 'dataset.zip'
    with zipfile.ZipFile(archive, 'w') as bundle:
        bundle.writestr('manifest.json', json.dumps(m))
    p['dataset_sha256'] = b['dataset_sha256'] = gate.sha256(archive)
    policy = tmp_path / 'policy.json'; policy.write_text(json.dumps(p))
    fragments = tmp_path / 'fragments'; fragments.mkdir()
    (fragments / 'darwin.json').write_text(json.dumps(b))
    output = tmp_path / 'baselines'
    with pytest.raises(gate.GateError, match='No windows'):
        module.finalize(policy, archive, fragments, output)
    assert not list(output.glob('*.json'))
    (fragments / 'windows.json').write_text(json.dumps({**b, 'platform': 'windows'}))
    module.finalize(policy, archive, fragments, output)
    approved = gate.read_json(policy)
    assert approved['approved'] is True
    assert approved['metrics']['SS']['max_mae_increase'] == .5
    assert approved['metrics']['SS']['max_case_error_increase'] == 2
    assert approved['baselines']['darwin']['sha256'] == gate.sha256(output / 'darwin.json')
    assert gate.read_json(output / 'windows.json')['predictions'] == b['predictions']
