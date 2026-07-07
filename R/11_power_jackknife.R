# 11_power_jackknife.R — jackknife inference for the primary estimator,
# paired draw-for-draw with the 09 power simulation (standalone; not part of
# run_all.R). Every summary(msyn) call in 02/07/09/10 uses the augsynth 0.2.0
# multisynth default inf_type = "bootstrap" (a wild bootstrap), so the
# recorded SEs are bootstrap SEs. This script recomputes inference three ways
# on identical draws: the default bootstrap (must reproduce the recorded
# numbers exactly), summary(msyn, inf_type = "jackknife"), and the
# RI-calibrated rule from 09. furrr_options(seed = SEED) gives each draw
# index its own deterministic stream, so the pseudo-treated draws reproduce
# exactly; within a draw the default summary runs first (consuming the same
# RNG as the original run) and the deterministic jackknife second. All
# reproductions are asserted. New cache keys (_jackv1) and new CSVs only.
source("R/helpers.R")
suppressPackageStartupMessages({
  library(augsynth); library(furrr)
})

T_SCRIPT_START <- Sys.time()

gate <- function(ok, msg, diag = NULL) {
  if (!isTRUE(ok)) {
    if (!is.null(diag)) print(diag)
    stop("GATE FAILED: ", msg, call. = FALSE)
  }
  message("[gate ok] ", msg)
}

# run_cached twin logging to timings_jack.csv, so a run_all.R rebuild of
# runtimes.csv never picks up jackknife steps.
run_cached_jack <- function(name, expr) {
  path <- file.path("Results", "cache", paste0(name, ".rds"))
  if (file.exists(path)) {
    message("[cache] ", name)
    return(readRDS(path))
  }
  t_start <- Sys.time()
  val <- force(expr)
  secs <- as.numeric(difftime(Sys.time(), t_start, units = "secs"))
  saveRDS(val, path)
  log_path <- file.path("Results", "cache", "timings_jack.csv")
  tl <- if (file.exists(log_path)) fread(log_path) else
    data.table(step = character(), seconds = numeric())
  tl <- rbind(tl[step != name], data.table(step = name, seconds = round(secs, 1)))
  fwrite(tl, log_path)
  message(sprintf("[run ] %s: %.1fs", name, secs))
  val
}

# Pooled Average-row ATT/SE under both inference types. The default
# (bootstrap) summary must run first: it consumes RNG exactly as the original
# run did; the jackknife is deterministic.
both_summaries <- function(msyn) {
  sb <- suppressWarnings(summary(msyn))$att
  sb <- sb[is.na(sb$Time) & sb$Level == "Average", ]
  sj <- suppressWarnings(summary(msyn, inf_type = "jackknife"))$att
  sj <- sj[is.na(sj$Time) & sj$Level == "Average", ]
  c(att = sb$Estimate, se_boot = sb$Std.Error, se_jack = sj$Std.Error)
}

# ---- Environment checks -----------------------------------------------------
aug_ver <- as.character(packageVersion("augsynth"))
gate(aug_ver == "0.2.0", sprintf("augsynth version is 0.2.0 (found %s)", aug_ver))
default_inf <- eval(formals(augsynth:::summary.multisynth)$inf_type)
gate(identical(default_inf, "bootstrap"),
     sprintf("summary.multisynth default inf_type is 'bootstrap' (found '%s')",
             default_inf))
aug_desc <- packageDescription("augsynth")
aug_sha <- if (!is.null(aug_desc$RemoteSha)) aug_desc$RemoteSha else
  if (!is.null(aug_desc$GithubSHA1)) aug_desc$GithubSHA1 else NA_character_
message(sprintf("augsynth %s @ %s; default inf_type = '%s'",
                aug_ver, aug_sha, default_inf))

cf <- clean_fit_set()
T0_VEC <- unname(sapply(cf, function(f) T0_MAP[[as.character(f)]]))
K <- length(cf)

