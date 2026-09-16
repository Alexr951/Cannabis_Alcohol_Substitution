# Detecting Cannabis–Alcohol Substitution in Aggregate Sales Data

[![DOI](https://img.shields.io/badge/DOI-10.2139%2Fssrn.7114559-blue.svg)](https://doi.org/10.2139/ssrn.7114559)

**Statistical Power and the Limits of Small-Sample Synthetic Control.** A multi-estimator
and power analysis of recreational cannabis legalization and U.S. state-level alcohol sales.
The compiled paper is [published on SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7114559),
a copy sits at the repository root as
[`Cannabis_Alcohol_Substitution.pdf`](Cannabis_Alcohol_Substitution.pdf), and the
analysis pipeline that produces every number in it is in this repo.

**Main results.** (1) Six estimators (partially-pooled augmented synthetic control
as primary, synthetic difference-in-differences, generalized synthetic control, matrix
completion, Callaway-Sant'Anna, and TWFE) return positive-signed nulls of
+0.7% to +2.8%, every confidence interval covering zero, with a joint
randomization-inference p = 0.17. (2) Backdated placebos show the same designs
produce pseudo-effects of −0.9% to −2.2% on windows where no state had legalized,
and the single-state placebo distributions have standard deviations of 2.3 to 3.4
percentage points. (3) A design-based power simulation puts a power curve on the
primary estimator and the four alternatives that carry one. The primary estimator's
jackknife inference holds size (1.8% at δ = 0) with an MDE at 80% power of 7.2%;
under design-calibrated randomization inference the minimum detectable effect ranges
from 4.5% (Callaway-Sant'Anna) to 6.4% (primary). A −4% effect is caught 46% of the
time by the primary estimator and about 70% of the time by the most sensitive one; a
−2% effect is caught 10.5% and 26% of the time. Effects in the low single digits,
where the survey and smaller quasi-experimental evidence point, sit below the
detection limit of every estimator and every rejection rule considered. The null is
therefore a statement about detectability, not evidence that substitution is absent.

## Interactive dashboard

**Live at <https://alexr951.github.io/Cannabis_Alcohol_Substitution/>.** A single page
that follows the paper's arc in three acts: the six pooled estimates over the
randomization-inference null distribution, the backdated-placebo noise floor with the
real estimates overlaid, and the power simulation, where a slider moves the true
effect δ across the five simulated sizes (0 to −12%), a chip row highlights any of
the six estimators, and a toggle switches the −5% cell to its three-year phase-in
version. The page is a pure replay of the committed results in `Results/csv/`;
nothing is estimated in the browser. `dashboard/prep/build_dashboard_data.py` packs
the result CSVs into `dashboard/public/data/power.json` (schema 4, with self-checks
that recompute every shipped rate from the shipped draws), and the front end is
vanilla JavaScript and D3 with no build step. Deployment is automatic:
`.github/workflows/deploy-pages.yml` publishes `dashboard/public/` to GitHub Pages on
every push to `main`. To run locally, serve with `python -m http.server` from
`dashboard/public`.

## Pipeline (hybrid Python + R)

```
cannabis_alcohol_scm.ipynb   presentation layer: data prep -> R pipeline -> figures
                             and the paper's auto-generated tables and number macros
run_all.R + R/01..10         estimation engine (cached): sample rules, six estimators,
                             scpi prediction intervals, in-time placebos, pooled RI,
                             power simulation, robustness suite
R/11_power_jackknife.R       standalone: reruns the primary estimator's power draws
                             with jackknife SEs, paired one-for-one to the committed
                             draws (~22 min cold)
R/12_power_screen.R          standalone: repeats the power simulation with the fit
                             screen applied inside each draw
notebook_src/make_tables.py  the paper's table bodies and number macros, called by
                             the notebook
Results/inference_outputs.py the paper's screened-simulation macro fragment from
                             those CSVs
Results/csv/                 tidy results (every paper number traces here)
Results/cache/               RDS caches (delete for a cold run; ~70 min on 6 cores)
Results/figures/             all figures used in the paper
dashboard/                   interactive companion (prep script + static site,
                             deployed to GitHub Pages by the Actions workflow)
```

One-command reproduction (after installing dependencies):

```
jupyter nbconvert --to notebook --execute --inplace cannabis_alcohol_scm.ipynb
```

This runs data prep, the cached R pipeline (`Rscript run_all.R`; R 4.4+, packages
installed by `R/00_setup.R` — augsynth and synthdid come from GitHub via remotes), the
Python↔R port check, all figures, and the paper table fragments.
Python dependencies: `pip install -r requirements.txt`. All randomness is seeded
(`SEED = 20260524`); step runtimes are logged to `Results/runtimes.csv`. The jackknife
inference and screened simulation are separate steps: `Rscript R/11_power_jackknife.R`
and `Rscript R/12_power_screen.R`, followed by `python Results/inference_outputs.py`.
R/11 asserts that its paired draws reproduce the committed `power_draws.csv` exactly
before writing anything.

The paper's LaTeX source is kept outside this repository, but the paper is fully
reproducible from the analysis here: no statistic in it is hand-typed — every table row
and in-text number is generated by `cannabis_alcohol_scm.ipynb` from `Results/csv/`.

## Data

- **Outcome:** `Data/pcyr1970-2023.txt` — NIAAA Surveillance Report #122 (Slater and
  Alpert, 2025), gallons of ethanol per capita (21+) by state, beverage, and year.
- **Cannabis sales (first stage):** `Data/external/cannabis_sales_annual.csv` — annual
  legal sales for CO, WA, OR, NV, CA, MA from state tax/regulatory portals; every figure
  sourced and cross-checked in `Data/external/SOURCES.md`.
- **Yearly covariates:** `Data/external/` — BEA real GDP per capita, BLS LAUS
  unemployment, Census age structure (share 20–34), FTA beer excise tax, 2000–2023.
- `Data/processed/` is derived by the notebook and not committed.

## Design summary

- Primary window 2000–2019 (COVID excluded); 2000–2023 as a labeled extension.
- Donors: 30 never-treated-recreational states; timing-adjusted pool in robustness.
- Pre-specified fit screen (pre-RMSPE ≤ 2× donor-placebo median) excludes Alaska and
  Nevada. Primary treated sample: CO, WA, OR, CA, MA.
- Washington privatized liquor sales in 2012, two years before its retail opening. The
  main protection is a re-estimate on a spirits-excluded outcome, which finds nothing
  (−2.9%, interval covering zero); a Chow forecast test for a 2012 break also fails to
  reject and is reported as supporting evidence rather than as the reason for keeping
  the state.
- Outcome-only matching justified via Kaul et al. (2022); lag-subset + pre-T0 covariate
  spec in the appendix.
- Inference: each estimator's native uncertainty, prediction intervals
  (Cattaneo–Feng–Titiunik 2021), pooled randomization inference, and a design-based
  power simulation with a pre-stated compute budget. For the primary estimator the
  reported SE is a jackknife over units, evaluated alongside a design-calibrated
  randomization test (`R/11_power_jackknife.R`).
- The randomization and power draws do not reapply the fit screen inside each draw.
  `R/12_power_screen.R` repeats the exercise with the screen applied: it binds in 86%
  of draws, the calibrated MDE rises from 6.4% to 7.4%, the jackknife MDE from 7.2% to
  8.1%, and the pooled randomization p-value from 0.17 to 0.21. The two runs bracket
  the procedure and the conclusion is the same under both.
- State-level estimates are reported with prediction intervals. California's +10.1%
  gap has an interval excluding zero and is read as donor contamination plus
  single-unit noise, not as a treatment effect: its first-stage dose is the smallest
  in the sample and there is no dose gradient across states.
- Robustness: dropping adjacent donors, Oklahoma, or New Hampshire moves the pooled
  estimate by less than a tenth of a standard error; the timing-adjusted donor pool
  (+2.6%), the 2000–2023 extension window (+4.2%), all seven treated states (+2.3%),
  and the beverage split (beer +3.9%, wine −2.9%, spirits +3.5%) leave the null intact.

## Citation

> Ronczewski, A. (2026). *Detecting Cannabis–Alcohol Substitution in Aggregate Sales
> Data: Statistical Power and the Limits of Small-Sample Synthetic Control.* Working paper.

```bibtex
@techreport{ronczewski2026cannabis,
  title  = {Detecting Cannabis--Alcohol Substitution in Aggregate Sales Data: Statistical Power and the Limits of Small-Sample Synthetic Control},
  author = {Ronczewski, Alex},
  year   = {2026},
  type   = {Working paper},
  url    = {https://papers.ssrn.com/sol3/papers.cfm?abstract_id=7114559}
}
```
## License

[![License: CC BY 4.0](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)

Code, data, and text in this repository are licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). You are free to share
and adapt the material for any purpose, including commercially, provided you give
appropriate credit (see [Citation](#citation)), link to the license, and indicate
if changes were made.
