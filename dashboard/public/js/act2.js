/* Act 2: the noise floor. Left: backdated single-state placebo distributions
   per method with the real estimates overlaid. Right: pooled backdated
   placebos (fake 2009 and fake 2007) for every estimator. */
(function () {
  "use strict";

  App.on("ready", function () {
    drawStrips(d3.select("#strips"), 620, 460);
    drawPooled(d3.select("#pooled-fakes"), 340, 460);
    writeCaptions();
    App.expandable(
      document.querySelectorAll("#act2 .fig")[0],
      "The noise floor",
      function (svg) { svg.attr("viewBox", "0 0 900 520"); drawStrips(svg, 900, 520); },
      function () { return "<p class='cap-note'>" + document.getElementById("act2-cap").textContent + "</p>"; }
    );
    App.expandable(
      document.querySelectorAll("#act2 .fig")[1],
      "Pooled backdated placebos",
      function (svg) { svg.attr("viewBox", "0 0 620 520"); drawPooled(svg, 620, 520); },
      function () { return "<p class='cap-note'>" + document.getElementById("act2b-cap").textContent + "</p>"; }
    );
  });
  App.on("focus", function () {
    drawStrips(d3.select("#strips"), 620, 460);
    drawPooled(d3.select("#pooled-fakes"), 340, 460);
  });

  function pctOf(att) { return Math.exp(att) - 1; }

  function drawStrips(svg, W, H) {
    svg.selectAll("*").remove();
    var C = App.C, f = App.fmt, P = App.data.placebo, A = App.data.annotations;
    var M = { t: 8, r: 18, b: 64, l: 22 };
    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");
    var g = root.append("g");

    // domain from the committed values themselves
    var lo = -0.06, hi = 0.02;
    P.single_order.forEach(function (m) {
      P.single[m].values.forEach(function (v) { lo = Math.min(lo, v.att); hi = Math.max(hi, v.att); });
    });
    Object.keys(P.real.states).forEach(function (m) {
      P.real.states[m].forEach(function (r) { lo = Math.min(lo, r.att); hi = Math.max(hi, r.att); });
    });
    App.data.meta.estimator_order.forEach(function (est) {
      if (P.real.pooled[est] != null) { lo = Math.min(lo, P.real.pooled[est]); hi = Math.max(hi, P.real.pooled[est]); }
    });
    var x = d3.scaleLinear().domain([lo - 0.01, hi + 0.012]).range([0, pw]);

    var rows = P.single_order, rowH = ph / rows.length;
    var focusMethod = P.focus_map[App.state.focus] || null;
    g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", ph)
      .attr("stroke", C.rule).attr("stroke-width", 1);

    var caDone = false;
    rows.forEach(function (m, i) {
      var s = P.single[m], y0 = i * rowH, yc = y0 + rowH * 0.6, isFocus = m === focusMethod;
      if (isFocus) {
        g.append("rect").attr("x", -6).attr("y", y0 + 2).attr("width", pw + 12).attr("height", rowH - 4)
          .attr("rx", 3).attr("fill", C.cal).attr("opacity", 0.045);
        g.append("rect").attr("x", -6).attr("y", y0 + 2).attr("width", 2.5).attr("height", rowH - 4)
          .attr("fill", C.cal).attr("opacity", 0.55);
      }
      g.append("text").attr("x", 0).attr("y", y0 + 14).attr("class", "ax-label").style("font-size", "13px")
        .attr("fill", isFocus ? C.ink : C.inkFaint).style("font-weight", isFocus ? "600" : "400")
        .text(s.label + "  ·  " + s.n + " backdated runs  ·  mean " + f.eff1(s.mean) +
              ", sd " + (Math.abs(s.sd) * 100).toFixed(1) + "pp");
      g.append("rect").attr("x", x(s.mean - 2 * s.sd)).attr("y", yc - rowH * 0.16)
        .attr("width", x(s.mean + 2 * s.sd) - x(s.mean - 2 * s.sd)).attr("height", rowH * 0.32).attr("rx", 2)
        .attr("fill", C.inkFaint).attr("opacity", isFocus ? 0.2 : 0.1);
      g.append("line").attr("x1", x(s.mean)).attr("x2", x(s.mean)).attr("y1", yc - rowH * 0.2).attr("y2", yc + rowH * 0.2)
        .attr("stroke", C.ink).attr("stroke-width", 1.4).attr("opacity", isFocus ? 0.9 : 0.5);
      s.values.forEach(function (vv, j) {
        g.append("circle").attr("cx", x(vv.att)).attr("cy", yc + App.jitter(j, rowH * 0.11))
          .attr("r", 2.4).attr("fill", C.inkFaint).attr("opacity", isFocus ? 0.8 : 0.45)
          .on("mousemove", function (evt) {
            App.tooltip("<strong>" + vv.state + "</strong>, fake adoption " + vv.fake_t0 +
              "<br />fake effect " + f.eff1(pctOf(vv.att)), evt);
          })
          .on("mouseleave", App.hideTooltip);
      });
      // real estimates: per-state where the method has them, pooled otherwise
      var reals = P.real.states[m]
        ? P.real.states[m].map(function (r) { return { state: r.state, att: r.att }; })
        : (P.real.pooled[m] != null ? [{ state: null, att: P.real.pooled[m] }] : []);
      reals.forEach(function (r) {
        var isCA = r.state === "California";
        var dEl = diamond(g, x(r.att), yc, 5.5, C.cal);
        dEl.on("mousemove", function (evt) {
          var head = r.state ? "<strong>" + r.state + "</strong> (real estimate)"
                             : "<strong>Real pooled estimate</strong>";
          var body = "ATT " + r.att.toFixed(4) + " (" + f.eff1(pctOf(r.att)) + ")";
          if (isCA) {
            body += "<br /><strong>Not read causally</strong> (Section " + A.california.section + "):<ul>" +
              A.california.reasons.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>";
          }
          App.tooltip(head + "<br />" + body, evt);
        }).on("mouseleave", App.hideTooltip);
        if (isCA && !caDone) {
          caDone = true;
          g.append("line").attr("x1", x(r.att)).attr("x2", x(r.att))
            .attr("y1", yc - 8).attr("y2", y0 + 24)
            .attr("stroke", C.cal).attr("stroke-width", 0.8).attr("opacity", 0.7);
          g.append("text").attr("x", x(r.att)).attr("y", y0 + 20).attr("text-anchor", "middle")
            .attr("class", "ax-note").style("font-size", "10.5px").attr("fill", C.cal)
            .text("California — Section " + A.california.section);
        }
      });
    });

    // axis + footnotes
    var ax = d3.axisBottom(x).ticks(7).tickSize(4)
      .tickFormat(function (d) { return (d < 0 ? "−" : "") + Math.abs(Math.round(d * 100)); });
    var gx = g.append("g").attr("transform", "translate(0," + ph + ")").call(ax);
    gx.selectAll("text").attr("class", "tick").style("font-size", "11px");
    gx.select(".domain").attr("stroke", C.rule);
    g.append("text").attr("class", "ax-label").attr("x", pw).attr("y", ph + 34)
      .attr("text-anchor", "end").style("font-size", "11px").text("fake effect (%)");
    if (!focusMethod && App.data.estimators[App.state.focus]) {
      g.append("text").attr("x", 0).attr("y", ph + 34).attr("class", "ax-note").style("font-size", "10.5px")
        .attr("fill", C.inkFaint)
        .text("single-state backdating was not run for " + App.data.real.rows[App.state.focus].short +
              "; its pooled placebo is in the panel at right");
    } else if (App.state.focus === "multisynth") {
      g.append("text").attr("x", 0).attr("y", ph + 34).attr("class", "ax-note").style("font-size", "10.5px")
        .attr("fill", C.inkFaint)
        .text("classic SCM is the single-unit special case of the partially-pooled ASCM");
    }
  }

  function diamond(g, x, y, r, fill) {
    return g.append("path")
      .attr("d", "M" + x + "," + (y - r) + "L" + (x + r) + "," + y + "L" + x + "," + (y + r) + "L" + (x - r) + "," + y + "Z")
      .attr("fill", fill).attr("stroke", App.C.panel).attr("stroke-width", 1);
  }

  function drawPooled(svg, W, H) {
    svg.selectAll("*").remove();
    var C = App.C, f = App.fmt, P = App.data.placebo;
    var M = { t: 26, r: 10, b: 64, l: 96 };
    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var panelW = (pw - 18) / 2;
    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");

    var ests = App.data.meta.estimator_order.filter(function (e) { return P.pooled2009[e]; });
    Object.keys(P.pooled2009).forEach(function (e) { if (ests.indexOf(e) < 0) ests.push(e); });
    var rowH = ph / ests.length;

    var lo = 0, hi = 0;
    ["pooled2009", "pooled2007"].forEach(function (key) {
      ests.forEach(function (e) {
        var p = P[key][e]; if (!p) return;
        var se = (e === "multisynth" && p.se_jack != null) ? p.se_jack : p.se;
        lo = Math.min(lo, p.att - 1.96 * se); hi = Math.max(hi, p.att + 1.96 * se);
      });
    });
    var x = d3.scaleLinear().domain([lo - 0.005, hi + 0.005]).range([0, panelW]);

    [["pooled2009", "fake 2009", 0], ["pooled2007", "fake 2007", panelW + 18]].forEach(function (spec) {
      var key = spec[0], titleTxt = spec[1], x0 = spec[2];
      var g = root.append("g").attr("transform", "translate(" + x0 + ",0)");
      g.append("text").attr("x", panelW / 2).attr("y", -10).attr("text-anchor", "middle")
        .attr("class", "ax-label").style("font-size", "11.5px").attr("fill", C.inkSoft)
        .text(titleTxt);
      g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", ph)
        .attr("stroke", C.rule).attr("stroke-width", 1);
      ests.forEach(function (e, i) {
        var p = P[key][e]; if (!p) return;
        var yc = i * rowH + rowH / 2;
        var seUsed = (e === "multisynth" && p.se_jack != null) ? p.se_jack : p.se;
        var tUsed = (e === "multisynth" && p.t_jack != null) ? p.t_jack : p.t;
        var flagged = Math.abs(tUsed) > 1.96;
        var col = flagged ? C.flag : (App.SWATCH[e] || C.inkSoft);
        g.append("line").attr("x1", x(p.att - 1.96 * seUsed)).attr("x2", x(p.att + 1.96 * seUsed))
          .attr("y1", yc).attr("y2", yc).attr("stroke", col).attr("stroke-width", 1.4)
          .attr("opacity", 0.7);
        g.append("circle").attr("cx", x(p.att)).attr("cy", yc).attr("r", flagged ? 4.6 : 3.6)
          .attr("fill", col).attr("stroke", C.panel).attr("stroke-width", 1)
          .on("mousemove", function (evt) {
            var lab = App.data.real.rows[e] ? App.data.real.rows[e].label : e;
            App.tooltip("<strong>" + lab + "</strong> · " + titleTxt +
              "<br />fake ATT " + f.eff1(p.pct) + " · t = " + tUsed.toFixed(2).replace("-", "−") +
              (e === "multisynth" ? " (jackknife)" : "") +
              (flagged ? "<br /><strong>rejects at the 5% level on no-treatment data</strong>" : ""), evt);
          })
          .on("mouseleave", App.hideTooltip);
        if (flagged) {
          g.append("text").attr("x", x(p.att)).attr("y", yc - 9).attr("text-anchor", "middle")
            .attr("class", "ax-note").style("font-size", "9.5px").attr("fill", C.flag)
            .text("rejects");
        }
      });
      var ax = d3.axisBottom(x).tickValues([-0.04, -0.02, 0]).tickSize(3)
        .tickFormat(function (d) { return (d < 0 ? "−" : "") + Math.abs(Math.round(d * 100)); });
      var gx = g.append("g").attr("transform", "translate(0," + ph + ")").call(ax);
      gx.selectAll("text").attr("class", "tick").style("font-size", "10px");
      gx.select(".domain").attr("stroke", C.rule);
    });

    // row labels (shared, left of the first panel)
    ests.forEach(function (e, i) {
      var lab = App.data.real.rows[e] ? App.data.real.rows[e].short : e;
      var isFocus = e === App.state.focus;
      root.append("text").attr("x", -8).attr("y", i * rowH + rowH / 2 + 4)
        .attr("text-anchor", "end").attr("class", "ax-label").style("font-size", "11.5px")
        .attr("fill", isFocus ? C.ink : C.inkFaint)
        .style("font-weight", isFocus ? "600" : "400")
        .text(lab);
    });
    root.append("text").attr("class", "ax-label").attr("x", pw).attr("y", ph + 34)
      .attr("text-anchor", "end").style("font-size", "10.5px").text("fake effect (%)");
  }

  function writeCaptions() {
    document.getElementById("act2-cap").textContent =
      "Gray points are backdated fake estimates at every feasible adoption year, " +
      "clean-fit states, pre-treatment data only. Bands mark each method's mean " +
      "± 2 SD; diamonds are the real estimates. Four of five real estimates sit " +
      "inside the no-treatment noise band; California is the exception, discussed " +
      "in Section III.C of the paper (hover its diamond for the three reasons the " +
      "gap is not read causally).";
    document.getElementById("act2b-cap").textContent =
      "Pooled backdated placebos: every estimator finds a negative pseudo-effect " +
      "near −1 to −2 percent. The flagged cell rejects at the 5 percent level on " +
      "data where no treatment occurred, anticipating the over-rejection its " +
      "native test shows in the simulation. The primary row uses its jackknife " +
      "standard error.";
  }
})();
