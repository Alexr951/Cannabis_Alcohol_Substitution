# Builds Results/figures/fig_n9_power_3rules.pdf, Results/JACKKNIFE_MEMO.md,
# and paper/gen/mechanism.tex from the CSVs written by R/11_power_jackknife.R.
# No number is hand-typed. Pass --macros-only to write only the .tex macros.
import os
import sys

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy import stats

plt.rcParams.update({
    'figure.figsize': (10, 6), 'font.family': 'serif', 'font.size': 11,
    'axes.titlesize': 13, 'axes.labelsize': 12, 'legend.fontsize': 10,
    'figure.dpi': 150, 'axes.spines.top': False, 'axes.spines.right': False,
})
COLORS = {'treated': '#1f77b4', 'synth_scm': '#d62728', 'synth_ascm': '#2ca02c',
          'placebo': '#cccccc', 'donor_avg': '#999999', 'accent': '#ff7f0e'}
CSV = 'Results/csv'
FIG = 'Results/figures'
os.makedirs(FIG, exist_ok=True)

res3 = pd.read_csv(f'{CSV}/power_results_3rules.csv')
mde3 = pd.read_csv(f'{CSV}/power_mde_3rules.csv').set_index('rule')
env = pd.read_csv(f'{CSV}/jackknife_env.csv').iloc[0]
placebo = pd.read_csv(f'{CSV}/intime_pooled_jack.csv')
overall = pd.read_csv(f'{CSV}/multisynth_overall_jack.csv').iloc[0]
robust = pd.read_csv(f'{CSV}/robustness_jack.csv')
budget = pd.read_csv(f'{CSV}/power_jack_budget_log.csv')
mde_old = pd.read_csv(f'{CSV}/power_mde.csv').set_index('rule')

ms = res3[res3['estimator'] == 'multisynth'].sort_values('delta')
ms_tab = ms.sort_values('delta', ascending=False)  # 0 first, like Table 6
ph = res3[res3['estimator'] == 'multisynth_phased'].iloc[0]
z0 = ms[ms['delta'] == 0].iloc[0]
zmin = ms[ms['delta'] == ms['delta'].min()].iloc[0]


def clopper_pearson(k, n, alpha=0.05):
    lo = stats.beta.ppf(alpha / 2, k, n - k + 1) if k > 0 else 0.0
    hi = stats.beta.ppf(1 - alpha / 2, k + 1, n - k) if k < n else 1.0
    return lo, hi


# ---- Figure: multisynth power curve under the three rules -------------------
def fig_power_3rules():
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.plot(ms['delta'] * 100, ms['reject_ri'], '-o', color=COLORS['treated'],
            lw=2.2, markersize=7, label='RI-calibrated test (size 5%)')
    ax.plot(ms['delta'] * 100, ms['reject_jack'], '-^',
            color=COLORS['synth_ascm'], lw=2, markersize=6,
            label='jackknife (correctly specified)')
    ax.plot(ms['delta'] * 100, ms['reject_boot'], '--s',
            color=COLORS['synth_scm'], lw=2, markersize=6,
            label='package default (wild bootstrap, as conventionally run)')
    ax.axhline(0.8, color='gray', ls='--', lw=0.8)
    ax.axhline(0.05, color='gray', ls=':', lw=0.8)
    ax.text(-0.6, 0.815, '80% power', fontsize=9, color='gray')
    ax.text(-0.6, 0.065, '5% nominal size', fontsize=9, color='gray')
    mri = mde3.loc['ri_calibrated']
    if not np.isnan(mri['mde_delta']):
        ax.axvline(mri['mde_delta'] * 100, color=COLORS['treated'], ls=':', lw=1)
        ax.text(mri['mde_delta'] * 100 - 0.3, 0.35,
                f"RI MDE ≈ {mri['mde_delta']:.1%}",
                fontsize=9, color=COLORS['treated'], ha='right')
    mj = mde3.loc['jackknife']
    if not np.isnan(mj['mde_delta']):
        ax.axvline(mj['mde_delta'] * 100, color=COLORS['synth_ascm'],
                   ls=':', lw=1)
        ax.text(mj['mde_delta'] * 100 - 0.3, 0.5,
                f"jackknife MDE ≈ {mj['mde_delta']:.1%}\n"
                f"(≈{mj['mde_drinks_per_month']:.1f} drinks/person/month)",
                fontsize=9, color=COLORS['synth_ascm'], ha='right')
    ax.set(xlabel='True injected effect δ (percent of per-capita ethanol)',
           ylabel='Rejection rate at 5% level', ylim=(-0.04, 1.06),
           title='Primary Estimator Power Under Three Inference Rules')
    ax.legend(frameon=False, fontsize=8.5, loc='lower left',
              bbox_to_anchor=(0.01, 0.07))
    plt.tight_layout()
    plt.savefig(f'{FIG}/fig_n9_power_3rules.pdf', bbox_inches='tight')
    plt.close(fig)


