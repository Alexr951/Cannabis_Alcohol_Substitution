# 12_power_screen.R — the pre-specified fit screen applied inside the
# simulation draws (standalone; not part of run_all.R). 08 and 09 draw
# pseudo-treated states without reapplying the screen of 01. This script
# reproduces the pseudo-treated identities of every committed power draw and
# RI draw via the same furrr per-draw seed streams (the mechanism 11 already
# validated), screens each pseudo-treated state with the donor-placebo RMSPE
# statistic of 01, refits the primary estimator on the surviving states for
# the affected draws, and recomputes the three rejection rules, the MDE, and
# the RI p-value. Identity reproduction is asserted by refitting spot draws
# and matching the committed point estimates to 1e-8. New cache keys (_scrv1)
# and new CSVs only; nothing committed is touched.
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

run_cached_scr <- function(name, expr) {
  path <- file.path("Results", "cache", paste0(name, ".rds"))
  if (file.exists(path)) {
    message("[cache] ", name)
    return(readRDS(path))
  }
  t_start <- Sys.time()
  val <- force(expr)
  secs <- as.numeric(difftime(Sys.time(), t_start, units = "secs"))
  saveRDS(val, path)
  log_path <- file.path("Results", "cache", "timings_screen.csv")
  tl <- if (file.exists(log_path)) fread(log_path) else
    data.table(step = character(), seconds = numeric())
  tl <- rbind(tl[step != name], data.table(step = name, seconds = round(secs, 1)))
  fwrite(tl, log_path)
  message(sprintf("[run ] %s: %.1fs", name, secs))
  val
}

cf <- clean_fit_set()
T0_VEC <- unname(sapply(cf, function(f) T0_MAP[[as.character(f)]]))
K <- length(cf)

# ---- Environment check (same requirement as 11) ------------------------------
aug_ver <- as.character(packageVersion("augsynth"))
gate(aug_ver == "0.2.0", sprintf("augsynth version is 0.2.0 (found %s)", aug_ver))

# ---- Donor-placebo RMSPE table (the statistic of 01, code copied verbatim) ---
scm_pre_rmspe <- function(f, t0, donors) {
  dat <- make_est_data(f, donors, t0_map = setNames(t0, f))
  asyn <- augsynth(lny ~ trt, fips, year, dat,
                   progfunc = "None", scm = TRUE, fixedeff = FALSE)
  att <- summary(asyn, inf_type = "jackknife+")$att
  pre_gap <- att[att$Time < t0 & !is.na(att$Time), "Estimate"]
  sqrt(mean(pre_gap^2))
}

T0_GRID <- sort(unique(T0_VEC))
rmspe_tab <- run_cached_scr("screen_rmspe_scrv1", {
  plan(multisession, workers = 6)
  on.exit(plan(sequential))
  rbindlist(lapply(T0_GRID, function(t0g) {
    vals <- unlist(future_map(
      NEVER_FIPS,
      function(d) tryCatch(scm_pre_rmspe(d, t0g, setdiff(NEVER_FIPS, d)),
                           error = function(e) NA_real_),
      .options = furrr_options(seed = SEED, packages = c("augsynth", "data.table"))))
    data.table(t0 = t0g, fips = NEVER_FIPS, rmspe = vals)
  }))
})

# The medians must reproduce the committed donor_placebo_median_rmspe of 01
# (rounded to 5 digits there) for the treated states sharing these T0s.
rules <- fread("Results/csv/sample_rules.csv")
for (t0g in T0_GRID) {
  med_here <- median(rmspe_tab[t0 == t0g, rmspe], na.rm = TRUE)
  med_ref <- rules[t0 == t0g, donor_placebo_median_rmspe][1]
  gate(abs(round(med_here, 5) - med_ref) < 1e-5,
       sprintf("donor placebo median at T0=%d reproduces 01 (%.5f vs %.5f)",
               t0g, med_here, med_ref))
}

# Screen rule for a pseudo-treated donor d at assigned T0: same criterion as
# 01 (RMSPE <= 2 x median of the identically fitted donor placebos), with the
# benchmark median taken over the other donors.
med_others <- rmspe_tab[, .(fips = fips,
                            med_oth = sapply(seq_len(.N), function(k)
                              median(rmspe[-k], na.rm = TRUE))), by = t0]
