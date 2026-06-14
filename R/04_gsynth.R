# 04_gsynth.R — Generalized synthetic control / interactive fixed effects
# (Xu 2017) and matrix completion (Athey et al. 2021), via gsynth.
# IFE: factor number chosen by CV over r in 0:5; parametric bootstrap SEs.
# MC: nonparametric bootstrap. nboots = 500 (reported).
source("R/helpers.R")
suppressPackageStartupMessages(library(gsynth))
set.seed(SEED)

cf <- clean_fit_set()
dat <- as.data.frame(make_est_data(cf, NEVER_FIPS))

NBOOTS <- 500

g_ife <- run_cached("gsynth_ife_primary", {
  gsynth(lny ~ trt, data = dat, index = c("fips", "year"),
         force = "two-way", CV = TRUE, r = c(0, 5), se = TRUE,
         inference = "parametric", nboots = NBOOTS, parallel = TRUE,
         cores = 6, seed = SEED)
})

g_mc <- run_cached("gsynth_mc_primary", {
  gsynth(lny ~ trt, data = dat, index = c("fips", "year"),
         force = "two-way", estimator = "mc", CV = TRUE, se = TRUE,
         nboots = NBOOTS, parallel = TRUE, cores = 6, seed = SEED)
})

extract_gsynth <- function(g, label) {
  ea <- g$est.avg
  data.table(estimator = label,
             att = as.numeric(ea[1, "ATT.avg"]),
             se = as.numeric(ea[1, "S.E."]),
             ci_lo = as.numeric(ea[1, "CI.lower"]),
             ci_hi = as.numeric(ea[1, "CI.upper"]),
             p = as.numeric(ea[1, "p.value"]),
             r_or_lambda = if (!is.null(g$r.cv)) g$r.cv else
               if (!is.null(g$lambda.cv)) g$lambda.cv else NA,
             nboots = NBOOTS)
}

res <- rbind(extract_gsynth(g_ife, "gsynth_ife"),
             extract_gsynth(g_mc, "matrix_completion"))
res[, pct := exp(att) - 1]
wcsv(res, "gsynth_primary")

# Event-time ATT paths for figures
paths <- rbind(
  data.table(estimator = "gsynth_ife", time = as.numeric(rownames(g_ife$est.att)),
             att = g_ife$est.att[, "ATT"], ci_lo = g_ife$est.att[, "CI.lower"],
             ci_hi = g_ife$est.att[, "CI.upper"]),
  data.table(estimator = "matrix_completion", time = as.numeric(rownames(g_mc$est.att)),
             att = g_mc$est.att[, "ATT"], ci_lo = g_mc$est.att[, "CI.lower"],
             ci_hi = g_mc$est.att[, "CI.upper"]))
wcsv(paths, "gsynth_att_paths")
print(res[, .(estimator, att = round(att, 4), se = round(se, 4),
              p = round(p, 3), r_or_lambda, pct = round(pct, 4))])
