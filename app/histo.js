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

function countKeys()

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

function calculateFrequencies(disturbances, key) {
  Plotly.d3.csv("../data/processedWeather.csv", function(data2){
    // tempfrequency = grouped(data.map(x => parseInt(x["min_temp"])));
    processData(disturbances, []);
    // processData(data, tempfrequency);
  });
}

Plotly.d3.csv("../data/weatherPerDisturbance.csv", function(data){ calculateFrequencies(data) } );

function processData(data, freq) {

  console.log(data);

  windspeed = grouped(data.map(x => parseInt(x["Windspeed"] )));
  minsight = grouped(data.map(x => parseInt(x["Min Sight"] )));
  windgust = grouped(data.map(x => parseInt(x["Max Windgust"] )));
  mintemp = grouped(data.map(x => parseInt(x["Min Temp"])));
  humidity = grouped(data.map(x => parseInt(x["Humidity"] )));

  // Normalize
  // mintemp.forEach(function(item) {
  //
  // });
  // //
  // var counted = 0;
  // function count(item) {
  //   if(item === -15) {
  //     counted++;
  //   }
  // }
  // mintemp.forEach(count);
  // console.log(counted);

  x1 = { data: mintemp[0], label: "Min Temp" };
  y1 = { data: mintemp[1], label: "Count" };
  x2 = { data: minsight[0], label: "Min Sight" };
  y2 = { data: minsight[1], label: "Count" };
  x3 = { data: windgust[0], label: "Max Windgust" };
  y3 = { data: windgust[1], label: "Count" };
  x4 = { data: humidity[0], label: "Humidity" };
  y4 = { data: humidity[1], label: "Count" };
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
