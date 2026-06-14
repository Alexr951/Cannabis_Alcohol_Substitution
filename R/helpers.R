# helpers.R — shared utilities for the estimation pipeline.
suppressPackageStartupMessages({
  library(data.table)
})

SEED <- 20260524
PRIMARY_YEARS <- 2000:2019
EXT_YEARS <- 2000:2023

PANEL <- fread("Data/processed/panel_long.csv")
TREAT <- fread("Data/processed/treatment.csv")

PRIMARY_TREATED <- TREAT[primary_treated == 1]          # 7 states
NEVER_FIPS <- TREAT[ever_rec_2023 == 0, fips]           # 30 never-treated donors
T0_MAP <- setNames(PRIMARY_TREATED$t0, PRIMARY_TREATED$fips)
FIPS_STATE <- setNames(TREAT$state, TREAT$fips)

# Donors adjacent to any of the 7 treated states (Census adjacency):
# CO: WY NE KS OK UT NM AZ | WA: ID OR | OR: WA ID NV CA | NV: OR ID UT AZ CA
# CA: OR NV AZ | MA: NH VT NY CT RI | AK: none
ADJ_TO_TREATED <- c(56, 31, 20, 40, 49, 35, 4, 16, 33, 50, 36, 9, 44)
ADJ_DONORS <- intersect(ADJ_TO_TREATED, NEVER_FIPS)     # those in the never pool

# High-intensity medical-cannabis donor states (pre-stated): Oklahoma (SQ788,
# June 2018; highest per-capita dispensary density in the US post-2018).
MED_INTENSITY_DONORS <- c(40)

# Long data for estimation: treated states + donors, trt = 1(year >= t0).
make_est_data <- function(treated_fips, donors, years = PRIMARY_YEARS,
                          bev_name = "total", t0_map = T0_MAP) {
  dt <- PANEL[beverage == bev_name & year %in% years &
                fips %in% c(treated_fips, donors)]
  dt[, trt := 0L]
  for (f in treated_fips) {
    dt[fips == f & year >= t0_map[[as.character(f)]], trt := 1L]
  }
  dt[, lny := log_pc_eth21]
  dt[order(fips, year)]
}

# Inject a multiplicative effect delta into pseudo-treated states (power sim).
inject_delta <- function(dt, pseudo_fips, pseudo_t0, delta) {
  dt <- copy(dt)
  for (i in seq_along(pseudo_fips)) {
    dt[fips == pseudo_fips[i] & year >= pseudo_t0[i],
       lny := lny + log(1 + delta)]
  }
  dt
}

# Cache wrapper: heavy computations stored as RDS; runtimes logged.
run_cached <- function(name, expr) {
  path <- file.path("Results", "cache", paste0(name, ".rds"))
  if (file.exists(path)) {
    message("[cache] ", name)
    return(readRDS(path))
  }
  t_start <- Sys.time()
  val <- force(expr)
  secs <- as.numeric(difftime(Sys.time(), t_start, units = "secs"))
  saveRDS(val, path)
  log_path <- file.path("Results", "cache", "timings.csv")
  tl <- if (file.exists(log_path)) fread(log_path) else
    data.table(step = character(), seconds = numeric())
  tl <- rbind(tl[step != name], data.table(step = name, seconds = round(secs, 1)))
  fwrite(tl, log_path)
  message(sprintf("[run ] %s: %.1fs", name, secs))
  val
}

wcsv <- function(df, name) {
  fwrite(df, file.path("Results", "csv", paste0(name, ".csv")))
}

# The clean-fit primary sample (written by 01_sample_rules.R).
clean_fit_set <- function() {
  sr <- fread("Results/csv/sample_rules.csv")
  sr[included == 1, fips]
}

# Average post-treatment ATT from a multisynth fit, point estimate only.
# predict(att = TRUE) returns calendar-year rows plus a final overall row;
# column "avg" is the across-state average.
msyn_avg_att <- function(msyn) {
  p <- predict(msyn, att = TRUE)
  as.numeric(p[nrow(p), "avg"])
}

# Post-window length (leads) so the pooled ATT uses every post period, not
# just the balanced minimum across cohorts.
N_LEADS_PRIMARY <- 6
