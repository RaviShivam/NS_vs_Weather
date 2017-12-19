import os
import pandas as pd

# Done for all processes
trainStations = pd.read_csv('data/trainStationsWithProvince.csv')
disturbances = pd.read_csv('data/disturbancesWithLines.csv')

trainStations['code'] = trainStations['code'].astype(str)
trainStations['province'] = trainStations['province'].astype(str)
disturbances['lines'] = disturbances['lines'].astype(str)

name_lookup = {}
for (index, station) in trainStations.iterrows():
    if station.province != '' and station.province != 'nan':
        name_lookup[station['code'].lower()] = station.province

provincesPerDisturbance = [[] for x in range(len(disturbances))]
for (index, disturbance) in disturbances.iterrows():
    lines = disturbance['lines']
    lines = lines.replace(' ', '-').split('-')

    provinces = []
    for code in lines:
        if code in name_lookup:
            province = name_lookup[code]
            if province not in provinces:
                provinces.append(province)

    provincesPerDisturbance[index] = ' '.join(provinces)

disturbances['provinces'] = provincesPerDisturbance
disturbances.to_csv('./data/disturbancesWithProvinces.csv', index=False)
