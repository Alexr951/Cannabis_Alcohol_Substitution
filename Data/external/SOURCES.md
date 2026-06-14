# External Data Sources

All files retrieved **2026-06-11**. Raw downloads and build scripts are kept in `Data/external/_tmp/`
(`build_panels.py`, `build_beer.py`, `build_cannabis.py`). All dollar figures are **nominal USD**.
No figure in any CSV was estimated or imputed; every number traces to a fetched page/file listed below.

---

## cannabis_sales_annual.csv

Columns: `state, fips, year, year_basis (CY/FY), sales_usd, scope (rec / rec+med), source_url, notes`.
FY = state fiscal year July 1 – June 30, labeled by ending year (e.g., FY2015 = Jul 2014–Jun 2015).

### Colorado (fips 8) — CY 2014–2023, scope rec+med
- Source: CO Dept. of Revenue, "Marijuana Sales Reports" page table ("Sales Totals / Calendar Year Total"),
  https://cdor.colorado.gov/data-and-reports/marijuana-data/marijuana-sales-reports (HTML fetched with curl; page 403s for some clients).
- Statewide total marijuana sales, **medical + retail combined** (CDOR does not split med/rec in this table).
- Cross-check: CDOR-based press coverage (CU Boulder/Colorado DOR press releases found via search) cites 2021 ≈ $2.2B and 2022 ≈ $1.77B, matching $2,228,994,553 and $1,768,688,837.

### Washington (fips 53) — FY2015–FY2024, scope rec (licensed retail)
- Source: WSLCB "Frequently Requested Lists" Excel files (sales & excise tax by county):
  - FY15/FY16/FY17: `FY15-MJ-Sales-Excise-Tax-by-County.xlsx`, `FY16-...`, `FY17-...` (Retailer sheet used; the "All" sheet sums producer+processor+retailer and would double count).
  - FY18–FY24: `FY2018-FY2024-Sales-and-Excise-Tax-by-County-retail-sales-only.xlsx` (one sheet per FY).
  - All under https://lcb.wa.gov/sites/default/files/publications/Cannabis/sales_activity/ (linked from https://lcb.wa.gov/records/frequently-requested-lists).
