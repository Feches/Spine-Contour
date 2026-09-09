import pytest

from tools.packaging.publish_preview import release_context


def context(**updates):
    return {'GITHUB_REPOSITORY': 'Feches/Spine-Contour',
            'GITHUB_REF': 'refs/heads/ui-redesign-cw', 'GITHUB_SHA': 'a' * 40, **updates}


@pytest.mark.parametrize('ref', ['refs/heads/main', 'refs/heads/codex/combined-next-release',
                                 'refs/tags/preview-windows', ''])
def test_preview_publisher_rejects_nonrelease_refs(ref):
    with pytest.raises(ValueError):
        release_context(context(GITHUB_REF=ref), 'windows')


def test_preview_publisher_rejects_unknown_repositories_platforms_and_incomplete_commits():
    for env, platform in [(context(GITHUB_REPOSITORY='someone/Spine-Contour'), 'windows'),
                          (context(GITHUB_SHA='abc123'), 'windows'), (context(), 'production')]:
        with pytest.raises(ValueError):
            release_context(env, platform)


def test_preview_publisher_can_only_choose_the_two_preview_aliases():
    for repo in ['Feches/Spine-Contour', 'mjayasur/Spine-Contour']:
        for platform in ['windows', 'macos']:
            assert release_context(context(GITHUB_REPOSITORY=repo), platform) == (
                repo, 'a' * 40, f'preview-{platform}')
