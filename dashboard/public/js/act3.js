/* Act 3: the power simulation. Slider drives the injected effect; the hero
   dot histogram replays the committed draws (the same pseudo-treated draws at
   every delta, so dots move by positional transition). Right column: power
   curves, the MDE ladder, and the jackknife credibility inset. Every panel
   also renders into the expand modal at larger dimensions. */
(function () {
  "use strict";

  var hero = null;   // inline hero env, rebuilt on focus change
  var pow = null;    // inline power-curves env

  App.on("ready", function () {
    buildControls();
    hero = buildHero(d3.select("#hero"), 640, 430);
    updateHero(hero, false);
    pow = buildPower(d3.select("#power"), 380, 300);
    drawCurves(pow);
    drawLadder(d3.select("#ladder"), 380, 250, true);
    drawInset(d3.select("#jk-ratio"), 380, 120, true);
    updateCounters(false);
    updateReading();
    writeClosing();
    updateDrinks();
    wireExpand();
  });
  App.on("delta", function () {
    syncToggle();
    updateHero(hero, true);
    updateCounters(true);
    updateReading();
    drawMarker(pow);
    updateDrinks();
  });
  App.on("phased", function () {
    syncToggle();
    updateHero(hero, true);
    updateCounters(true);
    updateReading();
  });
  App.on("focus", function () {
    syncToggle();
    hero = buildHero(d3.select("#hero"), 640, 430);
    updateHero(hero, false);
    drawCurves(pow);
    drawLadder(d3.select("#ladder"), 380, 250, true);
    updateCounters(false);
    updateReading();
  });

  function wireExpand() {
    var figs = document.querySelectorAll("#act3 .fig");
    App.expandable(figs[0], "Sampling distribution",
      function (svg) {
        svg.attr("viewBox", "0 0 900 520");
        var env = buildHero(svg, 900, 520);
        updateHero(env, false);
      },
      function () { return "<p class='cap-note'>" + document.getElementById("reading").textContent + "</p>"; });
    App.expandable(figs[1], "Power curves",
      function (svg) {
        svg.attr("viewBox", "0 0 760 520");
        var env = buildPower(svg, 760, 520);
        drawCurves(env);
      },
      function () {
        return "<p class='cap-note'>Rejection rate against the true effect under each " +
          "estimator's calibrated rule, with the primary estimator's jackknife curve " +
          "dashed. The shaded band marks the plausible effects; every curve is still " +
          "near the floor inside it.</p>";
      });
    App.expandable(figs[2], "Minimum detectable effects",
      function (svg) {
        svg.attr("viewBox", "0 0 760 420");
        drawLadder(svg, 760, 420, false);
      },
      function () { return "<p class='cap-note'>" + document.getElementById("ladder-cap").textContent + "</p>"; });
    App.expandable(figs[3], "Jackknife standard error against the true dispersion",
      function (svg) {
        svg.attr("viewBox", "0 0 760 240");
        drawInset(svg, 760, 240, false);
      },
      function () { return "<p class='cap-note'>" + document.getElementById("jk-cap").textContent + "</p>"; });
  }

  // ---------- controls ----------
  var toggleEl = null;
  function buildControls() {
    App.buildSlider(document.getElementById("slider"), App.state.dk, function (dk) {
      document.getElementById("delta-readout").textContent = App.fmt.effI(App.fmt.dkDec(dk));
      App.setDelta(dk);
    });
    document.getElementById("delta-readout").textContent = App.fmt.effI(App.fmt.dkDec(App.state.dk));
    toggleEl = document.getElementById("phase-toggle");
    toggleEl.addEventListener("click", function () {
      if (!toggleEl.disabled) App.setPhased(!App.state.phased);
    });
    syncToggle();
  }
  function syncToggle() {
    if (!toggleEl) return;
    toggleEl.disabled = App.state.dk !== "-5" || App.focusForPower() !== "multisynth";
    toggleEl.classList.toggle("on", App.state.phased);
    toggleEl.title = toggleEl.disabled
      ? "Available at −5% for the primary estimator, the only simulated phase-in cell"
      : (App.state.phased ? "Showing the 3-year phase-in draws" : "Switch to the 3-year phase-in draws");
  }
  function updateDrinks() {
    // Reuses the committed conversion: drinks(δ) scales the committed
    // MDE-in-drinks by |δ| / |MDE| (exactly proportional, no hand-derived factor).
    var m = App.data.meta, d = Math.abs(App.fmt.dkDec(App.state.dk));
    var drinks = m.mde_drinks_per_month * d / Math.abs(m.mde_delta_primary);
    document.getElementById("drinks-readout").textContent =
      d === 0 ? "" : "≈ " + drinks.toFixed(1) + " standard drinks per adult per month";
  }

  // ---------- hero ----------
  function heroCell() { return App.cell(App.focusForPower()); }
  function jackGate() {
    // flat across delta: the delta = 0 cell's mean jackknife SE
    return 1.96 * App.data.estimators.multisynth.deltas["0"].se_jack_mean;
  }

  function buildHero(svg, W, H) {
    svg.selectAll("*").remove();
    var C = App.C, est = App.focusForPower();
    var M = { t: 18, r: 16, b: 72, l: 16 };
    var env = { svg: svg, W: W, H: H, M: M, est: est, inline: svg.attr("id") === "hero" };
    env.pw = W - M.l - M.r; env.ph = H - M.t - M.b;
    env.x = d3.scaleLinear().domain([-0.27, 0.10]).range([0, env.pw]);
    env.nBins = 56;
    env.binW = (0.37) / env.nBins;
    // dot diameter sized to the tallest stack across every cell of this estimator
    var maxStack = 0;
    App.DKEYS.forEach(function (dk) {
      maxStack = Math.max(maxStack, maxBin(App.data.estimators[est].deltas[dk].att, env));
    });
    if (est === "multisynth") maxStack = Math.max(maxStack, maxBin(App.data.phased.att, env));
    env.dotD = Math.min(H > 460 ? 9 : 7, env.ph / (maxStack + 1));
    env.r = env.dotD * 0.42;

    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    env.gFrame = root.append("g");
    env.gDots = root.append("g");
    env.gAxis = root.append("g");

    // frame: axis, gates, notes
    var g = env.gFrame;
    g.append("line").attr("x1", 0).attr("x2", env.pw).attr("y1", env.ph).attr("y2", env.ph)
      .attr("stroke", C.ink).attr("stroke-width", 1);
    var ticks = [-0.25, -0.20, -0.15, -0.10, -0.05, 0, 0.05, 0.10];
    var ax = d3.axisBottom(env.x).tickValues(ticks).tickSize(4)
      .tickFormat(function (d) { return (d < 0 ? "−" : "") + Math.abs(Math.round(d * 100)); });
    var gax = g.append("g").attr("transform", "translate(0," + env.ph + ")").call(ax);
    gax.selectAll("text").attr("class", "tick").style("font-size", "11px");
    gax.select(".domain").remove();
    g.append("text").attr("class", "ax-label").attr("x", env.pw / 2).attr("y", env.ph + 46)
      .attr("text-anchor", "middle").style("font-size", "11px").text("estimated effect (%)");
    var thr = App.data.estimators[est].ri_thresh;
    [-thr, thr].forEach(function (t) {
      g.append("line").attr("x1", env.x(t)).attr("x2", env.x(t)).attr("y1", -6).attr("y2", env.ph)
        .attr("stroke", C.cal).attr("stroke-width", 1.2).attr("stroke-dasharray", "2 3").attr("opacity", 0.65);
    });
    g.append("text").attr("x", env.x(thr) + 4).attr("y", 8).attr("class", "ax-note")
      .style("font-size", "10px").attr("fill", C.cal).text("calibrated threshold");
    if (est === "multisynth") {
      [-jackGate(), jackGate()].forEach(function (t) {
        g.append("line").attr("x1", env.x(t)).attr("x2", env.x(t)).attr("y1", -6).attr("y2", env.ph)
          .attr("stroke", C.jack).attr("stroke-width", 1.5).attr("opacity", 0.8);
      });
      g.append("text").attr("x", env.x(-jackGate()) - 4).attr("y", 8).attr("class", "ax-note")
        .attr("text-anchor", "end").style("font-size", "10px").attr("fill", C.jack)
        .text("jackknife gate (flat across δ)");
    }
    g.append("text").attr("x", 0).attr("y", env.ph + 62).attr("class", "ax-note")
      .style("font-size", "10.5px").attr("fill", C.inkFaint)
      .text("the same " + App.data.estimators[est].n_draws +
            " pseudo-treated draws at every δ; only the injected effect changes");
    if (est !== App.state.focus) {
      g.append("text").attr("x", env.pw).attr("y", 8).attr("text-anchor", "end")
        .attr("class", "ax-note").style("font-size", "10.5px").attr("fill", C.inkFaint)
        .text("TWFE was not run through the power grid; showing the primary estimator");
    }
    return env;
  }

  function maxBin(att, env) {
    var counts = {};
    var mx = 0, x0 = env.x.domain()[0];
    att.forEach(function (a) {
      var b = Math.floor((a - x0) / env.binW);
      counts[b] = (counts[b] || 0) + 1;
      if (counts[b] > mx) mx = counts[b];
    });
    return mx;
  }

  function layout(att, env) {
    // dot positions: bin by estimate, stack upward from the axis in draw order
    var x0 = env.x.domain()[0], counts = {}, pos = new Array(att.length);
    for (var i = 0; i < att.length; i++) {
      var b = Math.floor((att[i] - x0) / env.binW);
      var s = counts[b] = (counts[b] || 0) + 1;
      pos[i] = {
        i: i,
        x: env.x(x0 + (b + 0.5) * env.binW),
        y: env.ph - (s - 0.5) * env.dotD
      };
    }
    return pos;
  }

  function updateHero(env, animate) {
    var C = App.C, est = env.est;
    var c = App.cell(est);
    var thr = App.data.estimators[est].ri_thresh;
    var hasJackDraws = est === "multisynth" && !!c.se_jack;
    var pos = layout(c.att, env);
    var dots = env.gDots.selectAll("circle").data(pos, function (d) { return d.i; });
    var enter = dots.enter().append("circle").attr("r", env.r)
      .attr("cx", function (d) { return d.x; }).attr("cy", function (d) { return d.y; });
    dots.exit().remove();
    var all = enter.merge(dots);
    function fillOf(d) { return Math.abs(c.att[d.i]) > thr ? C.cal : C.inkFaint; }
    function strokeOf(d) {
      if (!hasJackDraws) return "none";
      return Math.abs(c.att[d.i] / c.se_jack[d.i]) > 1.96 ? C.jack : "none";
    }
    if (animate && !App.REDUCE()) {
      all.transition().duration(520).ease(d3.easeCubicOut)
        .attr("cx", function (d) { return d.x; }).attr("cy", function (d) { return d.y; })
        .attr("fill", fillOf).attr("stroke", strokeOf).attr("stroke-width", 1.6);
    } else {
      all.attr("cx", function (d) { return d.x; }).attr("cy", function (d) { return d.y; })
        .attr("fill", fillOf).attr("stroke", strokeOf).attr("stroke-width", 1.6);
    }
    // truth + mean markers with a fixed readout row
    var ga = env.gAxis; ga.selectAll("*").remove();
    var inj = App.state.phased ? -0.05 : App.fmt.dkDec(App.state.dk);
    var xi = env.x(inj), xm = env.x(c.mean_att);
    ga.append("line").attr("x1", xi).attr("x2", xi).attr("y1", env.ph).attr("y2", env.ph + 7)
      .attr("stroke", C.ink).attr("stroke-width", 1.4);
    ga.append("line").attr("x1", xm).attr("x2", xm).attr("y1", env.ph).attr("y2", env.ph + 7)
      .attr("stroke", C.cal).attr("stroke-width", 1.4);
    ga.append("text").attr("x", 0).attr("y", env.ph + 32).attr("text-anchor", "start")
      .attr("class", "ax-note").style("font-size", "10.5px").attr("fill", C.ink)
      .text("injected " + App.fmt.effI(inj) +
            (App.state.phased ? " (3-yr phase-in)" : "") +
            ", recovered " + App.fmt.eff1(c.mean_att));
    if (env.inline) {
      env.svg.attr("aria-label",
        "Sampling distribution for " + App.data.real.rows[est].label + " at injected effect " +
        App.fmt.effI(inj) + ". The calibrated rule rejects " + App.fmt.pct1(c.reject_ri) +
        " of draws" + (c.reject_jack != null ? ", the jackknife " + App.fmt.pct1(c.reject_jack) + "." : "."));
    }
  }

  // ---------- counters + reading ----------
  function updateCounters(pulse) {
    var c = heroCell(), f = App.fmt;
    var j = document.getElementById("c-jack"), k = document.getElementById("c-cal");
    var jc = document.getElementById("c-jack-cap");
    k.textContent = f.pct1(c.reject_ri);
    if (c.reject_jack != null) {
      j.textContent = f.pct1(c.reject_jack);
      j.parentNode.classList.remove("na");
      if (App.state.dk === "0" && !App.state.phased) {
        var s = App.data.meta.size_jack;
        jc.textContent = "empirical size " + f.pct1(s.size) + " · 95% CI " +
          f.pct1(s.lo) + "–" + f.pct1(s.hi) + " (nominal 5%)";
      } else {
        jc.textContent = "reported inference, primary estimator";
      }
    } else {
      j.textContent = "—";
      j.parentNode.classList.add("na");
      jc.textContent = "primary estimator only";
    }
    if (pulse) { App.reflow(j); App.reflow(k); j.classList.add("pulse"); k.classList.add("pulse"); }
  }

  function updateReading() {
    var c = heroCell(), est = App.focusForPower(), f = App.fmt;
    var label = App.data.real.rows[est].label;
    var el = document.getElementById("reading");
    if (App.state.dk === "0" && !App.state.phased) {
      el.innerHTML = "The injected effect is zero. " + label +
        " returns a mean estimate of <strong>" + f.eff1(c.mean_att) + "</strong>. " +
        (c.reject_jack != null
          ? "The jackknife rejects <strong>" + f.pct1(c.reject_jack) +
            "</strong> of draws against a nominal 5 percent; the calibrated rule rejects <strong>" +
            f.pct1(c.reject_ri) + "</strong> by construction."
          : "The calibrated rule rejects <strong>" + f.pct1(c.reject_ri) + "</strong> by construction.");
    } else {
      var inj = App.state.phased ? "−5% phased in over three years" : f.effI(f.dkDec(App.state.dk));
      el.innerHTML = "The injected effect is <strong>" + inj + "</strong>. " + label +
        " recovers <strong>" + f.eff1(c.mean_att) + "</strong> on average. " +
        (c.reject_jack != null
          ? "The reported jackknife inference detects it in <strong>" + f.pct1(c.reject_jack) +
            "</strong> of draws; the calibrated rule in <strong>" + f.pct1(c.reject_ri) + "</strong>."
          : "The calibrated rule detects it in <strong>" + f.pct1(c.reject_ri) +
            "</strong> of draws; jackknife inference is reported for the primary estimator.");
    }
  }

  function writeClosing() {
    var rd = App.data.real_data, m = App.data.meta, b = App.data.plausible_band, f = App.fmt;
    document.getElementById("closing").innerHTML =
      "On the real data the pooled estimate is <strong>" + f.eff1(rd.pct) +
      "</strong> with a jackknife 95% interval of [" + f.sgn(rd.ci_jack[0]) + Math.abs(rd.ci_jack[0]).toFixed(3) +
      ", " + f.sgn(rd.ci_jack[1]) + Math.abs(rd.ci_jack[1]).toFixed(3) + "] log points (t = " +
      rd.t_jack.toFixed(2) + "), a null under the reported inference. The plausible effects, " +
      Math.abs(b.left * 100) + " to " + Math.abs(b.right * 100) + " percent, sit below the primary " +
      "estimator's minimum detectable effect under either rule (" +
      Math.abs(m.mde_jack_delta * 100).toFixed(1) + "% jackknife, " +
      Math.abs(m.mde_delta_primary * 100).toFixed(1) + "% calibrated), so the null is a statement " +
      "about detectability, not evidence that substitution is absent.";
  }

  // ---------- power curves ----------
  function buildPower(svg, W, H) {
    svg.selectAll("*").remove();
    var C = App.C;
    var M = { t: 24, r: 12, b: 40, l: 34 };
    var env = { svg: svg, pw: W - M.l - M.r, ph: H - M.t - M.b, inline: svg.attr("id") === "power" };
    env.x = d3.scaleLinear().domain([0, 0.12]).range([0, env.pw]);
    env.y = d3.scaleLinear().domain([0, 1]).range([env.ph, 0]);
    var gid = "band-grad-" + (env.inline ? "inline" : "modal");
    var grad = svg.append("defs").append("linearGradient").attr("id", gid).attr("x1", "0").attr("x2", "1");
    grad.append("stop").attr("offset", "0").attr("stop-color", C.band).attr("stop-opacity", 0.04);
    grad.append("stop").attr("offset", "0.5").attr("stop-color", C.band).attr("stop-opacity", 0.24);
    grad.append("stop").attr("offset", "1").attr("stop-color", C.band).attr("stop-opacity", 0.04);
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    env.gStatic = root.append("g"); env.gCurves = root.append("g"); env.gMarker = root.append("g");
    // static frame
    var g = env.gStatic;
    var bl = Math.abs(App.data.plausible_band.left), br = Math.abs(App.data.plausible_band.right);
    g.append("rect").attr("x", env.x(bl)).attr("y", 0).attr("width", env.x(br) - env.x(bl))
      .attr("height", env.ph).attr("fill", "url(#" + gid + ")");
    g.append("text").attr("x", (env.x(bl) + env.x(br)) / 2).attr("y", 12).attr("text-anchor", "middle")
      .attr("class", "ax-note").style("font-size", "9.5px").attr("fill", "#9a7b2e").text("plausible effects");
    var ax = d3.axisBottom(env.x).tickValues([0, 0.02, 0.05, 0.08, 0.12])
      .tickFormat(function (d) { return Math.round(d * 100) + "%"; }).tickSize(4);
    var gx = g.append("g").attr("transform", "translate(0," + env.ph + ")").call(ax);
    gx.selectAll("text").attr("class", "tick").style("font-size", "10.5px");
    gx.select(".domain").attr("stroke", C.rule);
    var ay = d3.axisLeft(env.y).tickValues([0.2, 0.5, 0.8, 1]).tickFormat(d3.format(".0%")).tickSize(4);
    var gy = g.append("g").call(ay);
    gy.selectAll("text").attr("class", "tick").style("font-size", "10.5px");
    gy.select(".domain").attr("stroke", C.rule);
    g.append("text").attr("class", "ax-label").attr("x", env.pw).attr("y", env.ph + 32)
      .attr("text-anchor", "end").style("font-size", "10.5px").text("true effect");
    g.append("line").attr("x1", 0).attr("x2", env.pw).attr("y1", env.y(0.8)).attr("y2", env.y(0.8))
      .attr("stroke", C.inkFaint).attr("stroke-width", 1).attr("stroke-dasharray", "3 3");
    g.append("text").attr("x", env.pw - 2).attr("y", env.y(0.8) - 5).attr("text-anchor", "end")
      .attr("class", "ax-note").style("font-size", "9.5px").attr("fill", C.inkFaint).text("80% power");
    return env;
  }
  function pcurve(env, rates) {
    return d3.line()
      .x(function (d) { return env.x(Math.abs(+d[0]) / 100); })
      .y(function (d) { return env.y(d[1]); })
      .curve(d3.curveMonotoneX)(App.DKEYS.map(function (k) { return [k, rates(k)]; }));
  }
  function drawCurves(env) {
    var C = App.C, g = env.gCurves, focus = App.focusForPower();
    g.selectAll("*").remove();
    App.data.meta.estimator_order.forEach(function (est) {
      var foc = est === focus;
      g.append("path").attr("d", pcurve(env, function (k) { return App.data.estimators[est].deltas[k].reject_ri; }))
        .attr("fill", "none").attr("stroke", App.SWATCH[est])
        .attr("stroke-width", foc ? 2.8 : 1.5).attr("opacity", foc ? 1 : 0.45);
      var mde = App.data.estimators[est].mde_ri;
      if (mde && foc) {
        var mx = env.x(Math.abs(mde));
        g.append("line").attr("x1", mx).attr("x2", mx).attr("y1", env.y(0.8) - 7).attr("y2", env.y(0.8) + 7)
          .attr("stroke", App.SWATCH[est]).attr("stroke-width", 2);
        g.append("text").attr("x", mx - 5).attr("y", env.y(0.8) - 9).attr("text-anchor", "end")
          .attr("class", "ax-note").style("font-size", "9.5px").attr("fill", App.SWATCH[est])
          .text("MDE " + (Math.abs(mde) * 100).toFixed(1) + "%");
      }
    });
    // the primary's jackknife curve (the paper's reported inference)
    var focJ = focus === "multisynth";
    g.append("path").attr("d", pcurve(env, function (k) { return App.data.estimators.multisynth.deltas[k].reject_jack; }))
      .attr("fill", "none").attr("stroke", C.jack).attr("stroke-width", focJ ? 2.4 : 1.6)
      .attr("opacity", focJ ? 1 : 0.6).attr("stroke-dasharray", "6 3");
    g.append("text").attr("x", env.x(0.12) - 4)
      .attr("y", env.y(App.data.estimators.multisynth.deltas["-12"].reject_jack) + 14)
      .attr("text-anchor", "end").attr("class", "ax-note").style("font-size", "9.5px")
      .attr("fill", C.jack).text("ASCM, jackknife (reported)");
    var mj = App.data.meta.mde_jack_delta;
    if (mj && focJ) {
      var mjx = env.x(Math.abs(mj));
      g.append("line").attr("x1", mjx).attr("x2", mjx).attr("y1", env.y(0.8) - 7).attr("y2", env.y(0.8) + 7)
        .attr("stroke", C.jack).attr("stroke-width", 2);
      g.append("text").attr("x", mjx + 5).attr("y", env.y(0.8) + 16).attr("text-anchor", "start")
        .attr("class", "ax-note").style("font-size", "9.5px").attr("fill", C.jack)
        .text("MDE " + (Math.abs(mj) * 100).toFixed(1) + "%");
    }
    drawMarker(env);
  }
  function drawMarker(env) {
    if (!env) return;
    var g = env.gMarker;
    g.selectAll("*").remove();
    var mx = env.x(Math.abs(+App.state.dk) / 100);
    g.append("line").attr("x1", mx).attr("x2", mx).attr("y1", 0).attr("y2", env.ph)
      .attr("stroke", App.C.ink).attr("stroke-width", 1).attr("opacity", 0.5);
    g.append("circle").attr("cx", mx).attr("cy", -2).attr("r", 3).attr("fill", App.C.ink);
  }

  // ---------- MDE ladder ----------
  function drawLadder(svg, W, H, writeCap) {
    svg.selectAll("*").remove();
    var C = App.C, focus = App.focusForPower();
    var M = { t: 18, r: 24, b: 34, l: 64 };
    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var ests = App.data.meta.estimator_order.slice().sort(function (a, b) {
      return Math.abs(App.data.estimators[a].mde_ri) - Math.abs(App.data.estimators[b].mde_ri);
    });
    var x = d3.scaleLinear().domain([0, 0.085]).range([0, pw]);
    var rowH = ph / ests.length;
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    ests.forEach(function (est, i) {
      var e = App.data.estimators[est], yc = i * rowH + rowH * 0.42;
      var isFocus = est === focus;
      root.append("text").attr("x", -10).attr("y", yc + 4).attr("text-anchor", "end")
        .attr("class", "ax-label").style("font-size", "11.5px")
        .attr("fill", isFocus ? C.ink : C.inkFaint)
        .style("font-weight", isFocus ? "600" : "400")
        .text(App.data.real.rows[est].short);
      root.append("line").attr("x1", 0).attr("x2", x(Math.abs(e.mde_ri))).attr("y1", yc).attr("y2", yc)
        .attr("stroke", App.SWATCH[est]).attr("stroke-width", 1.6).attr("opacity", 0.55);
      root.append("circle").attr("cx", x(Math.abs(e.mde_ri))).attr("cy", yc).attr("r", 4.5)
        .attr("fill", App.SWATCH[est]).attr("stroke", C.panel).attr("stroke-width", 1);
      // value line sits below the lollipop, left-aligned, so nothing collides
      root.append("text").attr("x", 0).attr("y", yc + rowH * 0.42)
        .attr("class", "ax-note").style("font-size", "10px").attr("fill", C.inkSoft)
        .text((Math.abs(e.mde_ri) * 100).toFixed(1) + "% ≈ " + e.mde_ri_drinks.toFixed(1) +
              " drinks/mo" + (i === 0 ? " · the design's limit" : ""));
      if (est === "multisynth") {
        var mj = Math.abs(App.data.meta.mde_jack_delta);
        root.append("circle").attr("cx", x(mj)).attr("cy", yc).attr("r", 4)
          .attr("fill", "none").attr("stroke", C.jack).attr("stroke-width", 2);
        root.append("text").attr("x", x(mj) + 8).attr("y", yc - 8).attr("text-anchor", "start")
          .attr("class", "ax-note").style("font-size", "9.5px").attr("fill", C.jack)
          .text("jackknife " + (mj * 100).toFixed(1) + "%");
      }
    });
    var ax = d3.axisBottom(x).tickValues([0, 0.02, 0.04, 0.06, 0.08])
      .tickFormat(function (d) { return Math.round(d * 100) + "%"; }).tickSize(3);
    var gx = root.append("g").attr("transform", "translate(0," + ph + ")").call(ax);
    gx.selectAll("text").attr("class", "tick").style("font-size", "10px");
    gx.select(".domain").attr("stroke", C.rule);
    root.append("text").attr("class", "ax-label").attr("x", pw).attr("y", ph + 30)
      .attr("text-anchor", "end").style("font-size", "10px").text("MDE at 80% power");
    if (writeCap) {
      // caption with both cautions the paper carries
      var envEst = ests[0], envE = App.data.estimators[envEst];
      document.getElementById("ladder-cap").textContent =
        "Minimum detectable effect at 80 percent power under each estimator's " +
        "calibrated rule. The smallest figure carries two cautions from the paper: " +
        App.data.real.rows[envEst].label + "'s native test is the worst " +
        "over-rejecter at δ = 0 (" + App.fmt.pct1(envE.size_se0) + " against a " +
        "nominal 5 percent, so calibration fixes the size but not the noise), and " +
        "its cells use " + envE.n_draws + " draws, making this the noisiest of the " +
        "minimum detectable effects reported.";
    }
  }

  // ---------- jackknife credibility inset ----------
  function drawInset(svg, W, H, writeCap) {
    svg.selectAll("*").remove();
    var C = App.C;
    var M = { t: 12, r: 12, b: 26, l: 34 };
    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var x = d3.scaleLinear().domain([0, 0.12]).range([0, pw]);
    var y = d3.scaleLinear().domain([0, 3]).range([ph, 0]);
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    root.append("line").attr("x1", 0).attr("x2", pw).attr("y1", y(1)).attr("y2", y(1))
      .attr("stroke", C.inkFaint).attr("stroke-width", 1).attr("stroke-dasharray", "3 3");
    root.append("text").attr("x", pw - 2).attr("y", y(1) + 12).attr("text-anchor", "end")
      .attr("class", "ax-note").style("font-size", "9px").attr("fill", C.inkFaint)
      .text("a well-calibrated SE sits here (1×)");
    var line = d3.line()
      .x(function (dk) { return x(Math.abs(+dk) / 100); })
      .y(function (dk) { return y(App.data.estimators.multisynth.deltas[dk].se_jack_ratio); })
      .curve(d3.curveMonotoneX);
    root.append("path").attr("d", line(App.DKEYS)).attr("fill", "none")
      .attr("stroke", C.jack).attr("stroke-width", 2);
    App.DKEYS.forEach(function (dk) {
      root.append("circle").attr("cx", x(Math.abs(+dk) / 100))
        .attr("cy", y(App.data.estimators.multisynth.deltas[dk].se_jack_ratio))
        .attr("r", 3).attr("fill", C.jack);
    });
    var ax = d3.axisBottom(x).tickValues([0, 0.02, 0.05, 0.08, 0.12])
      .tickFormat(function (d) { return Math.round(d * 100) + "%"; }).tickSize(3);
    var gx = root.append("g").attr("transform", "translate(0," + ph + ")").call(ax);
    gx.selectAll("text").attr("class", "tick").style("font-size", "9.5px");
    gx.select(".domain").attr("stroke", C.rule);
    var ay = d3.axisLeft(y).tickValues([1, 2]).tickFormat(function (d) { return d + "×"; }).tickSize(3);
    var gy = root.append("g").call(ay);
    gy.selectAll("text").attr("class", "tick").style("font-size", "9.5px");
    gy.select(".domain").attr("stroke", C.rule);
    if (writeCap) {
      // self-contained caption: constant conservatism, size, and the MDE gap
      var ratio = App.data.estimators.multisynth.deltas["0"].se_jack_ratio;
      var m = App.data.meta;
      document.getElementById("jk-cap").textContent =
        "The jackknife standard error runs a constant " + ratio.toFixed(2) +
        "× the true sampling dispersion at every effect size: uniformly " +
        "conservative by about " + Math.round((ratio - 1) * 100) + " percent. That " +
        "is consistent with its " + App.fmt.pct1(m.size_jack.size) + " empirical " +
        "size at δ = 0 and is what separates its " +
        Math.abs(m.mde_jack_delta * 100).toFixed(1) + " percent minimum detectable " +
        "effect from the calibrated rule's " +
        Math.abs(m.mde_delta_primary * 100).toFixed(1) + " percent.";
    }
  }
})();
