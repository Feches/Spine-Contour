# Moving films and annotations between computers: bundles

An annotation bundle (2026-10-15) is a folder holding films from one Spine Contour library together with everything the
app knows about them: the model's result, your edits and comment, the review mark and the manual image scale. **Export**
writes one from the Studies list; **Import bundle…** reads one into another library, or into the same library after an
edit on the other side. It is how you carry films and their annotations to a second computer, or bring a colleague's
annotations of films you already hold into your own list. Spec
`docs/superpowers/specs/2026-10-15-annotation-bundle-export-import-design.md` (decisions B1–B9); plan
`docs/superpowers/plans/2026-10-15-annotation-bundle-export-import.md` (rulings PB1–PB10, and S1–S44 in its Ledger).

Both buttons only read and write files on this computer. Nothing is uploaded, and the app makes no network call for
either one (B9).

A bundle is not the measurements CSV. The CSV export stays its own file for spreadsheets and cannot be imported back
(see the roadmap); a bundle carries the films and their annotations and nothing else reads it.

## What a bundle holds

A bundle is a plain folder (B2), not an archive. You can open it, copy it to a stick or a share, and delete it like any
other folder.

```
spine-contour-export-2026-10-15-1432/
  manifest.json
  lateral_lumbar_001/
    study.json                       the study's record, with its film path cleared
    prediction.json                  the model's result and the stored 8-bit image, when the film was segmented
    lateral_lumbar_001.label.json    the label record, when you have saved edits or marked the film reviewed
    calibration.json                 the manual image-scale reference, when you applied one
    film/lateral_lumbar_001.dcm      the original film, as it was added
  lateral_lumbar_001-2/              a second film with the same name
```

- **The folder's name** is `spine-contour-export-` and the date and time of the export on your clock. If the folder you
  chose already holds one of that name, the new one takes `-2`, `-3` (S1).
- **A film's folder** is its file name without the extension, made safe for every file system, with `-2`, `-3` for a
  second film of the same name. Names never end in a dot or a space (S10).
- **`study.json`** is the study as the library holds it: its name, view, region, subject, timepoint, film date, note,
  clinical fields, measurements, geometry, review mark and the comment on its label record. Only the film's location is
  left out.
- **`prediction.json`** is the model's result for the film (the same sidecar the app keeps in its data folder). A film
  with no model run, a film placed by hand included, has none.
