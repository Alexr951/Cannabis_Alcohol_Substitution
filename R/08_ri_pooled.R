# 08_ri_pooled.R — joint null test: randomization inference on the primary
# multisynth pooled ATT. 500 draws of 5 pseudo-treated never-treated states
# (real staggered T0s randomly assigned), point estimates only.
source("R/helpers.R")
suppressPackageStartupMessages({library(augsynth); library(furrr)})

cf <- clean_fit_set()
t0_vec <- unname(sapply(cf, function(f) T0_MAP[[as.character(f)]]))
N_RI <- 500

obs <- fread("Results/csv/multisynth_overall.csv")[state == "Average", Estimate]

ri_one <- function(i) {
  pseudo <- sample(NEVER_FIPS, length(cf))
  t0s <- sample(t0_vec)
  donors <- setdiff(NEVER_FIPS, pseudo)
  dat <- make_est_data(pseudo, donors, t0_map = setNames(t0s, pseudo))
  tryCatch({
    msyn <- multisynth(lny ~ trt, fips, year, dat, n_leads = N_LEADS_PRIMARY)
    msyn_avg_att(msyn)
  }, error = function(e) NA_real_)
}

null_dist <- run_cached("ri_pooled_null", {
  plan(multisession, workers = 6)
  on.exit(plan(sequential))
  unlist(future_map(seq_len(N_RI), ri_one,
                    .options = furrr_options(seed = SEED)))
})

null_ok <- null_dist[!is.na(null_dist)]
p_ri <- mean(abs(null_ok) >= abs(obs))
wcsv(data.table(draw = seq_along(null_dist), null_att = null_dist), "ri_null_dist")
wcsv(data.table(observed_att = obs, n_draws = length(null_ok),
                p_two_sided = p_ri, null_sd = sd(null_ok),
                null_mean = mean(null_ok)), "ri_pooled")
message(sprintf("RI: obs %.4f | null mean %.4f sd %.4f | p = %.3f (N=%d)",
                obs, mean(null_ok), sd(null_ok), p_ri, length(null_ok)))