rmspe_tab <- merge(rmspe_tab, med_others, by = c("t0", "fips"))
rmspe_tab[, fails := as.integer(is.na(rmspe) | rmspe > 2 * med_oth)]
wcsv(rmspe_tab, "screen_rmspe_donors")
message(sprintf("failing donor-T0 cells: %d of %d",
                sum(rmspe_tab$fails), nrow(rmspe_tab)))

# ---- Reproduce the pseudo-treated identities of 09 and 08 --------------------
# Within a draw the first two RNG consumers are sample(NEVER_FIPS, K) and
# sample(T0_VEC); furrr_options(seed = SEED) gives each draw index its own
# stream, so these calls reproduce the committed draws' identities without
# refitting anything.
ident_one <- function(i, est_name, delta) {
  pseudo <- sample(NEVER_FIPS, K)
  t0s <- sample(T0_VEC)
  data.table(draw = i, fips = pseudo, t0 = t0s)
}

ident_cell <- function(n_draws) {
  plan(multisession, workers = 6)
  on.exit(plan(sequential))
  rbindlist(future_map(seq_len(n_draws), ident_one, est_name = "multisynth",
                       delta = 0,
                       .options = furrr_options(seed = SEED,
                                                packages = "data.table")))
}

DELTAS <- c(0, -0.02, -0.05, -0.08, -0.12)
N_POWER <- 400L
N_RI <- 500L

idents <- run_cached_scr("screen_idents_scrv1", {
  po <- ident_cell(N_POWER)   # one cell; identical streams for every delta cell
  ri <- ident_cell(N_RI)
  list(power = po, ri = ri)
})
# 09 ran the identical future_map(seq_len(400), ...) construction for every
# delta cell, so the pseudo sets are the same across cells by construction;
# the RI script mapped seq_len(500) the same way.

idents$power <- merge(idents$power,
                      rmspe_tab[, .(t0, fips, fails)], by = c("t0", "fips"),
                      sort = FALSE)[order(draw)]
idents$ri <- merge(idents$ri,
                   rmspe_tab[, .(t0, fips, fails)], by = c("t0", "fips"),
                   sort = FALSE)[order(draw)]

# ---- Committed per-draw results ----------------------------------------------
draws_jack <- fread("Results/csv/power_draws_jack.csv")
ri_null <- fread("Results/csv/ri_null_dist.csv")

# ---- Refit machinery ----------------------------------------------------------
fit_screened <- function(ids_draw, delta, phased = FALSE) {
  surv <- ids_draw[fails == 0]
  if (nrow(surv) == 0) {
    return(data.table(att = NA_real_, se_boot = NA_real_, se_jack = NA_real_,
                      k_surv = 0L))
  }
  donors <- setdiff(NEVER_FIPS, ids_draw$fips)   # dropped states leave entirely
  dat <- make_est_data(surv$fips, donors,
                       t0_map = setNames(surv$t0, surv$fips))
  if (delta != 0) {
    if (phased) {
      for (r in seq_len(nrow(surv))) {
        dat[fips == surv$fips[r] & year >= surv$t0[r],
            lny := lny + log(1 + delta) *
              pmin(1, (year - surv$t0[r] + 1) / 3)]
      }
    } else {
      dat <- inject_delta(dat, surv$fips, surv$t0, delta)
    }
  }
  tryCatch({
    msyn <- multisynth(lny ~ trt, fips, year, dat, n_leads = N_LEADS_PRIMARY)
    sb <- suppressWarnings(summary(msyn))$att
    sb <- sb[is.na(sb$Time) & sb$Level == "Average", ]
    sj <- tryCatch({
      x <- suppressWarnings(summary(msyn, inf_type = "jackknife"))$att
      x[is.na(x$Time) & x$Level == "Average", "Std.Error"]
    }, error = function(e) NA_real_)
    data.table(att = sb$Estimate, se_boot = sb$Std.Error,
               se_jack = as.numeric(sj), k_surv = nrow(surv))
  }, error = function(e) data.table(att = NA_real_, se_boot = NA_real_,
                                    se_jack = NA_real_, k_surv = nrow(surv)))
}

