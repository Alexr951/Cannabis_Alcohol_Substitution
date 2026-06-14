# Covariate robustness (Kaul, Klossner, Pfeifer & Schieler 2022 JAE): matching
# on all outcome lags renders covariates irrelevant, so the primary spec is
# outcome-only by design. This robustness spec matches on a lag SUBSET
# (odd pre-period years) plus covariates measured PRE-T0 per state (mean of
# the three years before T0), and compares the classic-SCM ATT to the
# outcome-only ATT for each clean-fit state.
import os
import numpy as np
import pandas as pd
from scipy.optimize import minimize

COV_FILES = {
    'real_gdp_pc': 'Data/external/bea_gdp_pc.csv',
    'unemp_rate': 'Data/external/bls_unemployment.csv',
    'share_20_34': 'Data/external/age_share_20_34.csv',
    'beer_tax_per_gal': 'Data/external/beer_tax.csv',
}


def _solve_scm(Z_treated, Z_donors):
    J = Z_donors.shape[1]

    def objective(w):
        gap = Z_treated - Z_donors @ w
        return gap @ gap

    res = minimize(objective, x0=np.ones(J) / J, method='SLSQP',
                   bounds=[(0, 1)] * J,
                   constraints={'type': 'eq', 'fun': lambda w: w.sum() - 1.0},
                   options={'maxiter': 1000, 'ftol': 1e-12})
    w = res.x.copy()
    w[w < 1e-4] = 0
    if w.sum() > 0:
        w /= w.sum()
    return w


def _load_covariate_panels():
    panels = {}
    for var, path in COV_FILES.items():
        if not os.path.exists(path):
            continue
        df = pd.read_csv(path)
        val_col = [c for c in df.columns if c not in
                   ('fips', 'state', 'year', 'source_url')][0]
        panels[var] = df[['fips', 'year', val_col]].rename(columns={val_col: var})
    return panels


def covariate_lag_subset_spec():
    panels = _load_covariate_panels()
    if not panels:
        print('No yearly covariate panels available — spec skipped '
              '(documented in memo).')
        return None
    panel = pd.read_csv('Data/processed/panel_long.csv')
    treat = pd.read_csv('Data/processed/treatment.csv')
    rules = pd.read_csv('Results/csv/sample_rules.csv')
    never = treat[treat['ever_rec_2023'] == 0]['fips'].tolist()
    tot = panel[(panel['beverage'] == 'total') & panel['year'].between(2000, 2019)]
    wide = tot.pivot_table(index='year', columns='fips', values='log_pc_eth21')

    rows = []
    for _, r in rules[rules['included'] == 1].iterrows():
        f, t0 = int(r['fips']), int(r['t0'])
        # Covariates measured pre-T0: mean over [t0-3, t0-1], standardized
        # across the treated state + donors.
        cov = {}
        used = []
        for var, p in panels.items():
            m = (p[p['year'].between(t0 - 3, t0 - 1)]
                 .groupby('fips')[var].mean())
            if f in m.index and all(d in m.index for d in never):
                cov[var] = m
                used.append(var)
        pre_years = [y for y in wide.index if y < t0]
        odd_lags = [y for y in pre_years if y % 2 == 1]
        post = wide.index >= t0

        # Every predictor row (each odd-year lag AND each covariate) is
        # z-scored across donors, so all predictors enter the match at equal
        # scale. Without this, standardized covariates carry ~20x the weight
        # of raw log-point lags and the fit degenerates.
        def stack_raw(unit):
            lags = wide.loc[odd_lags, unit].values
            cv = np.array([cov[v][unit] for v in used])
            return np.concatenate([lags, cv])

        Zd_raw = np.column_stack([stack_raw(d) for d in never])
        mu = Zd_raw.mean(axis=1)
        sd = Zd_raw.std(axis=1)
        Zt = (stack_raw(f) - mu) / sd
        Zd = (Zd_raw - mu[:, None]) / sd[:, None]
        w = _solve_scm(Zt, Zd)
        gap = wide[f].values - wide[never].values @ w
        att_cov = gap[post].mean()

        # outcome-only all-lags benchmark (primary-style classic SCM)
        w0 = _solve_scm(wide.loc[pre_years, f].values,
                        wide.loc[pre_years, never].values)
        gap0 = wide[f].values - wide[never].values @ w0
        att0 = gap0[post].mean()
        rows.append({'fips': f, 'state': r['state'], 't0': t0,
                     'att_outcome_only': att0, 'att_lagsubset_cov': att_cov,
                     'covariates_used': '+'.join(used)})
    out = pd.DataFrame(rows)
    out.to_csv('Results/csv/covariate_lag_subset.csv', index=False)
    print(out.to_string(index=False))
    return out


if __name__ == '__main__':
    covariate_lag_subset_spec()