# ---- Primary fit ------------------------------------------------------------
# Replicates 02's sequence (set.seed(SEED), fit, default summary), so the
# recorded bootstrap SE must reproduce to 1e-8.
primary <- run_cached_jack("multisynth_primary_jackv1", {
  set.seed(SEED)
  dat <- make_est_data(cf, NEVER_FIPS)
  msyn <- multisynth(lny ~ trt, fips, year, dat, n_leads = N_LEADS_PRIMARY)
  both_summaries(msyn)
})
committed_overall <- fread("Results/csv/multisynth_overall.csv")[state == "Average"]
gate(abs(primary[["att"]] - committed_overall$Estimate) < 1e-8,
     sprintf("primary ATT reproduces committed (%.10f vs %.10f)",
             primary[["att"]], committed_overall$Estimate))
gate(abs(primary[["se_boot"]] - committed_overall$Std.Error) < 1e-8,
     sprintf("primary default-bootstrap SE reproduces committed (%.10f vs %.10f)",
             primary[["se_boot"]], committed_overall$Std.Error))
gate(abs(primary[["se_jack"]] - 0.0222) < 0.001,
     sprintf("primary jackknife SE ~ 0.0222 (found %.4f)", primary[["se_jack"]]))
wcsv(data.table(
  state = "Average", att = primary[["att"]],
  se_boot = primary[["se_boot"]], se_jack = primary[["se_jack"]],
  ci_lo_boot = primary[["att"]] - 1.96 * primary[["se_boot"]],
  ci_hi_boot = primary[["att"]] + 1.96 * primary[["se_boot"]],
  ci_lo_jack = primary[["att"]] - 1.96 * primary[["se_jack"]],
  ci_hi_jack = primary[["att"]] + 1.96 * primary[["se_jack"]],
  pct = exp(primary[["att"]]) - 1), "multisynth_overall_jack")

# ---- Robustness variants under both SEs -------------------------------------
# Same sequence and order as 10 after set.seed(SEED); the jackknife consumes
# no RNG, so the recomputed bootstrap SEs must match robustness_variants.csv
# exactly.
TIMING_DONORS <- TREAT[ever_rec_2023 == 1 & (is.na(t0) | t0 > 2019) &
                         primary_treated == 0, fips]
msyn_both <- function(dat, n_leads = N_LEADS_PRIMARY) {
  msyn <- multisynth(lny ~ trt, fips, year, dat, n_leads = n_leads)
  as.data.table(as.list(both_summaries(msyn)))
}
variants_jack <- run_cached_jack("robustness_variants_jackv1", {
  set.seed(SEED)
  res <- list()
  res$primary <- cbind(spec = "primary",
                       msyn_both(make_est_data(cf, NEVER_FIPS)))
  res$adj <- cbind(spec = "drop_adjacent_donors",
                   msyn_both(make_est_data(cf, setdiff(NEVER_FIPS, ADJ_DONORS))))
  res$med <- cbind(spec = "drop_oklahoma_medical",
                   msyn_both(make_est_data(cf, setdiff(NEVER_FIPS, MED_INTENSITY_DONORS))))
  res$nh <- cbind(spec = "drop_new_hampshire",
                  msyn_both(make_est_data(cf, setdiff(NEVER_FIPS, 33))))
  res$timing <- cbind(spec = "timing_adjusted_pool",
                      msyn_both(make_est_data(cf, c(NEVER_FIPS, TIMING_DONORS))))
  res$ext <- cbind(spec = "window_2000_2023",
                   msyn_both(make_est_data(cf, NEVER_FIPS, years = EXT_YEARS),
                             n_leads = 10))
  res$all7 <- cbind(spec = "all_seven_treated",
                    msyn_both(make_est_data(PRIMARY_TREATED$fips, NEVER_FIPS)))
  for (bev in c("beer", "wine", "spirits")) {
    res[[bev]] <- cbind(spec = paste0("beverage_", bev),
                        msyn_both(make_est_data(cf, NEVER_FIPS,
                                                bev_name = bev)))
  }
  rbindlist(res)
})
committed_rob <- fread("Results/csv/robustness_variants.csv")
rob_chk <- merge(variants_jack, committed_rob[, .(spec, att_ref = att, se_ref = se)],
                 by = "spec")
