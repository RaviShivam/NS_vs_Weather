
// Prepare variables for later use
var date, months, duration, durations, cause, causes, provinces, provincesGroup,
  stackGraphData = {}, monthIndexLookup = {}, getEmptyMonthData;
function formatMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

d3.csv("../data/disturbancesWithProvinces.csv", function(error, disturbances) {
  var monthIds = [];

  // Set types
  disturbances.forEach(function (d, i) {
    d.index = i;
    d.start_time = new Date(d.start_time);
    d.end_time = new Date(d.end_time);
    d.duration_minutes = +d.duration_minutes || 0;
    d.provinces = d.provinces ? d.provinces.split(' ') : [];

    var monthId = formatMonth(d.start_time);
    if (monthIds.length === 0 || monthIds[monthIds.length - 1] !== monthId) {
      monthIds.push(monthId);
    }
  });

  // Prepare month data
  monthIds.forEach(function (monthId, i) { monthIndexLookup[monthId] = i; });
  getEmptyMonthData = function() { return monthIds.map(function(d) { return [d, 0]}); };


  // Prepare crossfilter for fast filtering/grouping of data
  var disturbancesCF = crossfilter(disturbances);

  date = disturbancesCF.dimension(function (d) { return d.start_time; }),
  months = date.group(function (d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-01'; }),

  duration = disturbancesCF.dimension(function (d) { return d.duration_minutes / 60 }),
  durations = duration.group(function (d) { return Math.floor(d / 10) * 10; }),

  cause = disturbancesCF.dimension(function (d) { return d.cause_group });
  causes = cause.group(function (d) { return d });

  // Grouping for arrays needs some additional logic
  // var arrayVariable = 'provinces';
  // function reduceAdd(p, v) {
  //   v[arrayVariable].forEach(function (val) {
  //     p[val] = (p[val] || 0) + 1;
  //   });
  //   return p;
  // }
  // function reduceRemove(p, v) {
  //   v[arrayVariable].forEach(function (val) {
  //     p[val] = (p[val] || 0) - 1;
  //   });
  //   return p;
  // }
  // function reduceInitial() { return {}; }
  // provinces = disturbancesCF.dimension(function (d) { return d.provinces });
  // provincesGroup = provinces.groupAll().reduce(reduceAdd, reduceRemove, reduceInitial);

  // Get disturbances per cause per month
  var causeTypes = [ "accidents", "engineering work", "external", "infrastructure", "logistical", "rolling stock", "staff", "unknown", "weather" ];
  causeTypes.forEach(function (c, i) {
    cause.filterAll();
    cause.filter(c);
    var causeDisturbancesCF = crossfilter(cause.top(Infinity));
    var causeDate = causeDisturbancesCF.dimension(function (d) { return d.start_time; });
    var causeMonths = causeDate.group(function (d) { return formatMonth(d) });
    var causeProvinces = causeDisturbancesCF.dimension(function (d) { return d.provinces });
    // var causeProvincesGroup = causeProvinces.groupAll().reduce(reduceAdd, reduceRemove, reduceInitial);


    stackGraphData[c] = {
      monthsGroup: causeMonths,
      provinceFilter: causeProvinces,
      values: getEmptyMonthData() // new instance of array, can be reused for every cause
    };
  });

  // Init stack graph
  onFilter();
});

// Actual filtering happens here
/////////////////////////////////////////////
function onFilter(dateFilter, provinceFilter) {
  if (dateFilter) {
    date.filter(dateFilter[0], dateFilter[0]);
  }
  if (provinceFilter) {

  }

  // Filter for each cause group in the stack graph
  var stackGraphInput = [];
  Object.keys(stackGraphData).forEach(function (key) {
    if (provinceFilter) {
      stackGraphData[key].provinceFilter.filterAll();
      if (provinceFilter.length !== 0) { // No filter -> show all
        stackGraphData[key].provinceFilter.filterFunction(function (d) {
          for (var i = 0; i < d.length; i++) {
            if (provinceFilter.indexOf(d[i]) >= 0) return true;
          }
          return false;
        });
      }
    }
    var causeData = stackGraphData[key].monthsGroup.all();
    var values = stackGraphData[key].values;
    causeData.forEach(function(d) { values[monthIndexLookup[d.key]] = [d.key, d.value] });
    stackGraphInput.push({
      key: key,
      values: values
    });
  });
  // console.log(stackGraphInput);
  // console.log(groupedByCause, groupedByMonth);
  updateStackGraph(stackGraphInput);
}

function updateStackGraph(data) {
  d3.select('#stackGraphContainer')
      .datum(data)
      .transition().duration(500)
      .call(window.stackGraphChart);
}