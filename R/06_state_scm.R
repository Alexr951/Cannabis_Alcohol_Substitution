# 06_state_scm.R — descriptive state-by-state section: classic SCM and
# ridge-augmented SCM (augsynth) for every primary treated state, plus
# conformal prediction intervals (Chernozhukov, Wuthrich & Zhu 2021; scpi,
# Cattaneo et al.) for the clean-fit states. Donor weights exported for the
# appendix.
source("R/helpers.R")
suppressPackageStartupMessages({library(augsynth); library(scpi)})
set.seed(SEED)

state_fits <- run_cached("state_scm_all", {
  out <- list(); wts <- list(); gaps <- list()
  for (f in PRIMARY_TREATED$fips) {
    t0 <- T0_MAP[[as.character(f)]]
    dat <- make_est_data(f, NEVER_FIPS)
    for (pf in c("None", "Ridge")) {
      a <- augsynth(lny ~ trt, fips, year, dat,
                    progfunc = pf, scm = TRUE, fixedeff = FALSE)
      s <- summary(a, inf_type = "jackknife+")
      att <- as.data.table(s$att)
      lbl <- ifelse(pf == "None", "classic_scm", "ridge_ascm")
      pre <- att[Time < t0 & !is.na(Time), Estimate]
      out[[paste(f, pf)]] <- data.table(
        fips = f, state = FIPS_STATE[[as.character(f)]], t0 = t0,
        estimator = lbl, att = s$average_att$Estimate[1],
        pre_rmspe = sqrt(mean(pre^2)))
      gaps[[paste(f, pf)]] <- data.table(
        fips = f, state = FIPS_STATE[[as.character(f)]], estimator = lbl,
        year = att$Time, gap = att$Estimate)
      if (pf == "None") {
        w <- data.table(treated_fips = f,
                        treated = FIPS_STATE[[as.character(f)]],
                        donor_fips = as.integer(rownames(a$weights)),
                        weight = round(as.numeric(a$weights), 4))
        w[, donor := FIPS_STATE[as.character(donor_fips)]]
        wts[[as.character(f)]] <- w[weight > 0.001]
      }
    }
  }
  list(att = rbindlist(out), weights = rbindlist(wts), gaps = rbindlist(gaps))
})
state_att <- state_fits$att
state_att[, pct := exp(att) - 1]
wcsv(state_att, "state_scm_att")
wcsv(state_fits$weights, "state_scm_weights")
wcsv(state_fits$gaps, "state_scm_gaps")

# Conformal prediction intervals (clean-fit states only; runtime-bounded).
scpi_one <- function(f) {
  t0 <- T0_MAP[[as.character(f)]]
  pp <- as.data.frame(PANEL[beverage == "total" & year %in% PRIMARY_YEARS &
                              fips %in% c(f, NEVER_FIPS)])
  scd <- scdata(df = pp, id.var = "state", time.var = "year",
                outcome.var = "log_pc_eth21",
                period.pre = 2000:(t0 - 1), period.post = t0:2019,
                unit.tr = FIPS_STATE[[as.character(f)]],
                unit.co = unname(FIPS_STATE[as.character(NEVER_FIPS)]))
  res <- scpi(scd, w.constr = list(name = "simplex"), u.missp = TRUE,
              sims = 200, e.method = "gaussian", u.order = 1, u.lags = 0,
              e.order = 1, e.lags = 0, cores = 6, verbose = FALSE)
  y_post <- res$data$Y.post
  fit_post <- res$est.results$Y.post.fit
  ci <- res$inference.results$CI.all.gaussian
  data.table(fips = f, state = FIPS_STATE[[as.character(f)]],
             year = t0:2019,
             gap = as.numeric(y_post - fit_post),
             gap_lo = as.numeric(y_post - ci[, "Right Bound"]),
             gap_hi = as.numeric(y_post - ci[, "Left Bound"]))
}

scpi_res <- run_cached("scpi_conformal", {
  rbindlist(lapply(clean_fit_set(), scpi_one))
})
wcsv(scpi_res, "scpi_conformal")

print(dcast(state_att, state + t0 ~ estimator, value.var = "pct"))
avg_pi <- scpi_res[, .(avg_gap = round(mean(gap), 4),
                       lo = round(min(gap_lo), 4), hi = round(max(gap_hi), 4)),
                   by = state]
print(avg_pi)