gate(nrow(rob_chk) == nrow(variants_jack) &&
       max(abs(rob_chk$att - rob_chk$att_ref)) < 1e-8 &&
       max(abs(rob_chk$se_boot - rob_chk$se_ref)) < 1e-8,
     sprintf("all %d robustness variants reproduce committed att and bootstrap SE (max|d_att|=%.1e, max|d_se|=%.1e)",
             nrow(rob_chk), max(abs(rob_chk$att - rob_chk$att_ref)),
             max(abs(rob_chk$se_boot - rob_chk$se_ref))),
     diag = rob_chk[abs(att - att_ref) >= 1e-8 | abs(se_boot - se_ref) >= 1e-8])
variants_jack[, `:=`(pct = exp(att) - 1,
                     t_boot = att / se_boot, t_jack = att / se_jack)]
wcsv(variants_jack, "robustness_jack")

# ---- Pooled in-time placebos under both SEs ----------------------------------
# Multisynth rows of 07's pooled_fake() only. The bootstrap SE is taken from
# the existing CSV (its RNG position inside 07 is not replayable in
# isolation); the refit must reproduce the recorded point estimate, and the
# jackknife SE is deterministic.
fake_msyn_both <- function(fake_t0) {
  set.seed(SEED)
  yrs <- 2000:(fake_t0 + 4)
  t0m <- setNames(rep(as.integer(fake_t0), length(cf)), cf)
  dat <- make_est_data(cf, NEVER_FIPS, years = yrs, t0_map = t0m)
  msyn <- multisynth(lny ~ trt, fips, year, dat, n_leads = 5)
  both_summaries(msyn)
}
placebo_jack <- rbindlist(lapply(c(2009, 2007), function(ft) {
  r <- run_cached_jack(sprintf("intime_pooled_%d_jackv1", ft), fake_msyn_both(ft))
  committed <- fread(sprintf("Results/csv/intime_placebo_pooled%d.csv", ft))
  committed <- committed[estimator == "multisynth"]
  gate(abs(r[["att"]] - committed$att) < 1e-8,
       sprintf("pooled fake-%d multisynth ATT reproduces committed (%.10f vs %.10f)",
               ft, r[["att"]], committed$att))
  data.table(fake_t0 = ft, estimator = "multisynth", att = r[["att"]],
             se_boot = committed$se, se_jack = r[["se_jack"]],
             se_boot_rerun = r[["se_boot"]])
}))
placebo_jack[, `:=`(pct = exp(att) - 1, t_boot = att / se_boot,
                    t_jack = att / se_jack,
                    reject_jack_5pct = as.integer(abs(att / se_jack) > 1.96))]
wcsv(placebo_jack, "intime_pooled_jack")
print(placebo_jack[, .(fake_t0, att = round(att, 4), t_boot = round(t_boot, 2),
                       t_jack = round(t_jack, 2), reject_jack_5pct)])

# ---- Paired power draws: bootstrap + jackknife SEs per draw ------------------
# draw_data() / draw_data_phased() are verbatim from 09 so the per-draw RNG
# call sequence is identical.
draw_data <- function(delta) {
  pseudo <- sample(NEVER_FIPS, K)
  t0s <- sample(T0_VEC)
  donors <- setdiff(NEVER_FIPS, pseudo)
  dat <- make_est_data(pseudo, donors, t0_map = setNames(t0s, pseudo))
  if (delta != 0) dat <- inject_delta(dat, pseudo, t0s, delta)
  list(dat = dat, pseudo = pseudo, t0s = t0s, donors = donors)
}

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

fit_both <- function(d) {
  tryCatch({
    msyn <- multisynth(lny ~ trt, fips, year, d$dat, n_leads = N_LEADS_PRIMARY)
    both_summaries(msyn)
  }, error = function(e) c(att = NA_real_, se_boot = NA_real_,
                           se_jack = NA_real_))
}

sim_one_jack <- function(i, est_name, delta) {
  d <- draw_data(delta)
  r <- fit_both(d)
  data.table(draw = i, att = r[["att"]], se_boot = r[["se_boot"]],
             se_jack = r[["se_jack"]])
}

sim_one_phased_jack <- function(i, est_name, delta) {
  d <- draw_data_phased(delta)
  r <- fit_both(d)
  data.table(draw = i, att = r[["att"]], se_boot = r[["se_boot"]],
             se_jack = r[["se_jack"]])
}