# ---- Gate: spot refits of unaffected full draws reproduce committed ----------
spot_check <- run_cached_scr("screen_spotcheck_scrv1", {
  res <- list()
  for (dl in c(0, -0.05)) {
    committed <- draws_jack[estimator == "multisynth" & delta == dl]
    for (i in c(1L, 200L, 400L)) {
      ids <- idents$power[draw == i]
      full <- copy(ids)[, fails := 0L]         # refit all five, no screen
      set.seed(SEED)
      r <- fit_screened(full, dl)
      res[[length(res) + 1]] <- data.table(
        delta = dl, draw = i, att = r$att,
        att_ref = committed[draw == i, att])
    }
  }
  rbindlist(res)
})
gate(max(abs(spot_check$att - spot_check$att_ref)) < 1e-8,
     sprintf("identity reproduction: %d spot refits match committed draws (max diff %.1e)",
             nrow(spot_check), max(abs(spot_check$att - spot_check$att_ref))),
     diag = spot_check)
ri_spot <- run_cached_scr("screen_rispot_scrv1", {
  res <- list()
  for (i in c(1L, 250L, 500L)) {
    ids <- idents$ri[draw == i]
    full <- copy(ids)[, fails := 0L]
    set.seed(SEED)
    r <- fit_screened(full, 0)
    res[[length(res) + 1]] <- data.table(draw = i, att = r$att,
                                         att_ref = ri_null[draw == i, null_att])
  }
  rbindlist(res)
})
gate(max(abs(ri_spot$att - ri_spot$att_ref)) < 1e-8,
     sprintf("RI identity reproduction: %d spot refits match (max diff %.1e)",
             nrow(ri_spot), max(abs(ri_spot$att - ri_spot$att_ref))),
     diag = ri_spot)

# ---- Screened power cells ------------------------------------------------------
affected_draws <- idents$power[, .(n_fail = sum(fails)), by = draw][n_fail > 0, draw]
message(sprintf("power draws with at least one failing state: %d of %d (%.0f%%)",
                length(affected_draws), N_POWER,
                100 * length(affected_draws) / N_POWER))

refit_cell <- function(delta, phased = FALSE, key) {
  run_cached_scr(key, {
    plan(multisession, workers = 6)
    on.exit(plan(sequential))
    rbindlist(future_map(
      affected_draws,
      function(i) {
        set.seed(SEED + i)
        cbind(data.table(draw = i), fit_screened(idents$power[draw == i],
                                                 delta, phased))
      },
      .options = furrr_options(seed = SEED,
                               packages = c("augsynth", "data.table"))))
  })
}

screened_cell <- function(dlt, phased = FALSE) {
  est <- if (phased) "multisynth_phased" else "multisynth"
  committed <- draws_jack[estimator == est & delta == dlt]
  key <- sprintf("screen_refit_%s_d%g_scrv1", est, dlt)
  refits <- refit_cell(dlt, phased, key)
  out <- merge(committed[, .(draw, att, se_boot, se_jack)],
               refits[, .(draw, att_s = att, se_boot_s = se_boot,
                          se_jack_s = se_jack, k_surv)],
               by = "draw", all.x = TRUE)
  out[, screened := as.integer(!is.na(k_surv))]
  out[, `:=`(att_f = fifelse(screened == 1, att_s, att),
             se_boot_f = fifelse(screened == 1, se_boot_s, se_boot),
             se_jack_f = fifelse(screened == 1, se_jack_s, se_jack))]
  cbind(estimator = est, delta = dlt, out)
}

cells <- rbindlist(c(lapply(DELTAS, screened_cell),
                     list(screened_cell(-0.05, phased = TRUE))))
wcsv(cells[, .(estimator, delta, draw, screened, k_surv,
               att_screened = att_f, se_boot_screened = se_boot_f,
               se_jack_screened = se_jack_f)], "power_draws_screened")

