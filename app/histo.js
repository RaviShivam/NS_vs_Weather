histogramData = [];
plotDivs = ['histo1','histo2','histo3','histo4','histo5','histo6'];

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
  if(date1 && date2) {
    data = data.filter(x => dateIsBetween(x["Date"], date1, date2));
  }
  if(categories.length > 0) {
    data = data.filter(x => categories.includes(x["Cause Group"]));
  }
  plotDivs.forEach(function(item){Plotly.purge(item)});
  processData(data);
  return data;
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

  pre = date1;
  post = date2;
  return pre <= xdate && xdate <= post;
}

function processData(disturbances) {
  Plotly.d3.csv("../data/processedWeather.csv", function(weather){
    mintempfreq = grouped(weather.map(x => parseInt(x["min_temp"])));
    avgtempfreq = grouped(weather.map(x => parseInt(x["avg_temp"])));
    maxwindgustfreq = grouped(weather.map(x => parseInt(x["max_windgust"])));
    totalprecipitationfreq = grouped(weather.map(x => parseInt(x["total_precipitation"])));
    humidityfreq = grouped(weather.map(x => parseInt(x["humidity"])));
    windspeedreq = grouped(weather.map(x => parseInt(x["windspeed"])));
    minsightreq = grouped(weather.map(x => parseInt(x["min_sight"])));

    // plot(disturbances, []);
    frequencies = {
      "Min Temp": mintempfreq,
      "Avg Temp": avgtempfreq,
      "Max Windgust": maxwindgustfreq,
      "Total Precipitation": totalprecipitationfreq,
      "Humidity": humidityfreq,
      "Windspeed": windspeedreq,
      "Min Sight": minsightreq
    }
    plot(disturbances, frequencies);
  });
}

Plotly.d3.csv("../data/weatherPerDisturbance.csv", function(disturbances) {
  histogramData = disturbances;
  processData(disturbances);
});

function plot(data, freq) {
  windspeed = grouped(data.map(x => parseInt(x["Windspeed"] )));
  minsight = grouped(data.map(x => parseInt(x["Min Sight"] )));
  windgust = grouped(data.map(x => parseInt(x["Max Windgust"] )));
  mintemp = grouped(data.map(x => parseInt(x["Min Temp"] )));
  avgtemp = grouped(data.map(x => parseInt(x["Avg Temp"] )));
  humidity = grouped(data.map(x => parseInt(x["Humidity"] )));
  totalprecipitation = grouped(data.map(x => parseInt(x["Total Precipitation"] )));

  windspeed.label = "Windspeed";
  minsight.label = "Min Sight";
  windgust.label = "Max Windgust";
  mintemp.label = "Min Temp";
  avgtemp.label = "Avg Temp";
  humidity.label = "Humidity";
  totalprecipitation.label = "Total Precipitation";

  features = [windspeed, windgust, minsight, mintemp, avgtemp, humidity, totalprecipitation];

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
      bargap: 0.05,
      bargroupgap: 0.2,
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
  for (var i = 0; i < features.length; i++) {
    Plotly.newPlot('histo'+(i+1), [features[i].bars], features[i].layout, {displayModeBar: false});
  }
}