power_cell_jack <- function(delta, n_draws, sim_fun = sim_one_jack, key) {
  cell <- run_cached_jack(key, {
    plan(multisession, workers = 6)
    on.exit(plan(sequential))
    rbindlist(future_map(
      seq_len(n_draws), sim_fun, est_name = "multisynth", delta = delta,
      .options = furrr_options(seed = SEED,
                               packages = c("augsynth", "synthdid", "gsynth",
                                            "did", "data.table"))))
  })
  na_rate <- mean(is.na(cell$att))
  if (na_rate > 0.2) stop(sprintf(
    "jack power cell delta=%g: %.0f%% of draws failed — investigate, do not cache-and-continue",
    delta, 100 * na_rate))
  if (na_rate > 0) message(sprintf("  note: d=%g had %d failed draws",
                                   delta, sum(is.na(cell$att))))
  cell
}

# Reference draws for the pairing check.
PD_REF <- fread("Results/csv/power_draws.csv")[
  estimator %in% c("multisynth", "multisynth_phased")]
PD_REF[, dkey := sprintf("%g", delta)]

check_pairing <- function(cell, est_label, dl) {
  ref <- PD_REF[estimator == est_label & dkey == sprintf("%g", dl),
                .(draw, att_ref = att, se_ref = se)]
  m <- merge(cell, ref, by = "draw")
  gate(nrow(m) == nrow(cell),
       sprintf("pairing %s d=%g: all %d draws present in committed power_draws.csv",
               est_label, dl, nrow(cell)))
  gate(sum(is.na(m$att) != is.na(m$att_ref)) == 0,
       sprintf("pairing %s d=%g: identical NA pattern", est_label, dl),
       diag = m[is.na(att) != is.na(att_ref)])
  d_att <- max(abs(m$att - m$att_ref), na.rm = TRUE)
  d_se <- max(abs(m$se_boot - m$se_ref), na.rm = TRUE)
  gate(d_att < 1e-8 && d_se < 1e-8,
       sprintf("pairing %s d=%g: att and bootstrap SE match committed (max|d_att|=%.1e, max|d_se|=%.1e)",
               est_label, dl, d_att, d_se),
       diag = head(m[abs(att - att_ref) >= 1e-8 | abs(se_boot - se_ref) >= 1e-8], 5))
}

# ---- Pilot + budget (pre-stated degrade order) ------------------------------
JACK_BUDGET_SECS <- 90 * 60
pilot_jack <- run_cached_jack("power_jack_pilot_jackv1", {
  set.seed(SEED)
  t1 <- Sys.time()
  for (i in 1:4) invisible(sim_one_jack(i, "multisynth", -0.05))
  data.table(estimator = "multisynth_jack",
             secs_per_draw = as.numeric(difftime(Sys.time(), t1,
                                                 units = "secs")) / 4)
})
print(pilot_jack)
spd_jack <- pilot_jack$secs_per_draw

N_JACK <- 400
DELTAS_JACK <- c(0, -0.02, -0.05, -0.08, -0.12)
n_cells <- function() length(DELTAS_JACK) + 1  # + phased cell
proj <- n_cells() * N_JACK * spd_jack / 6
budget_log <- data.table(
  decision = "full jackknife arm: 5 deltas + phased, paired to committed draws",
  secs_per_draw = round(spd_jack, 2), projected_min = round(proj / 60, 1),
  n_draws = N_JACK, deltas = paste(DELTAS_JACK, collapse = " "))
