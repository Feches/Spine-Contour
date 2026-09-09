import json
from pathlib import Path

import pytest

from tools.packaging import publish_release as release


ENV = {'GITHUB_REPOSITORY': 'Feches/Spine-Contour',
       'GITHUB_REF': 'refs/heads/main', 'GITHUB_SHA': 'a' * 40}


@pytest.mark.parametrize('changes,version', [
    ({'GITHUB_REF': 'refs/heads/ui-redesign-cw'}, '1.0.0'),
    ({'GITHUB_REF': 'refs/pull/5/merge'}, '1.0.0'),
    ({'GITHUB_REF': 'refs/heads/codex/release-v1.0.0-main'}, '1.0.0'),
    ({'GITHUB_REPOSITORY': 'other/repo'}, '1.0.0'),
    ({'GITHUB_SHA': 'abc123'}, '1.0.0'),
    ({}, '1.0.0-preview'),
    ({}, '01.2.0'),
])
def test_numbered_release_rejects_unapproved_context(changes, version):
    with pytest.raises(ValueError):
        release.release_context({**ENV, **changes}, version)


def test_numbered_release_accepts_main_on_either_project_repository():
    for repo in ('Feches/Spine-Contour', 'mjayasur/Spine-Contour'):
        assert release.release_context({**ENV, 'GITHUB_REPOSITORY': repo}, '1.0.0') == (
            repo, ENV['GITHUB_SHA'], 'v1.0.0')


@pytest.fixture
def distribution(tmp_path):
    (tmp_path / 'package.json').write_text('{"version":"1.0.0"}')
    (tmp_path / 'docs/releases').mkdir(parents=True)
    (tmp_path / 'docs/releases/1.0.0.md').write_text('Release notes')
    (tmp_path / 'dist').mkdir()
    for name in release.ASSETS:
        (tmp_path / 'dist' / name).write_bytes(b'new build ' + name.encode())
    return tmp_path


class GitHub:
    def __init__(self, root, existing=False, draft=False, sha=ENV['GITHUB_SHA'], corrupt=False):
        self.root, self.existing, self.draft, self.sha, self.corrupt = root, existing, draft, sha, corrupt
        self.calls, self.uploaded = [], []
        self.original = root / 'original'
        self.original.mkdir()
        for name in release.ASSETS:
            (self.original / name).write_bytes(b'original published ' + name.encode())
        manifest = release.checksum_manifest(self.original)
        (self.original / 'SHA256SUMS').write_text('corrupt' if corrupt else manifest)

    def __call__(self, *args):
        self.calls.append(args)
        if args[0] == 'api':
            endpoint = args[1]
            if endpoint.endswith('/releases'):
                return json.dumps([[{'tag_name': 'v1.0.0', 'draft': self.draft,
                                      'target_commitish': self.sha}]] if self.existing else [[]])
            if '/matching-refs/' in endpoint:
                return json.dumps([{'ref': 'refs/tags/v1.0.0'}] if self.existing else [])
            if '/commits/' in endpoint:
                return json.dumps({'sha': self.sha})
        if args[:2] == ('release', 'download'):
            name = args[args.index('--pattern') + 1]
            target = Path(args[args.index('--dir') + 1]) / name
            assert not target.exists(), 'gh download refuses to overwrite an existing file'
            target.write_bytes((self.original / name).read_bytes())
        if args[:2] == ('release', 'create') and args[2] == 'latest-windows':
            self.uploaded.append(Path(args[3]).read_bytes())
        return ''


def test_missing_installer_stops_before_any_remote_call(distribution, monkeypatch):
    (distribution / 'dist' / release.ASSETS[1]).unlink()
    calls = []
    monkeypatch.setattr(release, 'gh', lambda *args: calls.append(args))
    with pytest.raises(FileNotFoundError):
        release.publish(distribution, ENV)
    assert calls == []


def test_version_cannot_be_reused_for_another_commit(distribution, monkeypatch):
    remote = GitHub(distribution, existing=True, sha='b' * 40)
    monkeypatch.setattr(release, 'gh', remote)
    with pytest.raises(ValueError, match='Bump the application version'):
        release.publish(distribution, ENV)
    assert all(call[0] == 'api' for call in remote.calls)


def test_both_assets_upload_to_a_draft_before_publication(distribution, monkeypatch):
    remote = GitHub(distribution)
    monkeypatch.setattr(release, 'gh', remote)
    release.publish(distribution, ENV)
    mutations = [call for call in remote.calls if call[0] == 'release']
    assert mutations[0][:3] == ('release', 'create', 'v1.0.0')
    assert '--draft' in mutations[0]
    assert mutations[1][:3] == ('release', 'upload', 'v1.0.0')
    assert [Path(value).name for value in mutations[1][3:6]] == [*release.ASSETS, 'SHA256SUMS']
    assert mutations[2][:3] == ('release', 'edit', 'v1.0.0')
    assert '--draft=false' in mutations[2]
    assert mutations[3][:3] == ('release', 'create', 'latest-windows')
    assert '--latest=false' in mutations[3]


def test_retry_recovers_original_published_binary_without_replacing_numbered_release(distribution, monkeypatch):
    remote = GitHub(distribution, existing=True)
    monkeypatch.setattr(release, 'gh', remote)
    release.publish(distribution, ENV)
    assert not any(call[:2] in [('release', 'upload'), ('release', 'edit')] for call in remote.calls)
    assert remote.uploaded == [(remote.original / release.ASSETS[0]).read_bytes()]


def test_retry_refuses_corrupt_published_assets(distribution, monkeypatch):
    remote = GitHub(distribution, existing=True, corrupt=True)
    monkeypatch.setattr(release, 'gh', remote)
    with pytest.raises(ValueError, match='checksums'):
        release.publish(distribution, ENV)
    assert remote.uploaded == []
