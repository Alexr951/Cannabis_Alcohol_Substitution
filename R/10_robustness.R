# 10_robustness.R — robustness suite, all as variants of the primary
# multisynth specification (clean-fit treated, never-treated donors,
# 2000-2019, log per-capita ethanol 21+) unless stated:
#   1. Spillover: drop donors adjacent to any treated state (Hansen, Miller &
#      Weber 2020).
#   2. Drop high-intensity medical-cannabis donor (Oklahoma, SQ788 2018).
#   3. Timing-adjusted donor pool: add states that legalized after 2019.
#   4. Extension window 2000-2023 (COVID years included, labeled).
#   5. WA spirits-excluded outcome (beer+wine ethanol), single-state ASCM.
#   6. Beverage decomposition: pooled multisynth per beverage with jackknife.
#   7. All-7 treated (AK, NV back in) for comparison with the fit rule.
#   8. Drop New Hampshire from the donor pool: NH's state-run, untaxed liquor
#      sales attract cross-border purchasing and NH carries large weights in
#      several synthetic controls (Appendix weights table).
source("R/helpers.R")
suppressPackageStartupMessages(library(augsynth))
set.seed(SEED)

cf <- clean_fit_set()
TIMING_DONORS <- TREAT[ever_rec_2023 == 1 & (is.na(t0) | t0 > 2019) &
                         primary_treated == 0, fips]

msyn_overall <- function(dat, n_leads = N_LEADS_PRIMARY) {
  msyn <- multisynth(lny ~ trt, fips, year, dat, n_leads = n_leads)
  ov <- summary(msyn)$att
  ov <- as.data.table(ov)[is.na(Time) & Level == "Average"]
  data.table(att = ov$Estimate, se = ov$Std.Error)
}

variants <- run_cached("robustness_variants_v2", {
  res <- list()

  res$primary <- cbind(spec = "primary",
                       msyn_overall(make_est_data(cf, NEVER_FIPS)))

  res$adj <- cbind(spec = "drop_adjacent_donors",
                   msyn_overall(make_est_data(cf, setdiff(NEVER_FIPS, ADJ_DONORS))))

  res$med <- cbind(spec = "drop_oklahoma_medical",
                   msyn_overall(make_est_data(cf, setdiff(NEVER_FIPS, MED_INTENSITY_DONORS))))

  res$nh <- cbind(spec = "drop_new_hampshire",
                  msyn_overall(make_est_data(cf, setdiff(NEVER_FIPS, 33))))

  res$timing <- cbind(spec = "timing_adjusted_pool",
                      msyn_overall(make_est_data(cf, c(NEVER_FIPS, TIMING_DONORS))))

  res$ext <- cbind(spec = "window_2000_2023",
                   msyn_overall(make_est_data(cf, NEVER_FIPS, years = EXT_YEARS),
                                n_leads = 10))

  res$all7 <- cbind(spec = "all_seven_treated",
                    msyn_overall(make_est_data(PRIMARY_TREATED$fips, NEVER_FIPS)))

  for (bev in c("beer", "wine", "spirits")) {
    res[[bev]] <- cbind(spec = paste0("beverage_", bev),
                        msyn_overall(make_est_data(cf, NEVER_FIPS,
                                                   bev_name = bev)))
  }
  rbindlist(res)
})
variants[, `:=`(pct = exp(att) - 1, t_stat = att / se)]
wcsv(variants, "robustness_variants")

# WA spirits-excluded outcome (beer+wine), single-state ridge ASCM.
wa_bw <- run_cached("wa_beer_wine", {
  dat <- make_est_data(53, NEVER_FIPS, bev_name = "beer_wine")
  a <- augsynth(lny ~ trt, fips, year, dat,
                progfunc = "Ridge", scm = TRUE, fixedeff = FALSE)
  s <- summary(a, inf_type = "jackknife+")
  av <- s$average_att
  get_col <- function(nm) if (nm %in% names(av)) av[[nm]][1] else NA_real_
  data.table(spec = "wa_spirits_excluded", att = av$Estimate[1],
             se = get_col("Std.Error"), ci_lo = get_col("lower_bound"),
             ci_hi = get_col("upper_bound"))
})
wa_bw[, `:=`(pct = exp(att) - 1, t_stat = att / se)]
wcsv(wa_bw, "wa_beer_wine")

print(rbind(variants, wa_bw, fill = TRUE)[
  , .(spec, att = round(att, 4), se = round(se, 4),
      pct = round(pct, 4), t = round(t_stat, 2))])
