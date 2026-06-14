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
  var state = { dk: "0", focus: "multisynth", active: {} };
  var DATA = null;
  var clipSeq = 0;

  function sgn(x) { return x < 0 ? "−" : (x > 0 ? "+" : ""); }
  function effI(dec) { return sgn(dec) + Math.abs(Math.round(dec * 100)) + "%"; }
  function eff1(dec) { return sgn(dec) + Math.abs(dec * 100).toFixed(1) + "%"; }
  function pct1(frac) { return (frac * 100).toFixed(1) + "%"; }
  function dkDec(dk) { return (+dk) / 100; }

  d3.json("data/power.json").then(function (data) {
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
    seInline = buildSEEnv(d3.select("#se"), 680, 196, false);
    powInline = buildPowerEnv(d3.select("#power"), 520, 432, false);
    initModal();
    update(true);
    document.getElementById("app").setAttribute("aria-busy", "false");
    var TITLES = { hero: "Sampling distribution", se: "Standard error inflation", power: "Power curves" };
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
  }

  function update(first, fromIdx) {
    refreshHeroLabels();
    setCounters(focusCell(), !first);
    drawReading(); drawSE(seInline); drawPowerMarker(powInline);
    if (first) {
      drawHeroFrame(heroInline); drawHeroGhost(heroInline);
      drawHeroLive(heroInline, focusCell().att, focusCell().se_claimed, focusCell().mean_att);
      drawPowerStatic(powInline); drawPowerCurves(powInline); drawPowerMarker(powInline);
    } else {
      morphHero(heroInline, DKEYS[fromIdx], state.dk);
    }
  }
  function setCounters(c, pulse) {
    var j = document.getElementById("c-jack"), k = document.getElementById("c-cal");
    j.textContent = pct1(c.reject_se); k.textContent = pct1(c.reject_ri);
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
    var M = { t: 16, r: 18, b: detail ? 74 : 60, l: 18 };
    var env = { svg: svg, W: W, H: H, M: M, detail: detail };
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
    // clip used to paint the share of the cloud past the calibrated threshold
    svg.append("defs").append("clipPath").attr("id", cid).append("rect")
      .attr("x", 0).attr("y", -6).attr("width", env.x(-DATA.estimators[state.focus].ri_thresh)).attr("height", env.ph + 6);
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
    var xL = 0, xR = env.pw, fs = env.detail ? 12 : 11;
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
    g.append("text").attr("class", "ax-label").attr("x", env.pw).attr("y", env.ph + 40)
      .attr("text-anchor", "end").style("font-size", fs + "px").text("estimated effect (%)");
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
    var jb = 1.96 * jackSE, fs = env.detail ? 11.5 : 10.5;
    [[xL, env.x(-jb)], [env.x(jb), xR]].forEach(function (s) {     // jackknife region moves with δ
      g.append("rect").attr("x", s[0]).attr("y", -6).attr("width", Math.max(0, s[1] - s[0])).attr("height", env.ph + 6)
        .attr("fill", C.jack).attr("opacity", 0.12);
    });
    [-jb, jb].forEach(function (t) {
      if (env.x(t) < xL - 2 || env.x(t) > xR + 2) return;
      g.append("line").attr("x1", env.x(t)).attr("x2", env.x(t)).attr("y1", -6).attr("y2", env.ph)
        .attr("stroke", C.jack).attr("stroke-width", 1.2).attr("stroke-dasharray", "4 3").attr("opacity", 0.8);
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
    ga.append("text").attr("x", lx).attr("y", env.ph + 25).attr("text-anchor", anchor)
      .attr("class", "ax-note").style("font-size", fs + "px").attr("fill", C.ink)
      .text("injected " + effI(inj) + ", recovered " + eff1(meanv));
    var jx = Math.max(xL + 1, env.x(-jb));
    ga.append("line").attr("x1", jx).attr("x2", jx).attr("y1", env.ph).attr("y2", env.ph + 7).attr("stroke", C.jack).attr("stroke-width", 1.2);
    ga.append("text").attr("x", jx + 4).attr("y", env.ph + 40).attr("text-anchor", "start")
      .attr("class", "ax-note").style("font-size", fs + "px").attr("fill", C.jack).text("jackknife threshold");
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

  // SE panel
  var seInline = null;
  function buildSEEnv(svg, W, H, detail) {
    svg.selectAll("*").remove();
    var M = { t: 16, r: detail ? 170 : 150, b: 14, l: 22 };
    var env = { svg: svg, W: W, H: H, M: M, detail: detail };
    env.pw = W - M.l - M.r; env.ph = H - M.t - M.b;
    env.x = d3.scaleLinear().range([0, env.pw]);
    env.g = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    return env;
  }
  function drawSE(env) {
    var g = env.g; g.selectAll("*").remove();
    var c = focusCell(), maxC = c.se_true;
    DKEYS.forEach(function (dk) { maxC = Math.max(maxC, cell(state.focus, dk).se_claimed); });
    env.x.domain([0, maxC * 1.04]);
    var fs = env.detail ? 13 : 12, sub = env.detail ? 11 : 10, barH = env.detail ? 20 : 17;
    var claimedSub = state.focus === "multisynth" ? "mean jackknife standard error" : "mean reported standard error";
    var rows = [
      { lab: "claimed", sub: claimedSub, val: c.se_claimed, col: C.jack, top: env.ph * 0.04 },
      { lab: "true", sub: "standard deviation of the estimates", val: c.se_true, col: C.cloud, top: env.ph * 0.54 }
    ];
    g.append("line").attr("x1", env.x(c.se_true)).attr("x2", env.x(c.se_true)).attr("y1", env.ph * 0.04)
      .attr("y2", env.ph * 0.54 + barH + 18).attr("stroke", C.cloud).attr("stroke-width", 1).attr("stroke-dasharray", "2 3").attr("opacity", 0.45);
    rows.forEach(function (r) {
      g.append("text").attr("x", 0).attr("y", r.top + 11).attr("class", "ax-label").style("font-size", fs + "px").attr("fill", C.ink).text(r.lab);
      g.append("text").attr("x", 64).attr("y", r.top + 11).attr("class", "ax-note").style("font-size", sub + "px").attr("fill", C.inkFaint).text(r.sub);
      var by = r.top + 20;
      g.append("rect").attr("x", 0).attr("y", by).attr("width", Math.max(1, env.x(r.val))).attr("height", barH).attr("rx", 2)
        .attr("fill", r.col).attr("opacity", r.lab === "claimed" ? 0.32 : 0.85);
      g.append("rect").attr("x", env.x(r.val) - 1.5).attr("y", by - 3).attr("width", 2.5).attr("height", barH + 6).attr("fill", r.col);
      g.append("text").attr("x", env.x(r.val) + 8).attr("y", by + barH - 4).attr("class", "ax-label").style("font-size", (fs - 0.5) + "px").attr("fill", r.col).text(r.val.toFixed(4));
    });
    var word = c.se_ratio > 1.05 ? "too wide" : (c.se_ratio < 0.95 ? "too narrow" : "about right");
    var rx = env.pw + env.M.r - 16, ry = env.detail ? 42 : 36;
    g.append("text").attr("x", rx).attr("y", ry).attr("text-anchor", "end")
      .attr("class", "ax-label").style("font-size", (env.detail ? 40 : 34) + "px").attr("fill", C.jack).text(c.se_ratio.toFixed(1) + "×");
    g.append("text").attr("x", rx).attr("y", ry + (env.detail ? 20 : 16)).attr("text-anchor", "end")
      .attr("class", "ax-note").style("font-size", sub + "px").attr("fill", C.inkFaint).text(word);
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
  function pcurve(env, rates) {
    return d3.line().x(function (d) { return env.x(Math.abs(+d[0]) / 100); }).y(function (d) { return env.y(d[1]); }).curve(d3.curveMonotoneX)(DKEYS.map(function (k) { return [k, rates(k)]; }));
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
      var mde = DATA.estimators[est].mde_ri;
      if (mde) g.append("line").attr("x1", env.x(Math.abs(mde))).attr("x2", env.x(Math.abs(mde))).attr("y1", env.y(0.8) - 5).attr("y2", env.y(0.8) + 5)
        .attr("stroke", SWATCH[est]).attr("stroke-width", foc ? 2 : 1.2).attr("opacity", foc ? 1 : 0.55);
    });
    // the primary estimator's jackknife rule sits flat on the floor at every δ
    g.append("path").attr("d", pcurve(env, function (k) { return cell("multisynth", k).reject_se; }))
      .attr("fill", "none").attr("stroke", C.jack).attr("stroke-width", 2.6);
    g.append("text").attr("x", env.x(0.12)).attr("y", env.y(0.05)).attr("text-anchor", "end").attr("class", "ax-note").style("font-size", "10px").attr("fill", C.jack).text("ASCM, jackknife rule");
  }
  function drawPowerMarker(env) {
    var g = env.gMarker; g.selectAll("*").remove();
    var mx = env.x(Math.abs(+state.dk) / 100);
    g.append("line").attr("x1", mx).attr("x2", mx).attr("y1", 0).attr("y2", env.ph).attr("stroke", C.ink).attr("stroke-width", 1).attr("opacity", 0.5);
    g.append("circle").attr("cx", mx).attr("cy", -2).attr("r", 3).attr("fill", C.ink);
  }

  function drawReading() {
    var c = focusCell(), est = DATA.estimators[state.focus], el = document.getElementById("reading");
    if (state.dk === "0") {
      el.innerHTML = "The injected effect is zero. " + est.label + " returns a mean estimate of <strong>" + eff1(c.mean_att) +
        "</strong>. The jackknife test rejects <strong>" + pct1(c.reject_se) + "</strong> of draws and the calibrated test rejects <strong>" +
        pct1(c.reject_ri) + "</strong>. The jackknife standard error is already <strong>" + c.se_ratio.toFixed(1) + "×</strong> the true sampling dispersion.";
    } else {
      el.innerHTML = "The injected effect is <strong>" + effI(dkDec(state.dk)) + "</strong>. " + est.label + " recovers a mean estimate of <strong>" +
        eff1(c.mean_att) + "</strong>. The jackknife test rejects <strong>" + pct1(c.reject_se) + "</strong> of draws. The calibrated test rejects <strong>" +
        pct1(c.reject_ri) + "</strong>. The jackknife standard error is <strong>" + c.se_ratio.toFixed(1) + "×</strong> the true spread.";
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
    [["hero", "Sampling distribution"], ["se", "Standard error inflation"], ["power", "Power curves"]].forEach(function (p) {
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
      modalSvg.attr("viewBox", "0 0 900 520");
      var e = buildHeroEnv(modalSvg, 900, 520, true);
      drawHeroFrame(e); drawHeroGhost(e); drawHeroLive(e, focusCell().att, focusCell().se_claimed, focusCell().mean_att);
      cap.appendChild(legendNode());
      cap.appendChild(note("At " + effI(dkDec(state.dk)) + " the estimates from " + DATA.estimators[state.focus].label +
        " center near the injected effect. The jackknife threshold sits far out at ±1.96 times the jackknife standard error, so the estimates do not reach it."));
    } else if (kind === "se") {
      modalSvg.attr("viewBox", "0 0 900 300");
      drawSE(buildSEEnv(modalSvg, 900, 300, true));
      cap.appendChild(note(state.focus === "multisynth"
        ? "The claimed spread is the mean jackknife standard error. The true spread is the standard deviation of the point estimates across draws. The jackknife runs several times too wide, so its test cannot reject."
        : "The claimed spread is the estimator's mean reported standard error. The true spread is the standard deviation of the point estimates across draws. Here the reported error runs narrower than the truth, so the test over-rejects."));
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
      var tx = mk("span"); tx.textContent = e.label + (e.mde_ri ? " (MDE " + (Math.abs(e.mde_ri) * 100).toFixed(1) + "%)" : "");
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
      ".thumb{position:absolute;top:50%;width:20px;height:20px;transform:translate(-50%,-50%);background:" + C.panel + ";border:2.5px solid " + C.cal + ";border-radius:50%;box-shadow:0 2px 6px -1px rgba(28,27,25,.35);pointer-events:none}";
    document.head.appendChild(s);
  }
  window.addEventListener("resize", function () {
    if (!slEl) return;
    placeThumb(DKEYS.indexOf(state.dk), false);
  });

})();
