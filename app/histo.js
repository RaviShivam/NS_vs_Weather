var histogramData = [];
var histoWeatherData = []
var plotDivs = ['histo1','histo2','histo3','histo4','histo5','histo6'];
var plotted = false;

Plotly.d3.csv("../data/weatherPerDisturbance.csv", function(disturbances) {
  histogramData = disturbances;
  if( histoWeatherData.length == 0) {
    Plotly.d3.csv("../data/processedWeather.csv", function(weather) {
      histoWeatherData = weather;
      processData(disturbances);
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

function updateHistograms(date1, date2, categories) {
  var data = histogramData;
  if(data.length > 0) {
    console.log("called");
    if(date1 && date2) {
      data = data.filter(x => dateIsBetween(x["Date"], date1, date2));
    }
    if(categories.length > 0) {
      data = data.filter(x => categories.includes(x["Cause Group"]));
    }
    processData(data);
    // plotDivs.forEach(function(item){Plotly.purge(item)});
    // restyle(processData(data));
  }
}

function dateIsBetween(x, date1, date2) {
  months = {
    "Jan": "-01-",
    "Feb": "-02-",
    "Mar": "-03-",
    "Apr": "-04-",
    "May": "-05-",
    "Jun": "-06-",
    "Jul": "-07-",
    "Aug": "-08-",
    "Sep": "-09-",
    "Oct": "-10-",
    "Nov": "-11-",
    "Dec": "-12-",
  };

  xdate = new Date("20" + x.substr(7,2) + months[x.substr(3,3)] + x.substr(0,2));
  return date1 <= xdate && xdate <= date2;
}

function processData(disturbances) {

    console.log(histoWeatherData);
    mintempfreq = grouped(histoWeatherData.map(x => parseInt(x["min_temp"])));
    avgtempfreq = grouped(histoWeatherData.map(x => parseInt(x["avg_temp"])));
    maxwindgustfreq = grouped(histoWeatherData.map(x => parseInt(x["max_windgust"])));
    totalprecipitationfreq = grouped(histoWeatherData.map(x => parseInt(x["total_precipitation"])));
    humidityfreq = grouped(histoWeatherData.map(x => parseInt(x["humidity"])));
    windspeedreq = grouped(histoWeatherData.map(x => parseInt(x["windspeed"])));
    minsightreq = grouped(histoWeatherData.map(x => parseInt(x["min_sight"])));

    frequencies = {
      "Min Temp": mintempfreq,
      "Avg Temp": avgtempfreq,
      "Max Windgust": maxwindgustfreq,
      "Total Precipitation": totalprecipitationfreq,
      "Humidity": humidityfreq,
      "Windspeed": windspeedreq,
      "Min Sight": minsightreq
    }
    return createBars(disturbances, frequencies);
}

function createBars(data, freq) {
  windspeed = grouped(data.map(x => parseInt(x["Windspeed"] )));
  minsight = grouped(data.map(x => parseInt(x["Min Sight"] )));
  windgust = grouped(data.map(x => parseInt(x["Max Windgust"] )));
  mintemp = grouped(data.map(x => parseInt(x["Min Temp"] )));
  // avgtemp = grouped(data.map(x => parseInt(x["Avg Temp"] )));
  humidity = grouped(data.map(x => parseInt(x["Humidity"] )));
  totalprecipitation = grouped(data.map(x => parseInt(x["Total Precipitation"] )));

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
      Plotly.newPlot('histo'+(i+1), [features[i].bars], features[i].layout, {displayModeBar: false});
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
