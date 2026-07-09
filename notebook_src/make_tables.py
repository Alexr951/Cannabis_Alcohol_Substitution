# Generates every LaTeX table fragment and in-text number macro for BOTH
# papers from Results/csv/ and the processed data. Output: paper/gen/*.tex
# (numbers.tex + tab_*.tex for main.tex; stats_numbers.tex +
# stats_tab_power_rows.tex for stats.tex; gen/mechanism.tex and gen/screen.tex
# come from Results/inference_outputs.py, which owns the fit computations).
# No statistic in either paper is hand-typed — they all come from here.
# Extracted from the notebook's table cell, which now calls this script.
# Run from the repository root:  python notebook_src/make_tables.py
# Primary inference for main.tex is the JACKKNIFE over units; the default wild
# bootstrap appears only in table notes and in the stats-note fragments.
import os
import numpy as np
import pandas as pd
from scipy import stats as sps

CSV = 'Results/csv'
GEN = 'paper/gen'

EST_NAMES = {
    'multisynth': 'Partially-pooled ASCM (primary)',
    'sdid': 'Synthetic difference-in-differences',
    'gsynth_ife': 'Generalized synthetic control (IFE)',
    'matrix_completion': 'Matrix completion',
    'callaway_santanna': "Callaway--Sant'Anna",
    'twfe': 'Two-way fixed effects',
}
EST_ORDER = list(EST_NAMES)
EST_INFER = {
    'multisynth': 'Jackknife',
    'sdid': 'Placebo (200 reps/cohort)',
    'gsynth_ife': 'Param.\\ bootstrap (500)',
    'matrix_completion': 'Bootstrap (500)',
    'callaway_santanna': 'Multiplier bootstrap (999)',
    'twfe': 'Clustered by state',
}


def pct(x, d=1):
    return f"{(np.exp(x) - 1) * 100:+.{d}f}"


def f3(x):
    return f"{x:+.3f}"


def macro(name, value):
    return f"\\newcommand{{\\{name}}}{{{value}}}"


def load_summary():
    ms = pd.read_csv(f'{CSV}/multisynth_overall.csv')
    avg = ms[ms['state'] == 'Average'].iloc[0]
    sd = pd.read_csv(f'{CSV}/sdid_primary.csv')
    agg = sd[sd['states'] == 'Aggregate'].iloc[0]
    gs = pd.read_csv(f'{CSV}/gsynth_primary.csv').set_index('estimator')
    ct = pd.read_csv(f'{CSV}/cs_twfe_primary.csv').set_index('estimator')
    rows = {
        'multisynth': (avg['Estimate'], avg['Std.Error']),
        'sdid': (agg['tau'], agg['se']),
        'gsynth_ife': (gs.loc['gsynth_ife', 'att'], gs.loc['gsynth_ife', 'se']),
        'matrix_completion': (gs.loc['matrix_completion', 'att'],
                              gs.loc['matrix_completion', 'se']),
        'callaway_santanna': (ct.loc['callaway_santanna', 'att'],
                              ct.loc['callaway_santanna', 'se']),
        'twfe': (ct.loc['twfe', 'att'], ct.loc['twfe', 'se']),
    }
    return rows, gs


