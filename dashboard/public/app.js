/* Replays data/power.json (built from Results/csv/power_*.csv). The slider stops
   at the five simulated effect sizes; nothing is estimated in the browser. */

(function () {
  "use strict";

  var css = getComputedStyle(document.documentElement);
  function v(name) { return css.getPropertyValue(name).trim(); }
  var C = {
    ink: v("--ink"), inkSoft: v("--ink-soft"), inkFaint: v("--ink-faint"),
    rule: v("--rule"), cloud: v("--cloud"), cal: v("--calibrated"),
    jack: v("--jackknife"), band: v("--band"), panel: v("--panel")
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
  d3.json("data/power.json?v=2").then(function (data) {
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
    heroInline = buildHeroEnv(d3.select("#hero"), 680, 408, false);
    seInline = buildSEEnv(d3.select("#se"), 680, 230, false);
    powInline = buildPowerEnv(d3.select("#power"), 520, 432, false);
    plaInline = buildPlaceboEnv(d3.select("#placebo"), 680, 400, false);
    initModal();
    fillMdeCallout();
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
      var tail = mk("span");
      if (e.primary) { tail.className = "est-tag"; tail.textContent = "primary"; }
      else { tail.className = "est-mde"; tail.textContent = e.mde_ri ? "MDE " + (Math.abs(e.mde_ri) * 100).toFixed(1) + "%" : ""; }
      li.appendChild(box); li.appendChild(sw); li.appendChild(lab); li.appendChild(tail);
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
    syncEstList(); refreshHeroLabels();
    setCounters(focusCell(), true);
    heroInline = buildHeroEnv(d3.select("#hero"), 680, 408, false);
    drawHeroFrame(heroInline); drawHeroGhost(heroInline);
    drawHeroLive(heroInline, focusCell().att, focusCell().se_claimed, focusCell().mean_att);
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
    document.getElementById("se-verdict").textContent = seVerdict();
    updateChartAria();
  }
  // One sentence on what the SE ratio means for the focused estimator's test.
  // Branches on the same delta=0 size flag as the jackknife-counter caption, then
  // on the panel's existing 1.05 qualifier bound, so the three never disagree.
  function seVerdict() {
    var c0 = cell(state.focus, "0");
    if (c0.reject_se > OVERSIZE) {
      return "The claimed error understates the true spread, so the test rejects too often: its nominal 5 percent size is really " + pct1(c0.reject_se) + ".";
    }
    if (c0.se_ratio > 1.05) {
      return "This multiple grows with the effect, which is why the jackknife test rarely fires.";
    }
    return "The claimed error runs narrower than the true spread, but the test still holds close to its nominal 5 percent size.";
  }
  // text alternatives: keep each chart's aria-label in step with the state
  function updateChartAria() {
    var c = focusCell(), est = DATA.estimators[state.focus].label, d = effI(dkDec(state.dk));
    d3.select("#hero").attr("aria-label", "Sampling distribution for " + est + " at injected effect " + d +
      ". The jackknife test rejects " + pct1(c.reject_se) + " of draws, the calibrated test " + pct1(c.reject_ri) + ".");
    d3.select("#se").attr("aria-label", "Standard error inflation for " + est + " at " + d +
      ": the claimed standard error is " + c.se_ratio.toFixed(1) + " times the true sampling spread.");
    d3.select("#power").attr("aria-label", "Power curves. At a true effect of " + d + ", " + est +
      " rejects " + pct1(c.reject_ri) + " of draws under the calibrated test.");
    if (DATA.placebo) {
      var m = DATA.placebo.focus_map[state.focus] || "classic_scm", s = DATA.placebo.single[m];
      d3.select("#placebo").attr("aria-label", "Backdated placebo distributions. " + s.label +
        " fake effects center at " + eff1(s.mean) + " with a spread of " + eff1(s.sd) +
        " per estimate; a true effect of " + d +
        (dkDec(state.dk) >= placeboEdge() ? " sits inside this noise floor." : " clears this noise floor."));
    }
  }

  function update(first, fromIdx) {
    refreshHeroLabels();
    setCounters(focusCell(), !first);
    drawReading(); drawPowerMarker(powInline); drawPlaceboMarker(plaInline);
    if (first) {
      drawSE(seInline);
      drawHeroFrame(heroInline); drawHeroGhost(heroInline);
      drawHeroLive(heroInline, focusCell().att, focusCell().se_claimed, focusCell().mean_att);
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
    var j = document.getElementById("c-jack"), k = document.getElementById("c-cal");
    j.textContent = pct1(c.reject_se); k.textContent = pct1(c.reject_ri);
    document.getElementById("c-jack-cap").textContent =
      cell(state.focus, "0").reject_se > OVERSIZE ? "over-rejects: SE too narrow" : "as used in applied work";
    if (pulse) { reflow(j); reflow(k); j.classList.add("pulse"); k.classList.add("pulse"); }
  }

  function buildLegend() {
    var items = [
      { cls: "lg-live", t: "estimates at current δ" },
      { cls: "lg-null", t: "null distribution (δ = 0)" },
      { cls: "lg-cal", t: "calibrated region" },
      { cls: "lg-jack", t: "jackknife region" }
    ];
    var el = document.getElementById("hero-legend");
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
    var M = { t: 16, r: 18, b: detail ? (narrow ? 128 : 96) : (narrow ? 124 : 82), l: 18 };
    var env = { svg: svg, W: W, H: H, M: M, detail: detail, narrow: narrow };
    env.pw = W - M.l - M.r; env.ph = H - M.t - M.b;
    env.x = d3.scaleLinear().domain([-0.27, 0.10]).range([0, env.pw]);
    var fc = focusCell(), n = DATA.estimators[state.focus].n_draws;
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
    // diagonal hatch so the jackknife region reads without color
    var pid = "hatch" + (clipSeq++);
    env.hatch = pid;
    defs.append("pattern").attr("id", pid).attr("width", 6).attr("height", 6).attr("patternUnits", "userSpaceOnUse")
      .append("path").attr("d", "M0,6 l6,-6").attr("stroke", C.jack).attr("stroke-width", 1).attr("opacity", 0.35);
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    env.gFrame = root.append("g");
    env.gGhost = root.append("g");
    env.gDyn = root.append("g");
    env.gAxis = root.append("g");
    return env;
  }
  function drawHeroFrame(env) {
    var g = env.gFrame; g.selectAll("*").remove();
    var thr = DATA.estimators[state.focus].ri_thresh;
    var xL = 0, xR = env.pw, fs = env.narrow ? 16 : (env.detail ? 12 : 11);
    [[xL, env.x(-thr)], [env.x(thr), xR]].forEach(function (s) {
      g.append("rect").attr("x", s[0]).attr("y", -6).attr("width", Math.max(0, s[1] - s[0])).attr("height", env.ph + 6)
        .attr("fill", C.cal).attr("opacity", 0.06);
    });
    [-thr, thr].forEach(function (t) {
      g.append("line").attr("x1", env.x(t)).attr("x2", env.x(t)).attr("y1", -6).attr("y2", env.ph)
        .attr("stroke", C.cal).attr("stroke-width", 1).attr("stroke-dasharray", "2 3").attr("opacity", 0.5);
    });
    g.append("line").attr("x1", 0).attr("x2", env.pw).attr("y1", env.ph).attr("y2", env.ph).attr("stroke", C.ink).attr("stroke-width", 1);
    var ticks = [-0.25, -0.20, -0.15, -0.10, -0.05, 0, 0.05, 0.10];
    var ax = d3.axisBottom(env.x).tickValues(ticks).tickSize(4)
      .tickFormat(function (d) { return (d < 0 ? "−" : "") + Math.abs(Math.round(d * 100)); });
    var gax = g.append("g").attr("transform", "translate(0," + env.ph + ")").call(ax);
    gax.selectAll("text").attr("class", "tick").style("font-size", fs + "px");
    gax.select(".domain").remove();
    // Row D: axis title on its own dedicated row, centered, below all callouts
    g.append("text").attr("class", "ax-label").attr("x", env.pw / 2)
      .attr("y", env.ph + (env.narrow ? 112 : (env.detail ? 76 : 70)))
      .attr("text-anchor", "middle").style("font-size", fs + "px").text("estimated effect (%)");
    // Row C: calibrated-threshold label centered on its own line
    thresholdLabel(g, thr, env.ph + (env.narrow ? 88 : (env.detail ? 60 : 56)), "calibrated threshold", C.cal, fs, env);
  }
  // Centers a threshold label on the right-side line of a ± pair (left line if the
  // right one is off-plot), clamps it inside the plot, and drops a short leader tick.
  function thresholdLabel(g, t, y, txt, color, fs, env) {
    var xRt = env.x(t), xLt = env.x(-t);
    var lineX = (xRt >= 0 && xRt <= env.pw) ? xRt : xLt;
    if (lineX < 0 || lineX > env.pw) return;   // both lines outside the plot
    g.append("line").attr("x1", lineX).attr("x2", lineX).attr("y1", env.ph).attr("y2", env.ph + 7)
      .attr("stroke", color).attr("stroke-width", 1.2);
    var el = g.append("text").attr("x", lineX).attr("y", y).attr("text-anchor", "middle")
      .attr("class", "ax-note").style("font-size", fs + "px").attr("fill", color).text(txt);
    var w = el.node().getComputedTextLength();
    el.attr("x", Math.min(Math.max(lineX, w / 2 + 2), env.pw - w / 2 - 2));
  }
  function drawHeroGhost(env) {
    var g = env.gGhost; g.selectAll("*").remove();
    var dens = kde(cell(state.focus, "0").att, env.bw, env.xs);
    var area = d3.area().x(function (d) { return env.x(d[0]); }).y0(env.ph).y1(function (d) { return env.y(d[1]); }).curve(d3.curveBasis);
    g.append("path").attr("d", area(dens)).attr("fill", C.inkFaint).attr("opacity", 0.16);
    g.append("path").attr("d", area(dens)).attr("fill", "none").attr("stroke", C.inkFaint).attr("stroke-width", 1).attr("opacity", 0.5);
  }
  function drawHeroLive(env, att, jackSE, meanv, labelDk) {
    var g = env.gDyn, ga = env.gAxis; g.selectAll("*").remove(); ga.selectAll("*").remove();
    var thr = DATA.estimators[state.focus].ri_thresh, xL = 0, xR = env.pw;
    var jb = 1.96 * jackSE, fs = env.narrow ? 16 : (env.detail ? 11.5 : 10.5);
    [[xL, env.x(-jb)], [env.x(jb), xR]].forEach(function (s) {     // jackknife region moves with δ
      g.append("rect").attr("x", s[0]).attr("y", -6).attr("width", Math.max(0, s[1] - s[0])).attr("height", env.ph + 6)
        .attr("fill", C.jack).attr("opacity", 0.12);
      g.append("rect").attr("x", s[0]).attr("y", -6).attr("width", Math.max(0, s[1] - s[0])).attr("height", env.ph + 6)
        .attr("fill", "url(#" + env.hatch + ")");
    });
    [-jb, jb].forEach(function (t) {
      if (env.x(t) < xL - 2 || env.x(t) > xR + 2) return;
      g.append("line").attr("x1", env.x(t)).attr("x2", env.x(t)).attr("y1", -6).attr("y2", env.ph)
        .attr("stroke", C.jack).attr("stroke-width", 1.2).attr("stroke-dasharray", "7 3").attr("opacity", 0.8);
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

    // callouts live below the baseline so nothing sits over the data
    var dk = labelDk || state.dk, inj = dkDec(dk), xi = env.x(inj), xm = env.x(meanv);
    ga.append("line").attr("x1", xi).attr("x2", xi).attr("y1", env.ph).attr("y2", env.ph + 7).attr("stroke", C.ink).attr("stroke-width", 1.4);
    ga.append("line").attr("x1", xm).attr("x2", xm).attr("y1", env.ph).attr("y2", env.ph + 7).attr("stroke", C.cal).attr("stroke-width", 1.4);
    var mid = (xi + xm) / 2, anchor = mid > env.pw - 120 ? "end" : (mid < 120 ? "start" : "middle");
    var lx = anchor === "end" ? Math.max(xi, xm) : (anchor === "start" ? Math.min(xi, xm) : mid);
    ga.append("text").attr("x", lx).attr("y", env.ph + (env.narrow ? 40 : (env.detail ? 31 : 29))).attr("text-anchor", anchor)
      .attr("class", "ax-note").style("font-size", fs + "px").attr("fill", C.ink)
      .text(env.narrow ? ("inj " + effI(inj) + ", rec " + eff1(meanv))
                       : ("injected " + effI(inj) + ", recovered " + eff1(meanv)));
    // Row B: jackknife-threshold label centered on its own line
    thresholdLabel(ga, jb, env.ph + (env.narrow ? 64 : (env.detail ? 46 : 43)), "jackknife threshold", C.jack, fs, env);
  }
  function morphHero(env, fromDk, toDk) {
    var est = state.focus, a0 = cell(est, fromDk), a1 = cell(est, toDk);
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || a0.att.length !== a1.att.length) { drawHeroLive(env, a1.att, a1.se_claimed, a1.mean_att, toDk); return; }
    var dur = 520, n = a1.att.length;
    if (env.timer) env.timer.stop();
    env.timer = d3.timer(function (el) {
      var k = Math.min(1, el / dur), e = d3.easeCubicOut(k), att = new Array(n);
      for (var i = 0; i < n; i++) att[i] = a0.att[i] + (a1.att[i] - a0.att[i]) * e;
      drawHeroLive(env, att, a0.se_claimed + (a1.se_claimed - a0.se_claimed) * e, a0.mean_att + (a1.mean_att - a0.mean_att) * e, toDk);
      if (k >= 1) { env.timer.stop(); drawHeroLive(env, a1.att, a1.se_claimed, a1.mean_att, toDk); }
    });
  }

  // SE panel: the inflation ratio is the hero, the spread bars support it
  var seInline = null;
  function buildSEEnv(svg, W, H, detail) {
    svg.selectAll("*").remove();
    var M = { t: 10, r: 18, b: 14, l: 22 };
    var env = { svg: svg, W: W, H: H, M: M, detail: detail };
    env.pw = W - M.l - M.r; env.ph = H - M.t - M.b;
    env.x = d3.scaleLinear().range([0, env.pw]);
    env.g = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    return env;
  }
  function drawSE(env, c) {
    var g = env.g; g.selectAll("*").remove();
    c = c || focusCell();
    var maxC = c.se_true;
    DKEYS.forEach(function (dk) { maxC = Math.max(maxC, cell(state.focus, dk).se_claimed); });
    env.x.domain([0, maxC * 1.04]);
    var fs = env.detail ? 13 : 12, sub = env.detail ? 11 : 10, barH = env.detail ? 20 : 16;
    var numFS = env.detail ? 84 : 66, numY = numFS * 0.82;
    var word = c.se_ratio > 1.05 ? "too wide" : (c.se_ratio < 0.95 ? "too narrow" : "about right");
    g.append("text").attr("x", 0).attr("y", numY)
      .attr("class", "ax-label").style("font-size", numFS + "px").style("font-weight", "500")
      .attr("fill", C.jack).text(c.se_ratio.toFixed(1) + "×");
    g.append("text").attr("x", env.pw).attr("y", numY - numFS * 0.34).attr("text-anchor", "end")
      .attr("class", "ax-note").style("font-size", (sub + 2) + "px").attr("fill", C.inkSoft)
      .text("claimed SE ÷ true sampling spread");
    g.append("text").attr("x", env.pw).attr("y", numY - numFS * 0.34 + 18).attr("text-anchor", "end")
      .attr("class", "ax-note").style("font-size", (sub + 2) + "px").attr("fill", C.jack).text(word);
    var claimedSub = state.focus === "multisynth" ? "mean jackknife standard error" : "mean reported standard error";
    var rows = [
      { lab: "claimed", sub: claimedSub, val: c.se_claimed, col: C.jack, top: numFS + 12 },
      { lab: "true", sub: "standard deviation of the estimates", val: c.se_true, col: C.cloud, top: numFS + 12 + (env.detail ? 62 : 52) }
    ];
    g.append("line").attr("x1", env.x(c.se_true)).attr("x2", env.x(c.se_true)).attr("y1", rows[0].top)
      .attr("y2", rows[1].top + barH + 18).attr("stroke", C.cloud).attr("stroke-width", 1).attr("stroke-dasharray", "2 3").attr("opacity", 0.45);
    rows.forEach(function (r) {
      g.append("text").attr("x", 0).attr("y", r.top + 11).attr("class", "ax-label").style("font-size", fs + "px").attr("fill", C.ink).text(r.lab);
      g.append("text").attr("x", 64).attr("y", r.top + 11).attr("class", "ax-note").style("font-size", sub + "px").attr("fill", C.inkFaint).text(r.sub);
      var by = r.top + 16;
      g.append("rect").attr("x", 0).attr("y", by).attr("width", Math.max(1, env.x(r.val))).attr("height", barH).attr("rx", 2)
        .attr("fill", r.col).attr("opacity", r.lab === "claimed" ? 0.32 : 0.85);
      g.append("rect").attr("x", env.x(r.val) - 1.5).attr("y", by - 3).attr("width", 2.5).attr("height", barH + 6).attr("fill", r.col);
      g.append("text").attr("x", env.x(r.val) + 8).attr("y", by + barH - 3).attr("class", "ax-label").style("font-size", (fs - 0.5) + "px").attr("fill", r.col).text(r.val.toFixed(4));
    });
  }
  function morphSE(env, fromDk, toDk) {
    var a0 = cell(state.focus, fromDk), a1 = cell(state.focus, toDk);
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { drawSE(env, a1); return; }
    var dur = 520;
    if (env.timer) env.timer.stop();
    env.timer = d3.timer(function (el) {
      var k = Math.min(1, el / dur), e = d3.easeCubicOut(k);
      drawSE(env, {
        se_claimed: a0.se_claimed + (a1.se_claimed - a0.se_claimed) * e,
        se_true: a1.se_true,
        se_ratio: a0.se_ratio + (a1.se_ratio - a0.se_ratio) * e
      });
      if (k >= 1) { env.timer.stop(); drawSE(env, a1); }
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
    // the primary estimator's jackknife rule sits flat on the floor at every δ
    // (drawn 2px above the axis so it reads as its own line, not the axis)
    g.append("path").attr("d", pcurve(env, function (k) { return cell("multisynth", k).reject_se; }, 2))
      .attr("fill", "none").attr("stroke", C.jack).attr("stroke-width", 2.6);
    g.append("text").attr("x", env.x(0.12)).attr("y", env.y(0.05)).attr("text-anchor", "end").attr("class", "ax-note").style("font-size", "10px").attr("fill", C.jack).text("ASCM, jackknife rule");
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
      m.baseline_gal_ethanol_21.toFixed(2) + "-gallon baseline. Plausible substitution, " +
      bl + " to " + br + " percent, sits well below it.";
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
        .attr("fill", C.jack).attr("opacity", isFocus ? 0.18 : 0.08);
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
    // "jackknife" only for the primary estimator (its actual inference); the rest
    // use neutral terms. The over-rejects clause mirrors the SE panel's verdict.
    var testName = est.primary ? "jackknife test" : "standard-error test";
    var seName = est.primary ? "jackknife standard error" : "reported standard error";
    var already = est.primary ? "already " : "";
    var tail = cell(state.focus, "0").reject_se > OVERSIZE ? ": too narrow, so the test over-rejects." : ".";
    if (state.dk === "0") {
      el.innerHTML = "The injected effect is zero. " + est.label + " returns a mean estimate of <strong>" + eff1(c.mean_att) +
        "</strong>. The " + testName + " rejects <strong>" + pct1(c.reject_se) + "</strong> of draws and the calibrated test rejects <strong>" +
        pct1(c.reject_ri) + "</strong>. The " + seName + " is " + already + "<strong>" + c.se_ratio.toFixed(1) + "×</strong> the true sampling dispersion" + tail;
    } else {
      el.innerHTML = "The injected effect is <strong>" + effI(dkDec(state.dk)) + "</strong>. " + est.label + " recovers a mean estimate of <strong>" +
        eff1(c.mean_att) + "</strong>. The " + testName + " rejects <strong>" + pct1(c.reject_se) + "</strong> of draws. The calibrated test rejects <strong>" +
        pct1(c.reject_ri) + "</strong>. The " + seName + " is <strong>" + c.se_ratio.toFixed(1) + "×</strong> the true spread" + tail;
    }
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
      var hw = NARROW_MQ.matches ? 520 : 900, hh = NARROW_MQ.matches ? 600 : 520;
      modalSvg.attr("viewBox", "0 0 " + hw + " " + hh);
      var e = buildHeroEnv(modalSvg, hw, hh, true);
      drawHeroFrame(e); drawHeroGhost(e); drawHeroLive(e, focusCell().att, focusCell().se_claimed, focusCell().mean_att);
      cap.appendChild(legendNode());
      cap.appendChild(note("At " + effI(dkDec(state.dk)) + " the estimates from " + DATA.estimators[state.focus].label +
        " center near the injected effect. The jackknife threshold sits far out at ±1.96 times the jackknife standard error, so the estimates do not reach it."));
    } else if (kind === "se") {
      modalSvg.attr("viewBox", "0 0 900 300");
      drawSE(buildSEEnv(modalSvg, 900, 300, true));
      cap.appendChild(note("The ratio divides the estimator's mean reported standard error by the standard deviation of the point estimates across draws. " + seVerdict()));
    } else if (kind === "placebo") {
      modalSvg.attr("viewBox", "0 0 900 520");
      var q = buildPlaceboEnv(modalSvg, 900, 520, true);
      drawPlaceboStatic(q); drawPlaceboMarker(q);
      cap.appendChild(note("Gray points are fake treatment effects estimated at every feasible backdated adoption year for the clean-fit states, using only pre-treatment data. Bands mark the mean and ±2 SD of each method's fake distribution; diamonds are the real estimates. The dashed line marks a true effect of the current δ: effects in the low single digits sit inside the noise the design produces when nothing happened."));
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
    var d = mk("div"); d.className = "cap-legend";
    [["lg-live", "estimates at current δ"], ["lg-null", "null distribution (δ = 0)"], ["lg-cal", "calibrated region"], ["lg-jack", "jackknife region"]].forEach(function (it) {
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
    var s2 = mk("span"); s2.className = "lg-item";
    var sw2 = mk("span"); sw2.className = "lg-sw"; sw2.style.background = C.jack;
    var tx2 = mk("span"); tx2.textContent = "ASCM, jackknife rule (flat at zero)";
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
    heroInline = buildHeroEnv(d3.select("#hero"), 680, 408, false);
    drawHeroFrame(heroInline); drawHeroGhost(heroInline);
    drawHeroLive(heroInline, focusCell().att, focusCell().se_claimed, focusCell().mean_att);
  });

})();
