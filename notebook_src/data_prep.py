# Data preparation: NIAAA panel -> tidy CSVs consumed by the R estimation
# pipeline. Ported from the v1 notebook loader (archive_v1/).
import os
import numpy as np
import pandas as pd

DATA_PATH = 'Data/pcyr1970-2023.txt'
OUT_DIR = 'Data/processed'
YEAR_START, YEAR_END = 2000, 2023

col_names = ['year', 'fips', 'beverage', 'gal_bev', 'gal_eth',
             'pop14', 'pc_eth14', 'decile14', 'pop21', 'pc_eth21',
             'decile21', 'data_source', 'abv', 'eth_tvabv']

# Recreational retail opening years (treatment = first full retail year).
treatment_years = {
    8: 2014, 53: 2014, 41: 2015, 2: 2016, 32: 2017, 6: 2018, 25: 2018,
    26: 2019, 17: 2020, 23: 2020, 4: 2021, 30: 2022, 34: 2022, 35: 2022,
    36: 2022, 50: 2022, 44: 2022, 9: 2023, 24: 2023, 29: 2023,
}
PRIMARY_STATES = [8, 53, 41, 2, 32, 6, 25]   # the 7 analyzed treated states
# Any state with recreational legalization through 2023 (incl. DC) — excluded
# from the never-treated donor pool.
rec_legal_fips = {2, 4, 6, 8, 9, 11, 17, 23, 24, 25, 26, 29, 30, 32, 34, 35,
                  36, 41, 44, 50, 53}

fips_to_state = {
    1: 'Alabama', 2: 'Alaska', 4: 'Arizona', 5: 'Arkansas', 6: 'California',
    8: 'Colorado', 9: 'Connecticut', 10: 'Delaware', 11: 'DC', 12: 'Florida',
    13: 'Georgia', 15: 'Hawaii', 16: 'Idaho', 17: 'Illinois', 18: 'Indiana',
    19: 'Iowa', 20: 'Kansas', 21: 'Kentucky', 22: 'Louisiana', 23: 'Maine',
    24: 'Maryland', 25: 'Massachusetts', 26: 'Michigan', 27: 'Minnesota',
    28: 'Mississippi', 29: 'Missouri', 30: 'Montana', 31: 'Nebraska',
    32: 'Nevada', 33: 'New Hampshire', 34: 'New Jersey', 35: 'New Mexico',
    36: 'New York', 37: 'North Carolina', 38: 'North Dakota', 39: 'Ohio',
    40: 'Oklahoma', 41: 'Oregon', 42: 'Pennsylvania', 44: 'Rhode Island',
    45: 'South Carolina', 46: 'South Dakota', 47: 'Tennessee', 48: 'Texas',
    49: 'Utah', 50: 'Vermont', 51: 'Virginia', 53: 'Washington',
    54: 'West Virginia', 55: 'Wisconsin', 56: 'Wyoming'
}


def build_processed_data():
    os.makedirs(OUT_DIR, exist_ok=True)
    raw = pd.read_csv(DATA_PATH, skiprows=129, sep=r'\s+', header=None,
                      names=col_names, na_values=['.'])
    raw['pc_eth21'] = raw['pc_eth21'] / 10_000
    raw['pc_eth14'] = raw['pc_eth14'] / 10_000
    raw = raw[raw['fips'].between(1, 56) & (raw['fips'] != 11)].copy()  # drop DC

    bev_map = {1: 'spirits', 2: 'wine', 3: 'beer', 4: 'total'}
    df = raw[raw['year'].between(YEAR_START, YEAR_END)].copy()
    df['beverage'] = df['beverage'].map(bev_map)
    df = df[df['beverage'].notna() & df['pc_eth21'].notna() & (df['pc_eth21'] > 0)]
    df['state'] = df['fips'].map(fips_to_state)
    df['log_pc_eth21'] = np.log(df['pc_eth21'])
    # 21+ population (same for all beverage rows of a state-year); used by the
    # first-stage per-capita cannabis sales figure.
    pop21 = (df[df['beverage'] == 'total'][['year', 'fips', 'pop21']]
             .drop_duplicates())

    # Beer+wine combined ethanol (spirits-excluded outcome for the WA check):
    bw = (df[df['beverage'].isin(['beer', 'wine'])]
          .groupby(['year', 'fips', 'state'], as_index=False)['pc_eth21'].sum())
    bw['beverage'] = 'beer_wine'
    bw['log_pc_eth21'] = np.log(bw['pc_eth21'])
    panel = pd.concat([df[['year', 'fips', 'state', 'beverage', 'pc_eth21',
                           'log_pc_eth21']], bw], ignore_index=True)

    # Keep only states with a balanced total-ethanol series 2000-2023
    tot = panel[panel['beverage'] == 'total']
    counts = tot.groupby('fips')['year'].nunique()
    balanced = counts[counts == (YEAR_END - YEAR_START + 1)].index
    panel = panel[panel['fips'].isin(balanced)].copy()
    panel.sort_values(['beverage', 'fips', 'year']).to_csv(
        f'{OUT_DIR}/panel_long.csv', index=False)
    pop21[pop21['fips'].isin(balanced)].sort_values(['fips', 'year']).to_csv(
        f'{OUT_DIR}/population_21.csv', index=False)

    treat = pd.DataFrame({'fips': sorted(fips_to_state)})
    treat = treat[treat['fips'] != 11]
    treat['state'] = treat['fips'].map(fips_to_state)
    treat['t0'] = treat['fips'].map(treatment_years).astype('Int64')
    treat['primary_treated'] = treat['fips'].isin(PRIMARY_STATES).astype(int)
    treat['ever_rec_2023'] = treat['fips'].isin(rec_legal_fips).astype(int)
    treat.to_csv(f'{OUT_DIR}/treatment.csv', index=False)

    n_states = panel[panel['beverage'] == 'total']['fips'].nunique()
    n_donor = int(((treat['ever_rec_2023'] == 0)
                   & treat['fips'].isin(balanced)).sum())
    print(f"panel_long.csv: {n_states} states x {YEAR_END-YEAR_START+1} years, "
          f"{panel['beverage'].nunique()} beverage series")
    print(f"treatment.csv: {int(treat['primary_treated'].sum())} primary treated, "
          f"{n_donor} never-treated donors")
    return panel, treat


if __name__ == '__main__' or True:
    panel, treat = build_processed_data()
