# 00_setup.R — idempotent package installation + version log.
# CRAN packages install as Windows binaries; augsynth/synthdid are pure-R GitHub
# packages (no Rtools needed). Do NOT install augsynth with dependencies = TRUE
# (its Suggests includes GitHub-only MCPanel).

options(repos = c(CRAN = "https://cran.r-project.org"))

cran_pkgs <- c("gsynth", "did", "scpi", "panelView", "osqp")
for (p in cran_pkgs) {
  if (!requireNamespace(p, quietly = TRUE)) {
    message("Installing (CRAN): ", p)
    install.packages(p, type = "binary")
  }
}

if (!requireNamespace("synthdid", quietly = TRUE)) {
  message("Installing (GitHub): synthdid")
  remotes::install_github("synth-inference/synthdid", upgrade = "never")
}
if (!requireNamespace("augsynth", quietly = TRUE)) {
  message("Installing (GitHub): augsynth")
  remotes::install_github("ebenmichael/augsynth", upgrade = "never")
}

# Verify all packages load and log versions
need <- c("augsynth", "synthdid", "gsynth", "did", "scpi", "fixest",
          "furrr", "future", "data.table")
status <- sapply(need, function(p) {
  ok <- suppressWarnings(suppressMessages(requireNamespace(p, quietly = TRUE)))
  if (ok) as.character(packageVersion(p)) else "MISSING"
})
writeLines(paste(names(status), status, sep = ","),
           file.path("Results", "package_versions.csv"))
print(data.frame(package = names(status), version = unname(status)))
if (any(status == "MISSING")) {
  stop("Missing packages: ", paste(names(status)[status == "MISSING"], collapse = ", "))
}
message("Setup OK.")
