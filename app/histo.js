var histogramData = [];
var histoWeatherData = [];
var plotted = false;
var plotScope = {};
var weatherConditions = [
  { label: 'Windspeed (m/s)', value: 'FG', scale: 0.1 },
  { label: 'Min Sight (m)', value: 'VVN', scale: 100 },
  { label: 'Max Windgust (m/s)', value: 'FXX', scale: 0.1 },
  { label: 'Min Temp (C)', value: 'TN', scale: 0.1 },
  { label: 'Humidity (%)', value: 'UG', scale: 1 },
  { label: 'Total Precipitation (mm)', value: 'RH', scale: 0.1 },
];

var shortMonths = { "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12 };
function parseWeirdDateFormat(d) {
  var split = d.split('-');
  return new Date(parseInt("20" + split[2]), shortMonths[split[1]], parseInt(split[2]));
}

var featureLabels = ["Windspeed", "Min Sight", "Max Windgust", "Min Temp", "Humidity", "Total Precipitation"];
var featureNames = ["windspeed", "min_sight", "max_windgust", "min_temp", "humidity", "total_precipitation"];
var frequencies;

var weatherFeaturesCF, weatherDateDimension,
  disturbanceFeaturesCF, disturbanceDateDimension;

// Plotly.d3.csv("../data/weatherPerDisturbance.csv", function(disturbances) {
Plotly.d3.csv("../data/delaysWithProvinceAndWeather.csv", function(disturbances) {
  histogramData = disturbances;
  // Set types
  histogramData.forEach(function (d) {
    d.Date = parseWeirdDateFormat(d.Date);
    d.Province = d.Province.split(' ');
  });

  Plotly.d3.csv("../data/processedWeather.csv", function(weather) {
    histoWeatherData = weather;

    // Parse all features correctly
    histoWeatherData.forEach(function(d) {
      featureNames.forEach(function(featName) {
        d[featName] = parseInt(d[featName]);
      });
      d.date = new Date(d.date);
    });

    // Set up crossfilter to find frequencies per day
    var histoWeatherDataCF = crossfilter(histoWeatherData);
    weatherDateDimension = histoWeatherDataCF.dimension(function(d) { return d.date });
    weatherFeaturesCF = featureNames.map(function(featName) {
      var featDimension = histoWeatherDataCF.dimension(function(d) { return d[featName] });
      var featGroup = featDimension.group(function(d) { return d });
      return {
        feature: featName,
        dimension: featDimension,
        group: featGroup
      };
    });

    processData();
    return createBars(disturbances, frequencies);
  });

});

function grouped(arr) {
    var a = [], b = [], prev;

    arr.sort();
    for ( var i = 0; i < arr.length; i++ ) {
        if ( arr[i] !== prev ) {
            a.push(arr[i]);
            b.push(1);
        } else {
            b[b.length-1]++;
        }
        prev = arr[i];
    }
    return [a, b];
}

function updateHistograms(date1, date2, categories, provinces) {
  processData();
  var data = histogramData;
  if(data.length > 0) {
    if(date1 && date2) {
      data = data.filter(function(x) { return dateIsBetween(x["Date"], date1, date2) });
    }
    if(categories.length > 0) {
      data = data.filter(function(x) { return categories.includes(x["Cause Group"]) });
    }
    if(provinces.length > 0) {
      data = data.filter(function(x) { return x["Province"].includes(provinces[0]) });
    }
    createBars(data);
  }
}

function dateIsBetween(x, date1, date2) {
  return date1 <= x && x <= date2;
}

function processData() {
    // var mintempfreq = grouped(histoWeatherData.map(x => (x["min_temp"])));
    // var maxwindgustfreq = grouped(histoWeatherData.map(x => (x["max_windgust"])));
    // var totalprecipitationfreq = grouped(histoWeatherData.map(x => (x["total_precipitation"])));
    // var humidityfreq = grouped(histoWeatherData.map(x => (x["humidity"])));
    // var windspeedreq = grouped(histoWeatherData.map(x => (x["windspeed"])));
    // var minsightreq = grouped(histoWeatherData.map(x => (x["min_sight"])));
    //
    // frequencies = {
    //   "Min Temp": mintempfreq,
    //   "Max Windgust": maxwindgustfreq,
    //   "Total Precipitation": totalprecipitationfreq,
    //   "Humidity": humidityfreq,
    //   "Windspeed": windspeedreq,
    //   "Min Sight": minsightreq
    // };
  // Filter per date
  weatherDateDimension.filterAll();
  weatherDateDimension.filter(window.dateExtent);

  // Find frequencies for each feature
  frequencies = {};
  weatherFeaturesCF.forEach(function (weatherFeature) {
    var groupedData = weatherFeature.group.all();
    frequencies[weatherFeature.feature] = {};
    groupedData.forEach(function (item) { frequencies[weatherFeature.feature][item.key] = item.value });
  });
}

function createBars(filteredData) {
  const barFeatures = [];
  featureLabels.forEach(function(label, labelIndex) {
    var feature = grouped(filteredData.map(function(x) { return x[label]; }));

    // Normalise feature data
    for (var i = 0; i < feature[1].length; i++) {
      const totalWeatherConditionOccurances = frequencies[featureNames[labelIndex]][feature[0][i]];
      // console.log(frequencies[featureNames[labelIndex]], feature[0]);
      feature[1][i] = feature[1][i] / totalWeatherConditionOccurances;
    }

    barFeatures.push({
      label: label,
      bars: {
        x: feature[0],
        y: feature[1],
        type: "bar",
      },
      layout: {
        bargap: 0,
        bargroupgap: 0.01,
        barmode: "overlay",
        xaxis: {
          title: label
        },
        yaxis: {
          title: "Average amount of disturbances",
          fixedrange: true
        }
      }
    });
  });

  // Plot the data.
  if (!plotted) {
    for (var i = 0; i < barFeatures.length; i++) {
      Plotly.newPlot('histo'+(i+1), [barFeatures[i].bars], barFeatures[i].layout, {displayModeBar: false});
      plotScope[barFeatures[i].label] = null;
      setListener('histo'+(i+1), barFeatures[i].label);
    }
    plotted = true;
  } else {
    for (var i = 0; i < barFeatures.length; i++) {
      var update = {
        x: [barFeatures[i].bars.x],
        y: [barFeatures[i].bars.y]
      };
      Plotly.restyle('histo'+(i+1), update);
    }
  }
}

function setListener(name, label) {
  var div = document.getElementById(name);
  div.label = label;
  div.on('plotly_relayout',
      function(eventdata){
        console.log(eventdata);
        console.log(div.label);
        var start = eventdata['xaxis.range[0]'];
        var end = eventdata['xaxis.range[1]']
        if(start && end) {
          plotScope[div.label] = {'start': start, 'end': end};
        } else {
          plotScope[div.label] = null;
        }
      });
}

// Click on plot to show weather condition in map:
weatherConditions.forEach(function (con, i) {
  document.getElementById('histo' + (i+1)).onclick = function() {
    chooseWeatherCondition(con);
  }
});
// Init map
setTimeout(function() { chooseWeatherCondition(weatherConditions[0]); }, 2000);
