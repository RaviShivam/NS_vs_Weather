// function normal() {
//     var x = 0,
//         y = 0,
//         rds, c;
//     do {
//         x = Math.random() * 2 - 1;
//         y = Math.random() * 2 - 1;
//         rds = x * x + y * y;
//     } while (rds == 0 || rds > 1);
//     c = Math.sqrt(-2 * Math.log(rds) / rds); // Box-Muller transform
//     return x * c; // throw away extra sample y * c
// }
//
// var N = 2000,
//   a = -1,
//   b = 1.2;
//
// var step = (b - a) / (N - 1);
// var t = new Array(N), x = new Array(N), y = new Array(N);

// for(var i = 0; i < N; i++){
//   t[i] = a + step * i;
//   x[i] = (Math.pow(t[i], 3)) + (0.3 * normal() );
//   y[i] = (Math.pow(t[i], 6)) + (0.3 * normal() );
// }

var x, y = [];
var x1, x2, x3, x4, y1, y2, y3, y4 = []
var sepallength, sepalwidth = [];

// Plotly.d3.csv("flowers.csv", function(data){ processData(data) } );
// function processData(data) {
//   sepallength = data.map(x => x["sepal length"] );
//   sepalwidth = data.map(x => x["sepal width"] );

Plotly.d3.csv("../data/weatherPerDisturbance.csv", function(data){ processData(data) } );
function processData(data) {
  console.log(data);
  windspeed = data.map(x => x["Windspeed"] );
  minsight = data.map(x => x["Min Sight"] );
  windgust = data.map(x => x["Max Windgust"] );
  mintemp = data.map(x => x["Min Temp"] );
  humidity = data.map(x => x["Humidity"] );

  x = {
    data: windspeed,
    label: "Windspeed"
  }
  y = {
    data: minsight,
    label: "Min Sight"
  }
  x2 = {
    data: windgust,
    label: "Windgust"
  }
  y2 = {
    data: mintemp,
    label: "Min Temp"
  }
  x3 = {
    data: mintemp,
    label: "Min Temp"
  }
  y3 = {
    data: humidity,
    label: "Humidity"
  }
  x4 = {
    data: minsight,
    label: "Min Sight"
  }
  y4 = {
    data: mintemp,
    label: "Min Temp"
  }


var scatter = {
  // x: x,
  // y: y,
  // x: sepalwidth,
  // y: sepallength,s
  x: x.data,
  y: y.data,
  mode: 'markers',
  name: 'disturbances',
  marker: {
    color: 'rgb(0,0,102)',
    size: 2,
    opacity: 0.4
  },
  type: 'scatter'
};
var density1 = {
  // x: x,
  // y: y,
  // x: sepalwidth,
  // y: sepallength,
  x: x.data,
  y: y.data,
  name: 'density',
  ncontours: 15,
  colorscale: 'Hot',
  reversescale: true,
  showscale: true,
  type: 'histogram2dcontour'
};
var density2 = {
  x: x2.data,
  y: y2.data,
  name: 'density',
  ncontours: 15,
  colorscale: 'Hot',
  reversescale: true,
  showscale: true,
  type: 'histogram2dcontour'
};
var density3 = {
  x: x3.data,
  y: y3.data,
  name: 'density',
  ncontours: 15,
  colorscale: 'Hot',
  reversescale: true,
  showscale: true,
  type: 'histogram2dcontour'
};
var density4 = {
  x: x4.data,
  y: y4.data,
  name: 'density',
  ncontours: 15,
  colorscale: 'Hot',
  reversescale: true,
  showscale: true,
  type: 'histogram2dcontour'
};
// var trace3 = {
//   x: x,
//   name: 'x density',
//   marker: {color: 'rgb(102,0,0)'},
//   yaxis: 'y2',
//   type: 'histogram'
// };
// var trace4 = {
//   y: y,
//   name: 'y density',
//   marker: {color: 'rgb(102,0,0)'},
//   xaxis: 'x2',
//   type: 'histogram'
// };

// var data = [sepalwidth, sepallength];
var data = [density1];
function giveLayout(_x, _y) {
  var layout = {
    showlegend: false,
    autosize: true,
    // width: 600,
    // height: 550,
    margin: {t: 50},
    // hover: false,
    hovermode: 'closest',
    bargap: 0,
    xaxis: {
      // domain: [0, 0.85],
      showgrid: false,
      zeroline: false,
      fixedrange: true,
      title: _x.label,
    },
    yaxis: {
      // domain: [0, 0.85],
      showgrid: false,
      zeroline: false,
      fixedrange: true,
      title: _y.label,
    },
    // xaxis2: {
    //   domain: [0.85, 1],
    //   showgrid: true,
    //   zeroline: false,
    //   fixedrange: true
    // },
    // yaxis2: {
    //   domain: [0.85, 1],
    //   showgrid: false,
    //   zeroline: false,
    //   fixedrange: true
    // }
  };
  return layout;
};
Plotly.newPlot('myDiv', [density1], giveLayout(x, y), {displayModeBar: false});
Plotly.newPlot('myDiv1', [density2], giveLayout(x2, y2),{displayModeBar: false});
Plotly.newPlot('myDiv2', [density3], giveLayout(x3, y3),{displayModeBar: false});
Plotly.newPlot('myDiv3', [density4], giveLayout(x4, y4),{displayModeBar: false});
// Plotly.newPlot('myDiv4', data, layout,{displayModeBar: false});
// Plotly.newPlot('myDiv5', data, layout,{displayModeBar: false});

}
