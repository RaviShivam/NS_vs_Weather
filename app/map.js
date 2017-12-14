// ----------------- SETTING UP D3 STUFF ----------------------------------------
// ------------------------------------------------------------------------------
var width = document.body.clientWidth,
    height = document.body.clientHeight / 4 * 3;

var projection = d3.geo.mercator()
    .scale(1)
    .translate([0, 0]);
var path = d3.geo.path()
    .projection(projection)
    .pointRadius(function() { return 1; });

var svg = d3.select("#mapContainer").append("svg")
    .attr("width", width)
    .attr("height", height);
svg.append("rect")
    .attr("class", "background")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", 'black')
    .on("click", reset);

var g = svg.append("g");
var active = d3.select(null);

var zoom = d3.behavior.zoom()
    .scaleExtent([0.5, 8])
    .on("zoom", zoomed);

svg.call(zoom);

function zoomed() {
  // g.style("stroke-width", 1.5 / d3.event.transform.k + "px");
    zoom.translate(d3.event.translate);
    g.attr("transform", "translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")");
}

function focus(d) {
  if (active.node() === this) return reset();
  active.classed("active", false);
  active = d3.select(this).classed("active", true);

  var bounds = path.bounds(d),
      dx = bounds[1][0] - bounds[0][0],
      dy = bounds[1][1] - bounds[0][1],
      x = (bounds[0][0] + bounds[1][0]) / 2,
      y = (bounds[0][1] + bounds[1][1]) / 2,
      scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / width, dy / height))),
      translate = [width / 2 - scale * x, height / 2 - scale * y];

  g.transition()
      .duration(750)
      .attr('transform', 'translate(' + translate + ')' + " scale(" + scale + ")");
  zoom.scale(scale);
  zoom.translate(translate);
}

function reset() {
  active.classed("active", false);
  active = d3.select(null);
  g.transition()
      .duration(750)
      .attr('transform', 'translate(' + [0.5, 0.5] + ') scale(1)');
  zoom.scale(1);
  zoom.translate([0.5, 0.5]);

}

// Setup layer order
var provinceLayer = g.append("g");
var trackLayer = g.append("g");
var stationLayer = g.append("g");

function capitalize(s) { return s && s[0].toUpperCase() + s.slice(1); }
/* Initialize tooltip */
var tip = d3.tip().attr('class', 'd3-tip')
    .offset([-10, 0])
    .html(function() {
      return "<strong>" + capitalize(this.getAttribute("class")) + "</strong> <span style='color:red'>" + this.id + "</span>";
    });
svg.call(tip);

// ----------------- ADD MAP ----------------------------------------------------
// ------------------------------------------------------------------------------
const provinceNames = [
    'Groningen',
    'Friesland',
    'Drenthe',
    'Overijssel',
    'Flevoland',
    'Gelderland',
    'Utrecht',
    'Noord-Holland',
    'Zuid-Holland',
    'Zeeland',
    'Noord-Brabant',
    'Limburg'
];
d3.json("../data/provinces.json", function(error, data) {
  var colour = d3.scale.ordinal(d3.schemeCategory20);

  // Center the map
  var l = topojson.feature(data, data.objects.subunits).features[3],
      b = path.bounds(l),
      s = .2 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height),
      t = [(width - s * (b[1][0] + b[0][0])) / 2, (height - s * (b[1][1] + b[0][1])) / 2];
  projection
      .scale(s)
      .translate(t);

  provinceLayer.selectAll("path")
      .data(topojson.feature(data, data.objects.subunits).features).enter()
      .append("path")
      .attr("d", path)
      .attr("fill", function(d, i) { return colour(i); })
      .attr("stroke", "white")
      .attr("stroke-width", 0.2)
      .attr("class", "province")
      .attr("id", function(d) { return d.properties.name; })
      .on('dragend', function(d){  d3.event.sourceEvent.stopPropagation() })
      .on("click", focus)
      .on('mouseover', tip.show)
      .on('mouseout', tip.hide);

  const min = -10, max = 10;

  // Legend
  svg.append("linearGradient")
      .attr("id", "temperature-gradient")
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "100%").attr("y2", "0%")
      .selectAll("stop")
      .data([
        {offset: "0%", color: "blue"},
        {offset: "100%", color: "red"}
      ])
      .enter().append("stop")
      .attr("offset", function(d) { return d.offset; })
      .attr("stop-color", function(d) { return d.color; });

    var legendWidth = width * 0.6,
        legendHeight = 10;

    height -= 150;

    //Color Legend container
    var legendsvg = svg.append("g")
        .attr("class", "legendWrapper")
        .attr("transform", "translate(" + (width/2 - 10) + "," + (height+50) + ")")
        .attr("fill", "white");
    legendsvg.append("rect")
        .attr("x", -legendWidth/2)
        .attr("y", 10)
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .attr("fill", "rgba(255, 255, 255, 0.5)");

    //Draw the Rectangle
    legendsvg.append("rect")
        .attr("class", "legendRect")
        .attr("x", -legendWidth/2)
        .attr("y", 10)
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .attr("fill", "url(#temperature-gradient");

    //Append title
    legendsvg.append("text")
        .attr("class", "legendTitle")
        .attr("x", 0)
        .attr("y", -2)
        .text("Temperature (C)");

    //Set scale for x-axis
    var xScale = d3.scale.linear()
        .range([0, legendWidth])
        .domain([min, max]);

    //Define x-axis
    var xAxis = d3.svg.axis()
        .orient('bottom')
        .ticks(5)
        .scale(xScale);

    //Set up X axis
    legendsvg.append("g")
        .attr("class", "axis axisText")  //Assign "axis" class
        .attr("transform", "translate(" + (-legendWidth/2) + "," + (10 + legendHeight) + ")")
        .call(xAxis);
});

