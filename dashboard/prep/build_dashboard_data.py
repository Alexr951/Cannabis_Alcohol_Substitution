"""Build the dashboard data file from the committed power-simulation results.

Reads the power_*.csv, intime_placebo_*.csv and primary-result files in
Results/csv/ and writes dashboard/public/data/power.json. The dashboard replays
this file in the browser and does no estimation of its own.

Run from the repository root:  python dashboard/prep/build_dashboard_data.py
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "Results" / "csv"
OUT = ROOT / "dashboard" / "public" / "data" / "power.json"

SOURCES = [
    "power_draws.csv", "power_results.csv", "power_ri_thresholds.csv",
    "power_jackknife_diag.csv", "power_mde.csv", "power_mde_by_estimator.csv",
    "power_draws_jack.csv", "power_results_3rules.csv",
    "power_se_diag_3rules.csv", "power_mde_3rules.csv",
    "multisynth_overall_jack.csv", "intime_pooled_jack.csv",
    "robustness_jack.csv",
    "intime_placebo_single.csv", "intime_placebo_pooled2009.csv",
    "intime_placebo_pooled2007.csv", "multisynth_overall.csv",
    "sdid_primary.csv", "gsynth_primary.csv", "cs_twfe_primary.csv",
    "state_scm_att.csv",
]

# display labels
LABELS = {
    "multisynth":        ("Partially-pooled ASCM", "ASCM"),
    "sdid":              ("Synthetic DiD", "SDID"),
    "gsynth_ife":        ("Generalized SC (IFE)", "GSC"),
    "matrix_completion": ("Matrix completion", "MC"),
    "callaway_santanna": ("Callaway–Sant'Anna", "CS"),
}
ORDER = ["multisynth", "sdid", "gsynth_ife", "matrix_completion", "callaway_santanna"]
PRIMARY = "multisynth"

# Single-state backdated placebo methods (07_intime_placebo.R). The partially-
# pooled ASCM has no single-unit analogue; the paper's Table 5 dagger note maps
# it to the classic single-treated-unit SCM band.
PLACEBO_LABELS = {
    "classic_scm": "Classic SCM",
    "ridge_ascm":  "Ridge ASCM",
    "sdid":        "Synthetic DiD",
    "gsynth_ife":  "Generalized SC (IFE)",
}
PLACEBO_ORDER = ["classic_scm", "ridge_ascm", "sdid", "gsynth_ife"]
FOCUS_MAP = {
    "multisynth": "classic_scm",   # dagger: single-unit special case of the augmented family
    "sdid": "sdid",
    "gsynth_ife": "gsynth_ife",
    "matrix_completion": None,     # single-state backdated exercise not run
    "callaway_santanna": None,
}

# Plausible-effect band, pinned to the paper (abstract, Section V, footnote 7).
# The paper declines a point estimate and treats "the low single digits" as the
# relevant small-effect case; the band is shaded 1%-4% with soft edges and sits
# entirely left of the detection frontier (MDE 4.5-6.4%).
PLAUSIBLE_BAND = {
    "left": -0.01,    # small end, the 1-2% placebo floor (Section VII)
    "right": -0.04,   # 4%, reaches only the most sensitive estimator's frontier (Section V)
    "edge": "soft",
    "label": "low single digits",
    "note": ("Treated as the relevant small-effect case, not a point estimate "
             "(Subbaraman 2016). Every estimator's detection frontier "
             "(MDE 4.5-6.4%) lies to the right; contrast the 12% scanner-data "
             "decline of Baggio, Chong & Kwon (2020)."),
    "source": "Cannabis_Alcohol_Substitution.pdf, abstract, Section V, footnote 7",
}


def pct_key(delta: float) -> str:
    """Integer-percent string key for a delta, e.g. -0.05 -> '-5'."""
    return str(int(round(delta * 100)))


def sig(x, n=6):
    """Round to n significant figures; pass through NaN/None as None."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    if x == 0:
        return 0.0
    return round(x, -int(math.floor(math.log10(abs(x)))) + (n - 1))


