/* Shared state, controls and helpers. Loads data/power.json (schema 4) and
   exposes window.App for the act scripts. Every number on the page comes from
   that file; nothing is estimated in the browser. */
(function () {
  "use strict";

  var App = window.App = {};

  var css = getComputedStyle(document.documentElement);
  function v(name) { return css.getPropertyValue(name).trim(); }
  App.C = {
    ink: v("--ink"), inkSoft: v("--ink-soft"), inkFaint: v("--ink-faint"),
    rule: v("--rule"), cloud: v("--cloud"), cal: v("--calibrated"),
    jack: v("--jack-rule"), band: v("--band"), panel: v("--panel"),
    flag: v("--flag")
  };
  App.SWATCH = {
    multisynth: App.C.cal,
    sdid: "#4a6670",
    gsynth_ife: "#7a6a48",
    matrix_completion: "#5b5566",
    callaway_santanna: "#3f6b53",
    twfe: "#8a8578"
  };

  App.DKEYS = ["0", "-2", "-5", "-8", "-12"];
  App.NARROW_MQ = window.matchMedia("(max-width: 480px)");
  App.REDUCE = function () {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  function sgn(x) { return x < 0 ? "−" : (x > 0 ? "+" : ""); }
  App.fmt = {
    sgn: sgn,
    effI: function (dec) { return sgn(dec) + Math.abs(Math.round(dec * 100)) + "%"; },
    eff1: function (dec) { return sgn(dec) + Math.abs(dec * 100).toFixed(1) + "%"; },
    pct1: function (frac) { return (frac * 100).toFixed(1) + "%"; },
    dkDec: function (dk) { return (+dk) / 100; }
  };

  App.state = { focus: "multisynth", dk: "0", phased: false };
  var subs = {};
  App.on = function (evt, fn) { (subs[evt] = subs[evt] || []).push(fn); };
  App.emit = function (evt) { (subs[evt] || []).forEach(function (f) { f(); }); };

  App.setFocus = function (est) {
    if (est === App.state.focus) return;
    App.state.focus = est;
    syncChips();
    App.emit("focus");
  };
  App.setDelta = function (dk) {
    if (dk === App.state.dk) return;
    App.state.dk = dk;
    if (dk !== "-5" && App.state.phased) { App.state.phased = false; }
    App.emit("delta");
  };
  App.setPhased = function (on) {
    if (on === App.state.phased) return;
    App.state.phased = on;
    App.emit("phased");
  };

  // The current simulation cell. The phased cell substitutes for the primary
  // estimator's -5% cell when the toggle is on.
  App.cell = function (est, dk) {
    dk = dk || App.state.dk;
    if (App.state.phased && est === "multisynth" && dk === "-5") return App.data.phased;
    return App.data.estimators[est].deltas[dk];
  };
  // Act 3 focus: falls back to the primary when the focused estimator has no
  // power-grid cells (TWFE).
  App.focusForPower = function () {
    return App.data.estimators[App.state.focus] ? App.state.focus : "multisynth";
  };

  App.kde = function (samples, bw, xs) {
    var inv = 1 / (bw * Math.sqrt(2 * Math.PI));
    return xs.map(function (x) {
      var s = 0;
      for (var i = 0; i < samples.length; i++) { var u = (x - samples[i]) / bw; s += Math.exp(-0.5 * u * u); }
      return [x, inv * s / samples.length];
    });
  };
  App.jitter = function (j, span) { return (((j * 7919) % 17) - 8) / 8 * span; };
  App.mk = function (t) { return document.createElement(t); };
  App.reflow = function (el) { el.classList.remove("pulse"); void el.offsetWidth; };

  // ---------- tooltip ----------
  var tipEl = null;
  App.tooltip = function (html, evt) {
    if (!tipEl) tipEl = document.getElementById("tooltip");
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    var pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
  };
  App.hideTooltip = function () { if (tipEl) tipEl.hidden = true; };

  // ---------- modal ----------
  var modal = null;
  function initModal() {
    modal = document.getElementById("modal");
    document.getElementById("modal-close").addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
  }
  function closeModal() { modal.hidden = true; }
  App.modal = function (title, drawFn, capHtml) {
    document.getElementById("modal-title").textContent = title;
    var svg = d3.select("#modal-svg");
    svg.selectAll("*").remove();
    drawFn(svg);
    document.getElementById("modal-cap").innerHTML = capHtml || "";
    modal.hidden = false;
    document.getElementById("modal-close").focus();
  };
  // Marks a figure as expandable into the modal.
  App.expandable = function (figEl, title, drawFn, capFn) {
    figEl.classList.add("expandable");
    figEl.setAttribute("role", "button");
    figEl.tabIndex = 0;
    figEl.setAttribute("aria-label", "Expand " + title);
    function open() { App.modal(title, drawFn, capFn ? capFn() : ""); }
    figEl.addEventListener("click", open);
    figEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  };

  // ---------- slider factory (five stops, pointer + keyboard) ----------
  var PAD = 13;
  App.buildSlider = function (slEl, initialDk, onChange) {
    var DK = App.DKEYS, thumb, fill;
    var track = App.mk("div"); track.className = "sl-track"; slEl.appendChild(track);
    fill = App.mk("div"); fill.className = "sl-fill"; slEl.appendChild(fill);
    DK.forEach(function (k, i) {
      var t = App.mk("div"); t.className = "sl-tick"; t.style.left = pctFor(i) + "%"; slEl.appendChild(t);
      var lab = App.mk("div"); lab.className = "sl-lab"; lab.style.left = pctFor(i) + "%";
      lab.textContent = App.fmt.effI(App.fmt.dkDec(k)); slEl.appendChild(lab);
    });
    thumb = App.mk("div"); thumb.className = "thumb"; slEl.appendChild(thumb);
    var cur = initialDk;
    slEl.setAttribute("aria-valuenow", cur);
    injectSliderCSS();
    var dragging = false;
    function pctFor(i) { return (i / (DK.length - 1)) * 100; }
    function placeThumb(i, animate) {
      var r = slEl.getBoundingClientRect();
      var usable = (r.width - 2 * PAD) || 300;
      var px = PAD + (i / (DK.length - 1)) * usable;
      thumb.style.transition = animate ? "left .45s cubic-bezier(.22,1,.36,1)" : "none";
      fill.style.transition = thumb.style.transition;
      thumb.style.left = px + "px"; fill.style.width = px + "px";
    }
    function set(dk) {
      if (dk === cur) return;
      cur = dk;
      placeThumb(DK.indexOf(dk), true);
      slEl.setAttribute("aria-valuenow", dk);
      slEl.setAttribute("aria-valuetext", App.fmt.effI(App.fmt.dkDec(dk)) + " effect");
      onChange(dk);
    }
    function pick(clientX) {
      var r = slEl.getBoundingClientRect();
      var x = (clientX - r.left - PAD) / (r.width - 2 * PAD);
      x = Math.max(0, Math.min(1, x));
      set(DK[Math.round(x * (DK.length - 1))]);
    }
    slEl.addEventListener("pointerdown", function (e) { dragging = true; slEl.setPointerCapture(e.pointerId); pick(e.clientX); });
    slEl.addEventListener("pointermove", function (e) { if (dragging) pick(e.clientX); });
    slEl.addEventListener("pointerup", function () { dragging = false; });
    slEl.addEventListener("pointercancel", function () { dragging = false; });
    slEl.addEventListener("keydown", function (e) {
      var i = DK.indexOf(cur);
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { set(DK[Math.max(0, i - 1)]); e.preventDefault(); }
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { set(DK[Math.min(DK.length - 1, i + 1)]); e.preventDefault(); }
    });
    window.addEventListener("resize", function () { placeThumb(DK.indexOf(cur), false); });
    placeThumb(DK.indexOf(cur), false);
  };
  function injectSliderCSS() {
    if (document.getElementById("slider-css")) return;
    var s = document.createElement("style"); s.id = "slider-css";
    s.textContent =
      ".sl-track{position:absolute;left:" + PAD + "px;right:" + PAD + "px;top:50%;height:3px;transform:translateY(-50%);background:" + App.C.rule + ";border-radius:2px}" +
      ".sl-fill{position:absolute;left:0;top:50%;height:3px;transform:translateY(-50%);background:" + App.C.cal + ";border-radius:2px;opacity:.55}" +
      ".sl-tick{position:absolute;top:50%;width:2px;height:10px;transform:translate(-50%,-50%);background:" + App.C.inkFaint + ";opacity:.5;border-radius:1px}" +
      ".sl-lab{position:absolute;top:calc(50% + 12px);transform:translateX(-50%);font-family:" + v("--mono") + ";font-size:11px;color:" + App.C.inkFaint + ";font-variant-numeric:tabular-nums}" +
      ".thumb{position:absolute;top:50%;width:20px;height:20px;transform:translate(-50%,-50%);background:" + App.C.panel + ";border:2.5px solid " + App.C.cal + ";border-radius:50%;box-shadow:0 2px 6px -1px rgba(28,27,25,.35);pointer-events:none}" +
      "@media (max-width:480px){.sl-lab{font-size:9px}}";
    document.head.appendChild(s);
  }

  // ---------- header ----------
  function buildStatChips() {
    var m = App.data.meta, R = App.data.real.rows, f = App.fmt;
    var box = document.getElementById("statchips");
    var pcts = App.data.real.order.map(function (e) { return R[e].pct; });
    chip(f.eff1(Math.min.apply(null, pcts)) + " to " + f.eff1(Math.max.apply(null, pcts)), "pooled estimates, six estimators");
    chip(m.ri_p.toFixed(2), "joint randomization-inference p-value");
    chip(Math.abs(m.mde_jack_delta * 100).toFixed(1) + "% · " + Math.abs(m.mde_delta_primary * 100).toFixed(1) + "%",
         "primary MDE, jackknife · calibrated");
    function chip(val, cap) {
      var d = App.mk("div"); d.className = "statchip";
      d.innerHTML = "<strong>" + val + "</strong><span>" + cap + "</span>";
      box.appendChild(d);
    }
  }
  function buildChips() {
    var row = document.getElementById("est-chips");
    App.data.real.order.forEach(function (est) {
      var r = App.data.real.rows[est];
      var b = App.mk("button"); b.className = "chip"; b.dataset.est = est;
      b.style.setProperty("--swatch", App.SWATCH[est]);
      b.appendChild(document.createTextNode(r.short));
      b.title = r.label;
      if (r.primary) {
        var t = App.mk("span"); t.className = "chip-tag"; t.textContent = "primary";
        b.appendChild(t);
      }
      if (!App.data.estimators[est]) {
        b.classList.add("no-power");
        b.title = r.label + " — not run through the power grid";
      }
      b.addEventListener("click", function () { App.setFocus(est); });
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
      "<p>Every number replays committed files in <code>Results/csv/</code>, the same " +
      "files the paper's tables are built from. No estimation runs in the browser. " +
      "Generated from commit <code>" + m.commit + "</code>, seed " + m.seed + ".</p>" +
      "<p>Ronczewski, A. (2026). <em>Detecting Cannabis–Alcohol Substitution in " +
      "Aggregate Sales Data: Statistical Power and the Limits of Small-Sample " +
      "Synthetic Control.</em> Working paper. " +
      '<a href="https://github.com/Alexr951/Cannabis_Alcohol_Substitution">Replication repository</a> · ' +
      '<a href="https://github.com/Alexr951/Cannabis_Alcohol_Substitution/blob/main/Cannabis_Alcohol_Substitution.pdf">read the paper</a>.</p>';
  }

  // ---------- boot ----------
  d3.json("data/power.json?v=4").then(function (data) {
    App.data = data;
    initModal();
    buildStatChips();
    buildChips();
    buildFooter();
    App.emit("ready");
    document.getElementById("app").setAttribute("aria-busy", "false");
  });
})();
