# Next session: execute the bundle export and import plan

Paste the block below as the first message of a new Claude Code session opened on this worktree:
`C:\Users\codyj\Spine Contour Desktop\Spine-Contour\.claude\worktrees\annotation-round-2`. Everything the session
needs is in the files it names; nothing here depends on the previous conversation.

---

Use superpowers skills. Execute `docs/superpowers/plans/2026-10-15-annotation-bundle-export-import.md` with
`superpowers:subagent-driven-development`, task by task, on this worktree and branch (`worktree-annotation-round-2`,
off `origin/main` @ `06c8cdd`, v1.1.1). Read the plan whole first, then its spec
`docs/superpowers/specs/2026-10-15-annotation-bundle-export-import-design.md` (decisions B1–B9) and `CLAUDE.md`'s
first paragraph (the editor round already built on this branch, released as 1.2.0 but unpublished).

Models: use the lowest-capability model that can do each task. Implementers on Sonnet for Tasks 1, 2, 4 and 8; on
Opus for Tasks 3, 5, 6 and 7; task reviewers on Opus, scoped re-reviews of small fixes on Sonnet; the final
whole-branch review on Opus. Never spawn the top model.

Rules that bind every task:

- Work only in this worktree; never touch the main checkout at `C:\Users\codyj\Spine Contour Desktop\Spine-Contour`
  (it holds unrelated uncommitted work). `node_modules` here is a junction and works; `backend/onnx/` holds hard-linked
  model graphs (gitignored).
- Never push, never open a PR, never run `git stash`, never run git outside this worktree. The branch is already on
  `origin` as a backup; it is pushed again only after the owner says "gate passed".
- Every commit message ends with the trailer line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Never view, Read or take a screenshot that could show a real radiograph; verify the app by DOM, store and file reads
  on scratch `%TEMP%` profiles with synthetic films (`tools/smoke/README.md`). Launch from source with
  `SPINE_CONTOUR_USER_DATA` at a scratch folder (never the real `%APPDATA%\spine-contour`),
  `SPINE_CONTOUR_PYTHON=C:\Users\codyj\Spine Contour Desktop\Spine-Contour\.venv\Scripts\python.exe` and
  `TESSERACT_CMD=C:\Users\codyj\AppData\Local\Programs\Spine-Contour\resources\backend-runtime\_internal\ocr\tesseract.exe`.
- `node --test test/*.test.js` (the glob form) is the unit suite: 1024/1024 at the start, 8 known `persistence:`
  warnings.
- The editor round's SDD workspace `.superpowers/sdd/2026-10-15-annotation-editor-round-2/` belongs to another plan:
  leave it; start this plan's own ledger.
- The release number stays 1.2.0 (plan ruling PB10): Task 8 extends `docs/releases/1.2.0.md` and the CHANGELOG's
  1.2.0 entry; no new bump.

Stop at the plan's Task 9, the owner's human gate, with a short list of what to try. On "gate passed", push the
branch to `origin` (`git push origin worktree-annotation-round-2`) and hand over the PR link
`https://github.com/Feches/Spine-Contour/compare/main...worktree-annotation-round-2?expand=1` with a body covering
both rounds (the previous session's draft is in
`.superpowers/sdd/2026-10-15-annotation-editor-round-2/pr-body.md`; add the bundle). The owner opens and merges the
PR with Create a merge commit, which publishes v1.2.0. End with the list of every ruling you made, each with what it
costs if wrong.
