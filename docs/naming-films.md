# Naming radiograph files so Spine Contour fills in the study fields

Spine Contour reads a film's **subject**, **timepoint**, **film date**, **view** and a free-text **note**
from its file name when the film is loaded, whether through the Workspace folder load, the Choose
radiograph button or a drag and drop. Name your files to the pattern below and those fields arrive
filled in. You can still correct any of them afterwards in the study drawer on the Analysis screen.

## The pattern

```
subject_timepoint_date.jpg
subject_timepoint_date_note.jpg
```

- **Underscores separate the fields.** Spaces and hyphens inside a field are fine; they are part of it.
- **The subject comes first.** Everything before the first field the app recognises is the subject,
  exactly as typed.
- **Timepoint, date and view can follow in any order.** The app recognises each by what it looks like.
- **Anything else after them is the note.** Use it to tell apart two films of the same subject taken on
  the same day, for example one centred on the femoral heads.

The extension (`.jpg`, `.png`, `.dcm`, and so on) is ignored. Upper and lower case do not matter.

## Examples

| File name | Subject | Timepoint | Film date | View | Note |
|---|---|---|---|---|---|
| `sub225_pre-op_10-23-2023.jpg` | sub225 | Pre-op | 2023-10-23 | Standing lateral | |
| `sub225_pre-op_10-23-2023_femoral heads.jpg` | sub225 | Pre-op | 2023-10-23 | Standing lateral | femoral heads |
| `sub225_post-op_3-22-2024.jpg` | sub225 | Post-op | 2024-03-22 | Standing lateral | |
| `sub225_6 wk_2024-04-30.jpg` | sub225 | 6 wk | 2024-04-30 | Standing lateral | |
| `sub225_1yr_flexion_2025-01-10.png` | sub225 | 1 yr | 2025-01-10 | Flexion lateral | |
| `sub225_3-22-2024_post-op.jpg` | sub225 | Post-op | 2024-03-22 | Standing lateral | |
| `John Doe_pre-op_10-23-2023.jpg` | John Doe | Pre-op | 2023-10-23 | Standing lateral | |
| `sub225_post-op.jpg` | sub225 | Post-op | | Standing lateral | |
| `IMG_0001.jpg` | IMG_0001 | | | Standing lateral | |

The last row shows a name with no recognisable field: the whole name becomes the subject and nothing
else is filled in. Such a film never pairs with anything until you set its timepoint by hand.

## What the app recognises

**Timepoint.** Any of these, with or without hyphens or spaces inside:

| You write | Stored as |
|---|---|
| `pre-op`, `preop`, `pre op`, `pre`, `pre-operative`, `preoperative` | Pre-op |
| `intra-op`, `intraop`, `intra-operative`, `intraoperative` | Intra-op |
| `post-op`, `postop`, `post op`, `post`, `post-operative`, `postoperative` | Post-op |
| `6wk`, `6 wk`, `6-wk`, `6 weeks` | 6 wk |
| `3mo`, `3 months` | 3 mo |
| `1yr`, `1 yr`, `2 years` | 1 yr, 2 yr |

**Film date.** Month-day-year with hyphens, `3-22-2024` or `03-22-2024`, or year first, `2024-03-22`.
The year needs all four digits and the date has to exist on the calendar. Slashes cannot be used in a
file name. A field that only looks like a date, such as `2-30-2024` or `3-22-24`, is not read as one:
it lands in the note, where you can see it and fix the name or the field.

**View.** `standing`, `upright` or `erect` for Standing lateral; `supine`; `prone`; `flexion` or `flex`;
`extension` or `ext`. A film with no view field is Standing lateral.

**Note.** Whatever is left after the subject and the recognised fields, kept as typed and joined with
spaces if it spans several fields. It shows in the study drawer as NOTE, is exported in the CSV, and is
searchable from the Find box.

## Keep the subject consistent

Every film of one person needs the same subject, because pairing pre-op with post-op films is done by
subject. `sub225` and `Sub225` match; `sub225` and `sub 225` do not. Choose one spelling and use it on
every film.

## Two films on the same day

When a subject has two films with the same timepoint on the same date, the paired export merges them
into one visit. The film **without** a note leads, and the film **with** a note only supplies the
measurements the first one lacks. So name the main film plainly and give the extra film a note:

```
sub225_pre-op_10-23-2023.jpg
sub225_pre-op_10-23-2023_femoral heads.jpg
```

Two same-day films that both have a note, or both lack one, cannot be told apart and the subject is
left out of the paired file with a message saying so. The export's toast and its `disagreements`
column list every measurement the two films disagreed on, and a `derived across films` column says when
the PI-LL mismatch was computed from a PI on one film and an LL on the other.

## Follow-up visits

You do not need a different timepoint for each follow-up. Label them all `post-op` with their dates,
and the paired export writes one column group per visit in date order, `Post-op 1`, `Post-op 2` and so
on, each with its film date. If you prefer interval labels such as `6 wk` or `1 yr`, those work too and
get their own column groups.

## Things that do not work

| Name | What happens |
|---|---|
| `sub225 post-op 3-22-2024.jpg` | Spaces do not separate fields. The whole name is the subject. |
| `sub225-post-op-3-22-2024.jpg` | Hyphens do not separate fields. The whole name is the subject. |
| `sub225_post-op_3/22/2024.jpg` | Not a valid file name on most systems, and a slash is never read as part of a date. |
| `sub225_post-op_3-22-24.jpg` | Two-digit year. `3-22-24` becomes the note. |
| `post-op_sub225_3-22-2024.jpg` | Works, but only because nothing precedes the first recognised field: the first plain field after it, `sub225`, becomes the subject. Subject-first is clearer. |

## Renaming a film that is already loaded

Loading fills in blank fields and never overwrites a value the app already holds. If a film was loaded
with the wrong name, renaming the file on disk and loading the folder again will not change its
subject or timepoint. Either edit the fields in the study drawer, or delete the study on the Find tab
and load the folder again.

## The CSV export uses the same name

The `Study ID` column of both CSV exports holds the file name without its extension, exactly as the
app shows it. A clinical spreadsheet you import through the Workspace must use that same value in its
`study_id` column to match a film.
