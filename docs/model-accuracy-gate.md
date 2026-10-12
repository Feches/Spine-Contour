# Private measurement-accuracy release gate

The reference cohort is Cody's 50 full-spine films with 200 LL, SS, PI and PT measurements. Five end-to-end configurations each consume the original uncropped films: explicit Full Spine, Auto with landmark detection, Auto with the fast classifier, lumbar U-Net, and lumbar HRNet. Every configuration runs the production decoding, orientation/routing, crop search, inference, geometry and measurement pipeline. This creates 250 image requests and 1,000 reference comparisons per operating system. No saved crop coordinates or model proposals replace runtime detection or reference annotations.

The approved regression limits are **0.5° maximum mean-error increase per metric and processing configuration**, **2° maximum individual-case error increase**, and **no newly missing measurement**. A recovered previously missing output cannot offset degradation in the fixed baseline-measurable cohort. Crop search is the active crop method; the retired trained crop detector is not an inference path. These configurations exercise the active crop-search paths without enumerating every combination of UI settings. The cohort does not contain cervical reference measurements, so it cannot establish cervical accuracy.

Windows and macOS releases must pass a reference-measurement benchmark using the actual packaged backend's `/predict` endpoint. Each platform is compared with its frozen baseline. All requests run on CPU with two threads. This checks the image decoding, localization, inference, landmark construction, and measurement pipeline used in the release. It does not validate GPU accuracy or provide segmentation-mask Dice scores.

The gate evaluates every annotated measurement on every registered case. It checks mean-error increase on the fixed cohort measurable at baseline and individual-case error increase. Losing a previously available measurement fails. Missing outputs receive the policy's explicit error penalty, so dropping difficult cases cannot improve the score by reducing the denominator. HTTP 422 abstentions count as missing measurements. Unexpected inference/server errors fail the gate even if they also occurred in a baseline. Empty datasets, changed case counts, unknown references, changed reference counts, altered image hashes, missing baselines, and unapproved policy all fail.

## Private data and public results

Keep the dataset and baseline predictions in a separate private repository:

```
dataset.zip
baselines/darwin.json
baselines/windows.json
```

The ZIP contains `manifest.json` and the real source images. Configure the public application's Actions variables `SPINE_ACCURACY_REPOSITORY` (owner/repository) and `SPINE_ACCURACY_REF` (a full immutable commit SHA). Store a fine-grained token restricted to **Contents: read** on that private repository as `SPINE_ACCURACY_READ_TOKEN`. A GitHub App with equivalent read access can also provide the checkout token. The public repo's default `GITHUB_TOKEN` does not grant access to another private repository.

Only a push to `main`, or an explicitly publishing manual run on `main`, fetches the private data and runs the benchmark. Pull requests run the gate's arithmetic and configuration tests without access to the private repository. There is no `pull_request_target` execution of proposed code with private credentials. Review changes to the workflow and evaluator before merging: trusted main code necessarily has access to the benchmark during evaluation.

Checkout credentials are not persisted. Private data lives outside the packaged application and is removed even after failure. The only uploaded accuracy artifact is an aggregate report containing metric counts, availability, mean errors, commit and dataset hashes, and pass/fail. It omits images, annotations, case identifiers, individual errors, and baseline predictions. Backend stdout/stderr are suppressed during the benchmark. For case-level diagnosis, reproduce the evaluation in a private environment and call the scorer directly; do not publish that output.

A failing platform job prevents the existing publish job from running. A missing private repository, token, archive, policy, or baseline is a failure, never a skipped green accuracy check. PR checks alone do not establish benchmark passage; the trusted main release run does.

## Reference contract

`manifest.json` contains:

- `schema_version: 1`, a stable `dataset_id`, and nonempty `reference_review` and `training_exclusion_review` provenance descriptions.
- A fixed nonempty `cases` list. Each case has a unique opaque `id`, relative `image` path, `image_sha256`, `reviewed: true`, `reference_source`, `request`, and `reference`.
- `request` contains the production `/predict` form fields: modality, body_part, view, model choices and processing options. Use the same approved settings for baseline and candidate; the archive hash locks these settings with the references. Anatomical orientation must be provided where required.
- `reference` maps measurement keys to finite reviewed numbers. Each key has a scenario prefix separated by `|` so every processing path is gated independently. Nested outputs use dot notation, such as `auto-landmarks|LL.L1-S1`; `SS`, `PI`, `PT`, and `C2C7_COBB` are direct keys. Omitted measurements are unannotated, not zero. Units must match the corresponding policy.

Human review and training-exclusion claims must be established by the dataset owner. The schema cannot independently prove them. Accepted model proposals alone must not be presented as independent ground truth.

`tools/accuracy/policy.json` pins the archive SHA-256, dataset identifier, case count, reference count for each metric, baseline commit, and baseline file paths/hashes for `darwin` and `windows`. Each metric defines `unit`, `missing_error`, `max_mae_increase`, and `max_case_error_increase`. The baseline must have exactly the registered cases and annotated metric keys. Set `approved: true` only after the reference set, provenance, coverage, units and thresholds have been reviewed.

Record baselines explicitly on the reference commit (recording is allowed before release-policy approval), with the packaged backend built there:

```
python tools/accuracy/run.py --policy /private/approved-policy.json \
  --archive /private/dataset.zip --baseline-dir /private/baselines \
  --record-baseline /private/baselines/darwin.json
```

Repeat on Windows with `windows.json`. Baseline recording refuses inference failures, an incorrect Git commit, or overwriting an existing file. Review its actual availability and errors before adopting the baseline. Calculate each baseline file's SHA-256 and add those hashes to the policy. Release CI never records or updates a baseline. A baseline update is a reviewed change, not an automatic response to a regression.

The checked-in policy remains unapproved until frozen measured baselines on both platforms have been recorded and reviewed. The dataset, private hosting and regression tolerances have been selected; the frozen baseline hashes must be filled from those measured results before enabling publication. A repository maintainer must also configure private read access. No benchmark results or anatomical accuracy claims are implied by the gate's software tests.

After downloading the private per-scenario baseline artifacts, assemble them with `tools/accuracy/finalize_baselines.py --policy tools/accuracy/policy.json --archive /private/dataset.zip --fragments /private/downloaded-artifacts --destination /private/baselines`. It requires complete, nonduplicated coverage on both platforms, preserves the approved regression tolerances, and writes the approved public policy plus private baseline files. Review the resulting diff and private overlays before merging. Never run this command automatically on a candidate release to erase a failing regression.