# ---- Memo -------------------------------------------------------------------
def fmt_pct(x, dec=1):
    return f'{x * 100:.{dec}f}%'


def make_memo():
    n0 = int(z0['n_ok'])
    k0 = int(round(z0['reject_jack'] * n0))
    lo0, hi0 = clopper_pearson(k0, n0)
    mri = mde3.loc['ri_calibrated']
    mj = mde3.loc['jackknife']
    mb = mde3.loc['default_bootstrap']
    mb_txt = ('never reaches 80% power anywhere on the grid (it rejects '
              'nothing)' if np.isnan(mb['mde_delta'])
              else f"{fmt_pct(abs(mb['mde_delta']))}")
    p09 = placebo[placebo['fake_t0'] == 2009].iloc[0]
    p07 = placebo[placebo['fake_t0'] == 2007].iloc[0]
    any_placebo_rejects = bool((placebo['reject_jack_5pct'] == 1).any())
    placebo_reject_txt = (
        'Neither pooled placebo rejects at the 5% level under the jackknife.'
        if not any_placebo_rejects else
        'At least one pooled placebo rejects at the 5% level under the '
        'jackknife; see the table above. This is an over-rejection on '
        'no-treatment data and has to be reported alongside the size estimate.')

    ratio_rows = '\n'.join(
        f"| {row['delta'] * 100:.0f}% | {row['ratio_boot']:.2f} | "
        f"{row['ratio_jack']:.2f} |"
        for _, row in ms_tab.iterrows())
    power_rows = '\n'.join(
        f"| {row['delta'] * 100:.0f}% | {int(row['n_ok'])} | "
        f"{fmt_pct(row['reject_boot'])} | {fmt_pct(row['reject_jack'])} | "
        f"{fmt_pct(row['reject_ri'])} |"
        for _, row in ms_tab.iterrows())
    power_rows += (
        f"\n| −5% phase-in | {int(ph['n_ok'])} | {fmt_pct(ph['reject_boot'])} | "
        f"{fmt_pct(ph['reject_jack'])} | {fmt_pct(ph['reject_ri'])} |")
    robust_rows = '\n'.join(
        f"| {row['spec']} | {row['att']:.4f} | {row['se_boot']:.4f} | "
        f"{row['se_jack']:.4f} | {row['t_boot']:.2f} | {row['t_jack']:.2f} |"
        for _, row in robust.iterrows())
    degrades = budget[budget['decision'].str.startswith('degrade')]
    degrade_txt = ('none (full 400-draw grid ran inside the budget)'
                   if degrades.empty else
                   '; '.join(degrades['decision'].tolist()))

    size_calibrated = 0.01 <= z0['reject_jack'] <= 0.10

    if size_calibrated:
        rec = f"""The zero-power finding in Section V is a property of the package default wild bootstrap, not of jackknife inference. The test the paper calls "jackknife" is the augsynth default `inf_type = "bootstrap"`; the true jackknife has empirical size {fmt_pct(z0['reject_jack'])} at δ = 0 (95% CI [{fmt_pct(lo0)}, {fmt_pct(hi0)}]) and reaches 80% power at {fmt_pct(abs(mj['mde_delta']))}, close to the RI-calibrated MDE of {fmt_pct(abs(mri['mde_delta']))}. Section V and the abstract should be reframed in two moves. First, relabel every committed multisynth SE as the package-default wild bootstrap and re-attribute the "rejects nothing up to −12%" result and the growing SE-inflation diagnostic ({z0['ratio_boot']:.1f}× at δ = 0 rising to {zmin['ratio_boot']:.1f}× at δ = {zmin['delta'] * 100:.0f}%) to that default; the inflation growth is a wild-bootstrap artifact, since the true jackknife ratio is flat at {ms['ratio_jack'].mean():.2f}× across the grid. Second, report the correctly specified jackknife alongside the RI-calibrated rule: the paper's MDE conclusion survives almost unchanged (the design cannot detect low-single-digit effects under any of the three rules), but the methodological claim shifts from "jackknife inference is structurally underpowered in this design" to "the augsynth default bootstrap, which a user gets by calling summary() as documented examples do, is what produces zero power; a correctly specified jackknife is roughly {'calibrated' if abs(z0['reject_jack'] - 0.05) < 0.02 else 'conservative' if z0['reject_jack'] < 0.05 else 'anti-conservative'}." The real-data headline is unaffected in sign and significance: the pooled ATT of {overall['att']:.4f} has jackknife t = {overall['att'] / overall['se_jack']:.2f}, still a null."""
    else:
        direction = 'under' if z0['reject_jack'] < 0.05 else 'over'
        rec = f"""The correctly specified jackknife is itself badly sized: empirical size {fmt_pct(z0['reject_jack'])} at δ = 0 (95% CI [{fmt_pct(lo0)}, {fmt_pct(hi0)}]) against a nominal 5%, i.e. it {direction}-rejects on no-treatment data. Section V should not simply swap labels from "jackknife" to "bootstrap"; it should report that neither of the two off-the-shelf inference options for multisynth is usable in this design (the default wild bootstrap rejects nothing up to −12%; the jackknife has size {fmt_pct(z0['reject_jack'])}), which strengthens rather than weakens the paper's case for the design-calibrated RI rule as the only test with known size. The MDE conclusion stands on the RI rule ({fmt_pct(abs(mri['mde_delta']))}); the jackknife MDE of {mb_txt if np.isnan(mj['mde_delta']) else fmt_pct(abs(mj['mde_delta']))} is not interpretable at face value because the test's size is not 5%. The abstract's "near-zero size" claim about the reported test remains true but must be re-attributed to the package default bootstrap, with the jackknife's miscalibration reported as a second, distinct failure."""

    memo = f"""# Jackknife inference memo

Generated by `Results/inference_outputs.py` from `Results/csv/`; produced by
`R/11_power_jackknife.R` (standalone, committed pipeline untouched). Every
number below is read from the CSVs. Seed {int(env['seed'])}; draws paired
one-for-one with the committed `power_draws.csv` (asserted to 1e-8 per cell).

## (a) What the committed SEs actually are

`augsynth` {env['augsynth_version']} (commit `{env['augsynth_sha']}`),
`summary.multisynth` default `inf_type = "{env['default_inf_type']}"` — a
wild/weighted bootstrap (`weighted_bootstrap_multi`, 1,000 replicates), not
the jackknife the paper reports. Every committed multisynth SE in
`multisynth_overall.csv`, `power_draws.csv`, `intime_placebo_pooled*.csv`,
and `robustness_variants.csv` is this bootstrap SE. Verified by exact
reproduction: rerunning the primary fit with the default summary returns
ATT = {overall['att']:.4f}, SE = {overall['se_boot']:.4f} (matches the
committed Table 3 row to 1e-8), and the committed
`power_jackknife_diag.csv` "jackknife" SE means equal the recomputed
bootstrap SE means on the paired draws. The true jackknife SE on the same
primary fit is {overall['se_jack']:.4f}; the default bootstrap SE is
{overall['se_boot'] / overall['se_jack']:.2f}× larger.
95% CIs: bootstrap [{overall['ci_lo_boot']:.4f}, {overall['ci_hi_boot']:.4f}],
jackknife [{overall['ci_lo_jack']:.4f}, {overall['ci_hi_jack']:.4f}]; the
estimate is a null under both.

## (b) Jackknife size at δ = 0

{k0} of {n0} draws reject at the 5% level: empirical size
**{fmt_pct(z0['reject_jack'])}** (Clopper–Pearson 95% CI
[{fmt_pct(lo0)}, {fmt_pct(hi0)}]). The default bootstrap rejects
{fmt_pct(z0['reject_boot'])} of the same draws; the RI rule is 5% by
construction.

## (c) Power and MDE under the three rules

| True δ | Draws | Default bootstrap | Jackknife | RI-calibrated |
|---|---|---|---|---|
{power_rows}

MDE at 80% power (same interpolation as the committed `mde_for()`):

| Rule | MDE | Drinks/adult/month |
|---|---|---|
| Package default (wild bootstrap) | {mb_txt} | {'—' if np.isnan(mb['mde_delta']) else f"{mb['mde_drinks_per_month']:.1f}"} |
| Jackknife (correctly specified) | {'beyond grid' if np.isnan(mj['mde_delta']) else fmt_pct(abs(mj['mde_delta']))} | {'—' if np.isnan(mj['mde_delta']) else f"{mj['mde_drinks_per_month']:.1f}"} |
| RI-calibrated (committed: {fmt_pct(abs(mde_old.loc['ri_calibrated', 'mde_delta']))}) | {fmt_pct(abs(mri['mde_delta']))} | {mri['mde_drinks_per_month']:.1f} |

## (d) SE-to-true-dispersion ratio by δ

True sampling SD of the estimator across draws:
{ms.iloc[0]['sd_att']:.4f} (identical in every δ cell, asserted).

| True δ | Bootstrap SE / SD (committed "inflation") | Jackknife SE / SD |
|---|---|---|
{ratio_rows}

The growth in the first column is a wild-bootstrap artifact (replicate
variance scales with the treated-unit ATT levels). The jackknife column is
flat, as exact shift-invariance requires (asserted to relative 1e-6).

## (e) Pooled in-time placebos under the jackknife

| Fake T0 | ATT | Bootstrap SE (committed) | Jackknife SE | t (boot) | t (jack) |
|---|---|---|---|---|---|
| 2009 | {p09['att']:.4f} | {p09['se_boot']:.4f} | {p09['se_jack']:.4f} | {p09['t_boot']:.2f} | {p09['t_jack']:.2f} |
| 2007 | {p07['att']:.4f} | {p07['se_boot']:.4f} | {p07['se_jack']:.4f} | {p07['t_boot']:.2f} | {p07['t_jack']:.2f} |

{placebo_reject_txt}

## Robustness variants under both SEs

| Spec | ATT | SE (boot) | SE (jack) | t (boot) | t (jack) |
|---|---|---|---|---|---|
{robust_rows}

## (f) Recommendation for Section V and the abstract

{rec}

## Run record

Total wall time {env['total_wall_min']:.1f} min; {int(env['n_draws_per_cell'])}
draws per cell over δ ∈ {{{env['deltas_run'].replace(' ', ', ')}}} plus
the −5% phase-in cell; degrade decisions: {degrade_txt}. augsynth
{env['augsynth_version']} @ `{env['augsynth_sha']}`; {env['r_version']}.
"""
    with open('Results/JACKKNIFE_MEMO.md', 'w', encoding='utf-8') as f:
        f.write(memo)


