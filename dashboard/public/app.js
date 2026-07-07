/* Replays data/power.json (built from Results/csv/power_*.csv). The slider stops
   at the five simulated effect sizes; nothing is estimated in the browser. */

(function () {
  "use strict";

  var css = getComputedStyle(document.documentElement);
  function v(name) { return css.getPropertyValue(name).trim(); }
  var C = {
    ink: v("--ink"), inkSoft: v("--ink-soft"), inkFaint: v("--ink-faint"),
    rule: v("--rule"), cloud: v("--cloud"), cal: v("--calibrated"),
    def: v("--default-rule"), jack: v("--jack-rule"),
    band: v("--band"), panel: v("--panel")
  };
  var SWATCH = {
    multisynth: C.cal,
    sdid: "#4a6670",
    gsynth_ife: "#7a6a48",
    matrix_completion: "#5b5566",
    callaway_santanna: "#3f6b53"
  };

  var DKEYS = ["0", "-2", "-5", "-8", "-12"];
  // same query string as the CSS narrow-phone rules: one breakpoint source of truth
  var NARROW_MQ = window.matchMedia("(max-width: 480px)");
  var state = { dk: "0", focus: "multisynth", active: {} };
  var DATA = null;
  var clipSeq = 0;

  function sgn(x) { return x < 0 ? "−" : (x > 0 ? "+" : ""); }
  function effI(dec) { return sgn(dec) + Math.abs(Math.round(dec * 100)) + "%"; }
  function eff1(dec) { return sgn(dec) + Math.abs(dec * 100).toFixed(1) + "%"; }
  function pct1(frac) { return (frac * 100).toFixed(1) + "%"; }
  function dkDec(dk) { return (+dk) / 100; }

  // ?v matches schema_version so a stale cached copy is never replayed
  d3.json("data/power.json?v=3").then(function (data) {
    DATA = data;
    DATA.meta.estimator_order.forEach(function (e) { state.active[e] = true; });
    var parts = (location.hash || "").replace("#", "").split("/");  // deep link: #-12 or #-8/hero
    if (DKEYS.indexOf(parts[0]) >= 0) state.dk = parts[0];
    var est0 = new URLSearchParams(location.search).get("est");    // ?est=gsynth_ife to focus an estimator
    if (est0 && DATA.estimators[est0]) state.focus = est0;
    document.getElementById("delta-readout").textContent = effI(dkDec(state.dk));
    buildSlider();
    buildEstList();
    buildLegend();
    heroInline = buildHeroEnv(d3.select("#hero"), 680, 424, false);
    seInline = buildSEEnv(d3.select("#se"), 680, 260, false);
    powInline = buildPowerEnv(d3.select("#power"), 520, 432, false);
    plaInline = buildPlaceboEnv(d3.select("#placebo"), 680, 300, false);
    initModal();
    fillMdeCallout();
    drawReadingStatic();
    update(true);
    document.getElementById("app").setAttribute("aria-busy", "false");
    var TITLES = { hero: "Sampling distribution", se: "Standard error inflation", power: "Power curves", placebo: "The observed noise floor" };
    if (parts[1] && TITLES[parts[1]]) openModal(parts[1], TITLES[parts[1]]);
  });

  function cell(est, dk) { return DATA.estimators[est].deltas[dk]; }
  function focusCell(dk) { return cell(state.focus, dk || state.dk); }

  // slider
  var slEl, thumb, fill, PAD = 13;
  function buildSlider() {
    slEl = document.getElementById("slider");
    var track = mk("div"); track.className = "sl-track"; slEl.appendChild(track);
    fill = mk("div"); fill.className = "sl-fill"; slEl.appendChild(fill);
    DKEYS.forEach(function (k, i) {
      var t = mk("div"); t.className = "sl-tick"; t.style.left = pctFor(i) + "%"; slEl.appendChild(t);
      var lab = mk("div"); lab.className = "sl-lab"; lab.style.left = pctFor(i) + "%";
      lab.textContent = effI(dkDec(k)); slEl.appendChild(lab);
    });
    thumb = mk("div"); thumb.className = "thumb"; slEl.appendChild(thumb);
    slEl.setAttribute("aria-valuenow", state.dk);
    injectSliderCSS();
    var dragging = false;
    function pick(clientX) {
      var r = slEl.getBoundingClientRect();
      var x = (clientX - r.left - PAD) / (r.width - 2 * PAD);
      x = Math.max(0, Math.min(1, x));
      setDelta(DKEYS[Math.round(x * (DKEYS.length - 1))]);
    }
    slEl.addEventListener("pointerdown", function (e) { dragging = true; slEl.setPointerCapture(e.pointerId); pick(e.clientX); });
    slEl.addEventListener("pointermove", function (e) { if (dragging) pick(e.clientX); });
    slEl.addEventListener("pointerup", function () { dragging = false; });
    slEl.addEventListener("pointercancel", function () { dragging = false; });
    slEl.addEventListener("keydown", function (e) {
      var i = DKEYS.indexOf(state.dk);
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { setDelta(DKEYS[Math.max(0, i - 1)]); e.preventDefault(); }
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { setDelta(DKEYS[Math.min(DKEYS.length - 1, i + 1)]); e.preventDefault(); }
    });
    placeThumb(DKEYS.indexOf(state.dk), false);
  }
  function pctFor(i) { return (i / (DKEYS.length - 1)) * 100; }
  function placeThumb(i, animate) {
    var r = slEl.getBoundingClientRect();
    var usable = (r.width - 2 * PAD) || 300;
    var px = PAD + (i / (DKEYS.length - 1)) * usable;
    thumb.style.transition = animate ? "left .45s cubic-bezier(.22,1,.36,1)" : "none";
    fill.style.transition = thumb.style.transition;
    thumb.style.left = px + "px"; fill.style.width = px + "px";
  }
  function setDelta(dk) {
    if (dk === state.dk) return;
    var fromIdx = DKEYS.indexOf(state.dk);
    state.dk = dk;
    placeThumb(DKEYS.indexOf(dk), true);
    slEl.setAttribute("aria-valuenow", dk);
    slEl.setAttribute("aria-valuetext", effI(dkDec(dk)) + " effect");
    document.getElementById("delta-readout").textContent = effI(dkDec(dk));
    update(false, fromIdx);
  }

  // estimator list: the checkbox toggles a curve, the row selects the focus
  function buildEstList() {
    var ul = document.getElementById("est-list");
    DATA.meta.estimator_order.forEach(function (est) {
      var e = DATA.estimators[est];
      var li = mk("li"); li.className = "est-row"; li.dataset.est = est;
      li.style.setProperty("--swatch", SWATCH[est]);
      var box = mk("span"); box.className = "est-check"; box.setAttribute("role", "checkbox");
      box.setAttribute("aria-checked", "true"); box.tabIndex = 0;
      box.addEventListener("click", function (ev) { ev.stopPropagation(); toggle(est); });
      box.addEventListener("keydown", function (ev) { if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); toggle(est); } });
      var sw = mk("span"); sw.className = "est-swatch";
      var lab = mk("span"); lab.className = "est-label"; lab.textContent = e.label;
      li.appendChild(box); li.appendChild(sw); li.appendChild(lab);
      if (e.primary) {
        var tag = mk("span"); tag.className = "est-tag"; tag.textContent = "primary";
        li.appendChild(tag);
      }
      var tail = mk("span"); tail.className = "est-mde";
      tail.textContent = e.mde_ri ? "MDE " + (Math.abs(e.mde_ri) * 100).toFixed(1) + "%" : "";
      li.appendChild(tail);
      li.addEventListener("click", function () { setFocus(est); });
      li.tabIndex = 0; li.setAttribute("role", "button");
      li.setAttribute("aria-label", "Read " + e.label + " in the charts");
      li.addEventListener("keydown", function (ev) {
        if (ev.target === li && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); setFocus(est); }
      });
      ul.appendChild(li);
    });
    syncEstList();
  }
  function toggle(est) {
    state.active[est] = !state.active[est];
    if (!state.active[est] && state.focus === est) {
      var on = DATA.meta.estimator_order.filter(function (e) { return state.active[e]; })[0];
      if (on) state.focus = on;
    }
    syncEstList(); drawPowerCurves(powInline); drawReading();
  }
  function setFocus(est) {
    if (!state.active[est]) state.active[est] = true;
    state.focus = est;
    syncEstList(); refreshHeroLabels(); buildLegend();
    setCounters(focusCell(), true);
    heroInline = buildHeroEnv(d3.select("#hero"), 680, 424, false);
    drawHeroFrame(heroInline); drawHeroGhost(heroInline);
    drawHeroLive(heroInline, focusCell().att, focusCell().se_boot_mean, focusCell().mean_att);
    drawChaseCallout(heroInline);
    drawSE(seInline); drawPowerCurves(powInline); drawReading();
    drawPlaceboStatic(plaInline); drawPlaceboMarker(plaInline);
  }
  function syncEstList() {
    d3.selectAll(".est-row").each(function () {
      var est = this.dataset.est;
      this.classList.toggle("focus", est === state.focus);
      this.querySelector(".est-check").setAttribute("aria-checked", state.active[est] ? "true" : "false");
      this.querySelector(".est-swatch").style.opacity = state.active[est] ? 1 : 0.25;
    });
  }
  function refreshHeroLabels() {
    document.getElementById("hero-est").textContent = DATA.estimators[state.focus].label;
    document.getElementById("se-est").textContent = DATA.estimators[state.focus].label;
    document.getElementById("pla-est").textContent = DATA.estimators[state.focus].label;
    document.getElementById("se-verdict").textContent = seVerdict();
    updateChartAria();
  }
  // One sentence on what the SE ratio means for the focused estimator's test.
  // Branches on the same delta=0 size flag as the counter caption, then on the
  // panel's 1.05 qualifier bound, so the three never disagree.
  function seVerdict() {
    var c0 = cell(state.focus, "0");
    if (DATA.estimators[state.focus].primary) {
      return "The default's multiple grows exactly when there is something to find: the wild bootstrap's replicate variance scales with the level of the treated-unit effects. The jackknife's does not.";
    }
    if (c0.reject_se > OVERSIZE) {
      return "The reported error understates the true spread, so the test rejects too often: its nominal 5 percent size is really " + pct1(c0.reject_se) + ".";
    }
    if (c0.se_boot_ratio > 1.05) {
      return "This multiple grows with the effect, which is why the default test rarely fires.";
    }
    return "The reported error runs narrower than the true spread, but the test still holds close to its nominal 5 percent size.";
  }
  // text alternatives: keep each chart's aria-label in step with the state
  function updateChartAria() {
    var c = focusCell(), est = DATA.estimators[state.focus].label, d = effI(dkDec(state.dk));
    var primary = DATA.estimators[state.focus].primary;
    d3.select("#hero").attr("aria-label", primary
      ? ("Sampling distribution for " + est + " at injected effect " + d +
         ". The default test, a wild bootstrap, rejects " + pct1(c.reject_se) + " of draws, the jackknife " +
         pct1(c.reject_jack) + ", the calibrated test " + pct1(c.reject_ri) + ".")
      : ("Sampling distribution for " + est + " at injected effect " + d +
         ". The native standard-error test rejects " + pct1(c.reject_se) + " of draws, the calibrated test " + pct1(c.reject_ri) + "."));
    d3.select("#se").attr("aria-label", primary
      ? ("Standard errors for " + est + " at " + d + ": the default wild bootstrap is " +
         c.se_boot_ratio.toFixed(1) + " times the true sampling spread, the jackknife " +
         c.se_jack_ratio.toFixed(2) + " times.")
      : ("Standard error for " + est + " at " + d + ": the reported standard error is " +
         c.se_boot_ratio.toFixed(1) + " times the true sampling spread."));
    d3.select("#power").attr("aria-label", "Power curves. At a true effect of " + d + ", " + est +
      " rejects " + pct1(c.reject_ri) + " of draws under the calibrated test" +
      (primary ? " and " + pct1(c.reject_jack) + " under the jackknife." : "."));
    if (DATA.placebo) {
      var m = DATA.placebo.focus_map[state.focus];
      var verdict = dkDec(state.dk) >= placeboEdge() ? " sits inside this noise floor." : " clears this noise floor.";
      if (m) {
        var s = DATA.placebo.single[m];
        d3.select("#placebo").attr("aria-label", "Backdated placebo noise for " + s.label +
          ": fake effects center at " + eff1(s.mean) + " with a spread of " + eff1(s.sd) +
          " per estimate; a true effect of " + d + verdict);
      } else {
        var p = DATA.placebo.pooled2009[state.focus];
        d3.select("#placebo").attr("aria-label", "Pooled fake-2009 placebo for " + est +
          ": estimate " + eff1(p.att) + " with standard error " + eff1(p.se) +
          "; a true effect of " + d + verdict);
      }
    }
  }

  function update(first, fromIdx) {
    refreshHeroLabels();
    setCounters(focusCell(), !first);
    drawReading(); drawPowerMarker(powInline); drawPlaceboMarker(plaInline);
    if (first) {
      drawSE(seInline);
      drawHeroFrame(heroInline); drawHeroGhost(heroInline);
      drawHeroLive(heroInline, focusCell().att, focusCell().se_boot_mean, focusCell().mean_att);
      drawChaseCallout(heroInline);
      drawPowerStatic(powInline); drawPowerCurves(powInline); drawPowerMarker(powInline);
      drawPlaceboStatic(plaInline); drawPlaceboMarker(plaInline);
    } else {
      morphHero(heroInline, DKEYS[fromIdx], state.dk);
      morphSE(seInline, DKEYS[fromIdx], state.dk);
    }
  }
  // An estimator whose SE test rejects more than this at delta=0 is an over-rejector
  // (1.5x the nominal 5% size, clear of sampling noise at 200 draws).
  var OVERSIZE = 0.075;
  function setCounters(c, pulse) {
    var d = document.getElementById("c-def"), j = document.getElementById("c-jack"),
        k = document.getElementById("c-cal");
    var primary = DATA.estimators[state.focus].primary;
    d.textContent = pct1(c.reject_se); k.textContent = pct1(c.reject_ri);
    document.getElementById("c-def-cap").textContent = primary
      ? "wild bootstrap, as conventionally run"
      : (cell(state.focus, "0").reject_se > OVERSIZE ? "native SE test · over-rejects: SE too narrow" : "native SE test");
    if (primary) {
      j.textContent = pct1(c.reject_jack);
      j.parentNode.classList.remove("na");
      document.getElementById("c-jack-cap").textContent = "same fits, held to 1.96";
    } else {
      j.textContent = "—";
      j.parentNode.classList.add("na");
      document.getElementById("c-jack-cap").textContent = "primary estimator only";
    }
    if (pulse) { reflow(d); reflow(j); reflow(k); d.classList.add("pulse"); j.classList.add("pulse"); k.classList.add("pulse"); }
  }

  function buildLegend() {
    var primary = DATA.estimators[state.focus].primary;
    var items = [
      { cls: "lg-live", t: "estimates at current δ" },
      { cls: "lg-null", t: "null distribution (δ = 0)" },
      { cls: "lg-cal", t: "calibrated threshold" }
    ];
    if (primary) items.push({ cls: "lg-jack", t: "jackknife threshold" });
    items.push({ cls: "lg-def", t: primary ? "default region (wild bootstrap)" : "reported-SE region" });
    var el = document.getElementById("hero-legend");
    el.innerHTML = "";
    items.forEach(function (it) {
      var s = mk("span"); s.className = "lg-item";
      var sw = mk("span"); sw.className = "lg-sw " + it.cls;
      var tx = mk("span"); tx.textContent = it.t;
      s.appendChild(sw); s.appendChild(tx); el.appendChild(s);
    });
  }

  function kde(samples, bw, xs) {
    var inv = 1 / (bw * Math.sqrt(2 * Math.PI));
    return xs.map(function (x) {
      var s = 0; for (var i = 0; i < samples.length; i++) { var u = (x - samples[i]) / bw; s += Math.exp(-0.5 * u * u); }
      return [x, inv * s / samples.length];
    });
  }

  // hero chart
  var heroInline = null;
  function buildHeroEnv(svg, W, H, detail) {
    svg.selectAll("*").remove();
    // narrow mode: the svg scales down ~0.47x on phones, so below-axis text gets
    // LARGER user-unit fonts plus a taller ladder to stay legible after scaling
    var narrow = NARROW_MQ.matches;
    // two fixed rows below the axis (readout, axis title); the threshold lines
    // are identified by the color legend, not by moving labels
    var M = { t: 16, r: 18, b: detail ? (narrow ? 96 : 64) : (narrow ? 84 : 58), l: 18 };
    var env = { svg: svg, W: W, H: H, M: M, detail: detail, narrow: narrow };
    env.pw = W - M.l - M.r; env.ph = H - M.t - M.b;
    env.x = d3.scaleLinear().domain([-0.27, 0.10]).range([0, env.pw]);
    var fc = focusCell(), n = DATA.estimators[state.focus].n_draws;
    env.primary = DATA.estimators[state.focus].primary;
    // fixed jackknife gate: the jackknife SE is flat across delta, so the
    // delta = 0 cell's mean is the gate at every stop
    env.jackHalf = env.primary ? 1.96 * cell(state.focus, "0").se_jack_mean : null;
    env.bw = 1.06 * fc.se_true * Math.pow(n, -0.2);   // Silverman bandwidth
    var nx = detail ? 120 : 70;
    env.xs = d3.range(nx).map(function (i) { return -0.27 + (i / (nx - 1)) * 0.37; });
    var ymax = 0;
    DKEYS.forEach(function (dk) { kde(cell(state.focus, dk).att, env.bw, env.xs).forEach(function (p) { if (p[1] > ymax) ymax = p[1]; }); });
    env.y = d3.scaleLinear().domain([0, ymax * 1.10]).range([env.ph, 0]);
    var cid = "cap" + (clipSeq++);
    env.clip = cid;
    var defs = svg.append("defs");
    // clip used to paint the share of the cloud past the calibrated threshold
    defs.append("clipPath").attr("id", cid).append("rect")
      .attr("x", 0).attr("y", -6).attr("width", env.x(-DATA.estimators[state.focus].ri_thresh)).attr("height", env.ph + 6);
    // diagonal hatch so the default region reads without color
    var pid = "hatch" + (clipSeq++);
    env.hatch = pid;
    defs.append("pattern").attr("id", pid).attr("width", 6).attr("height", 6).attr("patternUnits", "userSpaceOnUse")
      .append("path").attr("d", "M0,6 l6,-6").attr("stroke", C.def).attr("stroke-width", 1).attr("opacity", 0.35);
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    env.gFrame = root.append("g");
    env.gGhost = root.append("g");
    env.gDyn = root.append("g");
    env.gAxis = root.append("g");
    env.gCallout = root.append("g");
    return env;
  }
  function drawHeroFrame(env) {
    var g = env.gFrame; g.selectAll("*").remove();
    var thr = DATA.estimators[state.focus].ri_thresh;
    var fs = env.narrow ? 16 : (env.detail ? 12 : 11);
    // calibrated gates: vertical lines only (area shading is reserved for the
    // default region so three rules never stack into mud)
    [-thr, thr].forEach(function (t) {
      g.append("line").attr("x1", env.x(t)).attr("x2", env.x(t)).attr("y1", -6).attr("y2", env.ph)
        .attr("stroke", C.cal).attr("stroke-width", 1.2).attr("stroke-dasharray", "2 3").attr("opacity", 0.65);
    });
    // jackknife gates: fixed at ±1.96 × mean jackknife SE (flat across δ)
    if (env.primary) {
      [-env.jackHalf, env.jackHalf].forEach(function (t) {
        if (env.x(t) < -2 || env.x(t) > env.pw + 2) return;
        g.append("line").attr("x1", env.x(t)).attr("x2", env.x(t)).attr("y1", -6).attr("y2", env.ph)
          .attr("stroke", C.jack).attr("stroke-width", 1.5).attr("opacity", 0.8);
      });
    }
    g.append("line").attr("x1", 0).attr("x2", env.pw).attr("y1", env.ph).attr("y2", env.ph).attr("stroke", C.ink).attr("stroke-width", 1);
    var ticks = [-0.25, -0.20, -0.15, -0.10, -0.05, 0, 0.05, 0.10];
    var ax = d3.axisBottom(env.x).tickValues(ticks).tickSize(4)
      .tickFormat(function (d) { return (d < 0 ? "−" : "") + Math.abs(Math.round(d * 100)); });
    var gax = g.append("g").attr("transform", "translate(0," + env.ph + ")").call(ax);
    gax.selectAll("text").attr("class", "tick").style("font-size", fs + "px");
    gax.select(".domain").remove();
    // Row B: axis title, fixed position (threshold lines are identified by the legend)
    g.append("text").attr("class", "ax-label").attr("x", env.pw / 2)
      .attr("y", env.ph + (env.narrow ? 66 : (env.detail ? 50 : 46)))
      .attr("text-anchor", "middle").style("font-size", fs + "px").text("estimated effect (%)");
  }
  function drawHeroGhost(env) {
    var g = env.gGhost; g.selectAll("*").remove();
    var dens = kde(cell(state.focus, "0").att, env.bw, env.xs);
    var area = d3.area().x(function (d) { return env.x(d[0]); }).y0(env.ph).y1(function (d) { return env.y(d[1]); }).curve(d3.curveBasis);
    g.append("path").attr("d", area(dens)).attr("fill", C.inkFaint).attr("opacity", 0.16);
    g.append("path").attr("d", area(dens)).attr("fill", "none").attr("stroke", C.inkFaint).attr("stroke-width", 1).attr("opacity", 0.5);
  }
  function drawHeroLive(env, att, bootSE, meanv, labelDk) {
    var g = env.gDyn, ga = env.gAxis; g.selectAll("*").remove(); ga.selectAll("*").remove();
    var xL = 0, xR = env.pw;
    var jb = 1.96 * bootSE, fs = env.narrow ? 16 : (env.detail ? 11.5 : 10.5);
    [[xL, env.x(-jb)], [env.x(jb), xR]].forEach(function (s) {     // default region moves with δ
      g.append("rect").attr("x", s[0]).attr("y", -6).attr("width", Math.max(0, s[1] - s[0])).attr("height", env.ph + 6)
        .attr("fill", C.def).attr("opacity", 0.12);
      g.append("rect").attr("x", s[0]).attr("y", -6).attr("width", Math.max(0, s[1] - s[0])).attr("height", env.ph + 6)
        .attr("fill", "url(#" + env.hatch + ")");
    });
    [-jb, jb].forEach(function (t) {
      if (env.x(t) < xL - 2 || env.x(t) > xR + 2) return;
      g.append("line").attr("x1", env.x(t)).attr("x2", env.x(t)).attr("y1", -6).attr("y2", env.ph)
        .attr("stroke", C.def).attr("stroke-width", 1.2).attr("stroke-dasharray", "7 3").attr("opacity", 0.8);
    });
    var dens = kde(att, env.bw, env.xs);
    var area = d3.area().x(function (d) { return env.x(d[0]); }).y0(env.ph).y1(function (d) { return env.y(d[1]); }).curve(d3.curveBasis);
    g.append("path").attr("d", area(dens)).attr("fill", C.cloud).attr("opacity", 0.16);
    g.append("path").attr("d", area(dens)).attr("fill", "none").attr("stroke", C.cloud).attr("stroke-width", 1.5).attr("opacity", 0.9);
    g.append("path").attr("d", area(dens)).attr("fill", C.cal).attr("opacity", 0.42).attr("clip-path", "url(#" + env.clip + ")");
    var rug = att.map(function (a) { var x = env.x(a); return "M" + x + "," + env.ph + "v-6"; }).join("");
    g.append("path").attr("d", rug).attr("stroke", C.cloud).attr("stroke-width", 0.6).attr("opacity", 0.28);
    g.append("line").attr("x1", env.x(meanv)).attr("x2", env.x(meanv)).attr("y1", env.ph).attr("y2", -2)
      .attr("stroke", C.cloud).attr("stroke-width", 1.6);

    // Row A: injected/recovered readout at a fixed position (leader ticks
    // still point at the data), so nothing below the axis jumps around
    var dk = labelDk || state.dk, inj = dkDec(dk), xi = env.x(inj), xm = env.x(meanv);
    ga.append("line").attr("x1", xi).attr("x2", xi).attr("y1", env.ph).attr("y2", env.ph + 7).attr("stroke", C.ink).attr("stroke-width", 1.4);
    ga.append("line").attr("x1", xm).attr("x2", xm).attr("y1", env.ph).attr("y2", env.ph + 7).attr("stroke", C.cal).attr("stroke-width", 1.4);
    ga.append("text").attr("x", 0).attr("y", env.ph + (env.narrow ? 42 : (env.detail ? 32 : 30))).attr("text-anchor", "start")
      .attr("class", "ax-note").style("font-size", fs + "px").attr("fill", C.ink)
      .text(env.narrow ? ("inj " + effI(inj) + ", rec " + eff1(meanv))
                       : ("injected " + effI(inj) + ", recovered " + eff1(meanv)));
  }
  // The chase, said once: at the mid-grid stops the default gate visibly
  // retreats at roughly the pace the cloud advances.
  function drawChaseCallout(env) {
    var g = env.gCallout; g.selectAll("*").remove();
    if (!env.primary || (state.dk !== "-5" && state.dk !== "-8")) return;
    // top-right corner: empty space above the null ghost's right tail
    var fs = env.narrow ? 13 : (env.detail ? 12 : 10.5), tx = env.pw - 4;
    var lines = ["the default threshold moves with", "the effect it is meant to detect"];
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var t = g.append("text").attr("x", tx).attr("y", 12).attr("text-anchor", "end")
      .attr("class", "ax-note").style("font-size", fs + "px").attr("fill", C.def);
    lines.forEach(function (ln, i) {
      t.append("tspan").attr("x", tx).attr("dy", i === 0 ? 0 : fs + 3).text(ln);
    });
    // panel-colored halo so gate lines never strike through the text
    var bb = t.node().getBBox();
    g.insert("rect", "text").attr("x", bb.x - 6).attr("y", bb.y - 4)
      .attr("width", bb.width + 12).attr("height", bb.height + 8)
      .attr("fill", C.panel).attr("fill-opacity", 0.92).attr("rx", 3);
    if (!reduce) { g.attr("opacity", 0).transition().duration(300).attr("opacity", 1); }
    else { g.attr("opacity", 1); }
  }
  function morphHero(env, fromDk, toDk) {
    var est = state.focus, a0 = cell(est, fromDk), a1 = cell(est, toDk);
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    env.gCallout.selectAll("*").remove();
    if (reduce || a0.att.length !== a1.att.length) {
      drawHeroLive(env, a1.att, a1.se_boot_mean, a1.mean_att, toDk);
      drawChaseCallout(env);
      return;
    }
    var dur = 520, n = a1.att.length;
    if (env.timer) env.timer.stop();
    env.timer = d3.timer(function (el) {
      var k = Math.min(1, el / dur), e = d3.easeCubicOut(k), att = new Array(n);
      for (var i = 0; i < n; i++) att[i] = a0.att[i] + (a1.att[i] - a0.att[i]) * e;
      drawHeroLive(env, att, a0.se_boot_mean + (a1.se_boot_mean - a0.se_boot_mean) * e, a0.mean_att + (a1.mean_att - a0.mean_att) * e, toDk);
      if (k >= 1) { env.timer.stop(); drawHeroLive(env, a1.att, a1.se_boot_mean, a1.mean_att, toDk); drawChaseCallout(env); }
    });
  }

  // SE panel: the flat jackknife ratio against the climbing default ratio,
  // across the five effect sizes. The most shareable image on the page.
  var seInline = null;
  function buildSEEnv(svg, W, H, detail) {
    svg.selectAll("*").remove();
    var M = { t: 12, r: 20, b: 36, l: 34 };
    var env = { svg: svg, W: W, H: H, M: M, detail: detail };
    env.pw = W - M.l - M.r; env.ph = H - M.t - M.b;
    env.x = d3.scaleLinear().domain([0, 0.12]).range([0, env.pw]);
    env.y = d3.scaleLinear().domain([0, 7]).range([env.ph, 0]);
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    env.gStatic = root.append("g");
    env.gLive = root.append("g");
    return env;
  }
  function seRatios(dk) {
    var c = cell(state.focus, dk);
    return { boot: c.se_boot_ratio, jack: c.se_jack_ratio };
  }
  function drawSE(env) {
    var g = env.gStatic; g.selectAll("*").remove();
    var primary = DATA.estimators[state.focus].primary;
    var fs = env.detail ? 12 : 11;
    var line = d3.line()
      .x(function (dk) { return env.x(Math.abs(+dk) / 100); })
      .y(function (dk) { return env.y(seRatios(dk).boot); })
      .curve(d3.curveMonotoneX);
    var ax = d3.axisBottom(env.x).tickValues([0, 0.02, 0.05, 0.08, 0.12])
      .tickFormat(function (d) { return d === 0 ? "0" : "−" + Math.round(d * 100) + "%"; }).tickSize(4);
    var gx = g.append("g").attr("transform", "translate(0," + env.ph + ")").call(ax);
    gx.selectAll("text").attr("class", "tick").style("font-size", fs + "px");
    gx.select(".domain").attr("stroke", C.rule);
    var ay = d3.axisLeft(env.y).tickValues([1, 2, 4, 6]).tickFormat(function (d) { return d + "×"; }).tickSize(4);
    var gy = g.append("g").call(ay);
    gy.selectAll("text").attr("class", "tick").style("font-size", fs + "px");
    gy.select(".domain").attr("stroke", C.rule);
    g.append("text").attr("class", "ax-label").attr("x", env.pw).attr("y", env.ph + 32)
      .attr("text-anchor", "end").style("font-size", fs + "px").text("true effect");
    // where a well-calibrated SE sits
    g.append("line").attr("x1", 0).attr("x2", env.pw).attr("y1", env.y(1)).attr("y2", env.y(1))
      .attr("stroke", C.inkFaint).attr("stroke-width", 1).attr("stroke-dasharray", "3 3");
    g.append("text").attr("x", env.pw - 2).attr("y", env.y(1) + 14).attr("text-anchor", "end")
      .attr("class", "ax-note").style("font-size", (fs - 1) + "px").attr("fill", C.inkFaint)
      .text("a well-calibrated SE sits here (1×)");
    // default / own-SE series
    g.append("path").attr("d", line(DKEYS)).attr("fill", "none").attr("stroke", C.def).attr("stroke-width", 2.4);
    DKEYS.forEach(function (dk) {
      g.append("circle").attr("cx", env.x(Math.abs(+dk) / 100)).attr("cy", env.y(seRatios(dk).boot)).attr("r", 3.2).attr("fill", C.def);
    });
    var lastBoot = seRatios("-12").boot;
    g.append("text").attr("x", env.x(0.12) - 8).attr("y", env.y(lastBoot) - 9).attr("text-anchor", "end")
      .attr("class", "ax-note").style("font-size", fs + "px").attr("fill", C.def)
      .text(primary ? "default (wild bootstrap)" : "reported SE");
    // jackknife series (primary only): exactly flat
    if (primary) {
      var jline = d3.line()
        .x(function (dk) { return env.x(Math.abs(+dk) / 100); })
        .y(function (dk) { return env.y(seRatios(dk).jack); })
        .curve(d3.curveMonotoneX);
      g.append("path").attr("d", jline(DKEYS)).attr("fill", "none").attr("stroke", C.jack).attr("stroke-width", 2.4);
      DKEYS.forEach(function (dk) {
        g.append("circle").attr("cx", env.x(Math.abs(+dk) / 100)).attr("cy", env.y(seRatios(dk).jack)).attr("r", 3.2).attr("fill", C.jack);
      });
      g.append("text").attr("x", env.x(0.12) - 8).attr("y", env.y(seRatios("-12").jack) - 10).attr("text-anchor", "end")
        .attr("class", "ax-note").style("font-size", fs + "px").attr("fill", C.jack).text("jackknife");
    }
    drawSELive(env);
  }
  function drawSELive(env, live) {
    var g = env.gLive; g.selectAll("*").remove();
    var primary = DATA.estimators[state.focus].primary;
    if (!live) {
      var r = seRatios(state.dk);
      live = { xAbs: Math.abs(+state.dk) / 100, boot: r.boot, jack: r.jack };
    }
    var mx = env.x(live.xAbs);
    g.append("line").attr("x1", mx).attr("x2", mx).attr("y1", 0).attr("y2", env.ph)
      .attr("stroke", C.ink).attr("stroke-width", 1).attr("opacity", 0.45);
    g.append("circle").attr("cx", mx).attr("cy", -2).attr("r", 3).attr("fill", C.ink);
    // live numerals, top-left (the plot's empty corner)
    var numFS = env.detail ? 34 : 27, labFS = env.detail ? 12 : 10.5;
    g.append("text").attr("x", 6).attr("y", numFS).attr("class", "ax-label")
      .style("font-size", numFS + "px").style("font-weight", "500").attr("fill", C.def)
      .text(live.boot.toFixed(1) + "×");
    g.append("text").attr("x", 6).attr("y", numFS + labFS + 3).attr("class", "ax-note")
      .style("font-size", labFS + "px").attr("fill", C.def)
      .text(primary ? "default SE ÷ true spread" : "reported SE ÷ true spread");
    if (primary) {
      var y2 = numFS + labFS + 3;
      g.append("text").attr("x", 6).attr("y", y2 + numFS + 6).attr("class", "ax-label")
        .style("font-size", numFS + "px").style("font-weight", "500").attr("fill", C.jack)
        .text(live.jack.toFixed(2) + "×");
      g.append("text").attr("x", 6).attr("y", y2 + numFS + labFS + 9).attr("class", "ax-note")
        .style("font-size", labFS + "px").attr("fill", C.jack)
        .text("jackknife SE ÷ true spread");
    }
  }
  function morphSE(env, fromDk, toDk) {
    var r0 = seRatios(fromDk), r1 = seRatios(toDk);
    var x0 = Math.abs(+fromDk) / 100, x1 = Math.abs(+toDk) / 100;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { drawSELive(env); return; }
    var dur = 520;
    if (env.timer) env.timer.stop();
    env.timer = d3.timer(function (el) {
      var k = Math.min(1, el / dur), e = d3.easeCubicOut(k);
      drawSELive(env, {
        xAbs: x0 + (x1 - x0) * e,
        boot: r0.boot + (r1.boot - r0.boot) * e,
        jack: r0.jack != null && r1.jack != null ? r0.jack + (r1.jack - r0.jack) * e : null
      });
      if (k >= 1) { env.timer.stop(); drawSELive(env); }
    });
  }

  // power curve
  var powInline = null;
  function buildPowerEnv(svg, W, H, detail) {
    svg.selectAll("*").remove();
    var M = { t: 22, r: 16, b: 42, l: 38 };
    var env = { svg: svg, W: W, H: H, M: M, detail: detail };
    env.pw = W - M.l - M.r; env.ph = H - M.t - M.b;
    env.x = d3.scaleLinear().domain([0, 0.12]).range([0, env.pw]);
    env.y = d3.scaleLinear().domain([0, 1]).range([env.ph, 0]);
    var gid = "band" + (clipSeq++); env.grad = gid;
    var grad = svg.append("defs").append("linearGradient").attr("id", gid).attr("x1", "0").attr("x2", "1");
    grad.append("stop").attr("offset", "0").attr("stop-color", C.band).attr("stop-opacity", 0.04);
    grad.append("stop").attr("offset", "0.5").attr("stop-color", C.band).attr("stop-opacity", 0.24);
    grad.append("stop").attr("offset", "1").attr("stop-color", C.band).attr("stop-opacity", 0.04);
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    env.gStatic = root.append("g"); env.gCurves = root.append("g"); env.gMarker = root.append("g");
    return env;
  }
  function drawPowerStatic(env) {
    var g = env.gStatic; g.selectAll("*").remove();
    var fs = env.detail ? 12 : 11;
    var bl = Math.abs(DATA.plausible_band.left), br = Math.abs(DATA.plausible_band.right);
    g.append("rect").attr("x", env.x(bl)).attr("y", 0).attr("width", env.x(br) - env.x(bl)).attr("height", env.ph).attr("fill", "url(#" + env.grad + ")");
    g.append("text").attr("x", (env.x(bl) + env.x(br)) / 2).attr("y", 13).attr("text-anchor", "middle")
      .attr("class", "ax-note").style("font-size", "9.5px").attr("fill", "#9a7b2e").text("plausible");
    g.append("text").attr("x", (env.x(bl) + env.x(br)) / 2).attr("y", 24).attr("text-anchor", "middle")
      .attr("class", "ax-note").style("font-size", "9.5px").attr("fill", "#9a7b2e").text("effects");
    var ax = d3.axisBottom(env.x).tickValues([0, 0.02, 0.05, 0.08, 0.12]).tickFormat(function (d) { return Math.round(d * 100) + "%"; }).tickSize(4);
    var gx = g.append("g").attr("transform", "translate(0," + env.ph + ")").call(ax);
    gx.selectAll("text").attr("class", "tick").style("font-size", fs + "px"); gx.select(".domain").attr("stroke", C.rule);
    var ay = d3.axisLeft(env.y).tickValues([0.2, 0.5, 0.8, 1]).tickFormat(d3.format(".0%")).tickSize(4);  // no zero label
    var gy = g.append("g").call(ay);
    gy.selectAll("text").attr("class", "tick").style("font-size", fs + "px"); gy.select(".domain").attr("stroke", C.rule);
    g.append("text").attr("class", "ax-label").attr("x", env.pw).attr("y", env.ph + 36).attr("text-anchor", "end").style("font-size", fs + "px").text("true effect");
    g.append("line").attr("x1", 0).attr("x2", env.pw).attr("y1", env.y(0.8)).attr("y2", env.y(0.8)).attr("stroke", C.inkFaint).attr("stroke-width", 1).attr("stroke-dasharray", "3 3");
    g.append("text").attr("x", env.pw - 2).attr("y", env.y(0.8) - 5).attr("text-anchor", "end").attr("class", "ax-note").style("font-size", "10px").text("80% power");
  }
  function pcurve(env, rates, floorPad) {
    var pad = floorPad || 0;   // lifts floor-hugging curves off the axis line for legibility
    return d3.line().x(function (d) { return env.x(Math.abs(+d[0]) / 100); }).y(function (d) { return Math.min(env.y(d[1]), env.ph - pad); }).curve(d3.curveMonotoneX)(DKEYS.map(function (k) { return [k, rates(k)]; }));
  }
  function drawPowerCurves(env) {
    var g = env.gCurves; g.selectAll("*").remove();
    DATA.meta.estimator_order.forEach(function (est) {
      if (!state.active[est]) return;
      var foc = est === state.focus;
      g.append("path").attr("d", pcurve(env, function (k) { return cell(est, k).reject_ri; }))
        .attr("fill", "none").attr("stroke", SWATCH[est]).attr("stroke-width", foc ? 2.8 : 1.6).attr("opacity", foc ? 1 : 0.5);
      if (foc) DKEYS.forEach(function (k) {
        g.append("circle").attr("cx", env.x(Math.abs(+k) / 100)).attr("cy", env.y(cell(est, k).reject_ri)).attr("r", 3).attr("fill", SWATCH[est]);
      });
      // MDE tick for the focused curve only; the estimator list and modal legend carry the rest
      var mde = DATA.estimators[est].mde_ri;
      if (mde && foc) {
        var mx = env.x(Math.abs(mde));
        g.append("line").attr("x1", mx).attr("x2", mx).attr("y1", env.y(0.8) - 7).attr("y2", env.y(0.8) + 7)
          .attr("stroke", SWATCH[est]).attr("stroke-width", 2);
        g.append("text").attr("x", mx - 5).attr("y", env.y(0.8) - 7).attr("text-anchor", "end")
          .attr("class", "ax-note").style("font-size", "9.5px").attr("fill", SWATCH[est])
          .text("MDE " + (Math.abs(mde) * 100).toFixed(1) + "%");
      }
    });
    // the primary estimator's jackknife curve: same fits, working test
    if (state.active.multisynth) {
      var focJ = state.focus === "multisynth";
      g.append("path").attr("d", pcurve(env, function (k) { return cell("multisynth", k).reject_jack; }))
        .attr("fill", "none").attr("stroke", C.jack).attr("stroke-width", focJ ? 2.4 : 1.8)
        .attr("opacity", focJ ? 1 : 0.7);
      if (focJ) DKEYS.forEach(function (k) {
        g.append("circle").attr("cx", env.x(Math.abs(+k) / 100)).attr("cy", env.y(cell("multisynth", k).reject_jack)).attr("r", 2.6).attr("fill", C.jack);
      });
      g.append("text").attr("x", env.x(0.12) - 4).attr("y", env.y(cell("multisynth", "-12").reject_jack) + 16)
        .attr("text-anchor", "end").attr("class", "ax-note").style("font-size", "10px").attr("fill", C.jack).text("ASCM, jackknife");
      var mj = DATA.meta.mde_jack_delta;
      if (mj && focJ) {
        var mjx = env.x(Math.abs(mj));
        g.append("line").attr("x1", mjx).attr("x2", mjx).attr("y1", env.y(0.8) - 7).attr("y2", env.y(0.8) + 7)
          .attr("stroke", C.jack).attr("stroke-width", 2);
        g.append("text").attr("x", mjx + 5).attr("y", env.y(0.8) + 16).attr("text-anchor", "start")
          .attr("class", "ax-note").style("font-size", "9.5px").attr("fill", C.jack)
          .text("MDE " + (Math.abs(mj) * 100).toFixed(1) + "%");
      }
    }
    // the default rule sits flat on the floor at every δ
    // (drawn 2px above the axis so it reads as its own line, not the axis)
    g.append("path").attr("d", pcurve(env, function (k) { return cell("multisynth", k).reject_se; }, 2))
      .attr("fill", "none").attr("stroke", C.def).attr("stroke-width", 2.6);
    g.append("text").attr("x", env.x(0.12)).attr("y", env.y(0.05)).attr("text-anchor", "end").attr("class", "ax-note").style("font-size", "10px").attr("fill", C.def).text("ASCM, default rule (wild bootstrap)");
  }
  function drawPowerMarker(env) {
    var g = env.gMarker; g.selectAll("*").remove();
    var mx = env.x(Math.abs(+state.dk) / 100);
    g.append("line").attr("x1", mx).attr("x2", mx).attr("y1", 0).attr("y2", env.ph).attr("stroke", C.ink).attr("stroke-width", 1).attr("opacity", 0.5);
    g.append("circle").attr("cx", mx).attr("cy", -2).attr("r", 3).attr("fill", C.ink);
  }

  // human-units translation of the detection threshold (values from power.json meta)
  function fillMdeCallout() {
    var m = DATA.meta, el = document.getElementById("mde-callout");
    if (!el || m.mde_delta_primary == null) return;
    var bl = Math.abs(DATA.plausible_band.left * 100), br = Math.abs(DATA.plausible_band.right * 100);
    el.innerHTML = "The primary estimator's smallest detectable effect is <strong>" +
      Math.abs(m.mde_delta_primary * 100).toFixed(1) + "%</strong> of per-capita ethanol, roughly <strong>" +
      m.mde_drinks_per_month.toFixed(1) + " standard drinks per adult per month</strong> at the " +
      m.baseline_gal_ethanol_21.toFixed(2) + "-gallon baseline. The jackknife's is <strong>" +
      Math.abs(m.mde_jack_delta * 100).toFixed(1) + "%</strong>; the gap partly reflects its conservatism. " +
      "Plausible substitution, " + bl + " to " + br + " percent, sits well below both.";
  }

  // placebo panel: the observed noise floor (Section IV in-time placebos)
  var plaInline = null;
  function buildPlaceboEnv(svg, W, H, detail) {
    svg.selectAll("*").remove();
    var M = { t: 8, r: 18, b: 48, l: 22 };
    var env = { svg: svg, W: W, H: H, M: M, detail: detail };
    env.pw = W - M.l - M.r; env.ph = H - M.t - M.b;
    env.x = d3.scaleLinear().range([0, env.pw]);
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    env.gMarkerLine = root.append("g");   // beneath the marks so the line never strikes through text
    env.gStatic = root.append("g");
    env.gMarkerLab = root.append("g");
    return env;
  }
  // Noise-floor edge for the focused estimator: its single-state band (mean - 2sd),
  // or its pooled fake-2009 estimate (att - 2se) when no single-state row exists.
  function placeboEdge() {
    var P = DATA.placebo, m = P.focus_map[state.focus];
    if (m) { var s = P.single[m]; return s.mean - 2 * s.sd; }
    var p = P.pooled2009[state.focus];
    return p.att - 2 * p.se;
  }
  function placeboDiamond(g, x, y, r, fill) {
    g.append("path").attr("d", "M" + x + "," + (y - r) + "L" + (x + r) + "," + y + "L" + x + "," + (y + r) + "L" + (x - r) + "," + y + "Z")
      .attr("fill", fill).attr("stroke", C.panel).attr("stroke-width", 1);
  }
  function drawPlaceboStatic(env) {
    var g = env.gStatic; g.selectAll("*").remove();
    var P = DATA.placebo; if (!P) return;
    if (!env.detail) { drawPlaceboFocus(env, g, P); return; }   // inline: focused estimator only
    var fs = env.detail ? 12 : 11, sub = env.detail ? 11 : 10;
    // domain from the committed values themselves plus the delta grid
    var lo = -0.13, hi = 0.02;
    P.single_order.forEach(function (m) {
      P.single[m].values.forEach(function (v) { lo = Math.min(lo, v.att); hi = Math.max(hi, v.att); });
    });
    Object.keys(P.real.states).forEach(function (m) {
      P.real.states[m].forEach(function (r) { lo = Math.min(lo, r.att); hi = Math.max(hi, r.att); });
    });
    DATA.meta.estimator_order.forEach(function (est) {
      if (P.real.pooled[est] != null) { lo = Math.min(lo, P.real.pooled[est]); hi = Math.max(hi, P.real.pooled[est]); }
      if (P.pooled2009[est]) { lo = Math.min(lo, P.pooled2009[est].att); hi = Math.max(hi, P.pooled2009[est].att); }
    });
    env.x.domain([lo - 0.01, hi + 0.01]);

    var rows = P.single_order, rowH = env.ph / (rows.length + 1);
    var focusMethod = P.focus_map[state.focus];
    // zero line spans the panel
    g.append("line").attr("x1", env.x(0)).attr("x2", env.x(0)).attr("y1", 0).attr("y2", env.ph)
      .attr("stroke", C.rule).attr("stroke-width", 1);

    rows.forEach(function (m, i) {
      var s = P.single[m], y0 = i * rowH, yc = y0 + rowH * 0.62, isFocus = m === focusMethod;
      if (isFocus) {
        g.append("rect").attr("x", -6).attr("y", y0 + 2).attr("width", env.pw + 12).attr("height", rowH - 4)
          .attr("rx", 3).attr("fill", C.cal).attr("opacity", 0.045);
        g.append("rect").attr("x", -6).attr("y", y0 + 2).attr("width", 2.5).attr("height", rowH - 4)
          .attr("fill", C.cal).attr("opacity", 0.55);
      }
      g.append("text").attr("x", 0).attr("y", y0 + 13).attr("class", "ax-label").style("font-size", fs + "px")
        .attr("fill", isFocus ? C.ink : C.inkFaint).style("font-weight", isFocus ? "600" : "400")
        .text(s.label + "  ·  mean " + eff1(s.mean) + ", sd " + (Math.abs(s.sd) * 100).toFixed(1) + "pp");
      g.append("rect").attr("x", env.x(s.mean - 2 * s.sd)).attr("y", yc - rowH * 0.16)
        .attr("width", env.x(s.mean + 2 * s.sd) - env.x(s.mean - 2 * s.sd)).attr("height", rowH * 0.32).attr("rx", 2)
        .attr("fill", C.def).attr("opacity", isFocus ? 0.18 : 0.08);
      g.append("line").attr("x1", env.x(s.mean)).attr("x2", env.x(s.mean)).attr("y1", yc - rowH * 0.2).attr("y2", yc + rowH * 0.2)
        .attr("stroke", C.ink).attr("stroke-width", 1.4).attr("opacity", isFocus ? 0.9 : 0.5);
      s.values.forEach(function (v, j) {
        var jit = (((j * 7919) % 17) - 8) / 8 * rowH * 0.11;   // deterministic jitter
        g.append("circle").attr("cx", env.x(v.att)).attr("cy", yc + jit).attr("r", env.detail ? 2.6 : 2.1)
          .attr("fill", C.inkFaint).attr("opacity", isFocus ? 0.8 : 0.45);
      });
      var reals = P.real.states[m]
        ? P.real.states[m].map(function (r) { return r.att; })
        : (P.real.pooled[m] != null ? [P.real.pooled[m]] : []);
      reals.forEach(function (a) { placeboDiamond(g, env.x(a), yc, env.detail ? 6 : 5, C.cal); });
    });

    // pooled fake-2009 strip
    var yP = rows.length * rowH, ycP = yP + rowH * 0.62;
    g.append("text").attr("x", 0).attr("y", yP + 13).attr("class", "ax-label").style("font-size", fs + "px")
      .attr("fill", C.inkSoft).text("Pooled fake-2009, all five estimators");
    DATA.meta.estimator_order.forEach(function (est) {
      var p = P.pooled2009[est]; if (!p) return;
      var isFocus = est === state.focus;
      var r = isFocus ? (env.detail ? 6 : 5) : (env.detail ? 4 : 3.5);
      g.append("circle").attr("cx", env.x(p.att)).attr("cy", ycP).attr("r", r)
        .attr("fill", SWATCH[est]).attr("stroke", C.panel).attr("stroke-width", 1)
        .attr("opacity", isFocus ? 1 : 0.75);
      if (isFocus) {
        g.append("circle").attr("cx", env.x(p.att)).attr("cy", ycP).attr("r", r + 3.5)
          .attr("fill", "none").attr("stroke", SWATCH[est]).attr("stroke-width", 1.5);
        g.append("text").attr("x", env.x(p.att)).attr("y", ycP - r - 8).attr("text-anchor", "middle")
          .attr("class", "ax-note").style("font-size", (sub - 1) + "px").attr("fill", SWATCH[est])
          .style("font-weight", "600").text(DATA.estimators[est].short);
      }
    });

    // axis
    var ax = d3.axisBottom(env.x).tickValues([-0.12, -0.08, -0.04, 0, 0.04, 0.08])
      .tickFormat(function (d) { return (d < 0 ? "−" : "") + Math.abs(Math.round(d * 100)); }).tickSize(4);
    var gx = g.append("g").attr("transform", "translate(0," + env.ph + ")").call(ax);
    gx.selectAll("text").attr("class", "tick").style("font-size", fs + "px");
    gx.select(".domain").attr("stroke", C.rule);
    g.append("text").attr("class", "ax-label").attr("x", env.pw).attr("y", env.ph + 36)
      .attr("text-anchor", "end").style("font-size", fs + "px").text("fake effect (%)");
    if (!focusMethod) {
      g.append("text").attr("x", 0).attr("y", env.ph + 36).attr("class", "ax-note").style("font-size", sub + "px")
        .attr("fill", C.inkFaint)
        .text("single-state backdating was not run for " + DATA.estimators[state.focus].short + "; its pooled marker is highlighted");
    } else if (state.focus === "multisynth") {
      g.append("text").attr("x", 0).attr("y", env.ph + 36).attr("class", "ax-note").style("font-size", sub + "px")
        .attr("fill", C.inkFaint)
        .text("classic SCM is the single-unit analogue of the partially-pooled ASCM");
    }
  }
  // Inline view: one noise distribution for the focused estimator, matching the
  // hero's one-thing-per-panel grammar. The modal keeps the full comparison.
  function drawPlaceboFocus(env, g, P) {
    var fs = 11, sub = 10;
    var m = P.focus_map[state.focus];
    // stable domain across focus switches: all swarms, pooled intervals, real
    // pooled estimates, and the delta grid (per-state reals live in the modal)
    var lo = -0.13, hi = 0.02;
    P.single_order.forEach(function (mm) {
      P.single[mm].values.forEach(function (v) { lo = Math.min(lo, v.att); hi = Math.max(hi, v.att); });
    });
    DATA.meta.estimator_order.forEach(function (est) {
      if (P.real.pooled[est] != null) { lo = Math.min(lo, P.real.pooled[est]); hi = Math.max(hi, P.real.pooled[est]); }
      var pp = P.pooled2009[est];
      if (pp) { lo = Math.min(lo, pp.att - 2 * pp.se); hi = Math.max(hi, pp.att + 2 * pp.se); }
    });
    env.x.domain([lo - 0.01, hi + 0.012]);

    var yc = env.ph * 0.56, bandH = env.ph * 0.30;
    g.append("line").attr("x1", env.x(0)).attr("x2", env.x(0)).attr("y1", 22).attr("y2", env.ph)
      .attr("stroke", C.rule).attr("stroke-width", 1);

    function bandAndTick(center, half) {
      g.append("rect").attr("x", env.x(center - half)).attr("y", yc - bandH / 2)
        .attr("width", env.x(center + half) - env.x(center - half)).attr("height", bandH).attr("rx", 3)
        .attr("fill", C.def).attr("opacity", 0.15);
      g.append("line").attr("x1", env.x(center)).attr("x2", env.x(center))
        .attr("y1", yc - bandH * 0.72).attr("y2", yc + bandH * 0.72)
        .attr("stroke", C.ink).attr("stroke-width", 1.4).attr("opacity", 0.8);
      g.append("text").attr("x", env.x(center)).attr("y", yc - bandH * 0.72 - 6).attr("text-anchor", "middle")
        .attr("class", "ax-note").style("font-size", sub + "px").attr("fill", C.inkFaint).text("mean ± 2 SD");
    }

    if (m) {
      var s = P.single[m];
      g.append("text").attr("x", 0).attr("y", 12).attr("class", "ax-label").style("font-size", fs + "px")
        .attr("fill", C.ink).style("font-weight", "600")
        .text(s.label + "  ·  " + s.n + " backdated runs where nothing happened  ·  mean " +
          eff1(s.mean) + ", sd " + (Math.abs(s.sd) * 100).toFixed(1) + "pp");
      bandAndTick(s.mean, 2 * s.sd);
      s.values.forEach(function (v, j) {
        var jit = (((j * 7919) % 17) - 8) / 8 * bandH * 0.42;   // deterministic jitter
        g.append("circle").attr("cx", env.x(v.att)).attr("cy", yc + jit).attr("r", 2.8)
          .attr("fill", C.inkFaint).attr("opacity", 0.7);
      });
    } else {
      var p = P.pooled2009[state.focus];
      g.append("text").attr("x", 0).attr("y", 12).attr("class", "ax-label").style("font-size", fs + "px")
        .attr("fill", C.ink).style("font-weight", "600")
        .text(DATA.estimators[state.focus].label + "  ·  pooled fake-2009 placebo  ·  estimate " +
          eff1(p.att) + ", se " + (Math.abs(p.se) * 100).toFixed(1) + "pp");
      bandAndTick(p.att, 2 * p.se);
    }

    // the real (non-placebo) estimate for the focused estimator
    var ra = P.real.pooled[state.focus];
    if (ra != null) {
      placeboDiamond(g, env.x(ra), yc, 6, C.cal);
      var rx = Math.min(Math.max(env.x(ra), 42), env.pw - 42);
      g.append("text").attr("x", rx).attr("y", yc + bandH / 2 + 18).attr("text-anchor", "middle")
        .attr("class", "ax-note").style("font-size", sub + "px").attr("fill", C.cal).text("real estimate");
    }

    // axis + footnotes
    var ax = d3.axisBottom(env.x).tickValues([-0.12, -0.08, -0.04, 0, 0.04].filter(function (t) {
      var d = env.x.domain(); return t >= d[0] && t <= d[1];
    })).tickFormat(function (d) { return (d < 0 ? "−" : "") + Math.abs(Math.round(d * 100)); }).tickSize(4);
    var gx = g.append("g").attr("transform", "translate(0," + env.ph + ")").call(ax);
    gx.selectAll("text").attr("class", "tick").style("font-size", fs + "px");
    gx.select(".domain").attr("stroke", C.rule);
    g.append("text").attr("class", "ax-label").attr("x", env.pw).attr("y", env.ph + 36)
      .attr("text-anchor", "end").style("font-size", fs + "px").text("fake effect (%)");
    if (!m) {
      g.append("text").attr("x", 0).attr("y", env.ph + 36).attr("class", "ax-note").style("font-size", sub + "px")
        .attr("fill", C.inkFaint)
        .text("single-state backdating was not run for " + DATA.estimators[state.focus].short + "; its pooled placebo is shown");
    } else if (state.focus === "multisynth") {
      var pj = DATA.placebo_jack;
      g.append("text").attr("x", 0).attr("y", env.ph + 34).attr("class", "ax-note").style("font-size", sub + "px")
        .attr("fill", C.inkFaint)
        .text("classic SCM is the single-unit analogue of the ASCM");
      g.append("text").attr("x", 0).attr("y", env.ph + 46).attr("class", "ax-note").style("font-size", sub + "px")
        .attr("fill", C.inkFaint)
        .text("pooled fakes under the jackknife: t = " + pj["2009"].t_jack.toFixed(2).replace("-", "−") +
          " (2009), " + pj["2007"].t_jack.toFixed(2).replace("-", "−") + " (2007), no rejections");
    }
  }

  function drawPlaceboMarker(env) {
    var gl = env.gMarkerLine, gt = env.gMarkerLab;
    gl.selectAll("*").remove(); gt.selectAll("*").remove();
    if (!DATA.placebo) return;
    var v = dkDec(state.dk), mx = env.x(v);
    var inside = v >= placeboEdge();
    gl.append("line").attr("x1", mx).attr("x2", mx).attr("y1", 2).attr("y2", env.ph)
      .attr("stroke", inside ? C.inkFaint : C.cal).attr("stroke-width", inside ? 1.2 : 1.8)
      .attr("stroke-dasharray", "5 4").attr("opacity", inside ? 0.5 : 0.9);
    var left = mx < env.pw * 0.5;
    gt.append("text").attr("x", mx + (left ? 6 : -6)).attr("y", env.ph - 5).attr("text-anchor", left ? "start" : "end")
      .attr("class", "ax-note").style("font-size", (env.detail ? 11 : 10) + "px")
      .attr("fill", inside ? C.inkSoft : C.cal)
      .text("a true effect of " + effI(v) + " · " + (inside ? "inside the noise floor" : "clears the noise floor"));
  }

  function drawReading() {
    var c = focusCell(), est = DATA.estimators[state.focus], el = document.getElementById("reading");
    var lead = state.dk === "0"
      ? "The injected effect is zero. " + est.label + " returns a mean estimate of <strong>" + eff1(c.mean_att) + "</strong>. "
      : "The injected effect is <strong>" + effI(dkDec(state.dk)) + "</strong>. " + est.label + " recovers a mean estimate of <strong>" + eff1(c.mean_att) + "</strong>. ";
    if (est.primary) {
      el.innerHTML = lead +
        "The default test (a wild bootstrap) rejects <strong>" + pct1(c.reject_se) + "</strong> of draws, the jackknife <strong>" +
        pct1(c.reject_jack) + "</strong>, the calibrated test <strong>" + pct1(c.reject_ri) + "</strong>. The default standard error is <strong>" +
        c.se_boot_ratio.toFixed(1) + "×</strong> the true sampling dispersion; the jackknife's is a flat <strong>" +
        c.se_jack_ratio.toFixed(2) + "×</strong>.";
    } else {
      // neutral terms for the alternatives; the over-rejects clause mirrors the SE panel's verdict
      var tail = cell(state.focus, "0").reject_se > OVERSIZE ? ": too narrow, so the test over-rejects." : ".";
      el.innerHTML = lead +
        "The standard-error test rejects <strong>" + pct1(c.reject_se) + "</strong> of draws and the calibrated test rejects <strong>" +
        pct1(c.reject_ri) + "</strong>. The reported standard error is <strong>" + c.se_boot_ratio.toFixed(1) +
        "×</strong> the true sampling dispersion" + tail;
    }
  }

  // The corrected narrative, drawn once; every number formatted from power.json.
  function drawReadingStatic() {
    var el = document.getElementById("reading-static");
    if (!el) return;
    var m = DATA.meta, rd = DATA.real_data, pj = DATA.placebo_jack;
    var ms0 = cell("multisynth", "0"), ms12 = cell("multisynth", "-12");
    var p = function (h) { var q = mk("p"); q.innerHTML = h; el.appendChild(q); };
    el.innerHTML = "";
    p("The default standard error is a wild bootstrap, and it grows from " +
      ms0.se_boot_ratio.toFixed(1) + "× the true spread at δ = 0 to " + ms12.se_boot_ratio.toFixed(1) +
      "× at −12%, so the default test never rejects. The only hint in the software's output is a generic conservatism warning.");
    p("The jackknife on the same fits stays flat at " + ms0.se_jack_ratio.toFixed(2) + "×, holds size (" +
      pct1(ms0.reject_jack) + " at zero), reaches 80% power at " + Math.abs(m.mde_jack_delta * 100).toFixed(1) +
      "%, and stays quiet on placebo data (t = " + pj["2009"].t_jack.toFixed(2).replace("-", "−") + ", " +
      pj["2007"].t_jack.toFixed(2).replace("-", "−") + ").");
    p("The calibrated test is the benchmark: exact 5% size, MDE " + Math.abs(m.mde_delta_primary * 100).toFixed(1) +
      "%. No rule can see the low single digits, which is the paper's headline. Real data: <strong>" + eff1(rd.pct) +
      "</strong>, a null under every rule (t = " + rd.t_boot.toFixed(2) + " default, " + rd.t_jack.toFixed(2) + " jackknife).");
  }

  // modal
  var modal, modalSvg;
  function initModal() {
    modal = document.getElementById("modal");
    modalSvg = d3.select("#modal-svg");
    document.getElementById("modal-close").addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
    [["hero", "Sampling distribution"], ["se", "Standard error inflation"], ["power", "Power curves"], ["placebo", "The observed noise floor"]].forEach(function (p) {
      var fig = document.getElementById(p[0]).parentNode;
      fig.classList.add("expandable"); fig.setAttribute("role", "button"); fig.tabIndex = 0;
      fig.setAttribute("aria-label", "Expand " + p[1]);
      fig.addEventListener("click", function () { openModal(p[0], p[1]); });
      fig.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(p[0], p[1]); } });
    });
  }
  function openModal(kind, title) {
    document.getElementById("modal-title").textContent = title + " · " + DATA.estimators[state.focus].label;
    modalSvg.selectAll("*").remove();
    var cap = document.getElementById("modal-cap"); cap.innerHTML = "";
    if (kind === "hero") {
      var hw = NARROW_MQ.matches ? 520 : 900, hh = NARROW_MQ.matches ? 620 : 540;
      modalSvg.attr("viewBox", "0 0 " + hw + " " + hh);
      var e = buildHeroEnv(modalSvg, hw, hh, true);
      drawHeroFrame(e); drawHeroGhost(e); drawHeroLive(e, focusCell().att, focusCell().se_boot_mean, focusCell().mean_att);
      drawChaseCallout(e);
      cap.appendChild(legendNode());
      cap.appendChild(note(DATA.estimators[state.focus].primary
        ? ("At " + effI(dkDec(state.dk)) + " the estimates from " + DATA.estimators[state.focus].label +
           " center near the injected effect. The jackknife and calibrated thresholds stand still and the estimates cross them; the default threshold, ±1.96 times the mean wild-bootstrap standard error, moves outward with the effect, so the estimates never reach it.")
        : ("At " + effI(dkDec(state.dk)) + " the estimates from " + DATA.estimators[state.focus].label +
           " center near the injected effect. The shaded region is ±1.96 times the estimator's mean reported standard error; the dashed lines are the calibrated threshold.")));
    } else if (kind === "se") {
      modalSvg.attr("viewBox", "0 0 900 300");
      drawSE(buildSEEnv(modalSvg, 900, 300, true));
      cap.appendChild(note("Each ratio divides a mean standard error by the standard deviation of the point estimates across draws. " + seVerdict()));
    } else if (kind === "placebo") {
      modalSvg.attr("viewBox", "0 0 900 520");
      var q = buildPlaceboEnv(modalSvg, 900, 520, true);
      drawPlaceboStatic(q); drawPlaceboMarker(q);
      var pjm = DATA.placebo_jack;
      cap.appendChild(note("Gray points are fake treatment effects estimated at every feasible backdated adoption year for the clean-fit states, using only pre-treatment data. Bands mark the mean and ±2 SD of each method's fake distribution; diamonds are the real estimates. The dashed line marks a true effect of the current δ: effects in the low single digits sit inside the noise the design produces when nothing happened. Under the jackknife the pooled fake effects have t = " +
        pjm["2009"].t_jack.toFixed(2).replace("-", "−") + " (2009) and " + pjm["2007"].t_jack.toFixed(2).replace("-", "−") + " (2007): the working test also finds nothing where nothing happened."));
    } else {
      modalSvg.attr("viewBox", "0 0 760 520");
      var p = buildPowerEnv(modalSvg, 760, 520, true);
      drawPowerStatic(p); drawPowerCurves(p); drawPowerMarker(p);
      cap.appendChild(powerLegendNode());
    }
    modal.hidden = false; document.getElementById("modal-close").focus();
  }
  function closeModal() { modal.hidden = true; }
  function legendNode() {
    var primary = DATA.estimators[state.focus].primary;
    var items = [["lg-live", "estimates at current δ"], ["lg-null", "null distribution (δ = 0)"], ["lg-cal", "calibrated threshold"]];
    if (primary) items.push(["lg-jack", "jackknife threshold"]);
    items.push(["lg-def", primary ? "default region (wild bootstrap)" : "reported-SE region"]);
    var d = mk("div"); d.className = "cap-legend";
    items.forEach(function (it) {
      var s = mk("span"); s.className = "lg-item"; var sw = mk("span"); sw.className = "lg-sw " + it[0]; var tx = mk("span"); tx.textContent = it[1];
      s.appendChild(sw); s.appendChild(tx); d.appendChild(s);
    });
    return d;
  }
  function powerLegendNode() {
    var d = mk("div"); d.className = "cap-legend";
    DATA.meta.estimator_order.forEach(function (est) {
      var e = DATA.estimators[est], s = mk("span"); s.className = "lg-item";
      var sw = mk("span"); sw.className = "lg-sw"; sw.style.background = SWATCH[est]; sw.style.opacity = state.active[est] ? 1 : 0.3;
      var tx = mk("span"); tx.textContent = e.label + (e.mde_ri ? " (MDE " + (Math.abs(e.mde_ri) * 100).toFixed(1) + "%" +
        (e.mde_ri_drinks ? " ≈ " + e.mde_ri_drinks.toFixed(1) + " drinks/mo" : "") + ")" : "");
      s.appendChild(sw); s.appendChild(tx); d.appendChild(s);
    });
    var sj = mk("span"); sj.className = "lg-item";
    var swj = mk("span"); swj.className = "lg-sw"; swj.style.background = C.jack;
    var txj = mk("span"); txj.textContent = "ASCM, jackknife rule (MDE " +
      (Math.abs(DATA.meta.mde_jack_delta) * 100).toFixed(1) + "%; the gap to the calibrated rule partly reflects its conservatism)";
    sj.appendChild(swj); sj.appendChild(txj); d.appendChild(sj);
    var s2 = mk("span"); s2.className = "lg-item";
    var sw2 = mk("span"); sw2.className = "lg-sw"; sw2.style.background = C.def;
    var tx2 = mk("span"); tx2.textContent = "ASCM, default rule (wild bootstrap; flat at zero)";
    s2.appendChild(sw2); s2.appendChild(tx2); d.appendChild(s2);
    return d;
  }
  function note(t) { var p = mk("p"); p.className = "cap-note"; p.textContent = t; return p; }

  function mk(t) { return document.createElement(t); }
  function reflow(el) { el.classList.remove("pulse"); void el.offsetWidth; }
  function injectSliderCSS() {
    var s = document.createElement("style");
    s.textContent =
      ".sl-track{position:absolute;left:" + PAD + "px;right:" + PAD + "px;top:50%;height:3px;transform:translateY(-50%);background:" + C.rule + ";border-radius:2px}" +
      ".sl-fill{position:absolute;left:0;top:50%;height:3px;transform:translateY(-50%);background:" + C.cal + ";border-radius:2px;opacity:.55}" +
      ".sl-tick{position:absolute;top:50%;width:2px;height:10px;transform:translate(-50%,-50%);background:" + C.inkFaint + ";opacity:.5;border-radius:1px}" +
      ".sl-lab{position:absolute;top:calc(50% + 12px);transform:translateX(-50%);font-family:" + v("--mono") + ";font-size:11px;color:" + C.inkFaint + ";font-variant-numeric:tabular-nums}" +
      ".thumb{position:absolute;top:50%;width:20px;height:20px;transform:translate(-50%,-50%);background:" + C.panel + ";border:2.5px solid " + C.cal + ";border-radius:50%;box-shadow:0 2px 6px -1px rgba(28,27,25,.35);pointer-events:none}" +
      "@media (max-width:480px){.sl-lab{font-size:9px}}";   // breakpoint: narrow phones
    document.head.appendChild(s);
  }
  window.addEventListener("resize", function () {
    if (!slEl) return;
    placeThumb(DKEYS.indexOf(state.dk), false);
  });
  // rebuild the hero ladder when the narrow breakpoint flips
  NARROW_MQ.addEventListener("change", function () {
    if (!DATA || !heroInline) return;
    heroInline = buildHeroEnv(d3.select("#hero"), 680, 424, false);
    drawHeroFrame(heroInline); drawHeroGhost(heroInline);
    drawHeroLive(heroInline, focusCell().att, focusCell().se_boot_mean, focusCell().mean_att);
    drawChaseCallout(heroInline);
  });

})();
