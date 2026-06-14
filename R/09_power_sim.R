# 09_power_sim.R — design-based power simulation (the paper's centerpiece).
# Draw 5 pseudo-treated states from the 30 never-treated donors, assign the
# real staggered T0s {2014,2014,2015,2018,2018} at random, inject a
# multiplicative effect delta (lny += log(1+delta) for t >= T0), re-estimate,
# and compute rejection rates at the 5% level.
#   - Primary (multisynth): full power curve, delta in {0,-2,-5,-8,-12}%,
#     400 draws each; rejection by |ATT/jackknife SE| > 1.96 (the procedure as
#     used) and, as a byproduct, by an RI-calibrated threshold (95th pctile of
#     |ATT| under delta = 0).
#   - Alternatives (SDID, gsynth IFE & MC, Callaway-Sant'Anna): the full delta
#     grid at 200 draws each, so every estimator gets a power curve and an MDE
#     (the design's envelope MDE is the minimum across estimators).
#   - Phased-in cell: multisynth at delta = -5% with the effect ramping
#     linearly to full size over three years, 400 draws.
#   - Jackknife diagnosis: ratio of the mean jackknife SE to the true sampling
#     SD of the estimator across draws.
# A timed pilot precedes the full grid; if the projection exceeds the budget,
# draws/replications degrade in a pre-stated order and the decision is logged.
source("R/helpers.R")
suppressPackageStartupMessages({
  library(augsynth); library(synthdid); library(gsynth); library(did)
  library(furrr)
})

cf <- clean_fit_set()
T0_VEC <- unname(sapply(cf, function(f) T0_MAP[[as.character(f)]]))
K <- length(cf)
# Raised from 25 to 60 min for the full-grid extension (all estimators get
# power curves so the paper can report an envelope MDE); decision logged below.
BUDGET_SECS <- 60 * 60

draw_data <- function(delta) {
  pseudo <- sample(NEVER_FIPS, K)
  t0s <- sample(T0_VEC)
  donors <- setdiff(NEVER_FIPS, pseudo)
  dat <- make_est_data(pseudo, donors, t0_map = setNames(t0s, pseudo))
  if (delta != 0) dat <- inject_delta(dat, pseudo, t0s, delta)
  list(dat = dat, pseudo = pseudo, t0s = t0s, donors = donors)
}

pw_multisynth <- function(d) {
  msyn <- multisynth(lny ~ trt, fips, year, d$dat, n_leads = N_LEADS_PRIMARY)
  ov <- summary(msyn)$att
  ov <- ov[is.na(ov$Time) & ov$Level == "Average", ]
  c(att = ov$Estimate, se = ov$Std.Error)
}

pw_sdid <- function(d, reps = 25) {
  t0s_u <- sort(unique(d$t0s))
  taus <- ses <- cells <- numeric(0)
  for (t0 in t0s_u) {
    coh <- d$pseudo[d$t0s == t0]
    pp <- d$dat[fips %in% c(d$donors, coh)]
    wide <- dcast(pp, fips ~ year, value.var = "lny")
    wide <- wide[match(c(d$donors, coh), fips)]
    Y <- as.matrix(wide[, -1])
    est <- synthdid_estimate(Y, length(d$donors), sum(PRIMARY_YEARS < t0))
    taus <- c(taus, as.numeric(est))
    ses <- c(ses, sqrt(as.numeric(vcov(est, method = "placebo",
                                       replications = reps))))
    cells <- c(cells, length(coh) * sum(PRIMARY_YEARS >= t0))
  }
  w <- cells / sum(cells)
  c(att = sum(w * taus), se = sqrt(sum(w^2 * ses^2)))
}

