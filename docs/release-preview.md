# Combined v0.2.0 preview release

The replacement PR combines calibration/disc-height PR #2 and accuracy PR #3 with
their original commits retained. Its base is `Feches/Spine-Contour:ui-redesign-cw`,
the branch that actually builds the preview installers. Cody's latest studies tip
`cbe5adb` is included. Merge using **Create a merge commit**.

Merging the replacement PR triggers the existing Windows and macOS preview workflows
on the merged commit. Both run renderer/backend tests, bundle the backend and OCR,
verify bundled OCR, build the desktop installer, and inspect its actual `app.asar`:
the packaged version and renderer/main source must match the checkout exactly.
Successful builds update that repository's `preview-windows` and `preview-macos`
releases with v0.2.0 notes, installers and matching source tags.

For a build before merge, manually run either preview workflow on
`codex/combined-next-release` with **publish unchecked**. The installable files are
available as workflow artifacts. A feature-branch build cannot publish the shared
preview release, even if publish is selected. Preview publication is limited to
`ui-redesign-cw`; builds on different branches use separate concurrency groups.

The authenticated upstream account can build review artifacts in
`mjayasur/Spine-Contour`. Cody must merge the PR in his fork to publish that fork's
next preview. Production `main` and `latest-windows` are unchanged.

See [release notes](releases/0.2.0.md), [disc-height definitions](disc-heights.md),
[calibration](batch-calibration.md), and [accuracy safeguards](accuracy-safeguards.md).
