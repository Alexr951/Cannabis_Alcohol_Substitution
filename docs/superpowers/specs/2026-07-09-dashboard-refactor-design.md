# Dashboard refactor: paper-arc single page

2026-07-09. Full refactor of `dashboard/` to present the revised paper's
findings: six-estimator nulls, in-time placebos, power simulation with
jackknife-primary inference. Replaces the bootstrap-framed page.

## Invariants (unchanged from the current dashboard)

- Single page. No build step. Vendored D3 v7. Relative paths only.
- Pure replay of committed `Results/csv/` files packed into one JSON by
  `dashboard/prep/build_dashboard_data.py`; nothing is estimated in the
  browser.
- Prep script self-checks abort the build on any mismatch with the committed
  CSVs. Asserts compare recomputed-vs-shipped values, never hardcoded
  literals, so a regenerated draw file cannot silently break the build.
- Deployment workflow (`.github/workflows/deploy-pages.yml`) untouched.
- Serve locally with `python -m http.server` from `dashboard/public`.

## Page structure

### Header

Headline stating the paper's finding, one-sentence standfirst, three stat
chips read from the JSON: pooled range (+0.7 to +2.8 percent), joint RI
p-value (0.17), primary MDEs (jackknife 7.2, calibrated 6.4 percent). Below:
the global estimator chip row (six chips, ASCM tagged primary). Selecting a
chip highlights that estimator in all three acts. The TWFE chip greys out in
Act 3 with a tooltip: not run through the power grid. The chip row is not
sticky; the δ slider is scoped to Act 3.

### Act 1 — Six estimators, one null

Hero: forest plot fused with the RI null distribution on one shared x-axis
(effect in log points, labeled in percent).

- Top: six rows, point + 95% CI whisker. Primary row bold, inference tag
  "Jackknife"; other rows tagged with their native inference. The x > 0 half
  faintly tinted, labeled "wrong sign for substitution".
- Bottom: the 500 committed null draws (`ri_null_dist.csv`) as a density,
  with a vertical line through both panels at the observed estimate,
  annotated with the p-value.
- Scope label in the caption: "null distribution of the primary estimator
  under 500 pseudo-treatment draws" — the fused layout must not invite the
  reading that p = 0.17 tests all six estimators.
- Hover a row: ATT, SE, CI, percent, inference. Chip selection dims other
  rows.

### Act 2 — The noise floor

Hero: backdated-placebo strip plot. One band per method with single-state
runs (classic SCM, ridge ASCM, SDID, gsynth): 39 backdated fake estimates as
jittered gray dots, a mean ± 2 SD band, real clean-fit estimates overlaid as
colored diamonds on the same axis.

- Caption (California-correct): four of five real estimates sit inside the
  no-treatment noise band; California is the exception, discussed in Section
  III.C of the paper. The California diamonds carry a small annotation
  (hover or persistent marker) with the paper's three reasons the gap is not
  read causally: smallest first-stage dose in the sample, sign matches the
  donor-contamination direction, and only two post-treatment years. The
  outlier is presented as a demonstration of the design's known biases, not
  hidden by the caption.
- Chip selection focuses a band via the focus map (primary → classic SCM,
  its single-unit special case, stated in the caption; matrix completion and
  Callaway–Sant'Anna have no single-state runs and leave the focus
  unchanged).
- Hover a dot: state and fake adoption year.

Support: pooled backdated mini-forest, two panels (fake 2009, fake 2007),
six estimator rows each, dot + SE whisker, all negative. Primary row uses
jackknife SE and t. The Callaway–Sant'Anna 2007 cell is flagged red: it
rejects at the 5% level on no-treatment data; the caption ties this to the
over-rejection its native test shows in the simulation.

### Act 3 — Drag the truth (power + jackknife)

Control bar: δ slider snapping to the five simulated cells (0, −2, −5, −8,
−12 percent; no interpolated draws), a readout translating δ into standard
drinks per adult per month, and a phase-in toggle. The toggle is visible at
every δ but enabled only at −5 percent (the only phased cell), disabled with
a tooltip elsewhere so it can be discovered.

Hero: sampling distribution of the selected estimator's draws (400 primary,
200 alternatives) as a dot histogram. The grid reuses the same pseudo-treated
draws at every δ (verified: per-draw correlation across cells is exactly 1.0;
the difference is a rigid shift), so dots move by positional transition as
the slider moves, and the caption says so: the same worlds at every δ, only
the injected effect changes.

- Draws beyond the estimator's own RI threshold light up as detected. For
  the primary, draws with |ATT/jackknife SE| > 1.96 get a second encoding
  (ring vs fill); per-draw jackknife SEs exist only for the primary.