# Pre-stated degrade order: (1) 400 -> 200 draws per cell (FIRST 200 indices,
# pairing preserved by furrr per-element seeding), (2) drop the -12% cell.
if (proj > JACK_BUDGET_SECS) {
  N_JACK <- 200
  proj <- n_cells() * N_JACK * spd_jack / 6
  budget_log <- rbind(budget_log, data.table(
    decision = "degrade 1: draws 400 -> 200 per cell (first 200 indices)",
    secs_per_draw = round(spd_jack, 2), projected_min = round(proj / 60, 1),
    n_draws = N_JACK, deltas = paste(DELTAS_JACK, collapse = " ")))
}
if (proj > JACK_BUDGET_SECS) {
  DELTAS_JACK <- c(0, -0.02, -0.05, -0.08)
  proj <- n_cells() * N_JACK * spd_jack / 6
  budget_log <- rbind(budget_log, data.table(
    decision = "degrade 2: drop delta -12% cell",
    secs_per_draw = round(spd_jack, 2), projected_min = round(proj / 60, 1),
    n_draws = N_JACK, deltas = paste(DELTAS_JACK, collapse = " ")))
}
wcsv(budget_log, "power_jack_budget_log")
message(sprintf("Projected jackknife power-sim wall time: %.1f min (budget %.0f min)",
                proj / 60, JACK_BUDGET_SECS / 60))

# ---- Run cells, pairing-check each as soon as it completes ------------------
cells <- list()
for (dl in DELTAS_JACK) {
  cell <- power_cell_jack(dl, N_JACK,
                          key = sprintf("power_multisynth_jack_d%g_n%d_jackv1",
                                        dl * 100, N_JACK))
  check_pairing(cell, "multisynth", dl)
  cells[[paste("multisynth", dl)]] <-
    cbind(estimator = "multisynth", delta = dl, cell)
}
cell_ph <- power_cell_jack(-0.05, N_JACK, sim_fun = sim_one_phased_jack,
                           key = sprintf("power_multisynth_phased_jack_d-5_n%d_jackv1",
                                         N_JACK))
check_pairing(cell_ph, "multisynth_phased", -0.05)
cells[["multisynth_phased -0.05"]] <-
  cbind(estimator = "multisynth_phased", delta = -0.05, cell_ph)

draws_jack <- rbindlist(cells)
wcsv(draws_jack, "power_draws_jack")

# ---- Three rejection rules: size, power, MDE --------------------------------
ri_thresh_tab <- fread("Results/csv/power_ri_thresholds.csv")
ri_ms <- ri_thresh_tab[estimator == "multisynth", ri_thresh]
# As in 09, the phased cell is judged against the multisynth delta = 0
# threshold (same estimator and design; it has no zero-delta counterpart).
draws_jack[, ri_thresh := ri_ms]

results3 <- draws_jack[, .(
  n_ok = sum(!is.na(att)),
  reject_boot = mean(abs(att / se_boot) > 1.96, na.rm = TRUE),
  reject_jack = mean(abs(att / se_jack) > 1.96, na.rm = TRUE),
  reject_ri = mean(abs(att) > ri_thresh, na.rm = TRUE),
  mean_att = mean(att, na.rm = TRUE),
  sd_att = sd(att, na.rm = TRUE),
  mean_se_boot = mean(se_boot, na.rm = TRUE),
  mean_se_jack = mean(se_jack, na.rm = TRUE)), by = .(estimator, delta)]
results3[, `:=`(ratio_boot = mean_se_boot / sd_att,
                ratio_jack = mean_se_jack / sd_att)]

# Consistency checks (pure-delta multisynth cells).
pure <- results3[estimator == "multisynth"]
committed_pr <- fread("Results/csv/power_results.csv")[estimator == "multisynth"]
pr_chk <- merge(pure[, .(delta, reject_boot, reject_ri)],
                committed_pr[, .(delta, reject_se_ref = reject_se,
                                 reject_ri_ref = reject_ri)], by = "delta")
if (N_JACK == 400) {
  gate(max(abs(pr_chk$reject_boot - pr_chk$reject_se_ref)) < 1e-12 &&
         max(abs(pr_chk$reject_ri - pr_chk$reject_ri_ref)) < 1e-12,
       "reject_boot and reject_ri reproduce committed power_results.csv exactly",
       diag = pr_chk)
} else {
  gate(all(pr_chk$reject_boot == 0),
       "reject_boot is zero in every cell (committed zeros hold on the paired subset)",
       diag = pr_chk)
}
gate(abs(pure[delta == 0, reject_ri] -
           committed_pr[delta == 0, reject_ri]) < 1e-12 || N_JACK != 400,
     sprintf("reject_ri at delta = 0 equals committed 0.05 (found %.4f)",
             pure[delta == 0, reject_ri]))
