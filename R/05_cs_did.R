# 05_cs_did.R — Callaway & Sant'Anna (2021) group-time ATT (never-treated
# control, multiplier bootstrap, 999 iterations) and TWFE benchmark.
source("R/helpers.R")
suppressPackageStartupMessages({library(did); library(fixest)})
set.seed(SEED)

cf <- clean_fit_set()
dat <- as.data.frame(make_est_data(cf, NEVER_FIPS))
dat$g <- ifelse(dat$fips %in% cf, T0_MAP[as.character(dat$fips)], 0)

cs <- run_cached("cs_did_primary", {
  fit <- att_gt(yname = "lny", tname = "year", idname = "fips", gname = "g",
                data = dat, control_group = "nevertreated", est_method = "reg",
                bstrap = TRUE, biters = 999, base_period = "varying")
  list(simple = aggte(fit, type = "simple", bstrap = TRUE, biters = 999),
       dynamic = aggte(fit, type = "dynamic", bstrap = TRUE, biters = 999))
})

simple <- data.table(estimator = "callaway_santanna",
                     att = cs$simple$overall.att, se = cs$simple$overall.se,
                     biters = 999)
simple[, `:=`(ci_lo = att - 1.96 * se, ci_hi = att + 1.96 * se,
              pct = exp(att) - 1)]

dyn <- data.table(event_time = cs$dynamic$egt, att = cs$dynamic$att.egt,
                  se = cs$dynamic$se.egt, crit_val = cs$dynamic$crit.val.egt)

twfe <- run_cached("twfe_primary", {
  m <- feols(lny ~ trt | fips + year, data = dat, cluster = ~fips)
  data.table(estimator = "twfe", att = coef(m)[["trt"]], se = se(m)[["trt"]],
             biters = NA)
})
twfe[, `:=`(ci_lo = att - 1.96 * se, ci_hi = att + 1.96 * se,
            pct = exp(att) - 1)]

wcsv(rbind(simple, twfe), "cs_twfe_primary")
wcsv(dyn, "cs_eventstudy")
print(rbind(simple, twfe)[, .(estimator, att = round(att, 4),
                              se = round(se, 4), pct = round(pct, 4))])
n_pre_sig <- dyn[event_time < 0 & abs(att / se) > 1.96, .N]
message("CS pre-period event times with |t|>1.96: ", n_pre_sig, " of ",
        dyn[event_time < 0, .N])
