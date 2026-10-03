# Real-radiograph global SVA screenshots

`global-sva-real.png` and `global-sva-real-edit.png` show the running application
after actual cervical and lumbar HRNET inference. The model landmarks were not
manually moved. The displayed result is **83.8 px**; the published raster has no
verified physical calibration, so no millimetre value is assigned. These are
illustrative application screenshots, not an accuracy validation. Anatomical
review remains required.

## Source and image license

The radiograph is adapted from the unannotated, leftmost input panel of Figure 3
in Noh SH et al., *Deep Learning Method for Precise Landmark Identification and
Structural Assessment of Whole-Spine Radiographs*, **Bioengineering** 2024;11:481.
[Article and figure](https://doi.org/10.3390/bioengineering11050481).

Radiograph copyright © 2024 by the article authors, licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
The radiograph component retains that license; this attribution does not change
the application's software license. The authors and publisher do not endorse
this application.

[Original published Figure 3](https://mdpi-res.com/d_attachment/bioengineering/bioengineering-11-00481/article_deploy/html/images/bioengineering-11-00481-g003.png)
is 2922 × 1279 pixels. The input panel was extracted with pixel bounds
`[13, 95, 488, 1165)` to form a 475 × 1070 image, without resampling, rotation,
retouching or anatomical changes. The anterior side is image left. The
application added its own model landmarks, measurement construction, labels and
interface; the paper's heatmaps and landmark-output panels were not inputs.

The second screenshot opens landmark-editing mode to expose the C7 centroid and
both S1 superior-endplate handles. It retains the same unedited model result.
