# run_all.R — one-command estimation pipeline. Every step caches to
# Results/cache/*.rds; delete that directory for a cold run. Tidy results in
# Results/csv/; step runtimes in Results/runtimes.csv.
t_start <- Sys.time()
scripts <- c("R/01_sample_rules.R", "R/02_multisynth.R", "R/03_synthdid.R",
             "R/04_gsynth.R", "R/05_cs_did.R", "R/06_state_scm.R",
             "R/07_intime_placebo.R", "R/08_ri_pooled.R", "R/09_power_sim.R",
             "R/10_robustness.R")
for (s in scripts) {
  message("\n========== ", s, " ==========")
  source(s, local = new.env())
}
suppressPackageStartupMessages(library(data.table))
tl <- fread("Results/cache/timings.csv")
tl <- rbind(tl, data.table(step = "TOTAL_cached_steps", seconds = sum(tl$seconds)))
fwrite(tl, "Results/runtimes.csv")
message(sprintf("\nPipeline done in %.1f min this run; cumulative compute %.1f min.",
                as.numeric(difftime(Sys.time(), t_start, units = "mins")),
                tl[step == "TOTAL_cached_steps", seconds] / 60))
