# Figures for the redesigned paper — every figure built from Results/csv/*.csv
# (no hand-typed numbers). Style carried over from the v1 notebook.
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

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

EST_LABELS = {
    'multisynth': 'Partially-pooled ASCM\n(multisynth, jackknife)',
    'sdid': 'Synthetic DiD\n(placebo SE)',
    'gsynth_ife': 'Gen. synthetic control\n(IFE, param. bootstrap)',
    'matrix_completion': 'Matrix completion\n(bootstrap)',
    'callaway_santanna': "Callaway-Sant'Anna\n(multiplier bootstrap)",
    'twfe': 'TWFE\n(clustered SE)',
}
EST_ORDER = ['multisynth', 'sdid', 'gsynth_ife', 'matrix_completion',
             'callaway_santanna', 'twfe']


def load_estimator_summary():
    """One row per pooled estimator: att, se, ci."""
    rows = []
    ms = pd.read_csv(f'{CSV}/multisynth_overall.csv')
    avg = ms[ms['state'] == 'Average'].iloc[0]
    rows.append(('multisynth', avg['Estimate'], avg['Std.Error']))
    sd = pd.read_csv(f'{CSV}/sdid_primary.csv')
    agg = sd[sd['states'] == 'Aggregate'].iloc[0]
    rows.append(('sdid', agg['tau'], agg['se']))
    gs = pd.read_csv(f'{CSV}/gsynth_primary.csv')
    for _, r in gs.iterrows():
        rows.append((r['estimator'], r['att'], r['se']))
    ct = pd.read_csv(f'{CSV}/cs_twfe_primary.csv')
    for _, r in ct.iterrows():
        rows.append((r['estimator'], r['att'], r['se']))
    df = pd.DataFrame(rows, columns=['estimator', 'att', 'se'])
    df['ci_lo'] = df['att'] - 1.96 * df['se']
    df['ci_hi'] = df['att'] + 1.96 * df['se']
    df['estimator'] = pd.Categorical(df['estimator'], EST_ORDER, ordered=True)
    return df.sort_values('estimator').reset_index(drop=True)


def fig_forest_estimators():
    """Headline figure: all pooled estimators on one axis + RI p-value."""
    df = load_estimator_summary()
    ri = pd.read_csv(f'{CSV}/ri_pooled.csv').iloc[0]
    fig, ax = plt.subplots(figsize=(9, 5.5))
    y = np.arange(len(df))[::-1]
    ax.errorbar(df['att'], y, xerr=1.96 * df['se'], fmt='o', color=COLORS['treated'],
                ecolor=COLORS['treated'], elinewidth=2, capsize=4, markersize=7)
    ax.axvline(0, color='black', lw=0.8)
    ax.set_yticks(y)
    ax.set_yticklabels([EST_LABELS[e] for e in df['estimator']], fontsize=9)
    ax.set_xlabel('Pooled ATT on log per-capita ethanol (95% CI)')
    ax.set_title('Pooled Effect of Recreational Legalization: Six Estimators\n'
                 '(clean-fit states, never-treated donors, 2000–2019)')
    for yi, (_, r) in zip(y, df.iterrows()):
        ax.text(r['ci_hi'] + 0.004, yi, f"{np.exp(r['att'])-1:+.1%}",
                va='center', fontsize=9)
    # Widen the right margin so the joint-null annotation sits in empty space
    # to the right of the estimate labels rather than over the TWFE label.
    x0, x1 = ax.get_xlim()
    ax.set_xlim(x0, x1 + 0.08)
    ax.text(0.985, 0.04,
            f"Joint null test (randomization inference,\n"
            f"N={int(ri['n_draws'])} draws): p = {ri['p_two_sided']:.2f}",
            transform=ax.transAxes, ha='right', va='bottom', fontsize=9,
            bbox=dict(boxstyle='round', fc='white', ec='#cccccc'))
    plt.tight_layout()
    plt.savefig(f'{FIG}/fig_n1_forest_estimators.pdf', bbox_inches='tight')
    plt.show()
    return df