- **The label record** is the file Save edits writes (see [the level editor](level-editor.md#the-label-record)), under the
  name the study already gave it. Its `comment` travels with it.
- **`calibration.json`** is the manual image-scale reference you applied to the film, so a re-run on the other computer
  keeps your correction (B7).
- **The original film** is the DICOM or image file you added, copied byte for byte (B3), so the other computer can
  re-run it, window it on its full bit depth and move it like any film. The manifest records the film's SHA-256, which
  is how an import recognises a film it already holds.
- **`manifest.json`** lists the films and is written last. A folder cut off mid-export has no manifest, and Import
  refuses it with `This folder is not a Spine Contour bundle.` Delete such a folder and export again.

Demo studies are never exported.

## Exporting

On the **Find** tab, beside Delete, the button reads **Export all**, or **Export N selected** when you have ticked rows.
It follows the same rule as the CSV export (B6): the ticked rows that are visible, or every visible row when none is
ticked, so the search box and the workspace and folder filters decide what goes in. Choose the folder to put the bundle
in; cancelling does nothing. The button reads `Exporting…` until the toast.

The button is disabled, with the reason in its tooltip, while a run or a batch is in flight, while studies are not being
saved (the tooltip names why), while another export or an import is running, and when no study is visible. It asks for no
confirmation: the folder you pick is the commitment. A hundred DICOM films take as long as copying them; there is no
progress bar.

The toast reads `Exported 12 studies to <the folder>`. When it can say more it adds:

- `· 2 films were not found and were left out (a.png, b.png)`. The film's file had moved, could not be opened, or has a
  name that cannot be a file name in a bundle (S4). The study is still in the bundle with its result, record and scale,
  and imports without a film (see below).
- `· 1 file could not be read (a.png sidecar)`. A model result (named `<film> sidecar`), a label record (named by its
  own file name) or a scale reference (named `<film> calibration`) exists in the library but could not be read, so that
  one piece is left out and the rest of the study is written (S37, S40). A study with no file name is named by its
  folder in the bundle.

If the folder you chose cannot take the files, because the stick is full or the folder is read-only, the export stops
instead with a sentence such as `The film a.png could not be written to the bundle. Is the folder full or read-only?`
(or the same for a sidecar, a label record or a calibration reference) (S39). A film is reported as not found only when
it was not there to copy, never because the bundle's folder refused it. The half-written bundle has no manifest, so
Import refuses it: delete it, free some space or choose another folder, and export again.

## Importing

On the **Studies** screen, in the drop area beside **Choose radiograph**, **Import bundle…** asks for a bundle folder
(the one that holds `manifest.json`). The app reads it, works out what each film would do, and shows a line in the Find
bar instead of the usual buttons:

> Import from spine-contour-export-2026-10-15-1432: 10 to add, 2 to update, 3 to skip. The films stay in this folder, so
> keep it where it is.

with **Import** and **Cancel**. Focus starts on Cancel, and Escape cancels too. Nothing has been changed yet. If there is
nothing to add or update the prompt does not appear and a toast says why instead: `Nothing to import: already in the
library: a.dcm, b.dcm`. A folder with no manifest is refused with `This folder is not a Spine Contour bundle.`, and a
bundle written by a newer Spine Contour than the one importing it with `This bundle was written by a newer Spine Contour
(schema …). Update the app to import it.`

- **A film the library does not hold** is added as a new study, ready to open, review and edit. It takes the subject,
  timepoint, note and clinical fields the bundle recorded, and its model result, label record, comment, review mark and
  image scale come with it.
- **A film the library already holds** is matched by the film's content, never by its file name (B4): the bundle's
  SHA-256 against the library's. A bundle that names a film the library holds under another name still matches; two
  different films that share a name do not.
- **Anything else is skipped and named**, with its reason: `already in the library`, `being edited` or `malformed`. A
  damaged file in the bundle (a `study.json`, label record, model result or scale reference that cannot be read) makes
  that one film `malformed` and never stops the others (S38).

The import button is disabled, like Export, while a run, a batch, an export or another import is in flight, and while
studies are not being saved. While an import reads or places files it reads `Importing…`, and the bar's other actions
wait for it (S25, S30). The prompt is withdrawn if the library changes before you answer (a run ending, a subject
typed in the list, a film added) because its plan was made against the list as it was (S26); press **Import bundle…**
again. If the library changed while the bundle was being read, a toast says so and no prompt appears (S29).

When the import ends, the toast reads like `Imported 10 studies, updated 2, skipped 3 (already in the library: a, b;
being edited: c)`. A film whose file in the bundle was damaged or gone by the time it was placed, or whose scale
reference was refused, is counted there too, under `malformed`: nothing of it was written and the import went on with
the others (S38). After it, when they apply:

- `· 2 without film (x.dcm, y.dcm)`: those studies came in without a film (see below).
- `· 1 not added because the library changed (z.dcm); import the bundle again`: a film was added by another route while
  the import ran and took the id the plan had set aside for this one (S28). Nothing is lost; import the bundle again.
- `· stopped at q.dcm: <reason> Import the bundle again to continue.`: a file could not be written into this
  computer's data folder (the disk was full, a file was held open by another program). The studies placed before it
  stay. Importing the bundle again continues: the studies already placed are skipped as already in the library,
  because their label records are now the bundle's, and q.dcm is offered again, as a new film if it was one (it was
  never added) and as an update if the library held it (its label record is written last, so it still has its older
  one) (S38).

## The identifiers warning

**A bundle is for your own machines** (B3). A DICOM header can hold patient identifiers (a name, a medical record
number, a birth date, institution and exam dates), and the bundle carries the original file untouched. `study.json`
carries the file's name and whatever you typed in the study drawer: the subject, the note, the clinical fields. Do not
email a bundle, put it on a shared drive or hand it to a collaborator unless the films have been de-identified and the
study names and notes checked, in the way your approval for the data requires. The app does not remove identifiers and
does not warn about them in the file; this page is the warning.

## Keep the folder where it is

Imported films stay in the bundle folder (B5). The app keeps no copy of a film's bytes anywhere: a study's `filePath`
points at the film, as it does for every film you add, and an imported study's points into the bundle. Moving, renaming
or deleting that folder, or pulling out the stick it is on, breaks the path:

- A **re-run** and **window / level** need the original film. When a run finds it missing the app says
  `<file> was not found. Choose its new location.` and you point it at the film's new place, as for any film you have
  moved; once chosen, the study remembers the new place.
- A film **placed by hand** shows its original on the stage, so its stage reads `The source film could not be found.`
  until the film is found again.
- A film segmented by a model keeps opening on its stored image, which lives in the library and not in the bundle.

So copy a bundle to a permanent place on the computer first (not a stick you will take back), and import from there.

## A film the library already holds

The rule is the newer annotation wins (B4):

| The bundle's film | What happens |
|---|---|
| the library does not hold it | added |
| held; the bundle has a label record and the library's study has none | updated |
| held; both have records and the bundle's was saved later | updated |
| held; anything else: the bundle's record is older, was saved at the same moment, has a save time that cannot be read, or the bundle has no record | skipped, `already in the library` |
| held; that study is open in edit mode, or has edits left unsaved by opening another study | skipped, `being edited` |
| `study.json` or a named label record missing or damaged, a model result or scale reference damaged, or a path outside its folder | skipped, `malformed` |

An **update** keeps what is yours on this computer: where its film lives, its name, workspace folder, subject,
timepoint, film date, note, clinical fields and when it was added. It takes the annotation: the model result
and the stored image, the measurements and geometry, the view and region, the review mark, the thumbnail, the label
record, the comment and the image scale. A newer hand-placed result over an old model result replaces it. The updated
study is treated as re-run for the screen: its editor state and cached images are dropped, and the next time you open it
the new files are read. The older annotation on this computer is overwritten, so a study edited on both computers keeps
only the later save; there is no merge.

If a bundle holds two entries for one film, only one of them is weighed against the library: an entry with a label
record outranks one without, then the later-saved record, then the first in the bundle (S18). The rule above decides
whether it applies, and the other is skipped as `already in the library`.

A label record on this computer that exists but cannot be read at the moment (another program holds it open) is never
written over: the film is skipped as `already in the library` until it can be read (S42). One that is missing or
damaged counts as no record, so the bundle's replaces it.

## Importing the same bundle twice

Adds nothing, with one exception. The second import matches every film by its content, finds each already in the
library, and ends with `Nothing to import: already in the library: …` and no prompt. The same holds for a bundle
exported from the library you are importing into. The exception is a study that came with no film, no model result, no
image scale and no label record (an unsegmented film whose file had moved when the bundle was written): nothing in the
bundle identifies it, and a file name alone never matches (B4), so it is added again each time the bundle is imported.
To bring a later edit across, export again from the computer where you made it; the update rule above decides whether it
replaces the annotation on the other side.

## A study that arrives without its film

If the film was not found when the bundle was written, or has since been taken out of the bundle folder, the study is
added with no film location and the toast names it under `without film`. A segmented study still opens on its stored
image and shows its measurements, but cannot be re-run or windowed until a film is chosen for it (Run segmentation asks
for its new location). A study placed by hand has no stored image and shows `The source film could not be found.`

A study that arrives with nothing but its record (no film, no result, no scale, no label record) cannot be recognised on
a later import and is added again if the bundle is imported twice; Delete removes the extra copy.

## What does not travel

View state: window / level, zoom and where you dragged the level plates. The library never saved them.

## Verification

`tools/smoke/smoke-bundle.mjs` (phases `a`, `b` and `c`, on two scratch profiles; see `tools/smoke/README.md`) exports
two synthetic films from one profile, imports them into a second, imports them again, edits a comment on the second,
exports from it and imports into the first, by DOM, store and file reads. The pure planner has unit tests in
`test/bundle.test.js`, the main-process module in `test/bundle-io.test.js`, and the four channels in `test/api.test.js`
and `test/api-persistence.test.js`. The human gate (plan Task 9) is the owner's, on real films and a second computer.
