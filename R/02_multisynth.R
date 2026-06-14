# 02_multisynth.R — PRIMARY estimator: partially-pooled staggered augmented
# SCM (Ben-Michael, Feller & Rothstein 2022), jackknife inference.
# Sample: clean-fit treated states, never-treated donors, 2000-2019,
# log per-capita ethanol (21+), outcome-only matching (Kaul et al. 2022).
source("R/helpers.R")
suppressPackageStartupMessages(library(augsynth))
set.seed(SEED)

cf <- clean_fit_set()
dat <- make_est_data(cf, NEVER_FIPS)

# n_leads set to the maximum post-window (6) so the pooled ATT averages over
# all post periods, matching the post-cell coverage of the other estimators
# (the package default is the balanced minimum, here 2 leads).
fit <- run_cached("multisynth_primary_v2", {
  msyn <- multisynth(lny ~ trt, fips, year, dat, n_leads = N_LEADS_PRIMARY)
  summ <- summary(msyn)
  list(nu = msyn$nu, att = summ$att, n_leads = msyn$n_leads,
       avg_pre_l2 = tryCatch(summ$l2_imbalance, error = function(e) NA))
})

att <- as.data.table(fit$att)
att[, Level := as.character(Level)]
att[Level != "Average", state := FIPS_STATE[Level]]
att[Level == "Average", state := "Average"]
wcsv(att, "multisynth_att")

overall <- att[is.na(Time)]
overall[, `:=`(pct = exp(Estimate) - 1,
               ci_lo = Estimate - 1.96 * Std.Error,
               ci_hi = Estimate + 1.96 * Std.Error)]
wcsv(overall[, .(state, Estimate, Std.Error, ci_lo, ci_hi, pct)],
     "multisynth_overall")

message(sprintf("multisynth nu = %.3f", fit$nu))
print(overall[, .(state, Estimate, Std.Error, pct = round(pct, 4))])