def fig_bias_bands():
    """Systematic in-time placebos: fake-ATT distributions vs real estimates."""
    sp = pd.read_csv(f'{CSV}/intime_placebo_single.csv').dropna(subset=['fake_att'])
    real = pd.read_csv(f'{CSV}/state_scm_att.csv')
    ests = ['classic_scm', 'ridge_ascm', 'sdid', 'gsynth_ife']
    labels = {'classic_scm': 'Classic SCM', 'ridge_ascm': 'Ridge ASCM',
              'sdid': 'Synthetic DiD', 'gsynth_ife': 'gsynth (IFE)'}
    clean = ['Colorado', 'Washington', 'Oregon', 'California', 'Massachusetts']
    rng = np.random.default_rng(0)
    fig, ax = plt.subplots(figsize=(10, 6))
    for i, e in enumerate(ests):
        vals = sp[sp['estimator'] == e]['fake_att'].values
        x = rng.normal(i, 0.055, len(vals))
        ax.scatter(x, vals, s=15, color=COLORS['placebo'], edgecolor='#9a9a9a',
                   linewidth=0.4, alpha=0.7, zorder=2)
        m, sd = vals.mean(), vals.std()
        ax.hlines(m, i - 0.3, i + 0.3, color='#444444', lw=2.2, zorder=3)
        ax.hlines([m - 2 * sd, m + 2 * sd], i - 0.22, i + 0.22,
                  color='#444444', lw=1, ls=(0, (4, 3)), zorder=3)
    # real single-state estimates, spread within the column so they do not overlap
    for i, e in enumerate(['classic_scm', 'ridge_ascm']):
        rr = real[(real['estimator'] == e) & real['state'].isin(clean)]
        rr = rr.sort_values('state')
        offs = np.linspace(-0.17, 0.17, len(rr)) if len(rr) > 1 else np.zeros(len(rr))
        ax.scatter(i + offs, rr['att'], s=46, marker='D', color=COLORS['treated'],
                   edgecolor='white', linewidth=0.8, zorder=5,
                   label='Real estimates (clean-fit states)' if i == 0 else None)
    ax.axhline(0, color='black', lw=0.8)
    ax.set_xticks(range(len(ests)))
    ax.set_xticklabels([labels[e] for e in ests])
    ax.set_xlim(-0.5, len(ests) - 0.5)
    ax.margins(y=0.13)
    ax.set_ylabel('Fake ATT (log points)')
    ax.set_title('Empirical Bias Bands: Backdated Placebos at Every Feasible Fake $T_0$\n'
                 '(grey = fake ATTs, pre-real-treatment data only; bars = mean ± 2 SD; '
                 'blue = real estimates)')
    ax.legend(frameon=False, loc='upper right')
    plt.tight_layout()
    plt.savefig(f'{FIG}/fig_n2_bias_bands.pdf', bbox_inches='tight')
    plt.show()


def fig_fake2009():
    """Pooled fake-2009 diagnostic across all estimators."""
    df = pd.read_csv(f'{CSV}/intime_placebo_pooled2009.csv')
    df['estimator'] = pd.Categorical(df['estimator'], EST_ORDER, ordered=True)
    df = df.sort_values('estimator').reset_index(drop=True)
    fig, ax = plt.subplots(figsize=(9, 5))
    y = np.arange(len(df))[::-1]
    ax.errorbar(df['att'], y, xerr=1.96 * df['se'], fmt='s',
                color=COLORS['synth_scm'], elinewidth=2, capsize=4, markersize=7)
    ax.axvline(0, color='black', lw=0.8)
    ax.set_yticks(y)
    ax.set_yticklabels([EST_LABELS[e] for e in df['estimator']], fontsize=9)
    ax.set_xlabel('Fake pooled ATT, T0 = 2009, panel ends 2013 (95% CI)')
    ax.set_title('In-Time Placebo, Pooled: Does Any Estimator Absorb the Western Drift?')
    plt.tight_layout()
    plt.savefig(f'{FIG}/fig_n3_fake2009_pooled.pdf', bbox_inches='tight')
    plt.show()


