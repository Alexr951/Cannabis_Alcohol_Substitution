# 01_sample_rules.R — pre-specified sample inclusion rules, applied uniformly
# BEFORE any treatment-effect estimation (only pre-period fit information used):
#   (a) Fit-quality rule (primary): a treated state enters the pooled sample iff
#       its classic-SCM pre-period RMSPE (outcome-only match, never-treated
#       donors, 2000-2019 window) <= 2 x the median pre-RMSPE of in-space donor
#       placebos fitted identically at the same T0 (Abadie 2021 JEL fit
#       guidance; threshold fixed ex ante). An own-SD normalization
#       (RMSPE <= 0.5 x SD of own pre-period outcome) is reported alongside as
#       a diagnostic — it mechanically penalizes flat series, so it is not the
#       inclusion criterion; both are shown in the memo.
#   (b) Washington structural-break rule: Chow forecast test (1% level) for
#       2012-13 in WA's donor-demeaned log total ethanol, 2000-2013 (June 2012
#       liquor privatization). Rejection excludes WA from the primary sample.
source("R/helpers.R")
suppressPackageStartupMessages(library(augsynth))
set.seed(SEED)

scm_pre_rmspe <- function(f, t0, donors) {
  dat <- make_est_data(f, donors, t0_map = setNames(t0, f))
  asyn <- augsynth(lny ~ trt, fips, year, dat,
                   progfunc = "None", scm = TRUE, fixedeff = FALSE)
  att <- summary(asyn, inf_type = "jackknife+")$att
  pre_gap <- att[att$Time < t0 & !is.na(att$Time), "Estimate"]
  sqrt(mean(pre_gap^2))
}

rule_one_state <- function(f) {
  t0 <- T0_MAP[[as.character(f)]]
  pre_rmspe <- scm_pre_rmspe(f, t0, NEVER_FIPS)
  # In-space placebo benchmark: each never-treated donor fitted as if treated
  # at the same T0, using the remaining donors.
  plac <- sapply(NEVER_FIPS, function(d)
    tryCatch(scm_pre_rmspe(d, t0, setdiff(NEVER_FIPS, d)), error = function(e) NA))
  med_plac <- median(plac, na.rm = TRUE)
  dat <- make_est_data(f, NEVER_FIPS)
  sd_pre <- sd(dat[fips == f & year < t0, lny])
  data.table(fips = f, state = FIPS_STATE[[as.character(f)]], t0 = t0,
             pre_rmspe = round(pre_rmspe, 5),
             donor_placebo_median_rmspe = round(med_plac, 5),
             rel_to_placebo = round(pre_rmspe / med_plac, 3),
             passes_fit = as.integer(pre_rmspe <= 2 * med_plac),
             sd_pre_outcome = round(sd_pre, 5),
             ratio_own_sd = round(pre_rmspe / sd_pre, 3),
             passes_own_sd_diag = as.integer(pre_rmspe <= 0.5 * sd_pre))
}

rules <- run_cached("sample_rules_v2", {
  rbindlist(lapply(PRIMARY_TREATED$fips, rule_one_state))
})

# (b) WA Chow forecast test on donor-demeaned series, 2000-2013, break 2012.
wa_chow <- run_cached("wa_chow", {
  res <- list()
  for (bev in c("total", "spirits")) {
    pp <- PANEL[beverage == bev & year %in% 2000:2013]
    donor_mean <- pp[fips %in% NEVER_FIPS, .(dm = mean(log_pc_eth21)), by = year]
    wa <- merge(pp[fips == 53, .(year, lny = log_pc_eth21)], donor_mean, by = "year")
    wa[, w := lny - dm]
    est <- wa[year <= 2011]; hold <- wa[year >= 2012]
    m <- lm(w ~ year, data = est)
    rss1 <- sum(resid(m)^2)
    pred <- predict(m, newdata = hold)
    rss_all <- sum(resid(lm(w ~ year, data = wa))^2)
    n1 <- nrow(est); n2 <- nrow(hold); k <- 2
    f_stat <- ((rss_all - rss1) / n2) / (rss1 / (n1 - k))
    p_val <- pf(f_stat, n2, n1 - k, lower.tail = FALSE)
    res[[bev]] <- data.table(series = bev, f_stat = round(f_stat, 3),
                             p_value = round(p_val, 5),
                             reject_1pct = as.integer(p_val < 0.01))
  }
  rbindlist(res)
})

rules[, chow_excluded := as.integer(fips == 53 & wa_chow[series == "total", reject_1pct] == 1)]
rules[, included := as.integer(passes_fit == 1 & chow_excluded == 0)]
wcsv(rules, "sample_rules")
wcsv(wa_chow, "wa_chow")
print(rules)
print(wa_chow)
message("Clean-fit primary sample: ",
        paste(rules[included == 1, state], collapse = ", "))
