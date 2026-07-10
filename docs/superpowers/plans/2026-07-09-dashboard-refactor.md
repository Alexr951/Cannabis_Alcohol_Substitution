# Dashboard Paper-Arc Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `dashboard/` as a paper-arc single page (header + three acts: six-estimator nulls → placebo noise floor → power + jackknife) replaying `power.json` schema v4, with the bootstrap framing removed.

**Architecture:** One static page, no build step, vendored D3 v7. `dashboard/prep/build_dashboard_data.py` packs committed `Results/csv/` files into `dashboard/public/data/power.json` (schema 4) with recomputed-vs-shipped self-checks. Front end splits into `js/shared.js` (state, chips, formats, tooltip, modal, slider factory) plus `js/act1.js`, `js/act2.js`, `js/act3.js`, loaded as plain scripts in order.

**Tech Stack:** Python (pandas/numpy/scipy) for prep; vanilla JS + D3 v7 (already vendored at `dashboard/public/vendor/d3.v7.min.js`); plain CSS.

**Spec:** `docs/superpowers/specs/2026-07-09-dashboard-refactor-design.md` — read it before starting any task.

## Global Constraints

- NO git operations by the implementer (no add/commit/push/restore). Each task ends at a checkpoint where the USER reviews and commits.
- No build step, no npm, no new dependencies. Relative paths only (page is served from `dashboard/public/`).
- Every number displayed on the page is read from `power.json`; every number in `power.json` traces to a committed CSV via a prep self-check. Prep asserts compare recomputed-vs-shipped values, never hardcoded literals.
- Copy style: flat reporting, no rhetorical dashes, no exclamation. Bootstrap/wild-bootstrap wording must not appear anywhere in `dashboard/` except nothing — zero occurrences (the alternatives' inference labels in Act 1 come from the JSON `inference` field: "Placebo (200 reps/cohort)", "Param. bootstrap (500)", "Bootstrap (500)", "Multiplier bootstrap (999)", "Clustered by state" — these five strings are data, are legitimate, and live only in the JSON).
- Untouched: `.github/workflows/deploy-pages.yml`, `dashboard/public/vendor/`, favicons, `.nojekyll`, everything outside `dashboard/` and `README.md`.
- Preserve the existing page's accessibility patterns: `prefers-reduced-motion` fallbacks, keyboard slider, aria-labels kept in step with state, `(max-width: 480px)` narrow handling.
- Cache buster: fetch `data/power.json?v=4` (matches `schema_version: 4`).
- Test browser: serve with `python -m http.server 8000` from `dashboard/public`, open `http://localhost:8000`.

---

### Task 1: power.json schema v4 (prep script)

**Files:**
- Modify: `dashboard/prep/build_dashboard_data.py`
- Output: `dashboard/public/data/power.json` (regenerated)

**Interfaces:**
- Produces the JSON shape consumed by Tasks 2–5:
  - `schema_version: 4`
  - `meta`: existing fields + `commit` (string), `size_jack: {size, lo, hi}` (fractions), `ri_p`, `ri_null_sd` (floats)
  - `real`: `{order: [6 est ids incl. "twfe"], rows: {est: {att, se, ci_lo, ci_hi, pct, inference, primary}}}`
  - `ri_null`: `{values: [500 floats], observed: float, p: float, n_draws: int}`
  - `estimators[est].deltas[dk]`: `{att: [...], reject_ri, mean_att, se_true}` + primary-only `{se_jack: [...], reject_jack, se_jack_mean, se_jack_ratio}`; NO `se_boot*`, NO `reject_se`
  - `estimators[est].size_se0`: δ=0 native-SE rejection rate, alternatives only (null for primary)
  - `phased`: `{label, delta, att, reject_jack, reject_ri, mean_att}`
  - `placebo`: as v3, plus `pooled2009.multisynth.se_jack/t_jack` and `pooled2007.multisynth.se_jack/t_jack`
  - `annotations.california`: `{section: "III.C", reasons: [3 strings]}`
  - `real_data`: `{att, se_jack, ci_jack, t_jack, pct}` only
  - `plausible_band`: unchanged

- [ ] **Step 1: Edit the script header and imports**

In `dashboard/prep/build_dashboard_data.py`: extend the module docstring's first line to say "schema 4"; add imports `import subprocess` and `from scipy import stats as sps` after the pandas import. Add `"ri_null_dist.csv", "ri_pooled.csv"` to `SOURCES`.

- [ ] **Step 2: Add the real-estimates and RI-null blocks**

Inside `main()`, after the `real_states` block (line ~292), add:

```python
    # ---- Act 1: six real pooled estimates (paper Table 3) -------------------
    INFERENCE = {
        "multisynth": "Jackknife",
        "sdid": "Placebo (200 reps/cohort)",
        "gsynth_ife": "Param. bootstrap (500)",
        "matrix_completion": "Bootstrap (500)",
        "callaway_santanna": "Multiplier bootstrap (999)",
        "twfe": "Clustered by state",
    }
    REAL_ORDER = ORDER + ["twfe"]
    LABELS_REAL = dict(LABELS)
    LABELS_REAL["twfe"] = ("Two-way fixed effects", "TWFE")
    ovj = pd.read_csv(CSV / "multisynth_overall_jack.csv").iloc[0]

    def real_row(est):
        if est == "multisynth":
            att, se = float(ovj.att), float(ovj.se_jack)
            ci = (float(ovj.ci_lo_jack), float(ovj.ci_hi_jack))
        elif est == "sdid":
            r = sdid_prim[sdid_prim.states == "Aggregate"].iloc[0]
            att, se = float(r.tau), float(r.se)
            ci = (att - 1.96 * se, att + 1.96 * se)
        elif est in ("gsynth_ife", "matrix_completion"):
            att, se = float(gs_prim.loc[est, "att"]), float(gs_prim.loc[est, "se"])
            ci = (att - 1.96 * se, att + 1.96 * se)
        else:
            att, se = float(cs_prim.loc[est, "att"]), float(cs_prim.loc[est, "se"])
            ci = (att - 1.96 * se, att + 1.96 * se)
        # cross-file agreement with the overlay values already packed
        assert abs(att - real_pooled[est]) < 1e-6, f"real att mismatch for {est}"
        return {"att": sig(att), "se": sig(se), "ci_lo": sig(ci[0]),
                "ci_hi": sig(ci[1]), "pct": sig(math.exp(att) - 1),
                "inference": INFERENCE[est],
                "label": LABELS_REAL[est][0], "short": LABELS_REAL[est][1],
                "primary": est == PRIMARY}

    real = {"order": REAL_ORDER, "rows": {e: real_row(e) for e in REAL_ORDER}}

    # ---- Act 1: RI null distribution (R/08) ---------------------------------
    nd = pd.read_csv(CSV / "ri_null_dist.csv")
    rp = pd.read_csv(CSV / "ri_pooled.csv").iloc[0]
    null_ok = nd.null_att.dropna().astype(float)
    p_re = float((null_ok.abs() >= abs(float(rp.observed_att))).mean())
    assert abs(p_re - float(rp.p_two_sided)) < 1e-9, \
        f"RI p recomputed from null draws diverges: {p_re} vs {rp.p_two_sided}"
    assert len(null_ok) == int(rp.n_draws), "RI null draw count mismatch"
    ri_null = {"values": [sig(x) for x in null_ok.tolist()],
               "observed": sig(float(rp.observed_att)),
               "p": sig(float(rp.p_two_sided)), "n_draws": int(rp.n_draws)}

    # ---- Act 3: jackknife size at delta = 0, Clopper-Pearson ---------------
    n0 = int(res3.loc[(PRIMARY, 0.0), "n_ok"])
    k0 = int(round(float(res3.loc[(PRIMARY, 0.0), "reject_jack"]) * n0))
    size_jack = {
        "size": sig(k0 / n0),
        "lo": sig(float(sps.beta.ppf(0.025, k0, n0 - k0 + 1)) if k0 > 0 else 0.0),
        "hi": sig(float(sps.beta.ppf(0.975, k0 + 1, n0 - k0)) if k0 < n0 else 1.0),
    }
```

(`sdid_prim`, `gs_prim`, `cs_prim`, `real_pooled` already exist just above; `math` is already imported.)

- [ ] **Step 3: Strip bootstrap fields from cells and phased; add pairing-across-δ check**

In `cell()`: delete the lines producing `"se_boot"`, `"reject_se"`, `"se_boot_mean"`, `"se_boot_ratio"` from `out` (keep `att`, `reject_ri`, `mean_att`, `se_true`; keep the whole primary-only block). Keep the pairing and trace self-checks above `cell()` unchanged — they validate CSVs against each other and still pass.

In the estimator loop, after `"deltas": ...`, add per-estimator:

```python
            "size_se0": None if est == PRIMARY
                        else sig(float(res.loc[(est, 0.0), "reject_se"])),
```

In `phased`: delete `"se_boot"` and `"reject_se"` entries.

After the estimator loop's existing jackknife flatness check, add the rigid-shift check the Act 3 animation depends on:

```python
    # The grid reuses the same pseudo-treated draws at every delta: per-draw
    # differences from the delta=0 cell must be constant within each cell.
    for est in ORDER:
        base = np.array(estimators[est]["deltas"]["0"]["att"], dtype=float)
        for d in deltas[1:]:
            a = np.array(estimators[est]["deltas"][pct_key(d)]["att"], dtype=float)
            spread = float((a - base).std())
            assert spread < 1e-6, \
                f"draws not paired across delta for {est} at {d}: shift sd {spread}"
    print("pairing-across-delta self-check passed: rigid shift for all estimators")
```

- [ ] **Step 4: Fold jackknife into pooled placebos; trim real_data; add annotations**

After `placebo_pooled` is built, fold in the primary's jackknife columns (replaces the separate `placebo_jack` top-level block, which is deleted along with the `real_data` bootstrap fields):

```python
    ipj = pd.read_csv(CSV / "intime_pooled_jack.csv").set_index("fake_t0")
    for yr, key in ((2009, "pooled2009"), (2007, "pooled2007")):
        assert abs(placebo_pooled[key]["multisynth"]["att"]
                   - float(ipj.loc[yr, "att"])) < 1e-6, \
            f"pooled{yr} att mismatch vs intime_pooled_jack.csv"
        placebo_pooled[key]["multisynth"]["se_jack"] = sig(float(ipj.loc[yr, "se_jack"]))
        placebo_pooled[key]["multisynth"]["t_jack"] = sig(float(ipj.loc[yr, "t_jack"]))
```

Replace the old `real_data` block (keep only jackknife fields):

```python
    real_data = {
        "att": sig(float(ovj.att)),
        "se_jack": sig(float(ovj.se_jack)),
        "ci_jack": [sig(float(ovj.ci_lo_jack)), sig(float(ovj.ci_hi_jack))],
        "t_jack": sig(float(ovj.att / ovj.se_jack)),
        "pct": sig(float(ovj.pct)),
    }
```

Add the California annotation payload (text mirrors paper Section III.C):

```python
    annotations = {"california": {
        "section": "III.C",
        "reasons": [
            "smallest first-stage dose in the sample: the least-treated state carries the largest estimated effect, and the first stage shows no dose gradient",
            "the sign matches the donor-contamination bias, which is largest for late adopters",
            "the interval rests on two post-treatment years, 2018 and 2019",
        ],
    }}
```

- [ ] **Step 5: Update the payload and stamp**

Replace the `payload` dict:

```python
    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], capture_output=True,
        text=True, cwd=ROOT).stdout.strip() or "unknown"
    payload = {
        "schema_version": 4,
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
            "size_jack": size_jack,
            "ri_p": sig(float(rp.p_two_sided)),
            "ri_null_sd": sig(float(rp.null_sd)),
            "commit": commit,
            "sources": SOURCES,
            "note": "Every value traces to a committed file in Results/csv/.",
        },
        "plausible_band": PLAUSIBLE_BAND,
        "real": real,
        "ri_null": ri_null,
        "estimators": estimators,
        "phased": phased,
        "placebo": placebo,
        "real_data": real_data,
        "annotations": annotations,
    }
```

- [ ] **Step 6: Run and verify**

Run: `python dashboard/prep/build_dashboard_data.py` from the repo root.
Expected: all self-check lines print (pairing, trace, jackknife, pairing-across-delta, placebo) and `wrote dashboard/public/data/power.json (~90-120 KB)` — smaller than the current 165 KB because the `se_boot` arrays are gone.

Then run this verification snippet:

```python
python - << 'EOF'
import json
d = json.load(open('dashboard/public/data/power.json', encoding='utf-8'))
assert d['schema_version'] == 4
assert 'se_boot' not in json.dumps(d), "bootstrap arrays leaked into v4"
assert len(d['ri_null']['values']) == d['ri_null']['n_draws'] == 500
assert set(d['real']['rows']) == {'multisynth','sdid','gsynth_ife','matrix_completion','callaway_santanna','twfe'}
c = d['estimators']['multisynth']['deltas']['-5']
assert 'att' in c and 'se_jack' in c and 'reject_jack' in c and 'reject_se' not in c
assert d['estimators']['sdid']['size_se0'] is not None
assert d['estimators']['multisynth']['size_se0'] is None
assert d['placebo']['pooled2009']['multisynth']['t_jack'] is not None
assert d['meta']['size_jack']['lo'] < d['meta']['size_jack']['size'] < d['meta']['size_jack']['hi']
print('v4 verification passed')
EOF
```
Expected: `v4 verification passed`.

- [ ] **Step 7: Checkpoint — user reviews the prep diff and new JSON** (no commit by implementer).

---

### Task 2: Page skeleton — index.html, styles.css, js/shared.js

**Files:**
- Modify: `dashboard/public/index.html` (full restructure)
- Modify: `dashboard/public/styles.css` (new sections; keep tokens)
- Create: `dashboard/public/js/shared.js`
- Delete (in Task 6, after acts exist): `dashboard/public/app.js`

**Interfaces:**
- Produces global `App` used by act scripts:
  - `App.data` — parsed power.json
  - `App.state` — `{focus: "multisynth", dk: "0", phased: false}`
  - `App.on(evt, fn)` / `App.emit(evt)` — events `"focus"`, `"delta"`, `"phased"`
  - `App.setFocus(est)`, `App.setDelta(dk)`, `App.setPhased(bool)`
  - `App.C` — color tokens; `App.SWATCH` — per-estimator colors (add `twfe: "#8a8578"`)
  - `App.fmt` — `{effI, eff1, pct1, dkDec, sgn}` (same implementations as current app.js lines 30–34)
  - `App.DKEYS = ["0","-2","-5","-8","-12"]`
  - `App.kde(samples, bw, xs)` — copied verbatim from app.js lines 292–298
  - `App.jitter(j, span)` — deterministic: `(((j*7919)%17)-8)/8*span`
  - `App.buildSlider(el, onChange)` — the pointer/keyboard slider factory (adapted from app.js lines 64–114, parameterized: no globals)
  - `App.tooltip(html, x, y)` / `App.hideTooltip()` — one absolutely-positioned div
  - `App.modal(title, drawFn, capHtml)` — generic expand modal (adapted from app.js initModal/openModal, taking a draw callback instead of a kind switch)
  - `App.note(text)`, `App.mk(tag)` — helpers
  - Emits `"ready"` after data load; each act script registers `App.onReady(fn)`

- [ ] **Step 1: Write the new index.html**

Replace the `<main>` content with the three-act structure. Keep the existing `<head>` (fonts, styles.css, favicon links) and the `<noscript>`/loading patterns. Body structure (complete):

```html
<main class="wrap" id="app" aria-busy="true">
  <header class="masthead">
    <p class="kicker">Companion to the paper — every value replays a committed results file</p>
    <h1>Six estimators find nothing.<br />This page asks what they could have found.</h1>
    <p class="standfirst">Recreational cannabis retail and state-level alcohol sales,
      2000–2019: pooled estimates from six estimators, the noise the design produces
      when nothing happened, and the effect sizes the design could actually detect.</p>
    <div class="statchips" id="statchips"></div>
    <div class="est-chips" id="est-chips" role="listbox" aria-label="Highlight an estimator"></div>
  </header>

  <section class="act" id="act1" aria-label="Pooled estimates">
    <div class="act-head">
      <span class="act-no">1</span>
      <h2>Six estimators, one null</h2>
      <p class="act-sub">Every identification approach returns a small positive
        null. The observed estimate sits inside the design's own null
        distribution.</p>
    </div>
    <figure class="panel">
      <svg id="forest" viewBox="0 0 960 520" role="img"></svg>
      <figcaption id="act1-cap" class="cap"></figcaption>
    </figure>
  </section>

  <section class="act" id="act2" aria-label="Placebo noise floor">
    <div class="act-head">
      <span class="act-no">2</span>
      <h2>The noise floor</h2>
      <p class="act-sub">Backdated placebos measure what each estimator finds in
        windows where no treatment occurred.</p>
    </div>
    <div class="act2-grid">
      <figure class="panel">
        <svg id="strips" viewBox="0 0 620 460" role="img"></svg>
        <figcaption id="act2-cap" class="cap"></figcaption>
      </figure>
      <figure class="panel">
        <svg id="pooled-fakes" viewBox="0 0 340 460" role="img"></svg>
        <figcaption id="act2b-cap" class="cap"></figcaption>
      </figure>
    </div>
  </section>

  <section class="act" id="act3" aria-label="Power simulation">
    <div class="act-head">
      <span class="act-no">3</span>
      <h2>Drag the truth</h2>
      <p class="act-sub">The same pseudo-treated draws at every effect size; only
        the injected effect changes. Watch what each rejection rule can see.</p>
    </div>
    <div class="control" aria-label="Simulation controls">
      <div class="ctl-row">
        <label id="slider-label" for="slider">True substitution effect&nbsp;&nbsp;<span class="sym">δ</span></label>
        <output id="delta-readout" class="delta-readout" for="slider">0%</output>
        <output id="drinks-readout" class="drinks-readout"></output>
      </div>
      <div id="slider" class="slider" role="slider" tabindex="0"
           aria-labelledby="slider-label" aria-valuemin="-12" aria-valuemax="0"></div>
      <button id="phase-toggle" class="phase-toggle" disabled
              title="Available at −5%, the only simulated phase-in cell">3-yr phase-in</button>
    </div>
    <div class="act3-grid">
      <figure class="panel hero-panel">
        <svg id="hero" viewBox="0 0 640 430" role="img"></svg>
        <div class="counters">
          <div class="counter"><span class="counter-num" id="c-jack">—</span>
            <span class="counter-cap" id="c-jack-cap">reject · jackknife (reported inference)</span></div>
          <div class="counter"><span class="counter-num" id="c-cal">5.0%</span>
            <span class="counter-cap" id="c-cal-cap">reject · calibrated randomization rule</span></div>
        </div>
        <p id="reading" class="reading" aria-live="polite"></p>
      </figure>
      <div class="act3-side">
        <figure class="panel"><svg id="power" viewBox="0 0 380 300" role="img"></svg></figure>
        <figure class="panel"><svg id="ladder" viewBox="0 0 380 250" role="img"></svg>
          <figcaption id="ladder-cap" class="cap"></figcaption></figure>
        <figure class="panel jk-inset"><svg id="jk-ratio" viewBox="0 0 380 120" role="img"></svg>
          <figcaption id="jk-cap" class="cap"></figcaption></figure>
      </div>
    </div>
    <p id="closing" class="reading reading-static"></p>
  </section>

  <footer class="foot" id="foot"></footer>
</main>
<div id="tooltip" class="tooltip" hidden></div>
<div id="modal" class="modal" hidden>
  <div class="modal-box">
    <button id="modal-close" class="modal-close" aria-label="Close">×</button>
    <h3 id="modal-title"></h3>
    <div class="modal-body"><svg id="modal-svg" viewBox="0 0 900 520" role="img"></svg></div>
    <div id="modal-cap" class="modal-cap"></div>
  </div>
</div>
<script src="vendor/d3.v7.min.js"></script>
<script src="js/shared.js"></script>
<script src="js/act1.js"></script>
<script src="js/act2.js"></script>
<script src="js/act3.js"></script>
```

- [ ] **Step 2: Write js/shared.js**

Complete file. Copy verbatim from the old `app.js`: the color-token reader (lines 7–14), formatters (30–34), `kde` (292–298), the slider construction and pointer/keyboard logic (66–114) refactored into a factory `buildSlider(el, initialDk, onChange)` that keeps `placeThumb`/`setDelta` closures local and calls `onChange(dk, fromDk)`; the modal wiring (943–956) refactored so `App.modal(title, drawFn, capHtml)` clears `#modal-svg`, calls `drawFn(d3.select('#modal-svg'))`, sets the caption, and shows the dialog. New code:

```js
/* Shared state, controls and helpers. Loads data/power.json (schema 4) and
   exposes window.App for the act scripts. Nothing is estimated in the browser. */
(function () {
  "use strict";
  var App = window.App = {};
  // [color tokens C and SWATCH — copy app.js lines 7-21, add twfe: "#8a8578"]
  // [formatters — copy app.js lines 30-34 onto App.fmt]
  App.DKEYS = ["0", "-2", "-5", "-8", "-12"];
  App.state = { focus: "multisynth", dk: "0", phased: false };
  var subs = {};
  App.on = function (evt, fn) { (subs[evt] = subs[evt] || []).push(fn); };
  App.emit = function (evt) { (subs[evt] || []).forEach(function (f) { f(); }); };
  App.setFocus = function (est) {
    if (est === App.state.focus) return;
    App.state.focus = est; syncChips(); App.emit("focus");
  };
  App.setDelta = function (dk, fromDk) {
    App.state.dk = dk;
    if (dk !== "-5" && App.state.phased) { App.state.phased = false; App.emit("phased"); }
    App.emit("delta");
  };
  App.setPhased = function (on) { App.state.phased = on; App.emit("phased"); };
  App.cell = function (est, dk) {
    if (App.state.phased && est === "multisynth" && (dk || App.state.dk) === "-5") return App.data.phased;
    return App.data.estimators[est].deltas[dk || App.state.dk];
  };
  // [App.kde — copy app.js 292-298; App.jitter; tooltip div; App.modal; App.note; App.mk]
  d3.json("data/power.json?v=4").then(function (data) {
    App.data = data;
    buildStatChips(); buildChips(); buildFooter();
    App.emit("ready");
    document.getElementById("app").setAttribute("aria-busy", "false");
  });
  function buildStatChips() {
    var m = App.data.meta, R = App.data.real.rows, f = App.fmt;
    var pcts = App.data.real.order.map(function (e) { return R[e].pct; });
    chip("pooled estimates", f.eff1(Math.min.apply(null, pcts)) + " to " + f.eff1(Math.max.apply(null, pcts)));
    chip("joint RI p-value", m.ri_p.toFixed(2));
    chip("primary MDE", Math.abs(m.mde_jack_delta * 100).toFixed(1) + "% jackknife · " +
         Math.abs(m.mde_delta_primary * 100).toFixed(1) + "% calibrated");
    function chip(cap, val) {
      var d = App.mk("div"); d.className = "statchip";
      d.innerHTML = "<strong>" + val + "</strong><span>" + cap + "</span>";
      document.getElementById("statchips").appendChild(d);
    }
  }
  function buildChips() {
    var row = document.getElementById("est-chips");
    App.data.real.order.forEach(function (est) {
      var r = App.data.real.rows[est];
      var b = App.mk("button"); b.className = "chip"; b.dataset.est = est;
      b.style.setProperty("--swatch", App.SWATCH[est]);
      b.textContent = r.short; b.title = r.label;
      if (r.primary) { var t = App.mk("span"); t.className = "chip-tag"; t.textContent = "primary"; b.appendChild(t); }
      if (!App.data.estimators[est]) { b.classList.add("no-power"); b.title = r.label + " — not run through the power grid"; }
      b.addEventListener("click", function () {
        if (!App.data.estimators[est] && App.state.focus !== est) { /* Act 3 keeps prior focus */ }
        App.setFocus(est);
      });
      row.appendChild(b);
    });
    syncChips();
  }
  function syncChips() {
    d3.selectAll(".chip").each(function () {
      this.classList.toggle("focus", this.dataset.est === App.state.focus);
    });
  }
  function buildFooter() {
    var m = App.data.meta;
    document.getElementById("foot").innerHTML =
      "Generated from commit " + m.commit + " · seed " + m.seed +
      " · sources: committed files in <code>Results/csv/</code> · " +
      '<a href="../../Cannabis_Alcohol_Substitution.pdf">read the paper</a>';
  }
})();
```

Note on TWFE focus: `App.cell` is only called by Act 3, which checks `App.data.estimators[App.state.focus]` and falls back to the primary with a visible note when the focus has no power cells (Act 3, Task 5, Step 3). Acts 1–2 accept any of the six.

- [ ] **Step 3: Update styles.css**

Keep the token block (`--ink`, `--calibrated`, `--jack-rule`, `--band`, `--panel`, `--rule`, fonts) and the existing `.modal`, `.tooltip`, `.panel`, `.reading` rules. Delete `--default-rule` usages except keep the variable defined (harmless) or remove it and any `.lg-def`, `.se-panel`, counter styles for `#c-def`. Add: `.masthead`, `.statchips/.statchip`, `.est-chips/.chip/.chip-tag/.chip.focus/.chip.no-power`, `.act/.act-head/.act-no/.act-sub`, `.act2-grid` (60/40 two-column, stacking under 720px), `.act3-grid` (55/45, stacking under 900px), `.phase-toggle` (+ `[disabled]` style), `.counters` two-up, `.foot`. Grid/spacing values are the implementer's judgment; match the current visual density.

- [ ] **Step 4: Verify skeleton**

Run: `cd dashboard/public && python -m http.server 8000` and open `http://localhost:8000`.
Expected: header renders with three stat chips and six estimator chips (ASCM tagged primary, TWFE present); three empty act panels; footer shows commit stamp; zero console errors. (Act SVGs are empty until Tasks 3–5.)

- [ ] **Step 5: Checkpoint — user reviews skeleton.**

---

### Task 3: Act 1 — forest fused with the RI null (js/act1.js)

**Files:**
- Create: `dashboard/public/js/act1.js`

**Interfaces:**
- Consumes: `App.data.real`, `App.data.ri_null`, `App.on("focus")`, `App.SWATCH`, `App.fmt`, `App.kde`, `App.tooltip`, `App.modal`.
- Produces: nothing consumed by later tasks (self-contained act).

- [ ] **Step 1: Write js/act1.js**

Complete structure (fill D3 attribute chains in the established style of the old app.js):

```js
/* Act 1: six pooled estimates over the primary's RI null distribution.
   One shared x-axis in log points, labeled in percent. */
(function () {
  "use strict";
  App.on("ready", draw);
  App.on("focus", draw);
  function draw() {
    var svg = d3.select("#forest"); svg.selectAll("*").remove();
    var W = 960, H = 520, M = { t: 18, r: 24, b: 46, l: 220 };
    var pw = W - M.l - M.r;
    var forestH = 300, gap = 26, nullH = H - M.t - M.b - forestH - gap;
    var D = App.data, R = D.real, N = D.ri_null, f = App.fmt;
    // domain: all CIs plus the null draws, padded
    var lo = d3.min(R.order, function (e) { return R.rows[e].ci_lo; });
    var hi = d3.max(R.order, function (e) { return R.rows[e].ci_hi; });
    lo = Math.min(lo, d3.min(N.values)); hi = Math.max(hi, d3.max(N.values));
    var x = d3.scaleLinear().domain([lo - 0.01, hi + 0.01]).range([0, pw]);
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    // wrong-sign tint: x > 0 region, both panels, label top-right
    // zero line through both panels
    // FOREST: R.order rows, rowH = forestH / 6; per row:
    //   label (est label, left margin, bold if focus), inference tag (small, faint),
    //   CI whisker line ci_lo..ci_hi, point circle at att (r 5 primary / 4 others,
    //   fill SWATCH), pct text right of whisker. Focus row: full-width faint
    //   highlight rect (copy the pattern from old app.js lines 733-737).
    //   Row group gets pointer events -> App.tooltip with att/SE/CI/pct/inference.
    // NULL PANEL (below, translate(0, forestH + gap)):
    //   density of N.values via App.kde (Silverman bw: 1.06 * sd * n^-0.2, sd from
    //   d3.deviation(N.values)); area fill C.inkFaint 0.18, stroke inkFaint;
    //   vertical line at N.observed spanning BOTH panels (draw it on root, y from 0
    //   to forestH + gap + nullH), color C.cal, width 1.6;
    //   annotation text at the line: "observed +2.8% · p = " + N.p.toFixed(2)
    //   (numbers via f.eff1(R.rows.multisynth.pct) and N.p — never literals);
    //   scope label INSIDE the null panel, left-aligned, faint:
    //   "null distribution of the primary estimator under " + N.n_draws + " pseudo-treatment draws"
    // shared x-axis at the bottom: ticks in percent, "estimated effect (%)"
    // caption #act1-cap: set once — Table 3 note condensed: treated states,
    //   donors, window; "Whiskers are 95% confidence intervals under each
    //   estimator's reported inference."
    // expand: figure click -> App.modal("Six estimators, one null", redraw-into-modal fn, caption)
  }
})();
```

Implementation notes that are binding: the observed line must visibly pass through both panels; the p annotation must sit in the null panel, not the forest; every number formatted from `App.data` fields.

- [ ] **Step 2: Verify in browser**

Reload `http://localhost:8000`. Check against the paper: six rows in Table 3 order with ATT/CI matching `gen/tab_horserace_rows.tex` values (+0.0276/0.0222 jackknife primary, TWFE +0.0071), observed line at +2.8%, p = 0.17, scope label present, hover tooltips work, chip selection re-renders with the right row bolded.

- [ ] **Step 3: Checkpoint — user reviews Act 1.**

---

### Task 4: Act 2 — noise-floor strips and pooled fakes (js/act2.js)

**Files:**
- Create: `dashboard/public/js/act2.js`

**Interfaces:**
- Consumes: `App.data.placebo` (single, single_order, pooled2009, pooled2007, real, focus_map), `App.data.annotations.california`, `App.on("focus")`, helpers.

- [ ] **Step 1: Write js/act2.js — strip plot**

Adapt the detail-mode strip renderer from the OLD `app.js` `drawPlaceboStatic` (lines 706–795) — that code already draws: one row per `single_order` method, mean±2SD band, deterministic-jitter dots, focus highlight, real-estimate diamonds (`real.states` per-state for classic/ridge, pooled fallback otherwise), and the shared axis. Port it into `js/act2.js` with these changes (everything else verbatim):

1. Remove the pooled fake-2009 strip from this SVG (it moves to the second panel).
2. Diamond hover: each real-state diamond gets a tooltip "State · ATT · percent"; data from `placebo.real.states[m]` entries.
3. California annotation: for every diamond whose `state === "California"`, draw a thin leader line up to a persistent marker label "California — Section III.C" (once, on the topmost row that has a CA diamond); clicking or hovering it shows `App.tooltip` with the three `annotations.california.reasons` as a list.
4. Caption `#act2-cap` (exact copy, numbers via formatters from data):
   "Gray points are backdated fake estimates at every feasible adoption year, clean-fit states, pre-treatment data only. Bands mark each method's mean ± 2 SD; diamonds are the real estimates. Four of five real estimates sit inside the no-treatment noise band; California is the exception, discussed in Section III.C of the paper. Classic SCM is the single-unit special case of the partially-pooled ASCM."
5. Keep the focus-map behavior and its two footnote lines from the old code (lines 786–794).

- [ ] **Step 2: Write the pooled mini-forest (same file)**

New function drawing into `#pooled-fakes` (340×460): two column panels side by side ("fake 2009", "fake 2007"), shared y (six estimator rows in `real.order` minus twfe → use `meta.estimator_order` + twfe row from pooled data if present in the CSVs; use the keys present in `placebo.pooled2009`). Per row per panel: dot at `att`, whisker ±1.96·`se`, color SWATCH. For multisynth use `se_jack` for the whisker and show `t_jack` in the tooltip (fields added in Task 1). The Callaway–Sant'Anna 2007 cell: if `Math.abs(p.t) > 1.96`, fill the dot red (`#b3372f`) and add a flag glyph; caption `#act2b-cap`:
"Pooled backdated placebos: every estimator finds a negative pseudo-effect near −1 to −2 percent. The flagged cell rejects at the 5 percent level on data where no treatment occurred, anticipating the over-rejection its native test shows in the simulation. The primary row uses its jackknife standard error."

- [ ] **Step 3: Verify in browser**

Check against the paper: band means ≈ −0.9%, SDs 2.3–3.4pp (Table 5 right panel); pooled 2009 range −0.9 to −2.2; CS-2007 dot flagged red (|t| = 2.06 per `fakeSvnWorstT`); California diamonds annotated and outside every band; caption reads "four of five". Chip focus switches band highlight.

- [ ] **Step 4: Checkpoint — user reviews Act 2.**

---

### Task 5: Act 3 — slider, hero, curves, ladder, inset (js/act3.js)

**Files:**
- Create: `dashboard/public/js/act3.js`

**Interfaces:**
- Consumes: `App.buildSlider`, `App.cell`, `App.state`, `App.data.estimators/phased/meta/plausible_band`, events `"delta"`, `"focus"`, `"phased"`.

- [ ] **Step 1: Controls**

```js
  App.on("ready", function () {
    App.buildSlider(document.getElementById("slider"), "0", function (dk, fromDk) {
      App.setDelta(dk, fromDk);
    });
    var tog = document.getElementById("phase-toggle");
    tog.addEventListener("click", function () { App.setPhased(!App.state.phased); });
    App.on("delta", syncToggle); App.on("phased", syncToggle);
    function syncToggle() {
      tog.disabled = App.state.dk !== "-5";
      tog.classList.toggle("on", App.state.phased);
      tog.title = tog.disabled
        ? "Available at −5%, the only simulated phase-in cell"
        : (App.state.phased ? "Showing the 3-year phase-in draws" : "Switch to the 3-year phase-in draws");
    }
    syncToggle();
    // drinks readout: |δ| × baseline gal × 3785.4 ml/gal ÷ 17.7 ml per standard
    // drink ÷ 12 months — DO NOT hand-derive: reuse the committed conversion by
    // scaling meta.mde_drinks_per_month: drinks(δ) = mde_drinks_per_month ×
    // |δ| / |mde_delta_primary| (both from meta; exactly proportional).
  });
```

The drinks scaling must reuse the committed ratio as shown, so the readout agrees with the paper's macro-fed numbers at the MDE by construction.

- [ ] **Step 2: Hero — dot histogram with keyed positional transitions**

Layout: x scale domain [−0.27, 0.10] (same as old hero); bin width = x-span/56 bins; each draw is a circle r=3.2 keyed by draw index; y position = binIndex stack height (dotplot). On `"delta"`/`"phased"`/`"focus"`: recompute bins for the target cell's `att` array, then `selection.data(draws, key).transition().duration(520).ease(d3.easeCubicOut)` to new positions — reduced-motion check falls back to instant redraw (copy the `prefers-reduced-motion` guard from old app.js line 439).

Encodings per dot for the current cell `c = App.cell(focusForPower())`:
- `Math.abs(att) > ri_thresh` (the FOCUSED estimator's own `ri_thresh`) → fill `C.cal`, else `C.inkFaint`.
- Primary only: `Math.abs(att / c.se_jack[i]) > 1.96` → stroke `C.jack` width 2 (ring), else no stroke. Note the phased cell has no `se_jack` array — when `App.state.phased`, show the jackknife counter from `phased.reject_jack` but skip per-draw rings.
- Vertical guide lines at ±`ri_thresh` (color `C.cal`, dashed) and, primary only, ±1.96×`se_jack_mean` from the δ=0 cell (color `C.jack`, solid — flat across δ, same as old `env.jackHalf` logic at line 317).
- Axis markers: injected truth (δ, or the phased mean path label when phased) in `C.ink` and mean estimate in `C.cal`, with the fixed-position readout row copied from old `drawHeroLive` lines 407–413.
- Caption line under axis: "the same " + n_draws + " pseudo-treated draws at every δ; only the injected effect changes".

`focusForPower()`: `App.data.estimators[App.state.focus] ? App.state.focus : "multisynth"`; when it falls back (TWFE chip), render a small note "TWFE was not run through the power grid; showing the primary estimator".

Counters (`#c-jack`, `#c-cal`): from `c.reject_jack` (em-dash + "primary estimator only" caption for alternatives) and `c.reject_ri`; at dk === "0" the jackknife caption becomes "empirical size " + size formatted + " · 95% CI " + lo + "–" + hi + " (nominal 5%)" from `meta.size_jack`. Pulse animation: copy `reflow`/`pulse` pattern from old `setCounters`.

Reading line (`#reading`), same grammar as old `drawReading` but jackknife/RI only:
zero case: "The injected effect is zero. {label} returns a mean estimate of {eff1}. The jackknife rejects {pct1} of draws against a nominal 5 percent; the calibrated rule rejects {pct1} by construction."
nonzero: "The injected effect is {effI}. {label} recovers {eff1} on average. The reported jackknife inference detects it in {pct1} of draws; the calibrated rule in {pct1}." (alternatives: calibrated only + "jackknife is reported for the primary estimator").
Closing static line (`#closing`): real-data sentence from `real_data`: estimate, jackknife CI, t — "a null under the reported inference" — plus plausible-band sentence from `plausible_band` and both MDEs from `meta`.

- [ ] **Step 3: Power curves panel**

Port `buildPowerEnv`/`drawPowerStatic`/`pcurve`/`drawPowerCurves`/`drawPowerMarker` from old app.js (lines 573–665) with these deletions/changes:
1. DELETE the default-rule floor curve and its label (old lines 654–658).
2. All five estimators' RI curves always drawn (no checkbox state); focused curve wide, others thin at 0.45 opacity — focus from `focusForPower()`.
3. Jackknife curve for the primary kept (old lines 634–652), label "ASCM, jackknife (reported)".
4. Keep the plausible-band gradient, 80% line, MDE ticks for the focused curve, and the δ marker driven by `"delta"`.

- [ ] **Step 4: MDE ladder**

New function into `#ladder`: rows = 5 power-grid estimators sorted by `Math.abs(mde_ri)` ascending; per row: label, lollipop line from 0 to `|mde_ri|`×100 on an x scale [0, 8]%, dot in SWATCH, value text "|mde|% ≈ {mde_ri_drinks} drinks/mo". Primary row shows a second dot at `|meta.mde_jack_delta|` in `C.jack` labeled "jackknife". Top (smallest) row gets the tag "the design's limit". Caption `#ladder-cap` (both cautions, numbers from data):
"Minimum detectable effect at 80 percent power under each estimator's calibrated rule. The smallest figure carries two cautions from the paper: that estimator's native test is the worst over-rejecter at δ = 0 (" + pct1(size_se0 of that estimator) + " against a nominal 5 percent), and its cells use 200 draws, making this the noisiest of the minimum detectable effects reported."

- [ ] **Step 5: Jackknife credibility inset**

Into `#jk-ratio`: five dots + connecting line, x = |δ| (the five cells), y = `se_jack_ratio` from each primary cell, y-domain [0, 3], reference line at 1× labeled "a well-calibrated SE sits here". All five dots sit at ≈1.27. Caption `#jk-cap` (self-contained, numbers from data — `ratio` = δ=0 `se_jack_ratio`, `size` from `meta.size_jack`, MDEs from `meta`):
"The jackknife standard error runs a constant {ratio}× the true sampling dispersion at every effect size: uniformly conservative by about 27 percent. That is consistent with its {size} percent empirical size at δ = 0 and is what separates its {mde_jack} percent minimum detectable effect from the calibrated rule's {mde_ri} percent."
(The "27" is computed as `Math.round((ratio-1)*100)`, not typed.)

- [ ] **Step 6: Verify in browser**

Slider walk 0 → −12: dots translate rigidly, detected share grows, counters match Table 6 (jackknife 1.8/7.8/53.2/89.2/98.2; RI 5.0/9.5/63.8/97.2/100 — read them from `gen/tab_power_rows.tex` to confirm, not from this plan). Phase-in at −5: counters drop to 23.2/29.8. δ=0 jackknife caption shows size CI ≈ 0.7–3.6. Ladder: CS 4.5 flagged with double caution; primary shows 6.4 + 7.2. Inset flat at 1.27. TWFE chip → hero falls back with note. Reduced motion (emulate via devtools) skips transitions.

- [ ] **Step 7: Checkpoint — user reviews Act 3.**

---

### Task 6: Retire app.js, README, final sweep

**Files:**
- Delete: `dashboard/public/app.js`
- Modify: `dashboard/public/index.html` (only if any stale reference remains)
- Modify: `README.md` (dashboard paragraph)

- [ ] **Step 1: Delete `dashboard/public/app.js`** (the acts replace it). Confirm `index.html` references only `js/shared.js`, `js/act1.js`, `js/act2.js`, `js/act3.js`.

- [ ] **Step 2: Update README's "Interactive dashboard" paragraph**

Rewrite to describe the new page: paper-arc single page (pooled nulls with the RI null distribution, backdated-placebo noise floor, power simulation with δ slider, estimator chips, phase-in toggle), pure replay of `Results/csv/` via `power.json` schema 4, prep self-checks, no build step, same deploy workflow and local-serve instructions.

- [ ] **Step 3: Grep sweep**

Run from repo root:
`grep -rniE "wild|bootstrap|default[- ]test|default rule|se_boot|mechanism" dashboard/ --include="*.js" --include="*.html" --include="*.css" --include="*.py"`
Expected: zero hits in JS/HTML/CSS. In `build_dashboard_data.py`, only hits that read CSV columns for self-checks (e.g. the pairing check comparing `se` columns) are acceptable; no output-facing hit. The five inference-label strings live in the JSON `inference` fields and come from the prep `INFERENCE` dict — those `bootstrap` hits in the .py are data (Table 3 inference column) and stay.

- [ ] **Step 4: Full verification pass**

1. `python dashboard/prep/build_dashboard_data.py` — all self-checks pass.
2. Serve and walk the whole page against the paper PDF: header chips; Act 1 vs Table 3; Act 2 vs Table 5 and Figure (bias bands); Act 3 vs Tables 6–7 and the power figure; footer commit stamp.
3. Keyboard-only pass: chips tabbable, slider arrows work, modal Esc closes.
4. Narrow viewport (≤480px) sanity.

- [ ] **Step 5: Final checkpoint — user reviews everything and commits.**