def main():
    draws = pd.read_csv(CSV / "power_draws.csv")
    results = pd.read_csv(CSV / "power_results.csv")
    thresh = pd.read_csv(CSV / "power_ri_thresholds.csv").set_index("estimator")["ri_thresh"]
    diag = pd.read_csv(CSV / "power_jackknife_diag.csv")
    mde = pd.read_csv(CSV / "power_mde_by_estimator.csv").set_index("estimator")
    draws_jack = pd.read_csv(CSV / "power_draws_jack.csv")
    res3 = pd.read_csv(CSV / "power_results_3rules.csv").set_index(["estimator", "delta"])
    mde3 = pd.read_csv(CSV / "power_mde_3rules.csv").set_index("rule")

    res = results.set_index(["estimator", "delta"])
    deltas = [0.0, -0.02, -0.05, -0.08, -0.12]

    # The jackknife rerun is paired draw-for-draw with the committed simulation:
    # same estimator/delta/draw ids, identical att, identical bootstrap SE.
    paired = draws.merge(
        draws_jack, on=["estimator", "delta", "draw"], suffixes=("", "_j"))
    ms_rows = draws[draws.estimator.isin(["multisynth", "multisynth_phased"])]
    assert len(paired) == len(ms_rows), \
        f"pairing incomplete: {len(paired)} merged rows vs {len(ms_rows)} multisynth rows"
    d_att = (paired.att - paired.att_j).abs().max()
    d_se = (paired.se - paired.se_boot).abs().max()
    assert d_att <= 1e-8 and d_se <= 1e-8, \
        f"paired draws diverge: max|d_att|={d_att}, max|d_se|={d_se}"
    print(f"pairing self-check passed: {len(paired)} draws, "
          f"max|d_att|={d_att:.1e}, max|d_se|={d_se:.1e}")
    jack_by = draws_jack.set_index(["estimator", "delta"])

    # True sampling dispersion = SD of the estimator's delta=0 point estimates,
    # held constant across delta (a constant injected shift does not change spread).
    # This matches the committed jackknife-diag definition exactly (asserted below).
    se_true = {}
    for est in ORDER:
        d0 = draws[(draws.estimator == est) & (draws.delta == 0.0)]
        se_true[est] = float(d0.att.std(ddof=1))

    # the per-draw file must reproduce power_jackknife_diag.csv (multisynth)
    ms = draws[draws.estimator == "multisynth"]
    for _, row in diag.iterrows():
        g = ms[np.isclose(ms.delta, row.delta)]
        claimed = float(g.se.mean())
        assert abs(claimed - row.mean_jack_se) < 1e-6, \
            f"mean(se) mismatch at delta={row.delta}: {claimed} vs {row.mean_jack_se}"
    assert abs(se_true["multisynth"] - diag.sd_att.iloc[0]) < 1e-6, \
        f"sd_att mismatch: {se_true['multisynth']} vs {diag.sd_att.iloc[0]}"
    # se_inflation reproduces from the committed pieces.
    for _, row in diag.iterrows():
        g = ms[np.isclose(ms.delta, row.delta)]
        ratio = float(g.se.mean()) / se_true["multisynth"]
        assert abs(ratio - row.se_inflation) < 1e-6, \
            f"se_inflation mismatch at delta={row.delta}: {ratio} vs {row.se_inflation}"
    print("trace self-check passed: per-draw file reproduces power_jackknife_diag.csv")

    def cell(est, delta):
        g = draws[(draws.estimator == est) & np.isclose(draws.delta, delta)].sort_values("draw")
        r = res.loc[(est, delta)]
        boot_mean = float(g.se.mean())
        true = se_true[est]
        out = {
            "att": [sig(v) for v in g.att.tolist()],
            "se_boot": [sig(v) for v in g.se.tolist()],
            "reject_se": sig(float(r.reject_se)),
            "reject_ri": sig(float(r.reject_ri)),
            "mean_att": sig(float(r.mean_att)),
            "se_boot_mean": sig(boot_mean),  # mean own/default SE at this delta
            "se_true": sig(true),            # constant true sampling dispersion
            "se_boot_ratio": sig(boot_mean / true),
        }
        if est == PRIMARY:
            gj = draws_jack[(draws_jack.estimator == est) &
                            np.isclose(draws_jack.delta, delta)].sort_values("draw")
            r3 = res3.loc[(est, delta)]
            jack_mean = float(gj.se_jack.mean())
            # the replayed per-draw arrays must reproduce the summary CSV
            rej = float((np.abs(gj.att / gj.se_jack) > 1.96).mean())
            assert abs(rej - float(r3.reject_jack)) < 1e-9, \
                f"reject_jack mismatch at delta={delta}: {rej} vs {r3.reject_jack}"
            assert abs(jack_mean - float(r3.mean_se_jack)) < 1e-6, \
                f"mean se_jack mismatch at delta={delta}: {jack_mean} vs {r3.mean_se_jack}"
            out["se_jack"] = [sig(v) for v in gj.se_jack.tolist()]
            out["reject_jack"] = sig(float(r3.reject_jack))
            out["se_jack_mean"] = sig(jack_mean)
            out["se_jack_ratio"] = sig(jack_mean / true)
        return out

    estimators = {}
    for est in ORDER:
        label, short = LABELS[est]
        estimators[est] = {
            "label": label,
            "short": short,
            "primary": est == PRIMARY,
            "n_draws": int((draws.estimator == est).sum() // len(deltas)),
            "ri_thresh": sig(float(thresh[est])),
            "mde_ri": sig(float(mde.loc[est, "mde_ri"])) if not pd.isna(mde.loc[est, "mde_ri"]) else None,
            "mde_se": sig(float(mde.loc[est, "mde_se"])) if not pd.isna(mde.loc[est, "mde_se"]) else None,
            "mde_ri_drinks": sig(float(mde.loc[est, "mde_ri_drinks"])) if not pd.isna(mde.loc[est, "mde_ri_drinks"]) else None,
            "deltas": {pct_key(d): cell(est, d) for d in deltas},
        }

    # The jackknife SE is exactly shift-invariant to the injected effect, so its
    # ratio must be flat across the pure-delta cells (relative 1e-6).
    jm = [estimators[PRIMARY]["deltas"][pct_key(d)]["se_jack_mean"] for d in deltas]
    flat = (max(jm) - min(jm)) / (sum(jm) / len(jm))
    assert flat < 1e-6, f"jackknife SE not flat across delta: rel. range {flat}"
    assert abs(estimators[PRIMARY]["deltas"]["0"]["reject_jack"]
               - float(res3.loc[(PRIMARY, 0.0), "reject_jack"])) < 1e-9
    print("jackknife self-check passed: per-draw arrays reproduce "
          "power_results_3rules.csv; SE flat across delta")

    # Phase-in cell: -5% ramped over three years (final row of Table 6).
    gp = draws[(draws.estimator == "multisynth_phased")].sort_values("draw")
    rp = res.loc[("multisynth_phased", -0.05)]
    rp3 = res3.loc[("multisynth_phased", -0.05)]
    phased = {
        "label": "ASCM, 3-yr phase-in",
        "delta": -0.05,
        "att": [sig(v) for v in gp.att.tolist()],
        "se_boot": [sig(v) for v in gp.se.tolist()],
        "reject_se": sig(float(rp.reject_se)),
        "reject_jack": sig(float(rp3.reject_jack)),
        "reject_ri": sig(float(rp.reject_ri)),
        "mean_att": sig(float(rp.mean_att)),
    }

    mde_all = pd.read_csv(CSV / "power_mde.csv").set_index("rule")
    baseline = float(mde_all["baseline_gal_ethanol_21"].iloc[0])
    mde_primary = float(mde_all.loc["ri_calibrated", "mde_delta"])
    mde_drinks = float(mde_all.loc["ri_calibrated", "mde_drinks_per_month"])
    mde_jack = float(mde3.loc["jackknife", "mde_delta"])
    mde_jack_drinks = float(mde3.loc["jackknife", "mde_drinks_per_month"])

    # ---- In-time / backdated placebo section (Section IV of the paper) ----
    single = pd.read_csv(CSV / "intime_placebo_single.csv")
    pooled = {
        "pooled2009": pd.read_csv(CSV / "intime_placebo_pooled2009.csv").set_index("estimator"),
        "pooled2007": pd.read_csv(CSV / "intime_placebo_pooled2007.csv").set_index("estimator"),
    }

    placebo_single = {}
    for m in PLACEBO_ORDER:
        g = single[single.estimator == m].sort_values(["state", "fake_t0"])
        vals = g.fake_att.astype(float)
        placebo_single[m] = {
            "label": PLACEBO_LABELS[m],
            "n": int(len(g)),
            "mean": sig(float(vals.mean())),
            "sd": sig(float(vals.std(ddof=1))),
            "values": [
                {"state": s, "fake_t0": int(t), "att": sig(float(a))}
                for s, t, a in zip(g.state, g.fake_t0, vals)
            ],
        }
        # sanity windows from the paper (validate, do not hardcode):
        # fake effects center near -0.9%, single-state SDs roughly 2.3-3.4 pp
        assert -0.015 <= placebo_single[m]["mean"] <= -0.005, \
            f"placebo mean out of paper range for {m}: {placebo_single[m]['mean']}"
        assert 0.020 <= placebo_single[m]["sd"] <= 0.036, \
            f"placebo sd out of paper range for {m}: {placebo_single[m]['sd']}"

    placebo_pooled = {}
    for key, df in pooled.items():
        placebo_pooled[key] = {
            est: {
                "att": sig(float(df.loc[est, "att"])),
                "se": sig(float(df.loc[est, "se"])),
                "pct": sig(float(df.loc[est, "pct"])),
                "t": sig(float(df.loc[est, "t_stat"])),
            }
            for est in df.index
        }
    # pooled fake-2009 effects sit in the -0.9% to -2.2% range (paper Table 5)
    for est, c in placebo_pooled["pooled2009"].items():
        assert -0.025 <= c["pct"] <= -0.005, \
            f"pooled2009 pct out of paper range for {est}: {c['pct']}"
    print("placebo self-check passed: single-state bands and pooled fake-2009 "
          "match the paper's stated ranges")

    # Real (non-placebo) estimates for overlay markers.
    ms_overall = pd.read_csv(CSV / "multisynth_overall.csv").set_index("state")
    sdid_prim = pd.read_csv(CSV / "sdid_primary.csv")
    gs_prim = pd.read_csv(CSV / "gsynth_primary.csv").set_index("estimator")
    cs_prim = pd.read_csv(CSV / "cs_twfe_primary.csv").set_index("estimator")
    scm_att = pd.read_csv(CSV / "state_scm_att.csv")
    clean_states = sorted(single.state.unique().tolist())

    real_pooled = {
        "multisynth": sig(float(ms_overall.loc["Average", "Estimate"])),
        "sdid": sig(float(sdid_prim[sdid_prim.states == "Aggregate"].tau.iloc[0])),
        "gsynth_ife": sig(float(gs_prim.loc["gsynth_ife", "att"])),
        "matrix_completion": sig(float(gs_prim.loc["matrix_completion", "att"])),
        "callaway_santanna": sig(float(cs_prim.loc["callaway_santanna", "att"])),
        "twfe": sig(float(cs_prim.loc["twfe", "att"])),
    }
    real_states = {}
    for m in ("classic_scm", "ridge_ascm"):
        g = scm_att[(scm_att.estimator == m) & scm_att.state.isin(clean_states)]
        real_states[m] = [
            {"state": s, "att": sig(float(a))} for s, a in zip(g.state, g.att)
        ]

    placebo = {
        "single_order": PLACEBO_ORDER,
        "single": placebo_single,
        "pooled2009": placebo_pooled["pooled2009"],
        "pooled2007": placebo_pooled["pooled2007"],
        "real": {"pooled": real_pooled, "states": real_states},
        "focus_map": FOCUS_MAP,
        "note": ("Backdated in-time placebos: fake treatment effects estimated "
                 "on pre-treatment data where no treatment occurred. ATT in log "
                 "points; clean-fit states only."),
    }

    # Primary real-data estimate under both standard errors.
    ovj = pd.read_csv(CSV / "multisynth_overall_jack.csv").iloc[0]
    real_data = {
        "att": sig(float(ovj.att)),
        "se_boot": sig(float(ovj.se_boot)),
        "se_jack": sig(float(ovj.se_jack)),
        "ci_boot": [sig(float(ovj.ci_lo_boot)), sig(float(ovj.ci_hi_boot))],
        "ci_jack": [sig(float(ovj.ci_lo_jack)), sig(float(ovj.ci_hi_jack))],
        "t_boot": sig(float(ovj.att / ovj.se_boot)),
        "t_jack": sig(float(ovj.att / ovj.se_jack)),
        "pct": sig(float(ovj.pct)),
    }
    # sanity: the pooled placebo bootstrap SEs already in `placebo` must agree
    # with intime_pooled_jack.csv's se_boot column (same committed values)
    ipj = pd.read_csv(CSV / "intime_pooled_jack.csv").set_index("fake_t0")
    for yr in (2009, 2007):
        committed = placebo_pooled[f"pooled{yr}"]["multisynth"]["se"]  # sig(6)-rounded
        assert abs(committed - float(ipj.loc[yr, "se_boot"])) < 1e-6, \
            f"pooled{yr} bootstrap SE mismatch vs intime_pooled_jack.csv"
    placebo_jack = {
        str(yr): {
            "att": sig(float(ipj.loc[yr, "att"])),
            "se_jack": sig(float(ipj.loc[yr, "se_jack"])),
            "t_jack": sig(float(ipj.loc[yr, "t_jack"])),
        }
        for yr in (2009, 2007)
    }

    payload = {
        "schema_version": 3,
        "meta": {
            "seed": 20260524,
            "deltas": deltas,
            "primary": PRIMARY,
            "estimator_order": ORDER,
            "baseline_gal_ethanol_21": baseline,
            "mde_delta_primary": sig(mde_primary),
            "mde_drinks_per_month": sig(mde_drinks),
            "mde_jack_delta": sig(mde_jack),
            "mde_jack_drinks": sig(mde_jack_drinks),
            "sources": SOURCES,
            "note": "Every value traces to a committed file in Results/csv/.",
        },
        "plausible_band": PLAUSIBLE_BAND,
        "estimators": estimators,
        "phased": phased,
        "placebo": placebo,
        "real_data": real_data,
        "placebo_jack": placebo_jack,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.relative_to(ROOT)} ({kb:.0f} KB, {len(json.dumps(payload))} chars)")


if __name__ == "__main__":
    main()
