var width = document.body.clientWidth,
    height = document.body.clientHeight - 100;

var projection = d3.geoMercator()
    .scale(1)
    .translate([0, 0]);
var path = d3.geoPath()
    .projection(projection);

var svg = d3.select("#mapContainer").append("svg")
    .attr("width", width)
    .attr("height", height);
svg.append("rect")
    .attr("class", "background")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", 'white')
    .on("click", reset);

var g = svg.append("g");
var active = d3.select(null);

var zoom = d3.zoom()
    .scaleExtent([0.5, 8])
    .on("zoom", zoomed);

svg.call(zoom);

function zoomed() {
  g.style("stroke-width", 1.5 / d3.event.transform.k + "px");
  g.attr("transform", d3.event.transform);
}

// Add NL map
d3.json("../data/provinces.json", function(error, data) {

  var colour = d3.scaleOrdinal(d3.schemeCategory20);

  // Center the map
  var l = topojson.feature(data, data.objects.subunits).features[3],
      b = path.bounds(l),
      s = .2 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height),
      t = [(width - s * (b[1][0] + b[0][0])) / 2, (height - s * (b[1][1] + b[0][1])) / 2];
  projection
      .scale(s)
      .translate(t);

  var layer = g.append("g");

  layer.selectAll("path")
      .data(topojson.feature(data, data.objects.subunits).features).enter()
      .append("path")
      .attr("d", path)
      .attr("fill", function(d, i) {
        return colour(i);
      })
      .attr("class", function(d, i) {
        return d.properties.name;
      })
      .on("click", focus);
});

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

  svg.transition()
      .duration(750)
      .call(zoom.transform, d3.zoomIdentity.translate(translate[0],translate[1]).scale(scale));
}
function reset() {
  active.classed("active", false);
  active = d3.select(null);
  svg.transition()
      .duration(750)
      .call( zoom.transform, d3.zoomIdentity );
}

// Add stations
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
  var layer = g.append("g");
  layer.selectAll("path")
      .data(stationsGeo.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr('fill', 'green')
      .each(function (x) {
        d3.select(this).attr({
          type: x.properties.type,
          id: 's' + x.properties.id,
        });
        const pos = projection(x.geometry.coordinates);
        // Add station name as text
        layer.append("text")
            .attr('x', pos[0])
            .attr('y', pos[1])
            .attr("id", "tooltip")
            .attr('font-size', 4)
            .attr('type', x.properties.type)
            .text(x.properties.name_short);
      });

  setupUI(types);
});

// Setup UI elements
function setupUI(types) {
  const container = document.createElement('div');
  document.getElementById("mapContainer").appendChild(container);

  types.forEach(function(type) {
    var checkbox = document.createElement('input');
    checkbox.type = "checkbox";
    checkbox.name = type;
    checkbox.value = type;
    checkbox.id = type;
    checkbox.checked = true;
    checkbox.onclick = filterType;

    var label = document.createElement('label');
    label.htmlFor = type;
    label.appendChild(document.createTextNode(type));

    container.appendChild(checkbox);
    container.appendChild(label);
  });
}

function filterType(e) {
  const type = e.target.name;
  const checked = e.target.checked;
  d3.selectAll("[type=" + type + "]").style("opacity", checked ? 1 : 0);
}

// Set station color related to amount of disruptions
d3.dsvFormat(';').parse("../data/delays.csv", function(error, storingen) {
  const countTimes = {};
  const countMinutes = {};

  var max = -1;
  for (var i = 1; i < storingen.length; i++) {
    if (!storingen[i].rdt_lines_id) continue;

    const minutes = parseInt(storingen[i].duration_minutes);
    var ids = storingen[i].rdt_lines_id.split(',');
    ids.forEach(function(id) {
      const numId = parseInt(id);
      if (countTimes[numId] === undefined) countTimes[numId] = 1;
      else countTimes[numId] += 1;

      if (max < countTimes[numId]) max = countTimes[numId];

      if (countMinutes[numId] === undefined) countMinutes[numId] = minutes;
      else countMinutes[numId] += minutes;
    });
  }

  var color = d3.scale.linear()
      .domain([0, max])
      .range(["green", "red"]);

  Object.keys(countTimes).forEach(function(id) {
    d3.select("#s" + id).style("fill", color(countTimes[id]));
  });
});

// Add stations
d3.csv("../data/weatherStations.csv", function(error, stations) {
  const stationsGeo = {
    type: "FeatureCollection",
    transform: {
      scale: [1, 1],
      translate: [0, 0]
    },
    features: []
  };

  for (var i = 0; i < stations.length; i++) {
    const station = stations[i];
    stationsGeo.features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [station.lon, station.lat]
      },
      properties: station
    });
  }

  var layer = g.append("g");
  layer.selectAll("path")
      .data(stationsGeo.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr('fill', 'blue')
      .each(function (x) {
        d3.select(this).attr({
          id: 'weather-s' + x.properties.id,
        });
        const pos = projection(x.geometry.coordinates);
        // Add station name as text
        layer.append("text")
            .attr('x', pos[0])
            .attr('y', pos[1])
            .attr("id", "tooltip")
            .attr('font-size', 6)
            .text(x.properties.name);
      });
});