def main():
    os.makedirs(GEN, exist_ok=True)
    sr = pd.read_csv(f'{CSV}/sample_rules.csv')
    chow = pd.read_csv(f'{CSV}/wa_chow.csv').set_index('series')
    ri = pd.read_csv(f'{CSV}/ri_pooled.csv').iloc[0]
    itp = pd.read_csv(f'{CSV}/intime_placebo_pooled2009.csv')
    its = pd.read_csv(f'{CSV}/intime_placebo_single.csv').dropna(subset=['fake_att'])
    sc = pd.read_csv(f'{CSV}/scpi_conformal.csv')
    st = pd.read_csv(f'{CSV}/state_scm_att.csv')
    rb = pd.read_csv(f'{CSV}/robustness_variants.csv').set_index('spec')
    wa = pd.read_csv(f'{CSV}/wa_beer_wine.csv').iloc[0]
    pw = pd.read_csv(f'{CSV}/power_results.csv')
    mde = pd.read_csv(f'{CSV}/power_mde.csv').set_index('rule')
    mde_e = pd.read_csv(f'{CSV}/power_mde_by_estimator.csv').set_index('estimator')
    jdiag = pd.read_csv(f'{CSV}/power_jackknife_diag.csv').set_index('delta')
    itp07 = pd.read_csv(f'{CSV}/intime_placebo_pooled2007.csv')
    # jackknife-primary inputs (R/11 standalone outputs)
    ovj = pd.read_csv(f'{CSV}/multisynth_overall_jack.csv').iloc[0]
    ipj = pd.read_csv(f'{CSV}/intime_pooled_jack.csv').set_index('fake_t0')
    res3 = pd.read_csv(f'{CSV}/power_results_3rules.csv').set_index(['estimator', 'delta'])
    mde3 = pd.read_csv(f'{CSV}/power_mde_3rules.csv').set_index('rule')
    rbj = pd.read_csv(f'{CSV}/robustness_jack.csv').set_index('spec')
    cov = pd.read_csv(f'{CSV}/covariate_lag_subset.csv')
    wts = pd.read_csv(f'{CSV}/state_scm_weights.csv')
    panel = pd.read_csv('Data/processed/panel_long.csv')
    treat = pd.read_csv('Data/processed/treatment.csv')
    fs = pd.read_csv('Data/external/cannabis_sales_annual.csv')
    pop = pd.read_csv('Data/processed/population_21.csv')

    rows, gs = load_summary()
    avg_att, avg_se = rows['multisynth']
    mri = mde.loc['ri_calibrated']
    never = treat[treat['ever_rec_2023'] == 0]['fips'].tolist()
    cf = sr[sr['included'] == 1]
    pw_ms = pw[pw['estimator'] == 'multisynth'].set_index('delta')

    # ---------------- numbers.tex ----------------
    M = []
    M.append(macro('nDonors', len(never)))
    M.append(macro('nCleanFit', len(cf)))
    M.append(macro('cleanFitList', ', '.join(cf['state'])))
    excl = sr[sr['included'] == 0]
    M.append(macro('akRel', f"{excl[excl['state'] == 'Alaska']['rel_to_placebo'].iloc[0]:.1f}"))
    M.append(macro('nvRel', f"{excl[excl['state'] == 'Nevada']['rel_to_placebo'].iloc[0]:.1f}"))
    M.append(macro('waChowP', f"{chow.loc['total', 'p_value']:.2f}"))
    for e in EST_ORDER:
        a, s = rows[e]
        key = ''.join(w.capitalize() for w in e.split('_'))
        M.append(macro(f'att{key}', pct(a)))
        M.append(macro(f'attLog{key}', f3(a)))
        M.append(macro(f'se{key}', f"{s:.3f}"))
    M.append(macro('riP', f"{ri['p_two_sided']:.2f}"))
    M.append(macro('riDraws', int(ri['n_draws'])))
    M.append(macro('riNullSd', f"{ri['null_sd']:.3f}"))
    M.append(macro('rangeLo', pct(min(a for a, _ in rows.values()))))
    M.append(macro('rangeHi', pct(max(a for a, _ in rows.values()))))
    M.append(macro('gsR', int(gs.loc['gsynth_ife', 'r_or_lambda'])))
    # in-time pooled
    itp_i = itp.set_index('estimator')
    M.append(macro('fakeLo', pct(itp['att'].min())))
    M.append(macro('fakeHi', pct(itp['att'].max())))
    M.append(macro('fakeWorstT', f"{itp['t_stat'].min():.2f}"))
    M.append(macro('fakeMs', pct(itp_i.loc['multisynth', 'att'])))
    M.append(macro('fakeMc', pct(itp_i.loc['matrix_completion', 'att'])))
    # bias bands
    bb = its.groupby('estimator')['fake_att'].agg(['mean', 'std'])
    M.append(macro('bandMean', pct(bb['mean'].mean())))
    M.append(macro('bandSdLo', f"{bb['std'].min() * 100:.1f}"))
    M.append(macro('bandSdHi', f"{bb['std'].max() * 100:.1f}"))
    M.append(macro('nFakeRuns', int(its.groupby('estimator').size().iloc[0])))
    # conformal / CA
    ca = sc[sc['state'] == 'California']
    M.append(macro('caGap', pct(ca['gap'].mean())))
    M.append(macro('caGapLo', pct(ca['gap_lo'].min())))
    ma = sc[sc['state'] == 'Massachusetts']
    M.append(macro('maGap', pct(ma['gap'].mean())))
    # power
    M.append(macro('sizeBootDefault', f"{pw_ms.loc[0.0, 'reject_se'] * 100:.1f}"))
    M.append(macro('powRiTwo', f"{pw_ms.loc[-0.02, 'reject_ri'] * 100:.0f}"))
    M.append(macro('powRiFive', f"{pw_ms.loc[-0.05, 'reject_ri'] * 100:.0f}"))
    M.append(macro('powRiEight', f"{pw_ms.loc[-0.08, 'reject_ri'] * 100:.0f}"))
    M.append(macro('powRiTwelve', f"{pw_ms.loc[-0.12, 'reject_ri'] * 100:.0f}"))
    M.append(macro('mdeRi', f"{abs(mri['mde_delta']) * 100:.1f}"))
    M.append(macro('mdeDrinks', f"{mri['mde_drinks_per_month']:.1f}"))
    M.append(macro('baseGal', f"{mri['baseline_gal_ethanol_21']:.2f}"))
    for e, lab in [('sdid', 'Sdid'), ('callaway_santanna', 'Cs'),
                   ('matrix_completion', 'Mc'), ('gsynth_ife', 'Gsy')]:
        sub = pw[(pw['estimator'] == e)].set_index('delta')
        M.append(macro(f'sizeSe{lab}', f"{sub.loc[0.0, 'reject_se'] * 100:.0f}"))
        M.append(macro(f'powRi{lab}', f"{sub.loc[-0.05, 'reject_ri'] * 100:.0f}"))
    # envelope MDE (best-calibrated estimator) and jackknife diagnosis
    env = mde_e[mde_e['envelope']].iloc[0]
    M.append(macro('mdeEnvelope', f"{abs(env['mde_ri']) * 100:.1f}"))
    M.append(macro('mdeEnvelopeDrinks', f"{env['mde_ri_drinks']:.1f}"))
    M.append(macro('envEstName', EST_NAMES[env.name].replace('(primary)', '').strip()))
    M.append(macro('bootInfl', f"{jdiag.loc[0.0, 'se_inflation']:.1f}"))
    M.append(macro('bootInflTwelve', f"{jdiag.loc[-0.12, 'se_inflation']:.1f}"))
    # ---- jackknife-primary macros (R/11 outputs; main.tex reports these) ----
    ms3 = res3.loc['multisynth']
    ph3 = res3.loc[('multisynth_phased', -0.05)]
    assert abs(float(ovj['att']) - avg_att) < 1e-8, \
        "multisynth_overall_jack att diverges from multisynth_overall"
    n0j = int(ms3.loc[0.0, 'n_ok'])
    k0j = int(round(float(ms3.loc[0.0, 'reject_jack']) * n0j))
    lo0j = sps.beta.ppf(0.025, k0j, n0j - k0j + 1) if k0j > 0 else 0.0
    hi0j = sps.beta.ppf(0.975, k0j + 1, n0j - k0j) if k0j < n0j else 1.0
    M.append(macro('sizeJack', f"{ms3.loc[0.0, 'reject_jack'] * 100:.1f}"))
    M.append(macro('sizeJackLo', f"{lo0j * 100:.1f}"))
    M.append(macro('sizeJackHi', f"{hi0j * 100:.1f}"))
    M.append(macro('mdeJack', f"{abs(mde3.loc['jackknife', 'mde_delta']) * 100:.1f}"))
    M.append(macro('mdeJackDrinks', f"{mde3.loc['jackknife', 'mde_drinks_per_month']:.1f}"))
    M.append(macro('jackInfl', f"{ms3.loc[0.0, 'ratio_jack']:.2f}"))
    for nm, dd in [('Two', -0.02), ('Five', -0.05), ('Eight', -0.08), ('Twelve', -0.12)]:
        M.append(macro(f'powJack{nm}', f"{ms3.loc[dd, 'reject_jack'] * 100:.0f}"))
    M.append(macro('powJackPhased', f"{ph3['reject_jack'] * 100:.0f}"))
    # primary real-data estimate under both standard errors (Table 3 + notes)
    M.append(macro('seJackMultisynth', f"{ovj['se_jack']:.4f}"))
    M.append(macro('ciJackLo', f3(ovj['ci_lo_jack'])))
    M.append(macro('ciJackHi', f3(ovj['ci_hi_jack'])))
    M.append(macro('tJackMultisynth', f"{ovj['att'] / ovj['se_jack']:.2f}"))
    M.append(macro('seBootMultisynth', f"{ovj['se_boot']:.4f}"))
    M.append(macro('ciBootLo', f3(ovj['ci_lo_boot'])))
    M.append(macro('ciBootHi', f3(ovj['ci_hi_boot'])))
    # pooled in-time placebos under the jackknife (Table 5 + note)
    M.append(macro('fakeJackTNine', f"{ipj.loc[2009, 't_jack']:.2f}"))
    M.append(macro('fakeJackTSvn', f"{ipj.loc[2007, 't_jack']:.2f}"))
    M.append(macro('fakeBootSeNine', f"{ipj.loc[2009, 'se_boot']:.4f}"))
    # asymmetric detectability at the plausible-range endpoints (2% vs 4%)
    def interp_ri(est, d):
        s = pw[pw['estimator'] == est].set_index('delta').sort_index()
        return float(np.interp(d, s.index.values, s['reject_ri'].values))
    cs = pw[pw['estimator'] == 'callaway_santanna'].set_index('delta')
    M.append(macro('powRiCsTwo', f"{cs.loc[-0.02, 'reject_ri'] * 100:.0f}"))
    M.append(macro('powRiCsFour', f"{interp_ri('callaway_santanna', -0.04) * 100:.0f}"))
    M.append(macro('powRiMsFour', f"{interp_ri('multisynth', -0.04) * 100:.0f}"))
    # phased-in effect cell
    pw_ph = pw[pw['estimator'] == 'multisynth_phased'].set_index('delta')
    M.append(macro('powPhased', f"{pw_ph.loc[-0.05, 'reject_ri'] * 100:.0f}"))
    # pooled fake-2007
    M.append(macro('fakeSvnLo', pct(itp07['att'].min())))
    M.append(macro('fakeSvnHi', pct(itp07['att'].max())))
    M.append(macro('fakeSvnWorstT', f"{itp07['t_stat'].abs().max():.2f}"))
    # recovery (bias check)
    M.append(macro('recovFive', f"{pw_ms.loc[-0.05, 'mean_att']:.3f}"))
    M.append(macro('recovEight', f"{pw_ms.loc[-0.08, 'mean_att']:.3f}"))
    # robustness / WA
    M.append(macro('waBwAtt', pct(wa['att'])))
    M.append(macro('waBwLo', f3(wa['ci_lo'])))
    M.append(macro('waBwHi', f3(wa['ci_hi'])))
    M.append(macro('extAtt', pct(rb.loc['window_2000_2023', 'att'])))
    M.append(macro('bevWine', pct(rb.loc['beverage_wine', 'att'])))
    # first stage doses
    fsm = fs.merge(pop, on=['fips', 'year'], how='left').dropna(subset=['pop21'])
    fsm['sales_pc'] = fsm['sales_usd'] / fsm['pop21']
    t0_map = dict(zip(sr['fips'], sr['t0']))
    fsm['t0'] = fsm['fips'].map(t0_map)
    dose = (fsm[fsm['year'].between(fsm['t0'], fsm['t0'] + 1)]
            .groupby('state')['sales_pc'].mean())
    M.append(macro('doseCo', f"{dose['Colorado']:.0f}"))
    M.append(macro('doseCa', f"{dose['California']:.0f}"))
    M.append(macro('doseNv', f"{dose['Nevada']:.0f}"))
    M.append(macro('doseRatio', f"{dose['Colorado'] / dose['California']:.1f}"))
    # state-level
    st_i = st.set_index(['state', 'estimator'])
    M.append(macro('coClassic', pct(st_i.loc[('Colorado', 'classic_scm'), 'att'])))
    M.append(macro('waClassic', pct(st_i.loc[('Washington', 'classic_scm'), 'att'])))
    M.append(macro('caClassic', pct(st_i.loc[('California', 'classic_scm'), 'att'])))
    with open(f'{GEN}/numbers.tex', 'w', encoding='utf-8') as f:
        f.write('% Auto-generated by notebook_src/make_tables.py — do not edit.\n'
                + '\n'.join(M) + '\n')

    # ---------------- Table 1: descriptives (fixed donor row) ----------------
    tot = panel[panel['beverage'] == 'total']
    wide = tot.pivot_table(index='year', columns='fips', values='pc_eth21')
    lines = []
    for _, r in sr.sort_values('t0').iterrows():
        f_, t0 = int(r['fips']), int(r['t0'])
        pre = wide.loc[wide.index < t0, f_]
        lines.append(f"{r['state']} & 2000--{t0 - 1} & {pre.mean():.3f} & "
                     f"{pre.std():.3f} & {pre.min():.3f} & {pre.max():.3f} \\\\")
    dv = wide.loc[2000:2013, [f_ for f_ in never if f_ in wide.columns]]
    lines.append('\\midrule')
    lines.append(f"Donor average & 2000--2013 & {dv.values.mean():.3f} & "
                 f"{dv.values.std():.3f} & {dv.values.min():.3f} & "
                 f"{dv.values.max():.3f} \\\\")
    with open(f'{GEN}/tab_desc_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Table: sample rules ----------------
    lines = []
    for _, r in sr.sort_values('t0').iterrows():
        inc = 'Yes' if r['included'] == 1 else 'No'
        lines.append(f"{r['state']} & {int(r['t0'])} & {r['pre_rmspe']:.4f} & "
                     f"{r['donor_placebo_median_rmspe']:.4f} & "
                     f"{r['rel_to_placebo']:.2f} & {r['ratio_own_sd']:.2f} & "
                     f"{inc} \\\\")
    with open(f'{GEN}/tab_rules_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Table: horse race ----------------
    # Primary row reports the jackknife over units; the default wild bootstrap
    # value moves to the table note (macros seBootMultisynth, ciBoot*).
    lines = []
    for e in EST_ORDER:
        a, s = rows[e]
        if e == 'multisynth':
            a, s = float(ovj['att']), float(ovj['se_jack'])
        lines.append(f"{EST_NAMES[e]} & {a:.4f} & ({s:.4f}) & {pct(a)} & "
                     f"[{a - 1.96 * s:+.3f}, {a + 1.96 * s:+.3f}] & "
                     f"{EST_INFER[e]} \\\\")
    with open(f'{GEN}/tab_horserace_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Table: in-time pooled + bias bands ----------------
    lines = []
    for e in EST_ORDER:
        r = itp_i.loc[{'gsynth_ife': 'gsynth_ife'}.get(e, e)]
        band = ''
        key = {'multisynth': None, 'sdid': 'sdid', 'gsynth_ife': 'gsynth_ife',
               'matrix_completion': None, 'callaway_santanna': None,
               'twfe': None}[e]
        if key is not None and key in bb.index:
            band = f"{bb.loc[key, 'mean']:.4f} & {bb.loc[key, 'std']:.4f}"
        elif e == 'multisynth':
            # The pooled primary estimator has no single-unit analogue; the
            # classic single-treated-unit SCM band stands in. Marked with a
            # dagger in the table so the borrowed quantity is explicit.
            cl = bb.loc['classic_scm']
            band = f"{cl['mean']:.4f}$^{{\\dagger}}$ & {cl['std']:.4f}"
        else:
            band = '--- & ---'
        att_v, se_v, t_v = r['att'], r['se'], r['t_stat']
        if e == 'multisynth':
            # jackknife-primary: SE and t from the paired rerun; the point
            # estimate is identical (asserted), the default SE goes to the note.
            assert abs(float(ipj.loc[2009, 'att']) - float(r['att'])) < 1e-8, \
                "pooled fake-2009 att diverges between committed files"
            se_v, t_v = ipj.loc[2009, 'se_jack'], ipj.loc[2009, 't_jack']
        lines.append(f"{EST_NAMES[e]} & {att_v:.4f} & ({se_v:.4f}) & "
                     f"{t_v:.2f} & {band} \\\\")
    with open(f'{GEN}/tab_intime_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Table: power (primary, incl. phased-in row) ----------
    # main.tex version: two rules (jackknife, RI-calibrated). The 3-rules file
    # must agree with the committed power_results.csv on the shared columns.
    rej = lambda x: f"{x * 100:.1f}\\%"
    ms3s = ms3.sort_index(ascending=False)
    for d, r in ms3s.iterrows():
        assert abs(float(r['reject_ri']) - float(pw_ms.loc[d, 'reject_ri'])) < 1e-9, \
            f"reject_ri diverges between power CSVs at delta={d}"
        assert abs(float(r['mean_att']) - float(pw_ms.loc[d, 'mean_att'])) < 1e-9, \
            f"mean_att diverges between power CSVs at delta={d}"
    lines = []
    for d, r in ms3s.iterrows():
        lines.append(f"{d * 100:.0f}\\% & {int(r['n_ok'])} & "
                     f"{rej(r['reject_jack'])} & {rej(r['reject_ri'])} & "
                     f"{r['mean_att']:.4f} \\\\")
    lines.append(f"$-5$\\% (3-yr phase-in) & {int(ph3['n_ok'])} & "
                 f"{rej(ph3['reject_jack'])} & {rej(ph3['reject_ri'])} & "
                 f"{ph3['mean_att']:.4f} \\\\")
    with open(f'{GEN}/tab_power_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # stats.tex version: all three rules, default column retained.
    lines = []
    for d, r in ms3s.iterrows():
        lines.append(f"{d * 100:.0f}\\% & {int(r['n_ok'])} & "
                     f"{rej(r['reject_boot'])} & {rej(r['reject_jack'])} & "
                     f"{rej(r['reject_ri'])} & {r['mean_att']:.4f} \\\\")
    lines.append(f"$-5$\\% (3-yr phase-in) & {int(ph3['n_ok'])} & "
                 f"{rej(ph3['reject_boot'])} & {rej(ph3['reject_jack'])} & "
                 f"{rej(ph3['reject_ri'])} & {ph3['mean_att']:.4f} \\\\")
    with open(f'{GEN}/stats_tab_power_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Table: power and MDE by estimator ----------------
    lines = []
    for e in EST_ORDER:
        if e == 'twfe':
            continue
        sub = pw[pw['estimator'] == e].set_index('delta')
        mrow = mde_e.loc[e]
        mde_s = ('---' if pd.isna(mrow['mde_ri'])
                 else f"{abs(mrow['mde_ri']) * 100:.1f}\\%")
        lines.append(f"{EST_NAMES[e]} & {rej(sub.loc[0.0, 'reject_se'])} & "
                     f"{rej(sub.loc[-0.02, 'reject_ri'])} & "
                     f"{rej(sub.loc[-0.05, 'reject_ri'])} & "
                     f"{rej(sub.loc[-0.08, 'reject_ri'])} & "
                     f"{rej(sub.loc[-0.12, 'reject_ri'])} & {mde_s} \\\\")
    with open(f'{GEN}/tab_spot_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Table: state-by-state + conformal ----------------
    sc_sum = sc.groupby('state').agg(gap=('gap', 'mean'), lo=('gap_lo', 'min'),
                                     hi=('gap_hi', 'max'))
    lines = []
    for _, r in sr.sort_values('t0').iterrows():
        s = r['state']
        cl = st_i.loc[(s, 'classic_scm'), 'att']
        rg = st_i.loc[(s, 'ridge_ascm'), 'att']
        pr = st_i.loc[(s, 'classic_scm'), 'pre_rmspe']
        if s in sc_sum.index:
            conf = (f"[{sc_sum.loc[s, 'lo']:+.3f}, {sc_sum.loc[s, 'hi']:+.3f}]")
        else:
            conf = '---'
        lines.append(f"{s} & {int(r['t0'])} & {pr:.4f} & {cl:.4f} & "
                     f"{rg:.4f} & {pct(cl)} & {conf} \\\\")
    with open(f'{GEN}/tab_state_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Table: robustness ----------------
    rb_lab = {
        'primary': 'Primary specification',
        'drop_adjacent_donors': 'Drop donors adjacent to treated states',
        'drop_oklahoma_medical': 'Drop Oklahoma (high-intensity medical)',
        'drop_new_hampshire': 'Drop New Hampshire (cross-border sales)',
        'timing_adjusted_pool': 'Timing-adjusted donor pool',
        'window_2000_2023': 'Extension window, 2000--2023',
        'all_seven_treated': 'All seven treated states',
        'beverage_beer': 'Beer ethanol only',
        'beverage_wine': 'Wine ethanol only',
        'beverage_spirits': 'Spirits ethanol only',
    }
    # Jackknife SEs throughout (robustness_jack.csv, paired with the committed
    # variants — point estimates asserted identical). Default-bootstrap SEs
    # stay in the replication materials.
    lines = []
    for k, lab in rb_lab.items():
        r = rb.loc[k]
        assert abs(float(rbj.loc[k, 'att']) - float(r['att'])) < 1e-8, \
            f"robustness att diverges for {k}"
        lines.append(f"{lab} & {r['att']:.4f} & ({rbj.loc[k, 'se_jack']:.4f}) & "
                     f"{pct(r['att'])} \\\\")
    lines.append(f"Washington, spirits-excluded outcome & {wa['att']:.4f} & "
                 f"[{wa['ci_lo']:+.3f}, {wa['ci_hi']:+.3f}] & {pct(wa['att'])} \\\\")
    with open(f'{GEN}/tab_robust_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Table: covariate lag-subset ----------------
    lines = []
    for _, r in cov.sort_values('t0').iterrows():
        lines.append(f"{r['state']} & {int(r['t0'])} & "
                     f"{r['att_outcome_only']:.4f} & "
                     f"{r['att_lagsubset_cov']:.4f} \\\\")
    with open(f'{GEN}/tab_cov_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Table: first-stage dose ----------------
    lines = []
    for s_name in dose.sort_values(ascending=False).index:
        t0 = int(sr[sr['state'] == s_name]['t0'].iloc[0])
        lines.append(f"{s_name} & {t0} & {dose[s_name]:.0f} \\\\")
    with open(f'{GEN}/tab_dose_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Appendix: donor weights ----------------
    lines = []
    for f_, g in wts.groupby('treated_fips'):
        g = g.sort_values('weight', ascending=False).head(8)
        entries = ', '.join(f"{r['donor']} ({r['weight']:.3f})"
                            for _, r in g.iterrows())
        lines.append(f"{g['treated'].iloc[0]} & {entries} \\\\[2pt]")
    with open(f'{GEN}/tab_weights_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Appendix: covariate balance (pre-T0, classic weights) ---
    cov_files = {'GDP per capita (\\$)': ('Data/external/bea_gdp_pc.csv', '{:,.0f}'),
                 'Unemployment (\\%)': ('Data/external/bls_unemployment.csv', '{:.1f}'),
                 'Share aged 20--34': ('Data/external/age_share_20_34.csv', '{:.3f}'),
                 'Beer tax (\\$/gal)': ('Data/external/beer_tax.csv', '{:.2f}')}
    lines = []
    for _, srow in sr.sort_values('t0').iterrows():
        f_, t0, s_name = int(srow['fips']), int(srow['t0']), srow['state']
        g = wts[wts['treated_fips'] == f_]
        wmap = dict(zip(g['donor_fips'], g['weight']))
        first = f"{s_name} ({t0})"
        for lab, (path, fmt) in cov_files.items():
            df = pd.read_csv(path)
            val_col = [c for c in df.columns if c not in
                       ('fips', 'state', 'year', 'source_url', 'rate_as_of')][0]
            m = (df[df['year'].between(t0 - 3, t0 - 1)]
                 .groupby('fips')[val_col].mean())
            tv = m.get(f_, np.nan)
            sv = sum(wmap.get(d, 0) * m.get(d, np.nan) for d in never)
            da = m[m.index.isin(never)].mean()
            lines.append(f"{first} & {lab} & {fmt.format(tv)} & "
                         f"{fmt.format(sv)} & {fmt.format(da)} \\\\")
            first = ''
    with open(f'{GEN}/tab_balance_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- stats.tex macros (stats_numbers.tex) ----------------
    # The companion note's numbers. Fit/mechanism macros (slope, correlations,
    # max t, asymptote) live in gen/mechanism.tex from Results/inference_outputs.py.
    S = []
    S.append(macro('statNTreated', len(cf)))
    S.append(macro('statNDonors', len(never)))
    S.append(macro('statDrawsPerCell', n0j))
    S.append(macro('statSizeBootDefault', f"{ms3.loc[0.0, 'reject_boot'] * 100:.1f}"))
    S.append(macro('statBootInfl', f"{ms3.loc[0.0, 'ratio_boot']:.1f}"))
    S.append(macro('statBootInflTwelve', f"{ms3.loc[-0.12, 'ratio_boot']:.1f}"))
    S.append(macro('statJackInfl', f"{ms3.loc[0.0, 'ratio_jack']:.2f}"))
    S.append(macro('statSizeJack', f"{ms3.loc[0.0, 'reject_jack'] * 100:.1f}"))
    S.append(macro('statSizeJackLo', f"{lo0j * 100:.1f}"))
    S.append(macro('statSizeJackHi', f"{hi0j * 100:.1f}"))
    S.append(macro('statMdeJack', f"{abs(mde3.loc['jackknife', 'mde_delta']) * 100:.1f}"))
    S.append(macro('statMdeRi', f"{abs(mri['mde_delta']) * 100:.1f}"))
    S.append(macro('statAttPct', pct(ovj['att'])))
    S.append(macro('statAttLog', f"{ovj['att']:.4f}"))
    S.append(macro('statSeBoot', f"{ovj['se_boot']:.4f}"))
    S.append(macro('statSeJack', f"{ovj['se_jack']:.4f}"))
    S.append(macro('statTBoot', f"{ovj['att'] / ovj['se_boot']:.2f}"))
    S.append(macro('statTJack', f"{ovj['att'] / ovj['se_jack']:.2f}"))
    S.append(macro('statRiP', f"{ri['p_two_sided']:.2f}"))
    with open(f'{GEN}/stats_numbers.tex', 'w', encoding='utf-8') as f:
        f.write('% Auto-generated by notebook_src/make_tables.py — do not edit.\n'
                + '\n'.join(S) + '\n')

    print(f"paper/gen written: {len(os.listdir(GEN))} files")


if __name__ == '__main__':
    main()
