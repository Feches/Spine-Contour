"""Assemble privately recorded scenario baselines and freeze the approved regression policy.

Explicit maintainer operation. Inputs and assembled predictions remain private;
only hashes and the approved regression tolerances enter the public policy.
"""
import argparse
import json
from pathlib import Path
import zipfile

from gate import read_json, require, sha256, validate


def finalize(policy_path, archive, fragments, destination):
    policy = read_json(policy_path)
    require(sha256(archive) == policy['dataset_sha256'], 'Reference archive mismatch')
    with zipfile.ZipFile(archive) as bundle:
        manifest = json.loads(bundle.read('manifest.json'))
    validate({**policy, 'approved': True}, manifest)
    baseline_entries, assembled = {}, {}
    destination.mkdir(parents=True, exist_ok=True)
    for platform in ('darwin', 'windows'):
        files = sorted(fragments.rglob(platform + '.json'))
        require(files, f'No {platform} baseline fragments')
        predictions = {}
        for path in files:
            fragment = read_json(path)
            require(fragment['platform'] == platform and fragment['commit'] == policy['baseline_commit']
                    and fragment['dataset_sha256'] == policy['dataset_sha256'], 'Baseline provenance mismatch')
            require(not (predictions.keys() & fragment['predictions'].keys()), 'Duplicate baseline cases')
            predictions.update(fragment['predictions'])
        baseline = {'schema_version': 1, 'platform': platform, 'commit': policy['baseline_commit'],
                    'dataset_sha256': policy['dataset_sha256'], 'predictions': predictions}
        validate({**policy, 'approved': True, 'platform': platform}, manifest, baseline)
        for key, rule in policy['metrics'].items():
            cases = [case for case in manifest['cases'] if key in case['reference']]
            values = [predictions[case['id']][key] for case in cases]
            count = sum(value is not None for value in values)
            require(count > 0, f'{key}/{platform}: no measurable baseline references; cannot approve an accuracy claim')
        assembled[platform] = baseline
    require(all(not (destination / f'{platform}.json').exists() for platform in assembled),
            'Refusing to overwrite assembled baselines')
    for platform, baseline in assembled.items():
        output = destination / f'{platform}.json'
        output.write_text(json.dumps(baseline, indent=2, allow_nan=False) + '\n')
        baseline_entries[platform] = {'path': output.name, 'sha256': sha256(output)}
    policy.update(baselines=baseline_entries, approved=True)
    policy_path.write_text(json.dumps(policy, indent=2, allow_nan=False) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--policy', type=Path, required=True)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--fragments', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    finalize(args.policy, args.archive, args.fragments, args.destination)
