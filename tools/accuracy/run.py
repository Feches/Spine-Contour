"""Run the release executable's /predict endpoint against a pinned benchmark."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import zipfile

from gate import GateError, compare, measurement, read_json, require, sha256, validate

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def contained(root, relative):
    require(isinstance(relative, str) and relative, 'Missing relative file path')
    result = (root / relative).resolve()
    require(result.is_relative_to(root.resolve()) and result != root.resolve(), 'File escapes benchmark directory')
    return result


def prepare(config, destination, archive=None):
    require(config.get('approved') is True, 'Accuracy gate is not configured; approve policy.json before publishing')
    require(isinstance(config.get('dataset_sha256'), str) and len(config['dataset_sha256']) == 64, 'Pinned dataset SHA-256 required')
    destination.mkdir(parents=True, exist_ok=True)
    require(archive is not None and archive.is_file(), 'Private benchmark archive unavailable')
    require(sha256(archive) == config['dataset_sha256'], 'Benchmark archive hash mismatch')
    with zipfile.ZipFile(archive) as bundle:
        require(sum(item.file_size for item in bundle.infolist()) <= 4 * 1024**3, 'Expanded benchmark exceeds 4 GiB')
        names = set()
        for item in bundle.infolist():
            require(item.filename not in names, 'Duplicate archive member')
            names.add(item.filename)
            contained(destination, item.filename)
            require((item.external_attr >> 16) & 0o170000 != 0o120000, 'Archive symlinks are not allowed')
        bundle.extractall(destination)
    manifest = read_json(destination / 'manifest.json')
    validate(config, manifest)
    for case in manifest['cases']:
        image = contained(destination, case['image'])
        require(image.is_file() and sha256(image) == case.get('image_sha256'), 'Benchmark image missing or changed')
    return manifest


def predict(base_url, case, root, audit_dir=None):
    import httpx
    params = dict(case['request'])
    params['processor'] = 'cpu'
    params['cpu_threads'] = 2
    params = {key: json.dumps(value) if isinstance(value, (dict, bool)) else str(value) for key, value in params.items()}
    with contained(root, case['image']).open('rb') as image:
        response = httpx.post(base_url + '/predict', data=params,
                              files={'file': ('benchmark.png', image, 'application/octet-stream')}, timeout=600)
    if response.status_code == 422:
        return {key: None for key in case['reference']}  # pipeline abstention counts as missing
    response.raise_for_status()
    result = response.json()
    if audit_dir is not None:
        import base64
        audit_dir.mkdir(parents=True, exist_ok=True)
        # This directory is explicitly private and is never enabled by public CI.
        (audit_dir / 'response.json').write_text(json.dumps({key: value for key, value in result.items() if not key.endswith('_png')}, allow_nan=False))
        (audit_dir / 'image.png').write_bytes(base64.b64decode(result['image_png']))
    return {key: measurement(result.get('measurements'), key.split('|', 1)[-1]) for key in case['reference']}


def run(config, root, manifest, platform_name, baseline_dir, baseline_output=None, audit_dir=None):
    baseline = None
    if not baseline_output:
        entry = config.get('baselines', {}).get(platform_name)
        require(isinstance(entry, dict), f'Missing approved {platform_name} baseline')
        baseline_path = contained(baseline_dir, entry['path'])
        require(sha256(baseline_path) == entry.get('sha256'), 'Frozen baseline hash mismatch')
        config = {**config, 'platform': platform_name}
        baseline = read_json(baseline_path)
        validate(config, manifest, baseline)
    executable = ROOT / 'backend-dist/spine-contour-backend' / ('spine-contour-backend.exe' if os.name == 'nt' else 'spine-contour-backend')
    require(executable.is_file(), 'Build the release backend before running the accuracy gate')
    # Isolated CI job, dedicated loopback port; never connect to an existing service.
    import socket
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    url = f'http://127.0.0.1:{port}'
    process = subprocess.Popen([str(executable), '--host', '127.0.0.1', '--port', str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        import httpx
        for _ in range(120):
            require(process.poll() is None, 'Packaged backend stopped before becoming ready')
            try:
                if httpx.get(url + '/health', timeout=2).json().get('status') == 'ok':
                    break
            except (httpx.HTTPError, ValueError):
                pass
            time.sleep(1)
        else:
            raise GateError('Packaged backend did not become ready')
        predictions, errors = {}, []
        for index, case in enumerate(manifest['cases'], 1):
            try:
                predictions[case['id']] = predict(url, case, root, audit_dir / str(index) if audit_dir and index <= 2 else None)
            except Exception:
                predictions[case['id']] = {key: None for key in case['reference']}
                errors.append(f'{case["id"]}: inference failed')
            print(f'Accuracy case {index}/{len(manifest["cases"])} complete', flush=True)
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        if baseline_output:
            require(not errors, 'Cannot record a baseline with inference failures')
            require(commit == config['baseline_commit'], 'Baseline must be recorded at the approved reference commit')
            require(not baseline_output.exists(), 'Refusing to overwrite a frozen baseline')
            baseline_output.parent.mkdir(parents=True, exist_ok=True)
            baseline_output.write_text(json.dumps({'schema_version': 1, 'dataset_sha256': config['dataset_sha256'],
                'commit': commit, 'platform': platform_name, 'predictions': predictions}, indent=2, allow_nan=False) + '\n')
            return {'passed': True, 'baseline_recorded': True}
        report = compare(config, manifest, baseline, predictions)
        report.update(commit=commit, platform=platform_name, dataset_sha256=config['dataset_sha256'])
        if errors:
            report['failures'].extend(errors)
            report['passed'] = False
        return report
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait()


def public_report(report):
    # Explicit allowlist: private cases, references, filenames and error text stay out.
    summary = {key: report[key] for key in ('passed', 'schema_version', 'commit', 'platform',
               'dataset_sha256', 'metrics', 'baseline_recorded') if key in report}
    failures = report.get('failures', [])
    summary['failure_count'] = len(failures)
    summary['failures'] = ['Accuracy gate failed; inspect the benchmark privately.'] if failures else []
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--policy', type=Path, default=HERE / 'policy.json')
    parser.add_argument('--archive', type=Path, required=True, help='Local SHA-256 pinned private dataset ZIP')
    parser.add_argument('--baseline-dir', type=Path, required=True, help='Private directory containing frozen platform baselines')
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'build/accuracy-data')
    parser.add_argument('--report', type=Path, default=ROOT / 'build/accuracy-report.json')
    parser.add_argument('--private-audit-dir', type=Path, help='Private baseline-only image/geometry audit; never enabled in public CI')
    parser.add_argument('--scenario', help='Record one processing scenario only (baseline recording only)')
    parser.add_argument('--record-baseline', type=Path, help='Explicit maintainer operation; never used by release CI')
    args = parser.parse_args()
    report = {'passed': False}
    try:
        require(not args.private_audit_dir or args.record_baseline, 'Private audit is baseline-only')
        config = read_json(args.policy)
        if args.record_baseline:
            config = {**config, 'approved': True}  # recording is not release approval
        manifest = prepare(config, args.data_dir, args.archive)
        if args.scenario:
            require(args.record_baseline is not None, 'Scenario filtering is only allowed while recording baselines')
            prefix = args.scenario + '|'
            cases = [case for case in manifest['cases'] if all(key.startswith(prefix) for key in case['reference'])]
            require(cases, 'Unknown baseline scenario')
            manifest = {**manifest, 'cases': cases}
            config = {**config, 'case_count': len(cases), 'metrics': {key: rule for key, rule in config['metrics'].items() if key.startswith(prefix)}}
            validate(config, manifest)
        report = run(config, args.data_dir, manifest, platform.system().lower(), args.baseline_dir, args.record_baseline, args.private_audit_dir)
    except Exception as error:
        report = {'passed': False, 'failures': ['Accuracy gate infrastructure or input error']}
    report = public_report(report)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'passed': report['passed'], 'failures': report.get('failures', []), 'metrics': report.get('metrics', {})}, indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
