import pandas as pd

weather = pd.read_csv('data/weather.csv', comment='#')
wspp = pd.read_csv('data/weatherStationsPerProvince.csv') # weather stations per province
disturbances = pd.read_csv('data/delays.csv')

# Filter weather by date
start_date = int(disturbances['start_time'][0].split(' ')[0].replace('-', ''))
end_date = int(disturbances['start_time'][len(disturbances) - 1].split(' ')[0].replace('-', ''))

weather = weather.loc[start_date <= weather['YYYYMMDD']]
weather = weather.loc[weather['YYYYMMDD'] <= end_date]
weather.replace(['-'], [None])

weather_columns = 'YYYYMMDD,FG,FHX,FHN,FXX,TG,TN,TX,DR,RH,RHX,VVN,VVX,UG,UN'.split(',')

output = pd.DataFrame()
for (index, row) in wspp.iterrows():
  province = row['province']
  weatherStations = row['weatherStations']
  province_data = pd.DataFrame(pd.DataFrame(columns=weather_columns))

  # Get all data for this province
  ids = weatherStations.split(' ')
  for id in ids:
    ws_values = weather.loc[weather['STN'] == int(id)]
    ws_values.drop('STN', 1, inplace=True)
    province_data = ws_values  # pd.concat([province_data, ws_values], join='inner')
    break
  # province_data = province_data.mean()

  # fuck it, gewoon de eerste id pakken ipv van mergen
  province_data['PROVINCE'] = province

  output = pd.concat([output, province_data])

output.to_csv('weatherPerProvince.csv', index=False)