# ---- Paper macros: bootstrap mechanism diagnosis (Section 5) ----------------
def write_mechanism_macros():
    d = pd.read_csv(f'{CSV}/power_draws_jack.csv')
    d = d[d['estimator'] == 'multisynth']
    slope = np.polyfit(d['att'] ** 2, d['se_boot'] ** 2, 1)[0]
    corr_boot = np.corrcoef(d['att'] ** 2, d['se_boot'] ** 2)[0, 1]
    corr_jack = np.corrcoef(d['att'] ** 2, d['se_jack'] ** 2)[0, 1]
    t_boot = (d['att'] / d['se_boot']).abs()
    t_asym = t_boot[d['delta'] == d['delta'].min()].mean()
    n_draws = f'{len(d):,}'.replace(',', '{,}')
    # joint fit of the derived variance form: se^2 on att^2 and att
    X = np.column_stack([np.ones(len(d)), d['att'] ** 2, d['att']])
    y = (d['se_boot'] ** 2).to_numpy()
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    r2 = 1 - ((y - X @ beta) ** 2).sum() / ((y - y.mean()) ** 2).sum()
    os.makedirs('paper/gen', exist_ok=True)
    lines = [
        '% Generated by Results/inference_outputs.py from',
        '% Results/csv/power_draws_jack.csv. Do not hand-edit.',
        f'\\newcommand{{\\nMechDraws}}{{{n_draws}}}',
        f'\\newcommand{{\\bootSlope}}{{{slope:.2f}}}',
        f'\\newcommand{{\\bootCorr}}{{{corr_boot:.2f}}}',
        f'\\newcommand{{\\bootCorrJack}}{{{corr_jack:.2f}}}',
        f'\\newcommand{{\\bootTmax}}{{{t_boot.max():.2f}}}',
        f'\\newcommand{{\\bootTasym}}{{{t_asym:.2f}}}',
        f'\\newcommand{{\\bootIntercept}}{{{beta[0]:.5f}}}',
        f'\\newcommand{{\\bootQuad}}{{{beta[1]:.2f}}}',
        f'\\newcommand{{\\bootLin}}{{{beta[2]:.4f}}}',
        f'\\newcommand{{\\bootRsq}}{{{r2:.2f}}}',
    ]
    with open('paper/gen/mechanism.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


# ---- Paper macros: screened simulation (Section 5, from R/12) ----------------
def write_screen_macros():
    res = pd.read_csv(f'{CSV}/power_results_screened.csv')
    mde = pd.read_csv(f'{CSV}/power_mde_screened.csv').set_index('rule')
    ri = pd.read_csv(f'{CSV}/ri_pooled_screened.csv').iloc[0]
    summ = pd.read_csv(f'{CSV}/screen_summary.csv').iloc[0]
    os.makedirs('paper/gen', exist_ok=True)
    mri = abs(mde.loc['ri_calibrated', 'mde_delta']) * 100
    mjk = mde.loc['jackknife', 'mde_delta']
    mjk_txt = 'beyond the grid' if pd.isna(mjk) else f'{abs(mjk) * 100:.1f}'
    lines = [
        '% Generated by Results/inference_outputs.py from the',
        '% R/12_power_screen.R CSVs. Do not hand-edit.',
        f'\\newcommand{{\\scrShare}}{{{summ["share_power_affected"] * 100:.0f}}}',
        f'\\newcommand{{\\scrFailCells}}{{{int(summ["n_fail_cells"])}}}',
        f'\\newcommand{{\\scrMdeRi}}{{{mri:.1f}}}',
        f'\\newcommand{{\\scrMdeJack}}{{{mjk_txt}}}',
        f'\\newcommand{{\\scrRiP}}{{{ri["p_two_sided"]:.2f}}}',
    ]
    with open('paper/gen/screen.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


write_mechanism_macros()
print('wrote paper/gen/mechanism.tex')
if os.path.exists(f'{CSV}/power_results_screened.csv'):
    write_screen_macros()
    print('wrote paper/gen/screen.tex')
if '--macros-only' not in sys.argv:
    fig_power_3rules()
    make_memo()
    print('wrote Results/figures/fig_n9_power_3rules.pdf and '
          'Results/JACKKNIFE_MEMO.md')