def fig_power():
    """RI-calibrated power curves for all five estimators + jackknife curve."""
    pt = pd.read_csv(f'{CSV}/power_results.csv')
    mde = pd.read_csv(f'{CSV}/power_mde.csv').set_index('rule')
    ms = pt[pt['estimator'] == 'multisynth'].sort_values('delta')
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.plot(ms['delta'] * 100, ms['reject_ri'], '-o', color=COLORS['treated'],
            lw=2.2, markersize=7, label='multisynth, RI-calibrated test (size 5%)')
    ax.plot(ms['delta'] * 100, ms['reject_se'], '--s', color=COLORS['synth_scm'],
            lw=2, markersize=6,
            label='multisynth, jackknife test as conventionally used')
    markers = {'sdid': '^', 'gsynth_ife': 's', 'matrix_completion': 'D',
               'callaway_santanna': 'v'}
    cols = {'sdid': '#d62728', 'gsynth_ife': '#2ca02c',
            'matrix_completion': '#9467bd', 'callaway_santanna': '#ff7f0e'}
    for e in markers:
        sub = pt[pt['estimator'] == e].sort_values('delta')
        ax.plot(sub['delta'] * 100, sub['reject_ri'], '-', lw=1.2, alpha=0.85,
                marker=markers[e], markersize=5, color=cols[e],
                label=EST_LABELS[e].split('\n')[0] + ' (RI rule)')
    ax.axhline(0.8, color='gray', ls='--', lw=0.8)
    ax.axhline(0.05, color='gray', ls=':', lw=0.8)
    ax.text(-0.6, 0.815, '80% power', fontsize=9, color='gray')
    ax.text(-0.6, 0.065, '5% nominal size', fontsize=9, color='gray')
    mri = mde.loc['ri_calibrated']
    if not np.isnan(mri['mde_delta']):
        ax.axvline(mri['mde_delta'] * 100, color=COLORS['treated'], ls=':', lw=1)
        ax.text(mri['mde_delta'] * 100 - 0.3, 0.45,
                f"primary MDE ≈ {mri['mde_delta']:.1%}\n"
                f"(≈{mri['mde_drinks_per_month']:.1f} drinks/person/month)",
                fontsize=9, color=COLORS['treated'], ha='right')
    ax.set(xlabel='True injected effect δ (percent of per-capita ethanol)',
           ylabel='Rejection rate at 5% level', ylim=(-0.04, 1.06),
           title='Design-Based Power: Staggered Pseudo-Treatment in Never-Treated States')
    ax.legend(frameon=False, fontsize=8.5, loc='lower left',
              bbox_to_anchor=(0.01, 0.07))
    plt.tight_layout()
    plt.savefig(f'{FIG}/fig_n4_power_curve.pdf', bbox_inches='tight')
    plt.show()


def fig_state_gaps():
    """Descriptive per-state gap paths, classic vs ridge ASCM, 7 states."""
    gaps = pd.read_csv(f'{CSV}/state_scm_gaps.csv')
    sr = pd.read_csv(f'{CSV}/sample_rules.csv')
    t0s = dict(zip(sr['state'], sr['t0']))
    incl = dict(zip(sr['state'], sr['included']))
    states = ['Colorado', 'Washington', 'Oregon', 'Alaska', 'Nevada',
              'California', 'Massachusetts']
    fig, axes = plt.subplots(2, 4, figsize=(20, 9), sharex=True)
    for ax, st in zip(axes.flat, states):
        for est, c, ls in [('classic_scm', COLORS['synth_scm'], '-'),
                           ('ridge_ascm', COLORS['synth_ascm'], ':')]:
            g = gaps[(gaps['state'] == st) & (gaps['estimator'] == est)]
            ax.plot(g['year'], g['gap'], ls, color=c, lw=2,
                    label=est.replace('_', ' '))
        ax.axhline(0, color='black', lw=0.5)
        ax.axvline(t0s[st], color='gray', ls='--', lw=0.8, alpha=0.6)
        flag = '' if incl[st] else '  [excluded by fit rule]'
        ax.set_title(f"{st} (T0={t0s[st]}){flag}",
                     color='black' if incl[st] else '#999999')
        ax.legend(frameon=False, fontsize=7)
    axes.flat[-1].set_visible(False)
    fig.suptitle('State-by-State SCM Gaps (descriptive; 2000–2019, '
                 'never-treated donors)', fontsize=14, y=1.0)
    plt.tight_layout()
    plt.savefig(f'{FIG}/fig_n5_state_gaps.pdf', bbox_inches='tight')
    plt.show()


def fig_scpi():
    """Conformal prediction intervals for the clean-fit states."""
    sc = pd.read_csv(f'{CSV}/scpi_conformal.csv')
    states = sc['state'].unique()
    fig, axes = plt.subplots(1, len(states), figsize=(4 * len(states), 4.2),
                             sharey=True)
    for ax, st in zip(np.atleast_1d(axes), states):
        g = sc[sc['state'] == st]
        ax.fill_between(g['year'], g['gap_lo'], g['gap_hi'],
                        color=COLORS['placebo'], alpha=0.7,
                        label='90% conformal PI')
        ax.plot(g['year'], g['gap'], '-o', color=COLORS['treated'], lw=2,
                markersize=4)
        ax.axhline(0, color='black', lw=0.8)
        ax.set_title(st)
        ax.set_xticks(g['year'][::2])
    np.atleast_1d(axes)[0].set_ylabel('Post-period gap (log points)')
    np.atleast_1d(axes)[0].legend(frameon=False, fontsize=8)
    fig.suptitle('Conformal Prediction Intervals (Chernozhukov-Wüthrich-Zhu / scpi)',
                 fontsize=13, y=1.03)
    plt.tight_layout()
    plt.savefig(f'{FIG}/fig_n6_scpi_conformal.pdf', bbox_inches='tight')
    plt.show()


