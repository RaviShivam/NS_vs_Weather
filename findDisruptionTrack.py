import os
import pandas as pd
import csv
import networkx as nx
import matplotlib.pyplot as plt

from multiprocessing.dummy import Pool as ThreadPool
# For each disruption, find the tracks where the disruption happened

_dir = os.path.dirname(__file__)

# Done for all processes
trainStations = pd.read_csv('data/trainStations.csv')
trainStations['code'] = trainStations['code'].astype(str)

# Create graph
G = nx.Graph()
with open(os.path.join(_dir, 'data', 'trackTrainStationPairs.csv'), 'rb') as csvfile:
  reader = csv.reader(csvfile, delimiter=' ', quotechar='|')
  for row in reader:
    names = row[0].split(',')
    for i in range(len(names)):
      G.add_edge(names[0].lower(), names[i].lower())
nodes = G.nodes()

# Plot graph
# pos = nx.spring_layout(G)
# nx.draw_networkx_nodes(G, pos, cmap=plt.get_cmap('jet'), node_size = 500)
# nx.draw_networkx_labels(G, pos)
# nx.draw_networkx_edges(G, pos, edge_color='r', arrows=True)
# nx.draw_networkx_edges(G, pos, arrows=False)
# plt.show()

# Lookup table for full station name to abbreviated name
name_lookup = {}
for (index, station) in trainStations.iterrows():
  # if station.country == 'NL':
  name_lookup[station.name_long] = station.code.lower()
    # if station.code.lower() not in nodes:
    #   print station.name_long


def findLines(disr):
  id = disr[0]
  if (id % 500 == 0):
    print(id)

  lines = disr[2].split(', ')

  track_paths = []
  for (l_i, line) in enumerate(lines):
    line_stations = line.split(' - ')
    if len(line_stations) < 2:
      continue
    name1 = line_stations[0].replace(' (HSL)', '')
    name2 = line_stations[1].replace(' (HSL)', '')
    if name1 in name_lookup and name2 in name_lookup:
      short_name1 = name_lookup[name1]
      short_name2 = name_lookup[name2]

      if short_name1 in nodes and short_name2 in nodes:
        track_paths.append(nx.shortest_path(G, short_name1, short_name2))

        #   else:
        #     print 'Not found for ', short_name1, short_name2, (line_stations)
        # else:
        #   print 'Not found for ', line_stations
        # for line_station in line_stations:
        #   if line_station not in name_lookup:
        #     line_station = line_station\
        #       .replace(' (HSL)', '')
        #
        #   if line_station in name_lookup:
        #     found += 1
        #   else:
        #     not_found += 1
  return ' '.join(['-'.join([str(c) for c in lst]) for lst in track_paths])

if __name__ == '__main__':
  disturbances = pd.read_csv('data/delays.csv')
  disturbances['rdt_lines'] = disturbances['rdt_lines'].astype(str)

  #
  # # MULTITHREADING!!!
  pool = ThreadPool(12)
  data = disturbances.values.tolist()
  results = pool.map(findLines, data)
  #
  print 'Done!', len(results)
  disturbances['lines'] = results
  #
  # for (i, lines) in enumerate(results):
  #   string_value = ' '.join(['-'.join([str(c) for c in lst]) for lst in lines])
  #   print string_value
  #   disturbances.loc['lines', i] = string_value
  #
  disturbances.to_csv('./data/disturbancesWithLines.csv', index=False)
  #
  # # print 'Found: ', found, 'Not found: ', not_found
  # # Find shortest path between stations in the graph
  #
  print 'Finished writing'
