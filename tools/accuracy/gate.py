"""Frozen-reference measurement accuracy gate (standard library only).

The manifest contains reviewed measurements, never model predictions as truth.
Missing output receives a fixed error penalty and is counted in every denominator.
"""
from __future__ import annotations
import hashlib
import json
import math
from pathlib import Path


class GateError(ValueError):
    pass


def read_json(path):
    def invalid(value):
        raise GateError(f'Non-finite JSON constant: {value}')
    return json.loads(Path(path).read_text(), parse_constant=invalid)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def require(condition, message):
    if not condition:
        raise GateError(message)


def measurement(output, key):
    value = output
    for part in key.split('.'):
        value = value.get(part) if isinstance(value, dict) else None
    return value if finite(value) else None


def validate(config, manifest, baseline=None):
    require(config.get('schema_version') == 1, 'Unsupported accuracy policy version')
    require(config.get('approved') is True, 'Accuracy gate is not configured: approve a reference dataset, frozen baseline and tolerances before releasing')
    require(config.get('metrics'), 'No accuracy metrics configured')
    for name, rule in config['metrics'].items():
        require(isinstance(name, str) and name, 'Invalid metric name')
        require(rule.get('unit') in ('degrees', 'pixels', 'mm'), f'{name}: explicit unit required')
        for field in ('missing_error', 'max_mae_increase', 'max_case_error_increase'):
            require(finite(rule.get(field)) and rule[field] >= 0, f'{name}: invalid {field}')
        require(rule['missing_error'] > 0, f'{name}: missing penalty must be positive')
        require(type(rule.get('reference_count')) is int and rule['reference_count'] > 0, f'{name}: reference count required')
    require(manifest.get('schema_version') == 1 and manifest.get('dataset_id') == config.get('dataset_id'), 'Dataset identity/version mismatch')
    require(manifest.get('reference_review') and manifest.get('training_exclusion_review'), 'Reference review and training-overlap audit must be documented')
    cases = manifest.get('cases')
    require(isinstance(cases, list) and len(cases) == config.get('case_count') and len(cases) > 0, 'Benchmark case count changed or empty')
    ids = set()
    counts = dict.fromkeys(config['metrics'], 0)
    for case in cases:
        cid = case.get('id')
        require(isinstance(cid, str) and cid and cid not in ids, 'Case IDs must be unique and nonempty')
        ids.add(cid)
        require(case.get('reviewed') is True and case.get('reference_source'), f'{cid}: reviewed reference provenance required')
        reference = case.get('reference')
        require(isinstance(reference, dict) and reference, f'{cid}: no references')
        for key, value in reference.items():
            require(key in counts and finite(value), f'{cid}: unknown or non-finite reference {key}')
            counts[key] += 1
        require(isinstance(case.get('request'), dict) and case['request'].get('processor', 'cpu') == 'cpu', f'{cid}: fixed CPU request required')
    for key, count in counts.items():
        require(count == config['metrics'][key]['reference_count'], f'{key}: reference coverage changed')
    if baseline is not None:
        require(baseline.get('schema_version') == 1 and baseline.get('dataset_sha256') == config.get('dataset_sha256'), 'Baseline dataset mismatch')
        require(baseline.get('commit') == config.get('baseline_commit') and baseline.get('platform') == config.get('platform'), 'Baseline commit/platform mismatch')
        require(isinstance(baseline.get('predictions'), dict) and set(baseline['predictions']) == ids, 'Baseline case set differs from benchmark')
        for case in cases:
            values = baseline['predictions'][case['id']]
            require(isinstance(values, dict) and set(values) == set(case['reference']), 'Baseline metric set differs from reference')
            require(all(v is None or finite(v) for v in values.values()), 'Invalid baseline predictions')
    return cases


def compare(config, manifest, baseline, predictions):
    cases = validate(config, manifest, baseline)
    require(set(predictions) == {case['id'] for case in cases}, 'Candidate case set differs from benchmark')
    failures, metrics, rows = [], {}, []
    for key, rule in config['metrics'].items():
        errors, previous, comparable, comparable_before, available, before_available = [], [], [], [], 0, 0
        for case in cases:
            if key not in case['reference']:
                continue
            cid, truth = case['id'], case['reference'][key]
            current = predictions[cid].get(key)
            before = baseline['predictions'][cid][key]
            require(current is None or finite(current), f'{cid}: invalid prediction')
            err = abs(current - truth) if current is not None else rule['missing_error']
            old = abs(before - truth) if before is not None else rule['missing_error']
            errors.append(err); previous.append(old)
            if before is not None:
                comparable.append(err); comparable_before.append(old)
            available += current is not None; before_available += before is not None
            rows.append({'case_id': cid, 'metric': key, 'available': current is not None, 'error': err, 'baseline_error': old})
            if before is not None and current is None:
                failures.append(f'{cid}/{key}: previously available measurement is missing')
            if err - old > rule['max_case_error_increase'] + 1e-9:
                failures.append(f'{cid}/{key}: individual error regression')
        mae, old_mae = sum(errors) / len(errors), sum(previous) / len(previous)
        require(comparable, f'{key}: baseline has no measurable references')
        paired_mae, paired_before = sum(comparable) / len(comparable), sum(comparable_before) / len(comparable_before)
        metrics[key] = {'count': len(errors), 'available': available, 'baseline_available': before_available,
                        'paired_mae': paired_mae, 'baseline_paired_mae': paired_before, 'paired_count': len(comparable),
                        'mae_with_missing_penalty': mae, 'baseline_mae_with_missing_penalty': old_mae, 'unit': rule['unit']}
        if paired_mae - paired_before > rule['max_mae_increase'] + 1e-9:
            failures.append(f'{key}: mean error regression')
    return {'schema_version': 1, 'passed': not failures, 'failures': failures, 'metrics': metrics, 'cases': rows}
