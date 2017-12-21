var histogramData = [];
var histoWeatherData = []
var plotDivs = ['histo1','histo2','histo3','histo4','histo5','histo6'];
var plotted = false;

var shortMonths = { "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12 };
function parseWeirdDateFormat(d) {
  var split = d.split('-');
  return new Date(parseInt("20" + split[2]), shortMonths[split[1]], parseInt(split[2]));
}

var featureNames = [ "min_temp", "avg_temp", "max_windgust", "total_precipitation", "humidity", "windspeed", "min_sight"];
var frequencies;

// Plotly.d3.csv("../data/weatherPerDisturbance.csv", function(disturbances) {
Plotly.d3.csv("../data/delaysWithProvinceAndWeather.csv", function(disturbances) {
  histogramData = disturbances;
  // Set types
  histogramData.forEach(function (d) {
    d.Date = parseWeirdDateFormat(d.Date);
    featureNames.forEach(function(featName) {
      d[featName] = parseInt(d[featName]);
    });
    d.Province = d.Province.split(' ');
  });

  if (histoWeatherData.length === 0) {
    Plotly.d3.csv("../data/processedWeather.csv", function(weather) {
      histoWeatherData = weather;
      processData(disturbances);
      return createBars(disturbances, frequencies);
    });
  }
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

function updateHistograms(date1, date2, categories, province) {
  // console.log('inputs',date1, date2, categories, province);
  var data = histogramData;
  if(data.length > 0) {
    if(date1 && date2) {
      data = data.filter(x => dateIsBetween(x["Date"], date1, date2));
    }
    if(categories.length > 0) {
      data = data.filter(x => categories.includes(x["Cause Group"]));
    }
    if(province) {
      data = data.filter(x => x["Province"].includes(province));
    }
    createBars(data, frequencies);
  }
}

function dateIsBetween(x, date1, date2) {
  return date1 <= x && x <= date2;
}

function processData() {
    var mintempfreq = grouped(histoWeatherData.map(x => (x["min_temp"])));
    var maxwindgustfreq = grouped(histoWeatherData.map(x => (x["max_windgust"])));
    var totalprecipitationfreq = grouped(histoWeatherData.map(x => (x["total_precipitation"])));
    var humidityfreq = grouped(histoWeatherData.map(x => (x["humidity"])));
    var windspeedreq = grouped(histoWeatherData.map(x => (x["windspeed"])));
    var minsightreq = grouped(histoWeatherData.map(x => (x["min_sight"])));

    frequencies = {
      "Min Temp": mintempfreq,
      "Max Windgust": maxwindgustfreq,
      "Total Precipitation": totalprecipitationfreq,
      "Humidity": humidityfreq,
      "Windspeed": windspeedreq,
      "Min Sight": minsightreq
    };
}

function createBars(data, freq) {
  var windspeed = grouped(data.map(x => (x["Windspeed"] )));
  var minsight = grouped(data.map(x => (x["Min Sight"] )));
  var windgust = grouped(data.map(x => (x["Max Windgust"] )));
  var mintemp = grouped(data.map(x => (x["Min Temp"] )));
  var humidity = grouped(data.map(x => (x["Humidity"] )));
  var totalprecipitation = grouped(data.map(x => (x["Total Precipitation"] )));

  windspeed.label = "Windspeed";
  minsight.label = "Min Sight";
  windgust.label = "Max Windgust";
  mintemp.label = "Min Temp";
  // avgtemp.label = "Avg Temp";
  humidity.label = "Humidity";
  totalprecipitation.label = "Total Precipitation";

  features = [windspeed, windgust, minsight, mintemp, totalprecipitation, humidity];

  //Normalize all features, set the plotting attributes and layout per plot.
  features.forEach(function(feature) {
      for (var i = 0; i < feature[1].length; i++) {
        feature[1][i] = feature[1][i] / freq[feature.label][1][i];
      }
    feature.bars = {
      x: feature[0],
      y: feature[1],
      type: "bar",
    };
    feature.layout = {
      bargap: 0,
      bargroupgap: 0.01,
      barmode: "overlay",
      xaxis: {
        title: feature.label,
        fixedrange: true
      },
      yaxis: {
        title: "Average amount of disturbances",
        fixedrange: true
      }
    };
  });

  // Plot the data.
  if (!plotted) {
    for (var i = 0; i < features.length; i++) {
      Plotly.newPlot('histo'+(i+1), [features[i].bars], features[i].layout, {displayModeBar: false});
    }
    plotted = true;
  } else {
    for (var i = 0; i < features.length; i++) {
      // Plotly.newPlot('histo'+(i+1), [features[i].bars], features[i].layout, {displayModeBar: false});
      var update = {
        x: [features[i].bars.x],
        y: [features[i].bars.y],
      }
      Plotly.restyle('histo'+(i+1), update);
    }
  }
}

// Click on plot to show weather condition in map:
var weatherConditions = [
  { label: 'Windspeed (m/s)', value: 'FG', scale: 0.1 },
  { label: 'Min Sight (m)', value: 'VVN', scale: 100 },
  { label: 'Max Windgust (m/s)', value: 'FXX', scale: 0.1 },
  { label: 'Min Temp (C)', value: 'TN', scale: 0.1 },
  // { label: 'Avg Temp (C)', value: 'TG', scale: 0.1 },
  { label: 'Total Precipitation (mm)', value: 'RH', scale: 0.1 },
  { label: 'Humidity (%)', value: 'UG', scale: 1 },
];
weatherConditions.forEach(function (con, i) {
  document.getElementById('histo' + (i+1)).onclick = function() {
    chooseWeatherCondition(con);
  }
});
// Init map
setTimeout(function() { chooseWeatherCondition(weatherConditions[0]); }, 2000);
