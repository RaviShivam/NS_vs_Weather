var colors = d3.scale.category20();
var chart;

function throttle(fn, threshhold, scope) {
  threshhold || (threshhold = 250);
  var last,
      deferTimer;
  return function () {
    var context = scope || this;

    var now = +new Date,
        args = arguments;
    if (last && now < last + threshhold) {
      // hold on to it
      clearTimeout(deferTimer);
      deferTimer = setTimeout(function () {
        last = now;
        fn.apply(context, args);
      }, threshhold);
    } else {
      last = now;
      fn.apply(context, args);
    }
  };
}
var chooseDateExtent = throttle(function () {
    var prevExtent = window.dateExtent;
    window.dateExtent = [new Date(window.timeRange[0]), new Date(window.timeRange[1])];

    if (prevExtent && (prevExtent[0].getTime() !== window.dateExtent[0].getTime() || prevExtent[1].getTime() !== window.dateExtent[1].getTime())) {
      chooseMapDateExtent(window.dateExtent);
      updateHistograms(window.dateExtent[0], window.dateExtent[1], window.typesArray || [], window.selectedProvinces || []);
    }
  }, 500);


window.onBrushEnd = function() {
  // chooseMapDateExtent([new Date(window.timeRange[0]), new Date(window.timeRange[1])]);
};
window.onBrush = chooseDateExtent;

window.types = {};
window.typesArray = [];

window.chooseTypes = function(state) {
  causeTypes.forEach(function (type, i) {
    window.types[type] = !state.disabled[i];
  });
  window.typesArray = causeTypes.filter(function(x) { return types[x] });
  // chooseMapTypes(types);
  chooseMapDateExtent(window.dateExtent);
  updateHistograms(window.dateExtent[0], window.dateExtent[1], window.typesArray || [], window.selectedProvinces || []);
};


nv.addGraph(function() {
    chart = nv.models.stackedAreaWithFocusChart()
        .useInteractiveGuideline(true)
        .x(function(d) { return d[0] })
        .y(function(d) { return d[1] })
        .controlLabels({stacked: "Stacked"})
        .duration(300);

    window.stackGraphChart = chart;

    chart.brushExtent([1293843600000, 1504227600000]);

    chart.xAxis.tickFormat(function(d) { return d3.time.format('%Y-%m-%d')(new Date(d)) });
    chart.x2Axis.tickFormat(function(d) { return d3.time.format('%Y-%m-%d')(new Date(d)) });
    chart.yAxis.tickFormat(d3.format(',.4f'));
    chart.y2Axis.tickFormat(d3.format(',.4f'));
    chart.legend.vers('furious');

    // d3.select('#stackGraphContainer')
    //     .datum(histcatexplong)
    //     .transition().duration(1000)
    //     .call(chart)
    //     .each('start', function() {
    //         setTimeout(function() {
    //             d3.selectAll('#stackGraphContainer *').each(function() {
    //                 if(this.__transition__)
    //                     this.__transition__.duration = 4;
    //             })
    //         }, 0)
    //     });
    nv.utils.windowResize(chart.update);
    return chart;
});
