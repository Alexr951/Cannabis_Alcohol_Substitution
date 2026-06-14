# Generates every LaTeX table fragment and in-text number macro for the paper
# from Results/csv/ and the processed data. Output: paper/gen/*.tex.
# No statistic in main.tex is hand-typed — they all come from here.
import os
import numpy as np
import pandas as pd

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
    M.append(macro('sizeJack', f"{pw_ms.loc[0.0, 'reject_se'] * 100:.1f}"))
    M.append(macro('powJackEight', f"{pw_ms.loc[-0.08, 'reject_se'] * 100:.0f}"))
    M.append(macro('powJackTwelve', f"{pw_ms.loc[-0.12, 'reject_se'] * 100:.0f}"))
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
    M.append(macro('jackInfl', f"{jdiag.loc[0.0, 'se_inflation']:.1f}"))
    M.append(macro('jackInflTwelve', f"{jdiag.loc[-0.12, 'se_inflation']:.1f}"))
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
    lines = []
    for e in EST_ORDER:
        a, s = rows[e]
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
        lines.append(f"{EST_NAMES[e]} & {r['att']:.4f} & ({r['se']:.4f}) & "
                     f"{r['t_stat']:.2f} & {band} \\\\")
    with open(f'{GEN}/tab_intime_rows.tex', 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # ---------------- Table: power (primary, incl. phased-in row) ----------
    rej = lambda x: f"{x * 100:.1f}\\%"
    lines = []
    for d, r in pw_ms.sort_index(ascending=False).iterrows():
        lines.append(f"{d * 100:.0f}\\% & {int(r['n_ok'])} & "
                     f"{rej(r['reject_se'])} & {rej(r['reject_ri'])} & "
                     f"{r['mean_att']:.4f} \\\\")
    ph = pw_ph.loc[-0.05]
    lines.append(f"$-5$\\% (3-yr phase-in) & {int(ph['n_ok'])} & "
                 f"{rej(ph['reject_se'])} & {rej(ph['reject_ri'])} & "
                 f"{ph['mean_att']:.4f} \\\\")
    with open(f'{GEN}/tab_power_rows.tex', 'w', encoding='utf-8') as f:
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
    lines = []
    for k, lab in rb_lab.items():
        r = rb.loc[k]
        lines.append(f"{lab} & {r['att']:.4f} & ({r['se']:.4f}) & "
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

    print(f"paper/gen written: {len(os.listdir(GEN))} files")


if __name__ == '__main__':
    main()
