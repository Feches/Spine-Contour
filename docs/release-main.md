# Promoting v1.0.0 to main

The release branch is `codex/release-v1.0.0-main` in `Feches/Spine-Contour`, based on
Cody's merged `ui-redesign-cw` at `594e63f`. Its PR targets that fork's `main`.
It retains all 305 incoming commits; use **Create a merge commit** to retain the
reviewed history. The source app is v1.0.0, advancing main's v0.1.0.

## Build and publication

`.github/workflows/windows.yml` now builds Windows x64 and macOS arm64. Each build
runs backend and renderer tests, bundles/checks OCR, checks both packaging allowlists,
and verifies the actual packaged source, version and product executable. Both must
succeed before the publication job starts.

PRs to main and manual runs build installable artifacts. Manual `publish` defaults to
false. Publication requires `main` in a project repository and either a push or an
explicit manual `publish` selection. Feature branches and PRs cannot publish.

The publisher reads `package.json` and `docs/releases/<version>.md`, uploads both
installers plus `SHA256SUMS` to a draft, then publishes `v<version>` as the latest
release. A numbered tag already pointing at another commit is refused. Published
numbered binaries are never replaced. A same-commit retry uses the original published
binaries/checksums to finish updating the moving `latest-windows` compatibility alias.
Only that alias is moved; preview tags are managed by their existing workflows.

## Future versions

For a new release after v1.0.0, update `package.json`, `renderer/data/version.js`,
`CHANGELOG.md` and `docs/releases/<version>.md` together. Use a patch increment for
compatible fixes, a minor increment for compatible functionality, and a major increment
for breaking changes. The version test checks the app label against the package. A main commit
cannot replace a published version: bump the version for the next publication.

The production and preview libraries remain separate. No automatic preview-library
migration or store-format change is introduced by this PR. The macOS build remains
unsigned. Test results are software checks, not clinical validation.