pw_gsynth <- function(d, estimator = "ife", nboots = 100) {
  g <- suppressMessages(gsynth(
    lny ~ trt, data = as.data.frame(d$dat), index = c("fips", "year"),
    force = "two-way", CV = TRUE, r = c(0, 3), estimator = estimator,
    se = TRUE, inference = ifelse(estimator == "mc", "nonparametric",
                                  "parametric"),
    nboots = nboots, parallel = FALSE))
  c(att = as.numeric(g$est.avg[1, "ATT.avg"]),
    se = as.numeric(g$est.avg[1, "S.E."]))
}

pw_cs <- function(d, biters = 199) {
  dd <- as.data.frame(d$dat)
  dd$g <- 0
  for (i in seq_len(K)) dd$g[dd$fips == d$pseudo[i]] <- d$t0s[i]
  fit <- suppressWarnings(att_gt(yname = "lny", tname = "year", idname = "fips",
                                 gname = "g", data = dd,
                                 control_group = "nevertreated",
                                 est_method = "reg", bstrap = TRUE,
                                 biters = biters))
  agg <- suppressWarnings(aggte(fit, type = "simple", bstrap = TRUE,
                                biters = biters))
  c(att = agg$overall.att, se = agg$overall.se)
}

SDID_REPS <- 25; GSYN_BOOTS <- 100
ESTIMATORS <- c("multisynth", "sdid", "gsynth_ife", "matrix_completion",
                "callaway_santanna")

# Direct switch dispatch (NOT a list of closures): future's automatic global
# detection recurses into directly-referenced functions, so workers receive
# pw_* and their dependencies. A list-of-closures indirection silently
# breaks that export and every draw errors to NA.
sim_one <- function(i, est_name, delta) {
  d <- draw_data(delta)
  r <- tryCatch(switch(est_name,
    multisynth = pw_multisynth(d),
    sdid = pw_sdid(d, reps = SDID_REPS),
    gsynth_ife = pw_gsynth(d, "ife", GSYN_BOOTS),
    matrix_completion = pw_gsynth(d, "mc", GSYN_BOOTS),
    callaway_santanna = pw_cs(d)),
    error = function(e) c(att = NA_real_, se = NA_real_))
  data.table(draw = i, att = r[["att"]], se = r[["se"]])
}

power_cell <- function(est_name, delta, n_draws, sim_fun = sim_one,
                       key = sprintf("power_%s_d%g_n%d", est_name,
                                     delta * 100, n_draws)) {
  cell <- run_cached(key, {
    plan(multisession, workers = 6)
    on.exit(plan(sequential))
    rbindlist(future_map(
      seq_len(n_draws), sim_fun, est_name = est_name, delta = delta,
      .options = furrr_options(seed = SEED,
                               packages = c("augsynth", "synthdid", "gsynth",
                                            "did", "data.table"))))
  })
  na_rate <- mean(is.na(cell$att))
  if (na_rate > 0.2) stop(sprintf(
    "power cell %s delta=%g: %.0f%% of draws failed — investigate, do not cache-and-continue",
    est_name, delta, 100 * na_rate))
  if (na_rate > 0) message(sprintf("  note: %s d=%g had %d failed draws",
                                   est_name, delta, sum(is.na(cell$att))))
  cell
}

# ---- Pilot: time 4 draws per estimator (serial), project the full grid ----
pilot <- run_cached("power_pilot", {
  set.seed(SEED)
  out <- list()
  for (e in ESTIMATORS) {
    t1 <- Sys.time()
    for (i in 1:4) invisible(sim_one(i, e, -0.05))
    out[[e]] <- data.table(
      estimator = e,
      secs_per_draw = as.numeric(difftime(Sys.time(), t1, units = "secs")) / 4)
  }
  rbindlist(out)
})
print(pilot)

DELTAS <- c(0, -0.02, -0.05, -0.08, -0.12)
N_PRIMARY <- 400
N_SPOT <- 200
spd <- setNames(pilot$secs_per_draw, pilot$estimator)
ALTS <- c("sdid", "gsynth_ife", "matrix_completion", "callaway_santanna")
proj <- length(DELTAS) * (N_PRIMARY * spd[["multisynth"]] +
                            N_SPOT * sum(spd[ALTS])) / 6
