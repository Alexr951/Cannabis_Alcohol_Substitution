# Port-faithfulness check: the v1 hand-coded SCM solver (scipy SLSQP) and R
# augsynth (progfunc="None", scm=TRUE) should agree closely on the identical
# spec (outcome-only, never-treated donors, 2000-2019). Run after the R
# pipeline has written Results/csv/state_scm_att.csv.
import numpy as np
import pandas as pd
from scipy.optimize import minimize


def solve_scm_v1(Y_treated_pre, Y_donors_pre):
    J = Y_donors_pre.shape[1]

    def objective(w):
        gap = Y_treated_pre - Y_donors_pre @ w
        return gap @ gap

    result = minimize(objective, x0=np.ones(J) / J, method='SLSQP',
                      bounds=[(0, 1)] * J,
                      constraints={'type': 'eq', 'fun': lambda w: w.sum() - 1.0},
                      options={'maxiter': 1000, 'ftol': 1e-12})
    w = result.x.copy()
    w[w < 1e-4] = 0
    if w.sum() > 0:
        w /= w.sum()
    return w


def sanity_anchor():
    panel = pd.read_csv('Data/processed/panel_long.csv')
    treat = pd.read_csv('Data/processed/treatment.csv')
    never = treat[treat['ever_rec_2023'] == 0]['fips'].tolist()
    tot = panel[(panel['beverage'] == 'total') & panel['year'].between(2000, 2019)]
    wide = tot.pivot_table(index='year', columns='fips', values='log_pc_eth21')

    r_att = pd.read_csv('Results/csv/state_scm_att.csv')
    rows = []
    for f, t0 in [(8, 2014), (6, 2018)]:
        pre = wide.index < t0
        post = ~pre
        Yt = wide[f].values
        Yd = wide[never].values
        w = solve_scm_v1(Yt[pre], Yd[pre])
        gap = Yt - Yd @ w
        att_py = gap[post].mean()
        att_r = r_att[(r_att['fips'] == f) &
                      (r_att['estimator'] == 'classic_scm')]['att'].iloc[0]
        rows.append({'fips': f, 'att_python_v1': att_py, 'att_r_augsynth': att_r,
                     'abs_diff': abs(att_py - att_r)})
    out = pd.DataFrame(rows)
    assert (out['abs_diff'] < 0.005).all(), \
        f"Port check failed — solvers disagree by >0.5 log points:\n{out}"
    print("Port-faithfulness check PASSED (max |diff| = "
          f"{out['abs_diff'].max():.5f} log points)")
    return out


if __name__ == '__main__':
    print(sanity_anchor())