def fig_cs_eventstudy():
    dyn = pd.read_csv(f'{CSV}/cs_eventstudy.csv')
    fig, ax = plt.subplots(figsize=(10, 5.5))
    for pre, color, label in [(True, 'gray', 'Pre-treatment'),
                              (False, COLORS['treated'], 'Post-treatment')]:
        g = dyn[dyn['event_time'] < 0] if pre else dyn[dyn['event_time'] >= 0]
        ax.errorbar(g['event_time'], g['att'],
                    yerr=g['crit_val'] * g['se'], fmt='o', color=color,
                    markersize=5, capsize=3, lw=1.2, label=label)
    ax.axhline(0, color='black', lw=0.7)
    ax.axvline(-0.5, color='gray', ls='--', lw=0.8, alpha=0.6)
    ax.set(xlabel='Years relative to retail opening',
           ylabel='Effect on log per-capita ethanol',
           title="Callaway-Sant'Anna Event Study (primary sample)")
    ax.legend(frameon=False, loc='upper left', fontsize=9,
              title='95% simultaneous CIs', title_fontsize=9)
    plt.tight_layout()
    plt.savefig(f'{FIG}/fig_n7_cs_eventstudy.pdf', bbox_inches='tight')
    plt.show()


def fig_first_stage():
    """Cannabis sales per adult (21+) ramp + dose vs. state ATT scatter."""
    path = 'Data/external/cannabis_sales_annual.csv'
    if not os.path.exists(path):
        print('first-stage data not available — figure skipped')
        return None
    cs = pd.read_csv(path)
    pop = pd.read_csv('Data/processed/population_21.csv')
    cs = cs.merge(pop, on=['fips', 'year'], how='left')
    # 2024 fiscal-year rows have no NIAAA population — drop from the figure
    cs = cs.dropna(subset=['pop21'])
    cs['sales_pc'] = cs['sales_usd'] / cs['pop21']
    sr = pd.read_csv(f'{CSV}/sample_rules.csv')
    t0s = dict(zip(sr['fips'], sr['t0']))
    st_att = pd.read_csv(f'{CSV}/state_scm_att.csv')

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 5.5))
    for st, g in cs.groupby('state'):
        g = g.sort_values('year')
        basis = g['year_basis'].iloc[0]
        ax1.plot(g['year'], g['sales_pc'], '-o', lw=2, markersize=4,
                 label=f"{st}{' (FY)' if basis == 'FY' else ''}")
    ax1.set(xlabel='Year', ylabel='Legal cannabis sales per adult 21+ ($, nominal)',
            title='First Stage: Per-Adult Legal Cannabis Sales')
    ax1.legend(frameon=False, fontsize=9)

    # Dose = mean per-adult sales in the first two post years; ATT from the
    # descriptive classic SCM.
    rows = []
    for f, g in cs.groupby('fips'):
        t0 = t0s.get(f)
        if t0 is None:
            continue
        dose = g[g['year'].between(t0, t0 + 1)]['sales_pc'].mean()
        att = st_att[(st_att['fips'] == f) &
                     (st_att['estimator'] == 'classic_scm')]['att']
        if len(att) and pd.notna(dose):
            rows.append({'state': g['state'].iloc[0], 'dose': dose,
                         'att': att.iloc[0]})
    dd = pd.DataFrame(rows)
    ax2.scatter(dd['dose'], dd['att'], s=70, color=COLORS['treated'], zorder=3)
    for _, r in dd.iterrows():
        ax2.annotate(r['state'], (r['dose'], r['att']),
                     textcoords='offset points', xytext=(6, 4), fontsize=9)
    ax2.axhline(0, color='black', lw=0.8)
    ax2.set(xlabel='Mean per-adult sales, first two post years ($)',
            ylabel='Classic SCM ATT (log points)',
            title='Dose vs. Estimated Effect (descriptive)')
    plt.tight_layout()
    plt.savefig(f'{FIG}/fig_n8_first_stage.pdf', bbox_inches='tight')
    plt.show()
    return dd


def all_figures():
    df = fig_forest_estimators()
    fig_bias_bands()
    fig_fake2009()
    try:
        fig_power()
    except FileNotFoundError:
        print('power results not ready — fig_n4 skipped')
    fig_state_gaps()
    fig_scpi()
    fig_cs_eventstudy()
    fig_first_stage()
    return df