budget_log <- data.table(decision = "full grid, all estimators (envelope MDE)",
                         projected_min = round(proj / 60, 1),
                         n_primary = N_PRIMARY, n_spot = N_SPOT,
                         sdid_reps = SDID_REPS, gsyn_boots = GSYN_BOOTS,
                         deltas = paste(DELTAS, collapse = " "))
# Pre-stated degrade order: alternative draws 200->100, then drop delta = -12%.
if (proj > BUDGET_SECS) {
  N_SPOT <- 100
  proj <- length(DELTAS) * (N_PRIMARY * spd[["multisynth"]] +
                              N_SPOT * sum(spd[ALTS])) / 6
  budget_log <- rbind(budget_log, data.table(
    decision = "alternative draws 200->100", projected_min = round(proj / 60, 1),
    n_primary = N_PRIMARY, n_spot = N_SPOT, sdid_reps = SDID_REPS,
    gsyn_boots = GSYN_BOOTS, deltas = paste(DELTAS, collapse = " ")))
}
if (proj > BUDGET_SECS) {
  DELTAS <- c(0, -0.02, -0.05, -0.08)
  proj <- length(DELTAS) * (N_PRIMARY * spd[["multisynth"]] +
                              N_SPOT * sum(spd[ALTS])) / 6
  budget_log <- rbind(budget_log, data.table(
    decision = "drop delta -12%", projected_min = round(proj / 60, 1),
    n_primary = N_PRIMARY, n_spot = N_SPOT, sdid_reps = SDID_REPS,
    gsyn_boots = GSYN_BOOTS, deltas = paste(DELTAS, collapse = " ")))
}
wcsv(budget_log, "power_budget_log")
message(sprintf("Projected power-sim wall time: %.1f min", proj / 60))

# ---- Full grid ----
cells <- list()
for (dl in DELTAS) {
  cells[[paste("multisynth", dl)]] <-
    cbind(estimator = "multisynth", delta = dl,
          power_cell("multisynth", dl, N_PRIMARY))
}
for (e in ALTS) {
  for (dl in DELTAS) {
    cells[[paste(e, dl)]] <-
      cbind(estimator = e, delta = dl, power_cell(e, dl, N_SPOT))
  }
}

# ---- Phased-in effect: delta ramps linearly to full size over 3 years ----
# A constant post-treatment effect is the most detectable shape; a phase-in is
# the realistic alternative (retail markets ramp up, Figure on first stage).
draw_data_phased <- function(delta) {
  pseudo <- sample(NEVER_FIPS, K)
  t0s <- sample(T0_VEC)
  donors <- setdiff(NEVER_FIPS, pseudo)
  dat <- make_est_data(pseudo, donors, t0_map = setNames(t0s, pseudo))
  for (i in seq_len(K)) {
    f <- pseudo[i]; t0 <- t0s[i]
    dat[fips == f & year >= t0,
        lny := lny + log(1 + delta) * pmin(1, (year - t0 + 1) / 3)]
  }
  list(dat = dat, pseudo = pseudo, t0s = t0s, donors = donors)
}

sim_one_phased <- function(i, est_name, delta) {
  d <- draw_data_phased(delta)
  r <- tryCatch(pw_multisynth(d),
                error = function(e) c(att = NA_real_, se = NA_real_))
  data.table(draw = i, att = r[["att"]], se = r[["se"]])
}

cells[["multisynth_phased -0.05"]] <-
  cbind(estimator = "multisynth_phased", delta = -0.05,
        power_cell("multisynth", -0.05, N_PRIMARY, sim_fun = sim_one_phased,
                   key = sprintf("power_multisynth_phased_d-5_n%d", N_PRIMARY)))

draws <- rbindlist(cells)
wcsv(draws, "power_draws")