// ----------------- WEATHER PER PROVINCE IN MAP --------------------------------
// ------------------------------------------------------------------------------
var weatherData = [];
d3.csv("../data/weatherPerProvince.csv", function(error, data) {
  weatherData = data;
  plotWeather(['20130101', '20170101'], 'Temperature');
});

function convertDate(inputFormat, seperator) {
  function pad(s) { return (s < 10) ? '0' + s : s; }
  var d = new Date(inputFormat);
  return [d.getFullYear(), pad(d.getMonth()+1), pad(d.getDate())].join(seperator || '');
}

function plotWeather(extent, condition) {

  // Weather condition as color
  const provinceData = {};

  const dateWeather = weatherData.filter(function(a) { return a['YYYYMMDD'] > extent[0] && a['YYYYMMDD'] < extent[1] });

  var min = 10000, max = -10000;
  provinceNames.forEach(function (province) {
    const provinceWeather = dateWeather.filter(function(a) { return a.PROVINCE === province });

    var sum = 0;
    var minProv = 100;
    provinceWeather.forEach(function (item) { minProv = Math.min(minProv, parseInt(item.TG) / 10); });

    if (minProv !== 100)
      provinceData[province] = minProv;

    min = Math.min(min, provinceData[province]) || min;
    max = Math.max(max, provinceData[province]) || max;
  });

  min -= 2;
  max += 2;

  var color = d3.scale.linear()
      .domain([min, max])
      .range(["blue", "red"]);

  Object.keys(provinceData).forEach(function(province) {
    d3.select("#" + province.replace(' ', '')).style("fill", color(provinceData[province]));
  });

  //Set title
  d3.select('.legendTitle').text(condition);

  //Set scale for x-axis
  var legendWidth = width * 0.6;
  var xScale = d3.scale.linear()
      .range([0, legendWidth])
      .domain([min, max]);

  //Define x-axis
  var xAxis = d3.svg.axis()
      .orient('bottom')
      .ticks(5)
      .scale(xScale);

  //Set up X axis
  d3.select('.axis').call(xAxis);
}

// ----------------- ADD TRAIN STATIONS -----------------------------------------
// ------------------------------------------------------------------------------
d3.csv("../data/trainStations.csv", function(error, stations) {

  const stationsGeo = {
    type: "FeatureCollection",
    transform: {
      scale: [1, 1],
      translate: [0, 0]
    },
    features: []
  };

  const types = [];

  for (var i = 1; i < stations.length; i++) {
    const station = stations[i];

    if (station.country !== "NL") continue;
    stationsGeo.features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [station.geo_lng, station.geo_lat]
      },
      properties: station
    });

    if (types.indexOf(station.type) === -1)
      types.push(station.type);
  }

  stationLayer.selectAll("path")
      .data(stationsGeo.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr('fill', 'black')
      .attr("r", '3px')
      .attr("stroke", "white")
      .attr("stroke-width", 0.2)
      .attr("class", "station")
      .attr("id", function(d) { return d.properties.name_long })
      .on('mouseover', tip.show)
      .on('mouseout', tip.hide)
      .each(function (x) {
        // d3.select(this).attr({
        //   id: 's' + x.properties.id,
        // });
        // const pos = projection(x.geometry.coordinates);
        // Add station name as text
        // stationLayer.append("text")
        //     .attr('x', pos[0])
        //     .attr('y', pos[1])
        //     .attr("id", "tooltip")
        //     .attr('font-size', 4)
        //     .attr('type', x.properties.type)
        //     .text(x.properties.name_short);
      });

  // setupUI(types);
});

function filterType(e) {
  const type = e.target.name;
  const checked = e.target.checked;
  d3.selectAll("[type=" + type + "]").style("opacity", checked ? 1 : 0);
}

