**NS vs Weather**

The code of this project was split up into two parts.
1. The pre-processing of the raw data was performed in Python.
These scripts in the root directory were written by ourselves and the resulting data can be found in the `data` directory.

2. The processed data is imported in the visualization application in the `app` directory.
This directory contains the `index.html` file which imports the libraries and our own code. Next, an overview of the JavaScript files and their purpose will be given.

- `d3.v3.min.js`: The D3 library that is used in the map and the stack graph.
- `crossfilter.min.js`: The data filtering library used to filter most data.
- `dataLoader.js`: Code written by us to import and process the data that is used in the stack graph.
- `plotly-latest.min.js`: The plotly library used by the histograms.
- `histo.js`: Code written by us that controls the interaction and updating of the histograms.
- `d3-tip.js`: A small library used to show tooltips on the map.
- `map.js`: Code written by us that controls the interaction and updating of the map.
- `nv.d3.js`: The library used to create the stack graph.
- `stackgraph.js`: Code written by us that controls the interaction and updating of the stack graph.