# ---- Rejection rates, size, MDE ----
# Two rejection rules: (a) the procedure as conventionally used,
# |ATT/SE| > 1.96 with each estimator's own SE; (b) a design-calibrated RI
# test, |ATT| > the 95th percentile of |ATT| in that SAME estimator's
# delta = 0 draws (size = 5% by construction).
draws[, t_stat := att / se]
ri_thresh_tab <- draws[delta == 0,
                       .(ri_thresh = quantile(abs(att), 0.95, na.rm = TRUE)),
                       by = estimator]
# The phased cell has no delta = 0 counterpart; it is the same estimator and
# design as multisynth, so it is judged against the multisynth threshold.
ri_thresh_tab <- rbind(ri_thresh_tab, data.table(
  estimator = "multisynth_phased",
  ri_thresh = ri_thresh_tab[estimator == "multisynth", ri_thresh]))
draws <- merge(draws, ri_thresh_tab, by = "estimator")
power_tab <- draws[, .(
  n_ok = sum(!is.na(t_stat)),
  reject_se = mean(abs(t_stat) > 1.96, na.rm = TRUE),
  reject_ri = mean(abs(att) > ri_thresh, na.rm = TRUE),
  mean_att = mean(att, na.rm = TRUE)), by = .(estimator, delta)]
wcsv(power_tab, "power_results")
wcsv(ri_thresh_tab, "power_ri_thresholds")

# MDE at 80% power, per estimator and rule; the envelope MDE is the minimum
# across estimators under the calibrated rule.
base_gal <- PANEL[beverage == "total" & fips %in% cf & year == 2013,
                  mean(pc_eth21)]
mde_for <- function(est, col) {
  pc <- power_tab[estimator == est & !is.na(get(col))][order(-delta)]
  if (nrow(pc) < 2 || max(pc[[col]]) < 0.8) NA_real_ else
    approx(pc[[col]], pc$delta, xout = 0.8, ties = "ordered")$y
}
drinks <- function(m) abs(m) * base_gal * 128 / 0.6 / 12
mde_se <- mde_for("multisynth", "reject_se")
mde_ri <- mde_for("multisynth", "reject_ri")
wcsv(data.table(rule = c("jackknife_se", "ri_calibrated"),
                mde_delta = c(mde_se, mde_ri),
                mde_drinks_per_month = c(drinks(mde_se), drinks(mde_ri)),
                baseline_gal_ethanol_21 = base_gal), "power_mde")

mde_by_est <- rbindlist(lapply(ESTIMATORS, function(e) data.table(
  estimator = e,
  mde_ri = mde_for(e, "reject_ri"),
  mde_se = mde_for(e, "reject_se"))))
mde_by_est[, mde_ri_drinks := drinks(mde_ri)]
mde_by_est[, envelope := !is.na(mde_ri) & abs(mde_ri) == min(abs(mde_ri),
                                                             na.rm = TRUE)]
wcsv(mde_by_est, "power_mde_by_estimator")

# Jackknife diagnosis: mean jackknife SE vs. the true sampling SD of the
# estimator across draws. The ratio is the size of the inference failure.
jack_diag <- draws[estimator == "multisynth",
                   .(mean_jack_se = mean(se, na.rm = TRUE),
                     sd_att = sd(att, na.rm = TRUE)), by = delta]
jack_diag[, se_inflation := mean_jack_se / sd_att]
wcsv(jack_diag, "power_jackknife_diag")
print(mde_by_est)
print(jack_diag)
print(power_tab)
message(sprintf(
  "MDE at 80%%: jackknife rule = %s; RI-calibrated rule = %s (~%.1f drinks/person/month)",
  ifelse(is.na(mde_se), "never reaches 80% (zero power on the grid)",
         sprintf("%.3f", mde_se)),
  ifelse(is.na(mde_ri), "beyond grid", sprintf("%.3f", mde_ri)),
  drinks(mde_ri)))