# Rejection rules on the screened draws (thresholds re-derived at delta = 0).
ms0 <- cells[estimator == "multisynth" & delta == 0 & !is.na(att_f)]
thr_ri <- quantile(abs(ms0$att_f), 0.95, names = FALSE)
res_scr <- cells[!is.na(att_f), .(
  n_ok = .N,
  n_screened = sum(screened),
  reject_boot = mean(abs(att_f / se_boot_f) > 1.96, na.rm = TRUE),
  reject_jack = mean(abs(att_f / se_jack_f) > 1.96, na.rm = TRUE),
  reject_ri = mean(abs(att_f) > thr_ri),
  mean_att = mean(att_f)), by = .(estimator, delta)]
wcsv(res_scr, "power_results_screened")
print(res_scr)

# MDE, same interpolation as 09's mde_for().
mde_scr <- function(col) {
  pc <- res_scr[estimator == "multisynth"][order(-delta)]
  if (max(pc[[col]]) < 0.8) NA_real_ else
    approx(pc[[col]], pc$delta, xout = 0.8, ties = "ordered")$y
}
committed_mde <- fread("Results/csv/power_mde_3rules.csv")
base_gal <- committed_mde$baseline_gal_ethanol_21[1]
drinks <- function(m) abs(m) * base_gal * 128 / 0.6 / 12
mde_tab <- data.table(rule = c("default_bootstrap", "jackknife", "ri_calibrated"),
                      mde_delta = c(mde_scr("reject_boot"), mde_scr("reject_jack"),
                                    mde_scr("reject_ri")))
mde_tab[, mde_drinks_per_month := drinks(mde_delta)]
mde_tab[, baseline_gal_ethanol_21 := base_gal]
wcsv(mde_tab, "power_mde_screened")
print(mde_tab)

# ---- Screened RI null -----------------------------------------------------------
ri_affected <- idents$ri[, .(n_fail = sum(fails)), by = draw][n_fail > 0, draw]
message(sprintf("RI draws with at least one failing state: %d of %d",
                length(ri_affected), N_RI))
ri_refits <- run_cached_scr("screen_refit_ri_scrv1", {
  plan(multisession, workers = 6)
  on.exit(plan(sequential))
  rbindlist(future_map(
    ri_affected,
    function(i) {
      set.seed(SEED + i)
      cbind(data.table(draw = i), fit_screened(idents$ri[draw == i], 0))
    },
    .options = furrr_options(seed = SEED,
                             packages = c("augsynth", "data.table"))))
})
ri_scr <- merge(ri_null, ri_refits[, .(draw, att_s = att)], by = "draw",
                all.x = TRUE)
ri_scr[, att_f := fifelse(!is.na(att_s), att_s, null_att)]
obs <- fread("Results/csv/multisynth_overall.csv")[state == "Average", Estimate]
null_ok <- ri_scr[!is.na(att_f), att_f]
p_scr <- mean(abs(null_ok) >= abs(obs))
wcsv(data.table(observed_att = obs, n_draws = length(null_ok),
                n_screened = length(ri_affected), p_two_sided = p_scr,
                null_sd = sd(null_ok), null_mean = mean(null_ok)),
     "ri_pooled_screened")
message(sprintf("screened RI: p = %.3f (committed %.3f) | null sd %.4f mean %.4f",
                p_scr, fread("Results/csv/ri_pooled.csv")$p_two_sided,
                sd(null_ok), mean(null_ok)))

# ---- Summary --------------------------------------------------------------------
fail_states <- rmspe_tab[fails == 1,
                         .(state = FIPS_STATE[as.character(fips)], t0)][order(t0)]
wcsv(data.table(
  n_power_draws = N_POWER,
  n_power_affected = length(affected_draws),
  share_power_affected = length(affected_draws) / N_POWER,
  n_ri_affected = length(ri_affected),
  share_ri_affected = length(ri_affected) / N_RI,
  n_fail_cells = sum(rmspe_tab$fails),
  n_donor_t0_cells = nrow(rmspe_tab),
  total_wall_min = round(as.numeric(difftime(Sys.time(), T_SCRIPT_START,
                                             units = "mins")), 1)),
  "screen_summary")
print(fail_states)
message(sprintf("total wall time: %.1f min",
                as.numeric(difftime(Sys.time(), T_SCRIPT_START, units = "mins"))))
