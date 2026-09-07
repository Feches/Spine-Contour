# Calibration verification (2026-09-07)

The change is on `ui-redesign-cw`, using its existing sidebar, theme tokens, workspace scanner, API wrappers and preview-build identities.

Verified locally:

- 89 Python backend tests, including all model checkpoint tests.
- 277 existing and new renderer tests using Node's built-in test runner.
- The running Electron app, using the user's three screenshots converted to PNG: individual detection; manual numeric correction; two-point distances; folder search past a blank image; learning the corrected reference color; processing all files with separate scales; and leaving/re-entering the calibration screen without losing the reference. No page errors were reported.
- The macOS OCR runtime was copied with its transitive dylibs, rewritten to relative loader paths, signed locally, and successfully extracted 41.5 mm from a PNG outside the normal Homebrew executable location.

Repeat the desktop checks:

1. Open Image calibration and choose a PNG with a ruler. Check both green endpoints and the label value.
2. Change the value: the previous scale must become unavailable until Apply reference.
3. Drag an endpoint and apply. Choose Measure distance, place two yellow points, then drag one; the displayed distance must follow the scale.
4. Choose a folder containing a blank film and several annotated films. The search must skip the blank and find a reference.
5. Correct and apply the reference; learn its appearance; process the folder. A corrected scale must not be copied into other images.
6. Select another film and verify its own label and endpoints. Visit Studies and return; the session should survive navigation.
7. Use workspace folder after selecting a folder in Workspace. Export calibration JSON and inspect statuses and coordinates.
8. Test light and dark themes. Try manual calibration with OCR unavailable. Check the installed preview separately on its target OS.

The Windows and macOS workflows test the packaged backend's actual OCR endpoint before publishing previews. Local source checks do not replace installation testing. Session calibration is exported separately and is not yet persisted in study records.
