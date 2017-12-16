historgramData = []

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

function update(date1, date2) {

}


function dateIsBetween(x, date1, date2) {
  months = {
    "Jan": 0,
    "Feb": 1,
    "Mar": 2,
    "Apr": 3,
    "May": 4,
    "Jun": 5,
    "Jul": 6,
    "Aug": 7,
    "Sep": 8,
    "Oct": 9,
    "Nov": 10,
    "Dec": 11,
  };

  // From date to aproximated amount of days.
  dx = parseInt(x.substr(0,2)) +
  ( parseInt(months[x.substr(3,3)]) * 31) +
  ( parseInt(x.substr(7,2)) * 375 );
  d1 = parseInt(date1.substr(0,2)) +
  ( parseInt(months[date1.substr(3,3)]) * 31) +
  ( parseInt(date1.substr(7,2)) * 375 );
  d2 = parseInt(date2.substr(0,2)) +
  ( parseInt(months[date2.substr(3,3)]) * 31) +
  ( parseInt(date2.substr(7,2)) * 375 );
  console.log(dx,d1,d2);
  return d1 <= dx && dx <= d2;
}

// function oprotten(data) {
//   return data;
// }



function calculateFrequencies(disturbances) {
  Plotly.d3.csv("../data/processedWeather.csv", function(weather){
    mintempfreq = grouped(weather.map(x => parseInt(x["min_temp"])));
    avgtempfreq = grouped(weather.map(x => parseInt(x["avg_temp"])));
    maxwindgustfreq = grouped(weather.map(x => parseInt(x["max_windgust"])));
    totalprecipitationfreq = grouped(weather.map(x => parseInt(x["total_precipitation"])));
    humidityfreq = grouped(weather.map(x => parseInt(x["humidity"])));
    windspeedreq = grouped(weather.map(x => parseInt(x["windspeed"])));
    minsightreq = grouped(weather.map(x => parseInt(x["min_sight"])));

    // processData(disturbances, []);
    frequencies = {
      "Min Temp": mintempfreq,
      "Avg Temp": avgtempfreq,
      "Max Windgust": maxwindgustfreq,
      "Total Precipitation": totalprecipitationfreq,
      "Humidity": humidityfreq,
      "Windspeed": windspeedreq,
      "Min Sight": minsightreq
    }
    processData(disturbances, frequencies);
  });
}

Plotly.d3.csv("../data/weatherPerDisturbance.csv", function(disturbances){
  calculateFrequencies(disturbances);
});

function processData(data, freq) {

  // var weatherDataPerCondition = {};
  // // Init keys
  // Object.keys(weatherData[0]).forEach((key) => weatherDataPerCondition[key] = []);
  // weatherData.forEach((item) => {
  //   Object.keys(item).forEach([key].push(item[key]))
  // })

  windspeed = grouped(data.map(x => parseInt(x["Windspeed"] )));
  minsight = grouped(data.map(x => parseInt(x["Min Sight"] )));
  windgust = grouped(data.map(x => parseInt(x["Max Windgust"] )));
  mintemp = grouped(data.map(x => parseInt(x["Min Temp"])));
  avgtemp = grouped(data.map(x => parseInt(x["Avg Temp"])));
  humidity = grouped(data.map(x => parseInt(x["Humidity"] )));
  totalprecipitation = grouped(data.map(x => parseInt(x["Total Precipitation"] )));

  console.log(grouped(data.map(x => parseInt(x["Min Temp"]))));

  windspeed.label = "Windspeed";
  minsight.label = "Min Sight";
  windgust.label = "Max Windgust";
  mintemp.label = "Min Temp";
  avgtemp.label = "Avg Temp";
  humidity.label = "Humidity";
  totalprecipitation.label = "Total Precipitation";

  [windspeed, minsight, windgust, mintemp, avgtemp, humidity, totalprecipitation]
    .forEach(function(column) {
      for (var i = 0; i < column[1].length; i++) {
        column[1][i] = column[1][i] / freq[column.label][1][i];
      }
  })

  x1 = { data: mintemp[0], label: "Min Temp" };
  y1 = { data: mintemp[1], label: "Average amount of disturbances" };
  x2 = { data: minsight[0], label: "Min Sight" };
  y2 = { data: minsight[1], label: "Average amount of disturbances" };
  x3 = { data: windgust[0], label: "Max Windgust" };
  y3 = { data: windgust[1], label: "Average amount of disturbances" };
  x4 = { data: humidity[0], label: "Humidity" };
  y4 = { data: humidity[1], label: "Average amount of disturbances" };
  x4 = { data: avgtemp[0], label: "Avg Temp" };
  y4 = { data: avgtemp[1], label: "Average amount of disturbances" };
  x2 = { data: totalprecipitation[0], label: "Total Precipitation" };
  y2 = { data: totalprecipitation[1], label: "Average amount of disturbances" };
  // y = {
  //   data: minsight,
  //   label: "Min Sight"
  // };

var histo1 = {
  y: y1.data,
  x: x1.data,
  type: 'bar'
  // marker: {color: 'rgb(102,0,0)'},
};

var histo2 = {
  y: y2.data,
  x: x2.data,
  type: 'bar'
  // marker: {color: 'rgb(102,0,0)'},
};

var histo3 = {
  y: y3.data,
  x: x3.data,
  type: 'bar'
  // marker: {color: 'rgb(102,0,0)'},
};

var histo4 = {
  y: y4.data,
  x: x4.data,
  type: 'bar'
  // marker: {color: 'rgb(102,0,0)'},
  };

  function layout(_x, _y) {
    return {
      bargap: 0.05,
      bargroupgap: 0.2,
      barmode: "overlay",
      // // title: "Min Temp",
      xaxis: {title: _x.label},
      yaxis: {title: _y.label}
    };
  }

    Plotly.newPlot('myDiv1', [histo1], layout(x1, y1), {displayModeBar: false});
    Plotly.newPlot('myDiv2', [histo2], layout(x2, y2), {displayModeBar: false});
    Plotly.newPlot('myDiv3', [histo3], layout(x3, y3), {displayModeBar: false});
    Plotly.newPlot('myDiv4', [histo4], layout(x4, y4), {displayModeBar: false});
}
