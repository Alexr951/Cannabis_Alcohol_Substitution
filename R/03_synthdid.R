# 03_synthdid.R — Synthetic difference-in-differences (Arkhangelsky et al.
# 2021). The package assumes simultaneous adoption, so estimation is by
# adoption cohort on balanced blocks (cohort treated states + never-treated
# donors), aggregated by treated post-period cell counts. Cohort SEs from the
# placebo variance estimator; aggregate SE treats cohorts as independent
# (they share donors — caveat reported in the memo).
source("R/helpers.R")
suppressPackageStartupMessages(library(synthdid))
set.seed(SEED)

# Outcome matrix (units x years), donors first then treated, for one cohort.
sdid_matrix <- function(treated, donors, years, bev = "total") {
  pp <- PANEL[beverage == bev & year %in% years & fips %in% c(donors, treated)]
  wide <- dcast(pp, fips ~ year, value.var = "log_pc_eth21")
  ord <- c(donors, treated)
  wide <- wide[match(ord, fips)]
  Y <- as.matrix(wide[, -1])
  rownames(Y) <- wide$fips
  Y
}

sdid_cohort <- function(treated, t0, years = PRIMARY_YEARS, bev = "total",
                        replications = 200) {
  donors <- NEVER_FIPS
  Y <- sdid_matrix(treated, donors, years, bev)
  N0 <- length(donors)
  T0 <- sum(years < t0)
  est <- synthdid_estimate(Y, N0, T0)
  se <- sqrt(vcov(est, method = "placebo", replications = replications))
  n_post <- length(years) - T0
  list(tau = as.numeric(est), se = as.numeric(se),
       cells = length(treated) * n_post, est = est)
}

run_sdid_staggered <- function(treated_set, t0_map = T0_MAP,
                               years = PRIMARY_YEARS, bev = "total",
                               replications = 200) {
  t0s <- sapply(treated_set, function(f) t0_map[[as.character(f)]])
  out <- list()
  for (t0 in sort(unique(t0s))) {
    coh <- treated_set[t0s == t0]
    r <- sdid_cohort(coh, t0, years, bev, replications)
    out[[as.character(t0)]] <- data.table(
      cohort = t0, states = paste(FIPS_STATE[as.character(coh)], collapse = "+"),
      tau = r$tau, se = r$se, cells = r$cells)
  }
  res <- rbindlist(out)
  w <- res$cells / sum(res$cells)
  agg <- data.table(cohort = NA_integer_, states = "Aggregate",
                    tau = sum(w * res$tau),
                    se = sqrt(sum(w^2 * res$se^2)),
                    cells = sum(res$cells))
  rbind(res, agg)
}

sdid <- run_cached("sdid_primary", {
  run_sdid_staggered(clean_fit_set())
})
sdid[, pct := exp(tau) - 1]
wcsv(sdid, "sdid_primary")
print(sdid[, .(cohort, states, tau = round(tau, 4), se = round(se, 4),
               pct = round(pct, 4))])
