"""Publish both verified installers under one version, retaining the Windows download alias."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


ASSETS = ('Spine-Contour-Windows.exe', 'Spine-Contour-macOS-arm64.dmg')


def release_context(env, version):
    repo = env.get('GITHUB_REPOSITORY')
    if repo not in ('Feches/Spine-Contour', 'mjayasur/Spine-Contour'):
        raise ValueError('Release publishing is limited to the project repositories.')
    if env.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Only main may publish a numbered release.')
    sha = env.get('GITHUB_SHA', '')
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('A full source commit is required.')
    if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', version):
        raise ValueError('A stable major.minor.patch version is required.')
    return repo, sha, f'v{version}'


def assert_same_source(actual, expected):
    if actual != expected:
        raise ValueError('This version already belongs to another commit. Bump the application version.')


def checksum_manifest(directory):
    lines = []
    for name in ASSETS:
        with (directory / name).open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        lines.append(f'{digest}  {name}\n')
    return ''.join(lines)


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)


def publish(root=Path('.'), env=None):
    env = os.environ if env is None else env
    version = json.loads((root / 'package.json').read_text())['version']
    repo, sha, tag = release_context(env, version)
    dist = root / 'dist'
    manifest = checksum_manifest(dist)  # Require both installers before any remote writes.
    notes = (root / 'docs/releases' / f'{version}.md').read_text()
    notes += f'\n\nSource: [{sha}](https://github.com/{repo}/commit/{sha}) on `main`.\n'
    pages = json.loads(gh('api', f'repos/{repo}/releases', '--paginate', '--slurp'))
    releases = {release['tag_name']: release for page in pages for release in page}
    release = releases.get(tag)
    refs = json.loads(gh('api', f'repos/{repo}/git/matching-refs/tags/{tag}'))
    tag_exists = any(ref['ref'] == f'refs/tags/{tag}' for ref in refs)
    if tag_exists or release:
        # Resolve annotated tags too; an unpublished draft may not have a tag yet.
        ref = tag if tag_exists else release['target_commitish']
        actual = json.loads(gh('api', f'repos/{repo}/commits/{ref}'))['sha']
        assert_same_source(actual, sha)

    with tempfile.TemporaryDirectory(prefix='spine-release-') as temporary:
        temp = Path(temporary)
        body = temp / 'release-notes.md'
        body.write_text(notes, encoding='utf-8')
        checksums = temp / 'SHA256SUMS'
        title = f'Spine Contour {tag}'
        if release and not release['draft']:
            # Never replace numbered-release binaries with a fresh rebuild. Recover
            # the original assets so a retry can finish the moving download alias.
            for name in (*ASSETS, 'SHA256SUMS'):
                gh('release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', str(temp))
            if checksum_manifest(temp) != (temp / 'SHA256SUMS').read_text():
                raise ValueError('The published installer checksums do not match.')
            windows_asset = temp / ASSETS[0]
        else:
            checksums.write_text(manifest, encoding='utf-8')
            files = [str(dist / name) for name in ASSETS] + [str(checksums)]
            if not release:
                gh('release', 'create', tag, '--repo', repo, '--target', sha,
                   '--title', title, '--notes-file', str(body), '--draft')
            gh('release', 'upload', tag, *files, '--repo', repo, '--clobber')
            gh('release', 'edit', tag, '--repo', repo, '--title', title,
               '--notes-file', str(body), '--draft=false', '--prerelease=false', '--latest')
            windows_asset = dist / ASSETS[0]

        alias = 'latest-windows'
        alias_notes = f'Windows installer from [{tag}](https://github.com/{repo}/releases/tag/{tag}). Source commit: {sha}.'
        if alias in releases:
            gh('release', 'upload', alias, str(windows_asset), '--repo', repo, '--clobber')
            gh('release', 'edit', alias, '--repo', repo, '--title', f'Current Windows build ({tag})',
               '--notes', alias_notes, '--latest=false')
            gh('api', '--method', 'PATCH', f'repos/{repo}/git/refs/tags/{alias}',
               '-f', f'sha={sha}', '-F', 'force=true', '--silent')
        else:
            gh('release', 'create', alias, str(windows_asset), '--repo', repo, '--target', sha,
               '--title', f'Current Windows build ({tag})', '--notes', alias_notes, '--latest=false')
    print(f'Published {tag} with both installers and SHA256SUMS; numbered tags are never moved.')


if __name__ == '__main__':
    publish()