gate(max(pure$sd_att) - min(pure$sd_att) < 1e-12,
     sprintf("sd(att) identical across delta cells (range %.1e) — shift-equivariance",
             max(pure$sd_att) - min(pure$sd_att)))
jack_rel_range <- (max(pure$mean_se_jack) - min(pure$mean_se_jack)) /
  mean(pure$mean_se_jack)
gate(jack_rel_range < 1e-6,
     sprintf("mean jackknife SE constant across delta (rel. range %.1e) — shift-invariance",
             jack_rel_range),
     diag = pure[, .(delta, mean_se_jack)])
# power_jackknife_diag.csv's "jackknife" SE was in fact the bootstrap SE; on
# paired draws the recomputed bootstrap mean must equal it.
committed_diag <- fread("Results/csv/power_jackknife_diag.csv")
if (N_JACK == 400) {
  dg <- merge(pure[, .(delta, mean_se_boot)],
              committed_diag[, .(delta, mean_jack_se)], by = "delta")
  gate(max(abs(dg$mean_se_boot - dg$mean_jack_se)) < 1e-10,
       "mean bootstrap SE by delta equals committed power_jackknife_diag.csv mean_jack_se (the committed 'jackknife' diagnostic was the bootstrap)",
       diag = dg)
}
wcsv(results3, "power_results_3rules")
wcsv(results3[, .(estimator, delta, sd_att, mean_se_boot, mean_se_jack,
                  ratio_boot, ratio_jack)], "power_se_diag_3rules")

# MDE at 80% power for the three rules, same interpolation as 09's mde_for().
mde_from <- function(col) {
  pc <- pure[!is.na(get(col))][order(-delta)]
  if (nrow(pc) < 2 || max(pc[[col]]) < 0.8) NA_real_ else
    approx(pc[[col]], pc$delta, xout = 0.8, ties = "ordered")$y
}
base_gal <- PANEL[beverage == "total" & fips %in% cf & year == 2013,
                  mean(pc_eth21)]
gate(abs(base_gal - 2.83678) < 1e-4,
     sprintf("baseline 2013 clean-fit gal/adult = 2.83678 (found %.5f)", base_gal))
drinks <- function(m) abs(m) * base_gal * 128 / 0.6 / 12
mde3 <- data.table(rule = c("default_bootstrap", "jackknife", "ri_calibrated"),
                   mde_delta = c(mde_from("reject_boot"),
                                 mde_from("reject_jack"),
                                 mde_from("reject_ri")))
mde3[, mde_drinks_per_month := drinks(mde_delta)]
mde3[, baseline_gal_ethanol_21 := base_gal]
if (N_JACK == 400) {
  committed_mde <- fread("Results/csv/power_mde.csv")
  gate(abs(mde3[rule == "ri_calibrated", mde_delta] -
             committed_mde[rule == "ri_calibrated", mde_delta]) < 1e-10,
       "RI-calibrated MDE reproduces committed power_mde.csv")
}
wcsv(mde3, "power_mde_3rules")

# ---- Environment / provenance record ----------------------------------------
total_min <- as.numeric(difftime(Sys.time(), T_SCRIPT_START, units = "mins"))
wcsv(data.table(
  augsynth_version = aug_ver, augsynth_sha = aug_sha,
  default_inf_type = default_inf, r_version = R.version.string,
  seed = SEED, n_draws_per_cell = N_JACK,
  deltas_run = paste(DELTAS_JACK, collapse = " "),
  n_degrade_decisions = nrow(budget_log) - 1L,
  total_wall_min = round(total_min, 1)), "jackknife_env")

print(results3)
print(mde3)
message(sprintf(
  "Jackknife size at delta=0: %.3f | jackknife MDE: %s | RI MDE: %.4f | total wall: %.1f min",
  pure[delta == 0, reject_jack],
  ifelse(is.na(mde3[rule == "jackknife", mde_delta]), "beyond grid",
         sprintf("%.4f", mde3[rule == "jackknife", mde_delta])),
  mde3[rule == "ri_calibrated", mde_delta], total_min))
