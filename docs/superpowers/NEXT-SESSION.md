# Next session — prompt

Written at the wrap of the 2026-09-12 planning session (the similar-cases spec approved by the user, the two plans written
and committed). Paste everything below the line as the first message of the next session.

---

Work on Spine Contour, an Electron + Python/FastAPI app that measures spinopelvic parameters from lateral lumbar
radiographs.
Working directory (absolute): `C:\Users\codyj\spine contour\.claude\worktrees\studies-ui-updates-bb040d`
This is a git worktree, not the primary checkout; its directory name predates this work and means nothing. Run
everything from here; do not `cd` to `C:\Users\codyj\spine contour`.
Branch: `claude/image-similarity-visualization-400922`, re-pointed at `fork/main` @ `6704586` (v1.0.7) on 2026-09-12, carrying
the spec and the two plans as docs commits and nothing else. **`fork/main` is the trunk**; upstream `origin/main` still has
the OLD single-page UI and is never a base. Nothing is pushed yet. **Nothing is mid-flight: Plan A's Task 1 has not started.**

Read in this order before doing anything:

1. `CLAUDE.md` — non-negotiables, commands, the branch/remote rules, the ONNX amendment at the top (the backend needs
   `backend/requirements-export.txt` installed in the venv and `python tools/export_onnx.py` run once before a source
   launch; `backend/onnx/` is gitignored — copy it from a sibling worktree or export; if `/health` never comes up, that
   is the first thing to check)
2. `docs/superpowers/specs/2026-09-12-similar-cases-outcomes-design.md` — the approved spec; §6 is the user's rulings
   with their costs, §16 the amendments Plan B's last task writes
3. `docs/superpowers/plans/2026-09-12-a-embeddings-backend.md` — Plan A, the backend: Global Constraints, File
   structure, Rulings, then Task 1
4. `docs/superpowers/plans/2026-09-12-b-similar-cases-renderer.md` — Plan B, the renderer: the same shape, twelve tasks
5. `docs/superpowers/HANDOFF.md` — "Where things stand", "Decisions already made", "Known traps"
6. `docs/ROADMAP.md` §8 — stages 2 to 4, which this work must not start

Resume point. **Execute Plan A with superpowers:subagent-driven-development, Task 1 first**, then Plan B. Plan A is six
tasks: the `embeddings` option (1), the export tool's `embed` kind and the five-graph verifiers (2), `backend/embedding.py`
(3), the `/predict` stage (4), `POST /embed` and `GET /embedding-model` (5), records (6). Plan B is twelve: the Settings
switch (1), the embeddings store (2), `data/similarity.js` (3), `data/outcomes.js` and the three fields (4), keep-column-name
(5), the Find similar tab (6), the Embed batch (7), comparison mode (8), Export dataset (9), the smoke suite (10), the human
gate (11), records (12). Plan B's Tasks 1–6 and 9 need nothing from Plan A at runtime; 7, 10 and 11 need Plan A in the tree.

Subagent models — the user's instruction of 2026-09-10, the lowest model that completes the task reliably: **Sonnet** for
Plan A Tasks 1, 3, 4, 5, 6 and Plan B Tasks 1, 2, 4, 5, 7, 9, 10, 12 and for their reviews; **Opus** for Plan A Task 2 (the
ONNX export of a vision transformer) and Plan B Tasks 3, 6 and 8 (the geometry and fusion, the tab, comparison mode) and
their reviews; the orchestrator runs the human gate (Plan B Task 11) itself. **Never Fable.** Set the model explicitly on
every dispatch. Every dispatch that runs pytest or a smoke suite says "foreground, capture to a file under
`tools/smoke/out/`"; a Sonnet implementer that backgrounds a suite and "waits for the Monitor" ends its turn.

Before Plan A Task 1, do the pre-flight scan the plan-execution protocol asks for: every anchor the plans quote (file paths
with line ranges, function names, the `KNOWN_FIELDS` array, `currentStudy` in `viewer.js`, `newBatch`'s deep-equal tests)
checked against the working tree at `6704586`; record the findings under each plan's `## Ledger`; make at most one reviewed
amendment per plan before starting. The one known soft spot is Plan B Task 8 (comparison mode across four components): its
behaviour is normative, its anchors are approximate, and it is the task the gate watches most.

Commit after every task with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer; push only to `fork`,
never `origin`, and only when the user says so. Stop at the human gate: list the checks in the chat message and end the
turn.