- Figure used: the statewide **Total** row of each Retailer sheet (county sums verified to match to <$1).
- **Fiscal-year basis (Jul–Jun)**, labeled by ending year. Scope: recreational licensed stores; medical dispensaries were folded into the licensed system July 2016 (medically-endorsed store sales included thereafter).
- Cross-check: WA JLARC 2025 Cannabis Market Study (https://leg.wa.gov/JLARC/reports/2025/CannabisMarket/p_a/print.pdf, Figure 9, calendar-year basis) shows CY2021 "just under $1.5 billion" and CY2023 "just under $1.25 billion", consistent with FY2021 $1,497,078,869 and FY2023 $1,257,812,688.
- Note: WSLCB's Socrata portal (data.lcb.wa.gov) was unreachable (DNS/connection refused) on the retrieval date.

### Oregon (fips 41) — CY 2020–2022 only, scope rec — PARTIAL, ROUNDED
- OLCC moved its Marijuana Market Data to an interactive Tableau dashboard (data.olcc.state.or.us)
  that requires a JavaScript session; CSV export endpoints return a sign-in page to non-browser clients.
  Archived copies of the old downloadable files could not be located on the Wayback Machine, and
  OR Dept. of Revenue publishes tax *collections* (17% tax), not sales dollars. Deriving sales from
  tax collections would be an estimate, so it was not done.
- The only official published annual totals retrieved are **rounded** figures from OLCC legislative reports:
  - 2020: "$1.1 billion"; 2021: "$1.2 billion"; 2022: "$994 million" — OLCC *2023 Recreational Marijuana
    Supply and Demand Legislative Report*, p.6 (https://www.oregon.gov/olcc/Docs/reports/2023-Supply-and-Demand-Report.pdf),
    corroborated by OLCC news release 2023-02-01 (https://www.oregon.gov/olcc/Docs/news/news_releases/2023/nr020123-MJ-Supply-Demand-Report.pdf)
    and (2020, 2021) the 2025 report (https://www.oregonlegislature.gov/citizen_engagement/Reports/2025SupplyandDemand_Full%20Report_1-29-25.pdf).
- **Missing: 2016–2019, 2023** — no official precise annual totals retrievable (Tableau-only distribution; reports give only THC quantities or rounded text figures). Rows omitted rather than estimated.

### Nevada (fips 32) — FY2018–FY2024, scope rec+med (taxable sales)
- Concept: "Taxable sales reported by adult-use cannabis retail stores and medical dispensaries"
  (NV Dept. of Taxation / Cannabis Compliance Board joint series).
- FY2018: $529.9M (**rounded as published**; combined medical + adult-use + marijuana-related goods;
  adult-use alone $424.9M) — NV DoT news release, archived:
  http://web.archive.org/web/20200223074849/https://tax.nv.gov/uploadedFiles/taxnvgov/Content/TaxLibrary/News-Release-June-Marijuana.pdf
- FY2019: $639,035,590 — NV DoT FY19 monthly revenue report (archived Wayback, see CSV).
- FY2020: $684,959,149 — NV DoT FY20 report (archived); matches "$685 million" cited in CCB FY21 release.
- FY2021: $1,003,467,655 — CCB/DoT release (https://ccb.nv.gov/ccb-dot-release-annual-cannabis-taxable-sales-data-fy21/).
- FY2022: $965,091,123 — CCB/DoT release (FY-22 page).
- FY2023: $848,145,356 — cross-checked in **two** sources: tax.nv.gov FY23 cannabis revenue PDF and the CCB FY24 release.
- FY2024: $829,225,193 — CCB FY24 release PDF; re-confirmed in CCB FY25 release (Feb 2026).

### California (fips 6) — CY 2018–2023, scope rec+med (taxable sales)
- Source: CDTFA Open Data Portal dataset **Cannabis Tax Revenues**
  (page: https://cdtfa.ca.gov/dataportal/dataset.htm?url=CannabisTaxRevenues;
  data pulled from the portal's OData API `api/odata/Cannabis_Tax_Revenues` with browser headers + session cookie;
  raw JSON saved as `_tmp/cdtfa_rev.json`).
- Figure used: quarterly **"Taxable Sales"** (sales by cannabis businesses subject to sales & use tax),
  summed to calendar years. Caveats: (a) this is *taxable* sales, not total gross receipts — medicinal
  sales to MMIC-card patients are exempt and excluded; (b) amounts reflect CDTFA revisions as of
  2026-05-27 (dataset LastUpdated); (c) dataset also has a "CannabisSales" field (gross sales subject
  to the 15% excise) but it is only populated from 2023Q1, so it was not used for the panel.
- Sanity/cross-check: dataset SalesTax ÷ TaxableSales ≈ 8.8–9.0% (plausible average CA sales-tax rate);
  CDTFA quarterly news releases (e.g., https://cdtfa.ca.gov/news/23-07.htm) report the same revenue
  series (initial vintages, later revised in the dataset).

### Massachusetts (fips 25) — CY 2018–2023, scope rec (adult-use only)
- Source: Cannabis Control Commission Open Data, "Marijuana Establishment Facility Sales" daily gross
  sales CSV: https://masscannabiscontrol.com/resource/a_sales_au_gross.csv (linked from
  https://masscannabiscontrol.com/open-data/data-catalog/). Raw file saved in `_tmp/`.
- Figure used: sum of `TOTAL_$` by calendar year of `SaleDate` (all product categories; Retail + Delivery).
- Caveats: self-reported by licensees via Metrc; the raw file contains a few obviously misdated rows
  (year 2001/2003, ~$386 total) which fall outside 2018–2023 and are excluded. First stores opened 2018-11-20.
- Cross-check: 2024 sum of this file ($1,648.6M) matches CCC press release "more than $1.64 billion in 2024"
  (https://masscannabiscontrol.com/2025/01/massachusetts-adult-use-cannabis-sales-hit-annual-record-with-one-point-sixty-four-billion-generated-over-2024/).

---

## bea_gdp_pc.csv  (fips, state, year, real_gdp_pc)

- Coverage: 50 states + DC, 2000–2023 (1,224 rows).
- **Derived from two retrieved sources** (BEA's SAGDP zip does not include the per-capita table SAGDP10):
  1. Real GDP: BEA Regional Accounts, table **SAGDP9** "Real GDP (millions of chained 2017 dollars)",
     LineCode 1 (All industry total), from https://apps.bea.gov/regional/zip/SAGDP.zip
     (file `SAGDP9__ALL_AREAS_1997_2025.csv`, vintage 2026-04-08).
  2. Resident population (July 1 estimates), U.S. Census Bureau:
     - 2000–2009: intercensal state estimates by age/sex `st-est00int-agesex.csv` (SEX=0, single ages summed),
       https://www2.census.gov/programs-surveys/popest/datasets/2000-2010/intercensal/state/
     - 2010–2019: vintage-2020 totals `nst-est2020.csv`,
       https://www2.census.gov/programs-surveys/popest/datasets/2010-2020/state/totals/
     - 2020–2023: vintage-2023 totals `NST-EST2023-ALLDATA.csv`,
       https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/state/totals/
- `real_gdp_pc` = real GDP (chained 2017 $, millions) × 1e6 ÷ resident population, rounded to whole dollars.
  Units: **chained 2017 dollars per person**. Values will differ slightly from BEA's official SAGDP10
  (BEA uses its own midyear population), typically by <1%.

## bls_unemployment.csv  (fips, state, year, unemp_rate)

- Coverage: 50 states + DC, 2000–2023 (1,224 rows). Units: percent, annual average.
- Source: BLS Local Area Unemployment Statistics flat file
  https://download.bls.gov/pub/time.series/la/la.data.2.AllStatesU (statewide series
  `LAUST<fips>0000000000003`, unemployment rate, period **M13 = annual average**, not seasonally adjusted —
  annual averages are only published in the unadjusted series). Reflects current (revised) LAUS estimates.
- Note: https://www.bls.gov/web/laus/staadata.txt no longer exists (404).

## age_share_20_34.csv  (fips, state, year, share_20_34)

- Coverage: 50 states + DC, 2000–2023 (1,224 rows). Share = population aged 20–34 ÷ total population (SEX=0).
- Sources (July 1 estimates):
  - 2000–2009: Census intercensal `st-est00int-agesex.csv` (**resident** population; total = sum of single ages 0–85+).
  - 2010–2019: `SC-EST2020-AGESEX-CIV.csv` (vintage 2020, **civilian** population; AGE=999 total),
    https://www2.census.gov/programs-surveys/popest/datasets/2010-2020/state/asrh/
  - 2020–2023: `sc-est2023-agesex-civ.csv` (vintage 2023, **civilian**),
    https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/state/asrh/
- Caveat: 2010+ shares are based on civilian population (Census only publishes the CIV age-sex file for
  these vintages); 2000–2009 is resident population. Numerator and denominator are always from the same file.

## beer_tax.csv  (fips, state, year, beer_tax_per_gal, source_url, rate_as_of)

- State beer excise tax, **$ per gallon**, as compiled by the **Federation of Tax Administrators (FTA)**
  annual "State Excise Tax Rates on Beer" tables (taxadmin.org), retrieved via Wayback Machine snapshots
  (exact archived URL per row in `source_url`; `rate_as_of` is the as-of date printed in the table, normally January 1).
- Coverage: 51 jurisdictions × 18 years = 918 rows. Years: **2000–2008, 2010, 2013–2017, 2020–2022**.
- **Gaps (documented, not filled): 2009, 2011, 2012, 2018, 2019, 2023.**
  - 2009, 2011, 2012: archived FTA pages in those years still displayed the prior vintage (Jan 2008 / Jan 2010);
    no updated table appears to have been published/archived.
  - 2018, 2019: no Wayback snapshot of `beer.pdf` exists between Oct 2017 and Nov 2020.
  - 2023–2024: CDX-listed snapshots return 404 on retrieval (phantom captures).
  - Tax Policy Center / Tax Foundation downloads were blocked (Cloudflare 403) for non-browser clients.
- Caveat: rate shown is the FTA headline excise rate; several states have additional volume/wholesale/case
  taxes noted in FTA footnotes that are not captured here. Some entries carry FTA footnotes
  (e.g., WA 2013 $0.76 includes a temporary additional barrel tax that expired 6/30/2013).

---

## Known limitations summary

- Oregon cannabis sales: only rounded 2020–2022 figures (see above) — OLCC Tableau-only distribution.
- CA figures are taxable sales (rec + most med), not total gross receipts; WA and NV are fiscal-year basis.
- NV FY2018 is rounded to $0.1M as published.
- beer_tax.csv missing 6 year-vintages (above).
- bea_gdp_pc.csv is computed (BEA real GDP ÷ Census population), not BEA's official SAGDP10 series.