// Set station color related to amount of disruptions
// d3.dsvFormat(';').parse("../data/delays.csv", function(error, storingen) {
//   const countTimes = {};
//   const countMinutes = {};
//
//   var max = -1;
//   for (var i = 1; i < storingen.length; i++) {
//     if (!storingen[i].rdt_lines_id) continue;
//
//     const minutes = parseInt(storingen[i].duration_minutes);
//     var ids = storingen[i].rdt_lines_id.split(',');
//     ids.forEach(function(id) {
//       const numId = parseInt(id);
//       if (countTimes[numId] === undefined) countTimes[numId] = 1;
//       else countTimes[numId] += 1;
//
//       if (max < countTimes[numId]) max = countTimes[numId];
//
//       if (countMinutes[numId] === undefined) countMinutes[numId] = minutes;
//       else countMinutes[numId] += minutes;
//     });
//   }
//
//   var color = d3.scale.linear()
//       .domain([0, max])
//       .range(["green", "red"]);
//
//   Object.keys(countTimes).forEach(function(id) {
//     d3.select("#s" + id).style("fill", color(countTimes[id]));
//   });
// });

// ----------------- ADD TRAIN TRACKS/LINES -------------------------------------
// ------------------------------------------------------------------------------

var disturbances = [];
d3.csv("../data/disturbancesWithLines.csv", function(error, data) {
  disturbances = data;

  const trackData = getDisturbancesPerTrack(data);
  const tracks = trackData.tracks;
  const maxDuration = trackData.maxDuration;
  const maxCount = trackData.maxCount;

  // Add tracks/lines
  d3.json("../data/tracks.geojson", function(error, data) {
    trackLayer.selectAll("path")
        .data(data.features)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("class", "track")
        .attr("id", function(d) { var f = d.properties.from; var t = d.properties.to; return f < t ? (f + '-' + t) : (t + '-' + f) }) // alphabetic order
        .attr("stroke", "yellow")
        .attr("stroke-width", function() { return 0.5 + (this.id in tracks ? (3 * tracks[this.id].count / maxCount): 0)})
        .attr("fill", "none")
        .on("click", function(d) { focus.bind(this)(d); console.log(this.id); })
        .on('mouseover', tip.show)
        .on('mouseout', tip.hide);
  });
});

function getDisturbancesPerTrack(distSubset) {
  const tracks = {};
  for (var i = 1; i < distSubset.length; i++) {
    const seperateLines = distSubset[i].lines.split(' ');

    seperateLines.forEach(function (line) {
      const lineTracks = line.split('-');

      for (var j = 0; j < lineTracks.length - 1; j++) {
        const f = lineTracks[j];
        const t = lineTracks[j + 1];
        const track = f < t ? (f + '-' + t) : (t + '-' + f); // sort alphabetically

        if (track in tracks) {
          tracks[track].count += 1;
          tracks[track].totalDuration += parseFloat(distSubset[i].duration_minutes);
        } else {
          tracks[track] = { count: 1, totalDuration: parseFloat(distSubset[i].duration_minutes) };
        }
      }
    });
  }
  var maxDuration = 1;
  var maxCount = 1;

  if (Object.keys(tracks).length > 0) {
    maxDuration = Object.values(tracks).map(function(a) { return a.totalDuration; }).filter(function(a) { return !isNaN(a) }).reduce(function(a, b) { return Math.max(a, b)});
    maxCount = Object.values(tracks).map(function(a) { return a.count; }).reduce(function(a, b) { return Math.max(a, b)});
  }
  return {
    tracks: tracks,
    maxDuration: maxDuration,
    maxCount: maxCount
  };
}

function plotDisturbances(extent, types) {
  var dateDisturbances = [];


  for (var i = 0; i < disturbances.length; i++) {
    var startTime = disturbances[i]['start_time'].split(' ')[0].split('-');
    var dDate = convertDate(new Date(startTime[0], startTime[1], startTime[2]));

    if (dDate > extent[1]) break;
    if (dDate >= extent[0]) dateDisturbances.push(disturbances[i]);
  }

  const trackData = getDisturbancesPerTrack(dateDisturbances);
  const tracks = trackData.tracks;
  const maxDuration = trackData.maxDuration;
  const maxCount = trackData.maxCount;

  // Deselect/select tracks from this date
  d3.selectAll('.track')
      .attr("stroke", "gray")
      .attr("stroke-width", 0.5);
  Object.keys(tracks).forEach(function (trackId) {
    d3.select('#' + trackId)
        .attr("stroke", "yellow")
        .attr("stroke-width", function() { return 0.5 + (this.id in tracks ? (3 * tracks[this.id].count / maxCount): 0)})
  });
}


// ----------------- BIND FUNCTIONS TO UI ---------------------------------------
// ------------------------------------------------------------------------------
function chooseMapDateExtent(extent) {
  var formattedExtent = [convertDate(extent[0]), convertDate(extent[1])];
  plotWeather(formattedExtent, 'Temperature');
  plotDisturbances(formattedExtent);
}
