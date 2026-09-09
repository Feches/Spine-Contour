"""Publish a verified build from the preview branch, with its version and source commit."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def release_context(env, platform):
    if env.get('GITHUB_REPOSITORY') not in ('Feches/Spine-Contour', 'mjayasur/Spine-Contour'):
        raise ValueError('Preview publishing is limited to the project repositories.')
    if env.get('GITHUB_REF') != 'refs/heads/ui-redesign-cw':
        raise ValueError('Only ui-redesign-cw may publish a preview release.')
    sha = env.get('GITHUB_SHA', '')
    if not re.fullmatch(r'[a-f0-9]{40}', sha):
        raise ValueError('A full source commit is required.')
    if platform not in ('windows', 'macos'):
        raise ValueError('Unknown preview platform.')
    return env['GITHUB_REPOSITORY'], sha, f'preview-{platform}'


def publish(platform):
    repo, sha, tag = release_context(os.environ, platform)
    version = json.loads(Path('package.json').read_text())['version']
    name = 'Spine-Contour-Preview-Windows.exe' if platform == 'windows' else 'Spine-Contour-Preview-macOS-arm64.dmg'
    asset = Path('dist') / name
    if not asset.is_file():
        raise FileNotFoundError(asset)
    notes = Path('docs/releases') / f'{version}.md'
    body = notes.read_text() + f'\n\nBuilt from [{sha}](https://github.com/{repo}/commit/{sha}) on `ui-redesign-cw`.\n'
    notes_file = Path('build/preview-release-notes.md')
    notes_file.parent.mkdir(parents=True, exist_ok=True)
    notes_file.write_text(body, encoding='utf-8')
    title = f'Spine Contour v{version} preview ({platform})'

    def gh(*args):
        return subprocess.run(['gh', *args], check=True)

    # Listing succeeds or fails explicitly; a permission/network error must not be
    # mistaken for an absent release and followed by an attempted create.
    releases = json.loads(subprocess.check_output(
        ['gh', 'api', f'repos/{repo}/releases', '--paginate', '--slurp'], text=True))
    exists = any(release['tag_name'] == tag for page in releases for release in page)
    if exists:
        gh('release', 'upload', tag, str(asset), '--repo', repo, '--clobber')
        gh('release', 'edit', tag, '--repo', repo, '--title', title, '--notes-file', str(notes_file), '--prerelease')
        # Preview tags are moving aliases. Keep the tag's source consistent with
        # the replaced installer instead of leaving it on the first-ever build.
        gh('api', '--method', 'PATCH', f'repos/{repo}/git/refs/tags/{tag}',
           '-f', f'sha={sha}', '-F', 'force=true', '--silent')
    else:
        gh('release', 'create', tag, str(asset), '--repo', repo, '--target', sha,
           '--title', title, '--notes-file', str(notes_file), '--prerelease', '--latest=false')


if __name__ == '__main__':
    publish(sys.argv[1])