- Markers for the mean estimate and the injected truth (unbiasedness).
- Counters: reject percent under the jackknife (primary only) and under the
  calibrated rule. At δ = 0 the jackknife counter shows its empirical size
  with the Clopper–Pearson 95% interval (computed in prep, same formula as
  the paper's).
- One-line auto-updating reading under the hero; static closing line linking
  the paper PDF.

Right column, stacked:

1. Power curves: rejection rate vs δ. Five calibrated curves thin, selection
   emphasized, primary's jackknife curve as a marked second line, 80%-power
   and 5%-size guides, MDE drop-lines for the selection, and the shaded
   plausible-effect band (low single digits) on the x-axis.
2. MDE ladder: one lollipop per estimator, calibrated MDE in percent with
   the drinks translation; the primary shows both jackknife and calibrated
   MDEs. The envelope value (Callaway–Sant'Anna) is marked as the design's
   limit with BOTH cautions the paper carries: its native test is the worst
   over-rejecter at δ = 0 (calibration fixes the size, not the noise), and
   the figure comes from 200-draw cells, making it the noisiest of the MDEs
   reported. The dashboard must not state the headline number with less
   hedging than the paper.
3. Jackknife credibility inset: five-point sparkline of mean jackknife SE
   over true sampling dispersion across δ, flat at 1.27×. Caption is
   self-contained (no ghost of the deleted bootstrap comparison): the
   jackknife is uniformly conservative by a constant ~27 percent at every
   effect size, consistent with its 1.8 percent empirical size at δ = 0, and
   this constant conservatism is what separates its 7.2 percent MDE from the
   calibrated rule's 6.4.

## Data: power.json schema v4

One file, regenerated by `dashboard/prep/build_dashboard_data.py` from the
committed CSVs (which retain all columns; the cleanup removed no CSV data,
so there is no sequencing hazard — prep simply stops packing bootstrap
fields).

Added:
- `real`: per estimator {att, se, ci_lo, ci_hi, pct, inference, primary};
  primary from `multisynth_overall_jack.csv` (jackknife), others from
  `sdid_primary.csv`, `gsynth_primary.csv`, `cs_twfe_primary.csv`.
- `ri_null`: {values[500], observed, p, n_draws} from `ri_null_dist.csv` +
  `ri_pooled.csv`.
- `meta.size_jack`: {size, ci_lo, ci_hi} (Clopper–Pearson in prep).

Kept: per-δ `att` arrays, `reject_ri`, `reject_jack`, `mean_att`, `se_true`,
`ratio_jack` and per-draw `se_jack` (primary only), `ri_thresh`, MDEs
(ri + jack + drinks), placebo blocks (singles, pooled 2009/2007 with the
primary's jackknife SE/t folded in), phased draws, plausible band, sources
list, seed. Prep additionally writes a generated-from commit stamp into
`meta` (read-only `git rev-parse`, shown in the page footer).

Dropped (bootstrap material): all `se_boot` arrays, `se_boot_mean`,
`se_boot_ratio`, `real_data.se_boot/ci_boot/t_boot`, phased `se_boot`.
`reject_se` survives only as the δ = 0 scalar per alternative estimator (it
feeds the MDE-ladder over-rejection footnote, a paper finding).

Self-checks (recomputed-vs-shipped, extending the existing pattern):
- rejection rates recomputed from the shipped draw arrays and thresholds
  equal the committed CSV rates;
- the RI p recomputed from the shipped null values equals the committed
  `ri_pooled.csv` value;
- forest ATTs agree across their source CSVs;
- jackknife size recomputed from shipped `se_jack` draws equals the
  committed rate;
- draw pairing across δ cells holds (correlation 1 check), since the
  positional animation depends on it.

## Code layout

- `dashboard/public/index.html`: new three-act structure.
- `dashboard/public/js/shared.js`: state (selected estimator, δ, phase-in),
  chip row, formatters, tooltip, modal.
- `dashboard/public/js/act1.js`, `act2.js`, `act3.js`: one act each.
- `dashboard/public/styles.css`: updated.
- `dashboard/public/app.js`: removed (replaced by the js/ files).
- Keep: vendored `vendor/d3.v7.min.js`, favicon files, `.nojekyll`,
  expand-to-modal, keyboard-accessible slider.

Cut entirely: bootstrap headline, default-test counter, "Two standard
errors" panel, every "wild bootstrap" string. Final verification includes a
grep sweep of `dashboard/` for wild/bootstrap/default-test strings (the
other estimators' inference labels — parametric bootstrap, multiplier
bootstrap — are legitimate and stay).

## Verification

1. `python dashboard/prep/build_dashboard_data.py` passes all self-checks.
2. Serve locally; check each act against the paper: Table 3 row values, the
   0.17 p-value, placebo bands and pooled fakes, the power grid rates, MDEs
   (7.2 / 6.4 / 4.5), phase-in drop (64 → 30 calibrated, 53 → 23 jackknife).
3. Grep sweep as above.
4. California annotation present; RI-null scope label present; envelope
   double-caution present; jackknife inset caption self-contained.
5. README dashboard paragraph updated to describe the new page (last step).
6. User reviews in the browser; user commits (no git operations by Claude).

## Out of scope

State-by-state panel (California gets its Act 2 annotation and a text line,
not a visualization), event-study chart, any second page, any client-side
estimation, changes to R/ or Results/csv/.
