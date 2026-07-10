/* Act 1: six pooled estimates over the primary estimator's randomization-
   inference null distribution, one shared x-axis (log points, labeled in
   percent). */
(function () {
  "use strict";

  App.on("ready", function () {
    draw(d3.select("#forest"), 960, 520);
    writeCaption();
    App.expandable(
      document.querySelector("#act1 .fig"),
      "Six estimators, one null",
      function (svg) { svg.attr("viewBox", "0 0 900 520"); draw(svg, 900, 520); },
      function () { return "<p class='cap-note'>" + document.getElementById("act1-cap").textContent + "</p>"; }
    );
  });
  App.on("focus", function () { draw(d3.select("#forest"), 960, 520); });

  function draw(svg, W, H) {
    svg.selectAll("*").remove();
    var C = App.C, f = App.fmt, D = App.data, R = D.real, N = D.ri_null;
    var M = { t: 18, r: 26, b: 46, l: 232 };
    var pw = W - M.l - M.r;
    var forestH = 300, gap = 30, nullH = H - M.t - M.b - forestH - gap;
    var totalH = forestH + gap + nullH;

    var lo = d3.min(R.order, function (e) { return R.rows[e].ci_lo; });
    var hi = d3.max(R.order, function (e) { return R.rows[e].ci_hi; });
    lo = Math.min(lo, d3.min(N.values)); hi = Math.max(hi, d3.max(N.values));
    var x = d3.scaleLinear().domain([lo - 0.008, hi + 0.008]).range([0, pw]);

    var root = svg.append("g").attr("transform", "translate(" + M.l + "," + M.t + ")");

    // wrong-sign tint across both panels
    root.append("rect").attr("x", x(0)).attr("y", 0)
      .attr("width", pw - x(0)).attr("height", totalH)
      .attr("fill", C.inkFaint).attr("opacity", 0.05);
    root.append("text").attr("x", pw - 4).attr("y", 12).attr("text-anchor", "end")
      .attr("class", "ax-note").style("font-size", "10.5px").attr("fill", C.inkFaint)
      .text("wrong sign for substitution");

    // zero line across both panels
    root.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", totalH)
      .attr("stroke", C.rule).attr("stroke-width", 1);

    // ---- forest ----
    var rowH = forestH / R.order.length;
    var gF = root.append("g");
    R.order.forEach(function (est, i) {
      var r = R.rows[est], yc = i * rowH + rowH * 0.52;
      var isFocus = est === App.state.focus;
      var g = gF.append("g").attr("opacity", isFocus ? 1 : 0.62);
      if (isFocus) {
        g.append("rect").attr("x", -M.l + 6).attr("y", i * rowH + 3)
          .attr("width", M.l - 12 + pw + 6).attr("height", rowH - 6).attr("rx", 3)
          .attr("fill", App.SWATCH[est]).attr("opacity", 0.05);
      }
      g.append("text").attr("x", -14).attr("y", yc - 3).attr("text-anchor", "end")
        .attr("class", "ax-label").style("font-size", "13px")
        .attr("fill", isFocus ? C.ink : C.inkSoft)
        .style("font-weight", r.primary ? "600" : "400")
        .text(r.label);
      g.append("text").attr("x", -14).attr("y", yc + 12).attr("text-anchor", "end")
        .attr("class", "ax-note").style("font-size", "10.5px")
        .attr("fill", r.primary ? C.cal : C.inkFaint)
        .text(r.inference + (r.primary ? " · primary" : ""));
      g.append("line").attr("x1", x(r.ci_lo)).attr("x2", x(r.ci_hi))
        .attr("y1", yc).attr("y2", yc)
        .attr("stroke", App.SWATCH[est]).attr("stroke-width", r.primary ? 2.4 : 1.8);
      [r.ci_lo, r.ci_hi].forEach(function (t) {
        g.append("line").attr("x1", x(t)).attr("x2", x(t))
          .attr("y1", yc - 4).attr("y2", yc + 4)
          .attr("stroke", App.SWATCH[est]).attr("stroke-width", 1.6);
      });
      g.append("circle").attr("cx", x(r.att)).attr("cy", yc)
        .attr("r", r.primary ? 5.5 : 4.5)
        .attr("fill", App.SWATCH[est]).attr("stroke", C.panel).attr("stroke-width", 1.2);
      g.append("text").attr("x", pw + 6).attr("y", yc + 4).attr("text-anchor", "start")
        .attr("class", "ax-note").style("font-size", "12px")
        .attr("fill", isFocus ? C.ink : C.inkFaint)
        .text(f.eff1(r.pct));
      // hover surface
      gF.append("rect").attr("x", -M.l + 6).attr("y", i * rowH)
        .attr("width", M.l - 12 + pw + 20).attr("height", rowH)
        .attr("fill", "transparent")
        .on("mousemove", function (evt) {
          App.tooltip("<strong>" + r.label + "</strong><br />" +
            "ATT " + r.att.toFixed(4) + " log points (" + f.eff1(r.pct) + ")<br />" +
            "SE " + r.se.toFixed(4) + " · 95% CI [" + f.sgn(r.ci_lo) + Math.abs(r.ci_lo).toFixed(3) +
            ", " + f.sgn(r.ci_hi) + Math.abs(r.ci_hi).toFixed(3) + "]<br />" +
            "Inference: " + r.inference, evt);
        })
        .on("mouseleave", App.hideTooltip)
        .on("click", function () { App.setFocus(est); });
    });

    // ---- null distribution ----
    var gN = root.append("g").attr("transform", "translate(0," + (forestH + gap) + ")");
    var sd = d3.deviation(N.values);
    var bw = 1.06 * sd * Math.pow(N.values.length, -0.2);
    var dom = x.domain();
    var xs = d3.range(90).map(function (i) { return dom[0] + (i / 89) * (dom[1] - dom[0]); });
    var dens = App.kde(N.values, bw, xs);
    var ymax = d3.max(dens, function (p) { return p[1]; });
    var y = d3.scaleLinear().domain([0, ymax * 1.08]).range([nullH, 0]);
    var area = d3.area().x(function (p) { return x(p[0]); }).y0(nullH)
      .y1(function (p) { return y(p[1]); }).curve(d3.curveBasis);
    gN.append("path").attr("d", area(dens)).attr("fill", C.inkFaint).attr("opacity", 0.18);
    gN.append("path").attr("d", area(dens)).attr("fill", "none")
      .attr("stroke", C.inkFaint).attr("stroke-width", 1).attr("opacity", 0.6);
    gN.append("text").attr("x", 2).attr("y", nullH - 6).attr("text-anchor", "start")
      .attr("class", "ax-note").style("font-size", "10.5px").attr("fill", C.inkFaint)
      .text("null distribution of the primary estimator under " + N.n_draws + " pseudo-treatment draws");

    // observed line through both panels
    var xo = x(N.observed);
    root.append("line").attr("x1", xo).attr("x2", xo).attr("y1", 0).attr("y2", totalH)
      .attr("stroke", C.cal).attr("stroke-width", 1.6).attr("stroke-dasharray", "1 0");
    var tA = root.append("text").attr("x", xo + 7).attr("y", forestH + gap + 14)
      .attr("text-anchor", "start").attr("class", "ax-note")
      .style("font-size", "11.5px").attr("fill", C.cal);
    tA.append("tspan").text("observed " + f.eff1(R.rows.multisynth.pct));
    tA.append("tspan").attr("x", xo + 7).attr("dy", 14).text("p = " + N.p.toFixed(2));

    // shared axis
    var ax = d3.axisBottom(x).ticks(8).tickSize(4)
      .tickFormat(function (d) { return (d < 0 ? "−" : "") + Math.abs(Math.round(d * 100)); });
    var gx = root.append("g").attr("transform", "translate(0," + totalH + ")").call(ax);
    gx.selectAll("text").attr("class", "tick").style("font-size", "11px");
    gx.select(".domain").attr("stroke", C.rule);
    root.append("text").attr("class", "ax-label").attr("x", pw).attr("y", totalH + 34)
      .attr("text-anchor", "end").style("font-size", "11px").text("estimated effect (%)");
  }

  function writeCaption() {
    var D = App.data;
    document.getElementById("act1-cap").textContent =
      "Pooled effect of recreational retail opening on log per-capita ethanol, " +
      "2000–2019 window. Whiskers are 95% confidence intervals under each " +
      "estimator's reported inference (tagged under each name); the primary " +
      "estimator reports a jackknife over units. The distribution below is the " +
      "randomization-inference null for the primary estimator: " +
      D.ri_null.n_draws + " draws of pseudo-treated states assigned the real " +
      "staggered dates. The observed estimate sits inside it (p = " +
      D.ri_null.p.toFixed(2) + "). Click a row or a chip above to highlight an estimator.";
  }
})();
