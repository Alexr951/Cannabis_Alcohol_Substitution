# 07_intime_placebo.R — systematic backdated (in-time) placebos.
# (a) Single-state: for every clean-fit treated state, every feasible fake T0
#     (>=6 pre years, >=3 fake post years, data truncated at real T0 - 1),
#     estimate the fake ATT under classic SCM, ridge ASCM, SDID, and gsynth
#     IFE (point estimates only — the distribution IS the empirical bias band).
# (b) Pooled fake-T0 = 2009 (panel ending 2013, fully pre-treatment for all
#     states) for every pooled estimator, WITH inference — the key diagnostic
#     for whether latent-factor / time-weighted estimators absorb the Western
#     drift that breaks classic SCM.
source("R/helpers.R")
suppressPackageStartupMessages({
  library(augsynth); library(synthdid); library(gsynth); library(did)
  library(fixest)
})
set.seed(SEED)

cf <- clean_fit_set()

fake_att_one <- function(f, fake_t0, real_t0) {
  yrs <- 2000:(real_t0 - 1)
  t0m <- setNames(fake_t0, f)
  dat <- make_est_data(f, NEVER_FIPS, years = yrs, t0_map = t0m)
  out <- list()
  for (pf in c("None", "Ridge")) {
    lbl <- ifelse(pf == "None", "classic_scm", "ridge_ascm")
    att <- tryCatch({
      a <- augsynth(lny ~ trt, fips, year, dat,
                    progfunc = pf, scm = TRUE, fixedeff = FALSE)
      g <- summary(a, inf_type = "jackknife+")$att
      mean(g[g$Time >= fake_t0 & !is.na(g$Time), "Estimate"])
    }, error = function(e) NA_real_)
    out[[lbl]] <- att
  }
  out[["sdid"]] <- tryCatch({
    pp <- PANEL[beverage == "total" & year %in% yrs & fips %in% c(NEVER_FIPS, f)]
    wide <- dcast(pp, fips ~ year, value.var = "log_pc_eth21")
    wide <- wide[match(c(NEVER_FIPS, f), fips)]
    Y <- as.matrix(wide[, -1])
    as.numeric(synthdid_estimate(Y, length(NEVER_FIPS), sum(yrs < fake_t0)))
  }, error = function(e) NA_real_)
  out[["gsynth_ife"]] <- tryCatch({
    g <- suppressMessages(gsynth(lny ~ trt, data = as.data.frame(dat),
                                 index = c("fips", "year"), force = "two-way",
                                 CV = TRUE, r = c(0, 3), se = FALSE))
    as.numeric(g$att.avg)
  }, error = function(e) NA_real_)
  rbindlist(lapply(names(out), function(e)
    data.table(fips = f, state = FIPS_STATE[[as.character(f)]],
               real_t0 = real_t0, fake_t0 = fake_t0, estimator = e,
               fake_att = out[[e]])))
}

single <- run_cached("intime_single", {
  res <- list()
  for (f in cf) {
    real_t0 <- T0_MAP[[as.character(f)]]
    for (ft in 2006:(real_t0 - 3)) {
      res[[paste(f, ft)]] <- fake_att_one(f, ft, real_t0)
    }
  }
  rbindlist(res)
})
wcsv(single, "intime_placebo_single")

# (b) Pooled fake treatments: all clean-fit states fake-treated at the same
# backdated year, five fake post years, panel fully pre-treatment. 2009 is the
# primary diagnostic; 2007 (panel ending 2011) checks that the result is not
# specific to one macro window.
pooled_fake <- function(fake_t0) {
  yrs <- 2000:(fake_t0 + 4)
  t0m <- setNames(rep(as.integer(fake_t0), length(cf)), cf)
  dat <- make_est_data(cf, NEVER_FIPS, years = yrs, t0_map = t0m)
  res <- list()

  msyn <- multisynth(lny ~ trt, fips, year, dat, n_leads = 5)
  ov <- summary(msyn)$att
  ov <- ov[is.na(ov$Time) & ov$Level == "Average", ]
  res$multisynth <- data.table(estimator = "multisynth", att = ov$Estimate,
                               se = ov$Std.Error)

  pp <- PANEL[beverage == "total" & year %in% yrs & fips %in% c(NEVER_FIPS, cf)]
  wide <- dcast(pp, fips ~ year, value.var = "log_pc_eth21")
  wide <- wide[match(c(NEVER_FIPS, cf), fips)]
  Y <- as.matrix(wide[, -1])
  est <- synthdid_estimate(Y, length(NEVER_FIPS), sum(yrs < fake_t0))
  res$sdid <- data.table(estimator = "sdid", att = as.numeric(est),
                         se = sqrt(as.numeric(vcov(est, method = "placebo",
                                                   replications = 200))))

  for (es in c("ife", "mc")) {
    g <- suppressMessages(gsynth(
      lny ~ trt, data = as.data.frame(dat), index = c("fips", "year"),
      force = "two-way", CV = TRUE, r = c(0, 3),
      estimator = ifelse(es == "mc", "mc", "ife"), se = TRUE,
      inference = ifelse(es == "mc", "nonparametric", "parametric"),
      nboots = 200, parallel = TRUE, cores = 6, seed = SEED))
    res[[paste0("gsynth_", es)]] <- data.table(
      estimator = ifelse(es == "mc", "matrix_completion", "gsynth_ife"),
      att = as.numeric(g$est.avg[1, "ATT.avg"]),
      se = as.numeric(g$est.avg[1, "S.E."]))
  }

  datc <- as.data.frame(dat)
  datc$g <- ifelse(datc$fips %in% cf, fake_t0, 0)
  csf <- att_gt(yname = "lny", tname = "year", idname = "fips", gname = "g",
                data = datc, control_group = "nevertreated",
                est_method = "reg", bstrap = TRUE, biters = 999)
  agg <- aggte(csf, type = "simple", bstrap = TRUE, biters = 999)
  res$cs <- data.table(estimator = "callaway_santanna",
                       att = agg$overall.att, se = agg$overall.se)

  m <- feols(lny ~ trt | fips + year, data = datc, cluster = ~fips)
  res$twfe <- data.table(estimator = "twfe", att = coef(m)[["trt"]],
                         se = se(m)[["trt"]])
  rbindlist(res)
}

pooled_2009 <- run_cached("intime_pooled_2009", pooled_fake(2009))
pooled_2009[, `:=`(pct = exp(att) - 1, t_stat = att / se)]
wcsv(pooled_2009, "intime_placebo_pooled2009")

pooled_2007 <- run_cached("intime_pooled_2007", pooled_fake(2007))
pooled_2007[, `:=`(pct = exp(att) - 1, t_stat = att / se)]
wcsv(pooled_2007, "intime_placebo_pooled2007")

print(single[, .(mean_fake = round(mean(fake_att, na.rm = TRUE), 4),
                 sd_fake = round(sd(fake_att, na.rm = TRUE), 4),
                 n = sum(!is.na(fake_att))), by = estimator])
print(pooled_2009[, .(estimator, att = round(att, 4), se = round(se, 4),
                      t = round(t_stat, 2))])
