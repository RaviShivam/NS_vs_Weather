/* nvd3 version 1.8.6-dev (https://github.com/novus/nvd3) 2017-10-14 */
(function(){

// set up main nv object
var nv = {};

// the major global objects under the nv namespace
nv.dev = false; //set false when in production
nv.tooltip = nv.tooltip || {}; // For the tooltip system
nv.utils = nv.utils || {}; // Utility subsystem
nv.models = nv.models || {}; //stores all the possible models/components
nv.charts = {}; //stores all the ready to use charts
nv.logs = {}; //stores some statistics and potential error messages
nv.dom = {}; //DOM manipulation functions

// Node/CommonJS - require D3
if (typeof(module) !== 'undefined' && typeof(exports) !== 'undefined' && typeof(d3) == 'undefined') {
    d3 = require('d3');
}

nv.dispatch = d3.dispatch('render_start', 'render_end');

// Function bind polyfill
// Needed ONLY for phantomJS as it's missing until version 2.0 which is unreleased as of this comment
// https://github.com/ariya/phantomjs/issues/10522
// http://kangax.github.io/compat-table/es5/#Function.prototype.bind
// phantomJS is used for running the test suite
if (!Function.prototype.bind) {
    Function.prototype.bind = function (oThis) {
        if (typeof this !== "function") {
            // closest thing possible to the ECMAScript 5 internal IsCallable function
            throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
        }

        var aArgs = Array.prototype.slice.call(arguments, 1),
            fToBind = this,
            fNOP = function () {},
            fBound = function () {
                return fToBind.apply(this instanceof fNOP && oThis
                        ? this
                        : oThis,
                    aArgs.concat(Array.prototype.slice.call(arguments)));
            };

        fNOP.prototype = this.prototype;
        fBound.prototype = new fNOP();
        return fBound;
    };
}

//  Development render timers - disabled if dev = false
if (nv.dev) {
    nv.dispatch.on('render_start', function(e) {
        nv.logs.startTime = +new Date();
    });

    nv.dispatch.on('render_end', function(e) {
        nv.logs.endTime = +new Date();
        nv.logs.totalTime = nv.logs.endTime - nv.logs.startTime;
        nv.log('total', nv.logs.totalTime); // used for development, to keep track of graph generation times
    });
}

// Logs all arguments, and returns the last so you can test things in place
// Note: in IE8 console.log is an object not a function, and if modernizr is used
// then calling Function.prototype.bind with with anything other than a function
// causes a TypeError to be thrown.
nv.log = function() {
    if (nv.dev && window.console && console.log && console.log.apply)
        console.log.apply(console, arguments);
    else if (nv.dev && window.console && typeof console.log == "function" && Function.prototype.bind) {
        var log = Function.prototype.bind.call(console.log, console);
        log.apply(console, arguments);
    }
    return arguments[arguments.length - 1];
};

// print console warning, should be used by deprecated functions
nv.deprecated = function(name, info) {
    if (console && console.warn) {
        console.warn('nvd3 warning: `' + name + '` has been deprecated. ', info || '');
    }
};

// The nv.render function is used to queue up chart rendering
// in non-blocking async functions.
// When all queued charts are done rendering, nv.dispatch.render_end is invoked.
nv.render = function render(step) {
    // number of graphs to generate in each timeout loop
    step = step || 1;

    nv.render.active = true;
    nv.dispatch.render_start();

    var renderLoop = function() {
        var chart, graph;

        for (var i = 0; i < step && (graph = nv.render.queue[i]); i++) {
            chart = graph.generate();
            if (typeof graph.callback == typeof(Function)) graph.callback(chart);
        }

        nv.render.queue.splice(0, i);

        if (nv.render.queue.length) {
            setTimeout(renderLoop);
        }
        else {
            nv.dispatch.render_end();
            nv.render.active = false;
        }
    };

    setTimeout(renderLoop);
};

nv.render.active = false;
nv.render.queue = [];

/*
Adds a chart to the async rendering queue. This method can take arguments in two forms:
nv.addGraph({
    generate: <Function>
    callback: <Function>
})

or

nv.addGraph(<generate Function>, <callback Function>)

The generate function should contain code that creates the NVD3 model, sets options
on it, adds data to an SVG element, and invokes the chart model. The generate function
should return the chart model.  See examples/lineChart.html for a usage example.

The callback function is optional, and it is called when the generate function completes.
*/
nv.addGraph = function(obj) {
    if (typeof arguments[0] === typeof(Function)) {
        obj = {generate: arguments[0], callback: arguments[1]};
    }

    nv.render.queue.push(obj);

    if (!nv.render.active) {
        nv.render();
    }
};

// Node/CommonJS exports
if (typeof(module) !== 'undefined' && typeof(exports) !== 'undefined') {
  module.exports = nv;
}

if (typeof(window) !== 'undefined') {
  window.nv = nv;
}
/* Facade for queueing DOM write operations
 * with Fastdom (https://github.com/wilsonpage/fastdom)
 * if available.
 * This could easily be extended to support alternate
 * implementations in the future.
 */
nv.dom.write = function(callback) {
	if (window.fastdom !== undefined) {
		return fastdom.mutate(callback);
	}
	return callback();
};

/* Facade for queueing DOM read operations
 * with Fastdom (https://github.com/wilsonpage/fastdom)
 * if available.
 * This could easily be extended to support alternate
 * implementations in the future.
 */
nv.dom.read = function(callback) {
	if (window.fastdom !== undefined) {
		return fastdom.measure(callback);
	}
	return callback();
};
/* Utility class to handle creation of an interactive layer.
 This places a rectangle on top of the chart. When you mouse move over it, it sends a dispatch
 containing the X-coordinate. It can also render a vertical line where the mouse is located.

 dispatch.elementMousemove is the important event to latch onto.  It is fired whenever the mouse moves over
 the rectangle. The dispatch is given one object which contains the mouseX/Y location.
 It also has 'pointXValue', which is the conversion of mouseX to the x-axis scale.
 */
nv.interactiveGuideline = function() {
    "use strict";

    var margin = { left: 0, top: 0 } //Pass the chart's top and left magins. Used to calculate the mouseX/Y.
        ,   width = null
        ,   height = null
        ,   xScale = d3.scale.linear()
        ,   dispatch = d3.dispatch('elementMousemove', 'elementMouseout', 'elementClick', 'elementDblclick', 'elementMouseDown', 'elementMouseUp')
        ,   showGuideLine = true
        ,   svgContainer = null // Must pass the chart's svg, we'll use its mousemove event.
        ,   tooltip = nv.models.tooltip()
        ,   isMSIE =  window.ActiveXObject// Checkt if IE by looking for activeX. (excludes IE11)
    ;

    tooltip
        .duration(0)
        .hideDelay(0)
        .hidden(false);

    function layer(selection) {
        selection.each(function(data) {
            var container = d3.select(this);
            var availableWidth = (width || 960), availableHeight = (height || 400);
            var wrap = container.selectAll("g.nv-wrap.nv-interactiveLineLayer")
                .data([data]);
            var wrapEnter = wrap.enter()
                .append("g").attr("class", " nv-wrap nv-interactiveLineLayer");
            wrapEnter.append("g").attr("class","nv-interactiveGuideLine");

            if (!svgContainer) {
                return;
            }

            function mouseHandler() {
                var mouseX = d3.event.clientX - this.getBoundingClientRect().left;
                var mouseY = d3.event.clientY - this.getBoundingClientRect().top;

                var subtractMargin = true;
                var mouseOutAnyReason = false;
                if (isMSIE) {
                    /*
                     D3.js (or maybe SVG.getScreenCTM) has a nasty bug in Internet Explorer 10.
                     d3.mouse() returns incorrect X,Y mouse coordinates when mouse moving
                     over a rect in IE 10.
                     However, d3.event.offsetX/Y also returns the mouse coordinates
                     relative to the triggering <rect>. So we use offsetX/Y on IE.
                     */
                    mouseX = d3.event.offsetX;
                    mouseY = d3.event.offsetY;

                    /*
                     On IE, if you attach a mouse event listener to the <svg> container,
                     it will actually trigger it for all the child elements (like <path>, <circle>, etc).
                     When this happens on IE, the offsetX/Y is set to where ever the child element
                     is located.
                     As a result, we do NOT need to subtract margins to figure out the mouse X/Y
                     position under this scenario. Removing the line below *will* cause
                     the interactive layer to not work right on IE.
                     */
                    if(d3.event.target.tagName !== "svg") {
                        subtractMargin = false;
                    }

                    if (d3.event.target.className.baseVal.match("nv-legend")) {
                        mouseOutAnyReason = true;
                    }

                }

                if(subtractMargin) {
                    mouseX -= margin.left;
                    mouseY -= margin.top;
                }

                /* If mouseX/Y is outside of the chart's bounds,
                 trigger a mouseOut event.
                 */
                if (d3.event.type === 'mouseout'
                    || mouseX < 0 || mouseY < 0
                    || mouseX > availableWidth || mouseY > availableHeight
                    || (d3.event.relatedTarget && d3.event.relatedTarget.ownerSVGElement === undefined)
                    || mouseOutAnyReason
                    ) {

                    if (isMSIE) {
                        if (d3.event.relatedTarget
                            && d3.event.relatedTarget.ownerSVGElement === undefined
                            && (d3.event.relatedTarget.className === undefined
                                || d3.event.relatedTarget.className.match(tooltip.nvPointerEventsClass))) {

                            return;
                        }
                    }
                    dispatch.elementMouseout({
                        mouseX: mouseX,
                        mouseY: mouseY
                    });
                    layer.renderGuideLine(null); //hide the guideline
                    tooltip.hidden(true);
                    return;
                } else {
                    tooltip.hidden(false);
                }


                var scaleIsOrdinal = typeof xScale.rangeBands === 'function';
                var pointXValue = undefined;

                // Ordinal scale has no invert method
                if (scaleIsOrdinal) {
                    var elementIndex = d3.bisect(xScale.range(), mouseX) - 1;
                    // Check if mouseX is in the range band
                    if (xScale.range()[elementIndex] + xScale.rangeBand() >= mouseX) {
                        pointXValue = xScale.domain()[d3.bisect(xScale.range(), mouseX) - 1];
                    }
                    else {
                        dispatch.elementMouseout({
                            mouseX: mouseX,
                            mouseY: mouseY
                        });
                        layer.renderGuideLine(null); //hide the guideline
                        tooltip.hidden(true);
                        return;
                    }
                }
                else {
                    pointXValue = xScale.invert(mouseX);
                }

                dispatch.elementMousemove({
                    mouseX: mouseX,
                    mouseY: mouseY,
                    pointXValue: pointXValue
                });

                //If user double clicks the layer, fire a elementDblclick
                if (d3.event.type === "dblclick") {
                    dispatch.elementDblclick({
                        mouseX: mouseX,
                        mouseY: mouseY,
                        pointXValue: pointXValue
                    });
                }

                // if user single clicks the layer, fire elementClick
                if (d3.event.type === 'click') {
                    dispatch.elementClick({
                        mouseX: mouseX,
                        mouseY: mouseY,
                        pointXValue: pointXValue
                    });
                }

                // if user presses mouse down the layer, fire elementMouseDown
                if (d3.event.type === 'mousedown') {
                	dispatch.elementMouseDown({
                		mouseX: mouseX,
                		mouseY: mouseY,
                		pointXValue: pointXValue
                	});
                }

                // if user presses mouse down the layer, fire elementMouseUp
                if (d3.event.type === 'mouseup') {
                	dispatch.elementMouseUp({
                		mouseX: mouseX,
                		mouseY: mouseY,
                		pointXValue: pointXValue
                	});
                }
            }

            svgContainer
                .on("touchmove",mouseHandler)
                .on("mousemove",mouseHandler, true)
                .on("mouseout" ,mouseHandler,true)
                .on("mousedown" ,mouseHandler,true)
                .on("mouseup" ,mouseHandler,true)
                .on("dblclick" ,mouseHandler)
                .on("click", mouseHandler)
            ;

            layer.guideLine = null;
            //Draws a vertical guideline at the given X postion.
            layer.renderGuideLine = function(x) {
                if (!showGuideLine) return;
                if (layer.guideLine && layer.guideLine.attr("x1") === x) return;
                nv.dom.write(function() {
                    var line = wrap.select(".nv-interactiveGuideLine")
                        .selectAll("line")
                        .data((x != null) ? [nv.utils.NaNtoZero(x)] : [], String);
                    line.enter()
                        .append("line")
                        .attr("class", "nv-guideline")
                        .attr("x1", function(d) { return d;})
                        .attr("x2", function(d) { return d;})
                        .attr("y1", availableHeight)
                        .attr("y2",0);
                    line.exit().remove();
                });
            }
        });
    }

    layer.dispatch = dispatch;
    layer.tooltip = tooltip;

    layer.margin = function(_) {
        if (!arguments.length) return margin;
        margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
        margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
        return layer;
    };

    layer.width = function(_) {
        if (!arguments.length) return width;
        width = _;
        return layer;
    };

    layer.height = function(_) {
        if (!arguments.length) return height;
        height = _;
        return layer;
    };

    layer.xScale = function(_) {
        if (!arguments.length) return xScale;
        xScale = _;
        return layer;
    };

    layer.showGuideLine = function(_) {
        if (!arguments.length) return showGuideLine;
        showGuideLine = _;
        return layer;
    };

    layer.svgContainer = function(_) {
        if (!arguments.length) return svgContainer;
        svgContainer = _;
        return layer;
    };

    return layer;
};

/* Utility class that uses d3.bisect to find the index in a given array, where a search value can be inserted.
 This is different from normal bisectLeft; this function finds the nearest index to insert the search value.

 For instance, lets say your array is [1,2,3,5,10,30], and you search for 28.
 Normal d3.bisectLeft will return 4, because 28 is inserted after the number 10.  But interactiveBisect will return 5
 because 28 is closer to 30 than 10.

 Unit tests can be found in: interactiveBisectTest.html

 Has the following known issues:
 * Will not work if the data points move backwards (ie, 10,9,8,7, etc) or if the data points are in random order.
 * Won't work if there are duplicate x coordinate values.
 */
nv.interactiveBisect = function (values, searchVal, xAccessor) {
    "use strict";
    if (! (values instanceof Array)) {
        return null;
    }
    var _xAccessor;
    if (typeof xAccessor !== 'function') {
        _xAccessor = function(d) {
            return d.x;
        }
    } else {
        _xAccessor = xAccessor;
    }
    var _cmp = function(d, v) {
        // Accessors are no longer passed the index of the element along with
        // the element itself when invoked by d3.bisector.
        //
        // Starting at D3 v3.4.4, d3.bisector() started inspecting the
        // function passed to determine if it should consider it an accessor
        // or a comparator. This meant that accessors that take two arguments
        // (expecting an index as the second parameter) are treated as
        // comparators where the second argument is the search value against
        // which the first argument is compared.
        return _xAccessor(d) - v;
    };

    var bisect = d3.bisector(_cmp).left;
    var index = d3.max([0, bisect(values,searchVal) - 1]);
    var currentValue = _xAccessor(values[index]);

    if (typeof currentValue === 'undefined') {
        currentValue = index;
    }

    if (currentValue === searchVal) {
        return index; //found exact match
    }

    var nextIndex = d3.min([index+1, values.length - 1]);
    var nextValue = _xAccessor(values[nextIndex]);

    if (typeof nextValue === 'undefined') {
        nextValue = nextIndex;
    }

    if (Math.abs(nextValue - searchVal) >= Math.abs(currentValue - searchVal)) {
        return index;
    } else {
        return nextIndex
    }
};

/*
 Returns the index in the array "values" that is closest to searchVal.
 Only returns an index if searchVal is within some "threshold".
 Otherwise, returns null.
 */
nv.nearestValueIndex = function (values, searchVal, threshold) {
    "use strict";
    var yDistMax = Infinity, indexToHighlight = null;
    values.forEach(function(d,i) {
        var delta = Math.abs(searchVal - d);
        if ( d != null && delta <= yDistMax && delta < threshold) {
            yDistMax = delta;
            indexToHighlight = i;
        }
    });
    return indexToHighlight;
};

/* Model which can be instantiated to handle tooltip rendering.
 Example usage:
 var tip = nv.models.tooltip().gravity('w').distance(23)
 .data(myDataObject);

 tip();    //just invoke the returned function to render tooltip.
 */
nv.models.tooltip = function() {
    "use strict";

    /*
    Tooltip data. If data is given in the proper format, a consistent tooltip is generated.
    Example Format of data:
    {
        key: "Date",
        value: "August 2009",
        series: [
            {key: "Series 1", value: "Value 1", color: "#000"},
            {key: "Series 2", value: "Value 2", color: "#00f"}
        ]
    }
    */
    var id = "nvtooltip-" + Math.floor(Math.random() * 100000) // Generates a unique id when you create a new tooltip() object.
        ,   data = null
        ,   gravity = 'w'   // Can be 'n','s','e','w'. Determines how tooltip is positioned.
        ,   distance = 25 // Distance to offset tooltip from the mouse location.
        ,   snapDistance = 0   // Tolerance allowed before tooltip is moved from its current position (creates 'snapping' effect)
        ,   classes = null  // Attaches additional CSS classes to the tooltip DIV that is created.
        ,   hidden = true  // Start off hidden, toggle with hide/show functions below.
        ,   hideDelay = 200  // Delay (in ms) before the tooltip hides after calling hide().
        ,   tooltip = null // d3 select of the tooltip div.
        ,   lastPosition = { left: null, top: null } // Last position the tooltip was in.
        ,   enabled = true  // True -> tooltips are rendered. False -> don't render tooltips.
        ,   duration = 100 // Tooltip movement duration, in ms.
        ,   headerEnabled = true // If is to show the tooltip header.
        ,   nvPointerEventsClass = "nv-pointer-events-none" // CSS class to specify whether element should not have mouse events.
    ;

    // Format function for the tooltip values column.
    // d is value,
    // i is series index
    // p is point containing the value
    var valueFormatter = function(d, i, p) {
        return d;
    };

    // Format function for the tooltip header value.
    var headerFormatter = function(d) {
        return d;
    };

    var keyFormatter = function(d, i) {
        return d;
    };

    // By default, the tooltip model renders a beautiful table inside a DIV, returned as HTML
    // You can override this function if a custom tooltip is desired. For instance, you could directly manipulate
    // the DOM by accessing elem and returning false.
    var contentGenerator = function(d, elem) {
        if (d === null) {
            return '';
        }

        var table = d3.select(document.createElement("table"));
        if (headerEnabled) {
            var theadEnter = table.selectAll("thead")
                .data([d])
                .enter().append("thead");

            theadEnter.append("tr")
                .append("td")
                .attr("colspan", 3)
                .append("strong")
                .classed("x-value", true)
                .html(headerFormatter(d.value));
        }

        var tbodyEnter = table.selectAll("tbody")
            .data([d])
            .enter().append("tbody");

        var trowEnter = tbodyEnter.selectAll("tr")
                .data(function(p) { return p.series})
                .enter()
                .append("tr")
                .classed("highlight", function(p) { return p.highlight});

        trowEnter.append("td")
            .classed("legend-color-guide",true)
            .append("div")
            .style("background-color", function(p) { return p.color});

        trowEnter.append("td")
            .classed("key",true)
            .classed("total",function(p) { return !!p.total})
            .html(function(p, i) { return keyFormatter(p.key, i)});

        trowEnter.append("td")
            .classed("value",true)
            .html(function(p, i) { return valueFormatter(p.value, i, p) });

        trowEnter.filter(function (p,i) { return p.percent !== undefined }).append("td")
            .classed("percent", true)
            .html(function(p, i) { return "(" + d3.format('%')(p.percent) + ")" });

        trowEnter.selectAll("td").each(function(p) {
            if (p.highlight) {
                var opacityScale = d3.scale.linear().domain([0,1]).range(["#fff",p.color]);
                var opacity = 0.6;
                d3.select(this)
                    .style("border-bottom-color", opacityScale(opacity))
                    .style("border-top-color", opacityScale(opacity))
                ;
            }
        });

        var html = table.node().outerHTML;
        if (d.footer !== undefined)
            html += "<div class='footer'>" + d.footer + "</div>";
        return html;

    };

    /*
     Function that returns the position (relative to the viewport/document.body)
     the tooltip should be placed in.
     Should return: {
        left: <leftPos>,
        top: <topPos>
     }
     */
    var position = function() {
        var pos = {
            left: d3.event !== null ? d3.event.clientX : 0,
            top: d3.event !== null ? d3.event.clientY : 0
        };

        if(getComputedStyle(document.body).transform != 'none') {
            // Take the offset into account, as now the tooltip is relative
            // to document.body.
            var client = document.body.getBoundingClientRect();
            pos.left -= client.left;
            pos.top -= client.top;
        }

        return pos;
    };

    var dataSeriesExists = function(d) {
        if (d && d.series) {
            if (nv.utils.isArray(d.series)) {
                return true;
            }
            // if object, it's okay just convert to array of the object
            if (nv.utils.isObject(d.series)) {
                d.series = [d.series];
                return true;
            }
        }
        return false;
    };

    // Calculates the gravity offset of the tooltip. Parameter is position of tooltip
    // relative to the viewport.
    var calcGravityOffset = function(pos) {
        var height = tooltip.node().offsetHeight,
            width = tooltip.node().offsetWidth,
            clientWidth = document.documentElement.clientWidth, // Don't want scrollbars.
            clientHeight = document.documentElement.clientHeight, // Don't want scrollbars.
            left, top, tmp;

        // calculate position based on gravity
        switch (gravity) {
            case 'e':
                left = - width - distance;
                top = - (height / 2);
                if(pos.left + left < 0) left = distance;
                if((tmp = pos.top + top) < 0) top -= tmp;
                if((tmp = pos.top + top + height) > clientHeight) top -= tmp - clientHeight;
                break;
            case 'w':
                left = distance;
                top = - (height / 2);
                if (pos.left + left + width > clientWidth) left = - width - distance;
                if ((tmp = pos.top + top) < 0) top -= tmp;
                if ((tmp = pos.top + top + height) > clientHeight) top -= tmp - clientHeight;
                break;
            case 'n':
                left = - (width / 2) - 5; // - 5 is an approximation of the mouse's height.
                top = distance;
                if (pos.top + top + height > clientHeight) top = - height - distance;
                if ((tmp = pos.left + left) < 0) left -= tmp;
                if ((tmp = pos.left + left + width) > clientWidth) left -= tmp - clientWidth;
                break;
            case 's':
                left = - (width / 2);
                top = - height - distance;
                if (pos.top + top < 0) top = distance;
                if ((tmp = pos.left + left) < 0) left -= tmp;
                if ((tmp = pos.left + left + width) > clientWidth) left -= tmp - clientWidth;
                break;
            case 'center':
                left = - (width / 2);
                top = - (height / 2);
                break;
            default:
                left = 0;
                top = 0;
                break;
        }

        return { 'left': left, 'top': top };
    };

    /*
     Positions the tooltip in the correct place, as given by the position() function.
     */
    var positionTooltip = function() {
        nv.dom.read(function() {
            var pos = position(),
                gravityOffset = calcGravityOffset(pos),
                left = pos.left + gravityOffset.left,
                top = pos.top + gravityOffset.top;

            // delay hiding a bit to avoid flickering
            if (hidden) {
                tooltip
                    .interrupt()
                    .transition()
                    .delay(hideDelay)
                    .duration(0)
                    .style('opacity', 0);
            } else {
                // using tooltip.style('transform') returns values un-usable for tween
                var old_translate = 'translate(' + lastPosition.left + 'px, ' + lastPosition.top + 'px)';
                var new_translate = 'translate(' + Math.round(left) + 'px, ' + Math.round(top) + 'px)';
                var translateInterpolator = d3.interpolateString(old_translate, new_translate);
                var is_hidden = tooltip.style('opacity') < 0.1;

                tooltip
                    .interrupt() // cancel running transitions
                    .transition()
                    .duration(is_hidden ? 0 : duration)
                    // using tween since some versions of d3 can't auto-tween a translate on a div
                    .styleTween('transform', function (d) {
                        return translateInterpolator;
                    }, 'important')
                    // Safari has its own `-webkit-transform` and does not support `transform`
                    .styleTween('-webkit-transform', function (d) {
                        return translateInterpolator;
                    })
                    .style('-ms-transform', new_translate)
                    .style('opacity', 1);
            }

            lastPosition.left = left;
            lastPosition.top = top;
        });
    };

    // Creates new tooltip container, or uses existing one on DOM.
    function initTooltip() {
        if (!tooltip || !tooltip.node()) {
            // Create new tooltip div if it doesn't exist on DOM.

            var data = [1];
            tooltip = d3.select(document.body).selectAll('#'+id).data(data);

            tooltip.enter().append('div')
                   .attr("class", "nvtooltip " + (classes ? classes : "xy-tooltip"))
                   .attr("id", id)
                   .style("top", 0).style("left", 0)
                   .style('opacity', 0)
                   .style('position', 'fixed')
                   .selectAll("div, table, td, tr").classed(nvPointerEventsClass, true)
                   .classed(nvPointerEventsClass, true);

            tooltip.exit().remove()
        }
    }

    // Draw the tooltip onto the DOM.
    function nvtooltip() {
        if (!enabled) return;
        if (!dataSeriesExists(data)) return;

        nv.dom.write(function () {
            initTooltip();
            // Generate data and set it into tooltip.
            // Bonus - If you override contentGenerator and return false, you can use something like
            //         Angular, React or Knockout to bind the data for your tooltip directly to the DOM.
            var newContent = contentGenerator(data, tooltip.node());
            if (newContent) {
                tooltip.node().innerHTML = newContent;
            }

            positionTooltip();
        });

        return nvtooltip;
    }

    nvtooltip.nvPointerEventsClass = nvPointerEventsClass;
    nvtooltip.options = nv.utils.optionsFunc.bind(nvtooltip);

    nvtooltip._options = Object.create({}, {
        // simple read/write options
        duration: {get: function(){return duration;}, set: function(_){duration=_;}},
        gravity: {get: function(){return gravity;}, set: function(_){gravity=_;}},
        distance: {get: function(){return distance;}, set: function(_){distance=_;}},
        snapDistance: {get: function(){return snapDistance;}, set: function(_){snapDistance=_;}},
        classes: {get: function(){return classes;}, set: function(_){classes=_;}},
        enabled: {get: function(){return enabled;}, set: function(_){enabled=_;}},
        hideDelay: {get: function(){return hideDelay;}, set: function(_){hideDelay=_;}},
        contentGenerator: {get: function(){return contentGenerator;}, set: function(_){contentGenerator=_;}},
        valueFormatter: {get: function(){return valueFormatter;}, set: function(_){valueFormatter=_;}},
        headerFormatter: {get: function(){return headerFormatter;}, set: function(_){headerFormatter=_;}},
        keyFormatter: {get: function(){return keyFormatter;}, set: function(_){keyFormatter=_;}},
        headerEnabled: {get: function(){return headerEnabled;}, set: function(_){headerEnabled=_;}},
        position: {get: function(){return position;}, set: function(_){position=_;}},

        // Deprecated options
        chartContainer: {get: function(){return document.body;}, set: function(_){
            // deprecated after 1.8.3
            nv.deprecated('chartContainer', 'feature removed after 1.8.3');
        }},
        fixedTop: {get: function(){return null;}, set: function(_){
            // deprecated after 1.8.1
            nv.deprecated('fixedTop', 'feature removed after 1.8.1');
        }},
        offset: {get: function(){return {left: 0, top: 0};}, set: function(_){
            // deprecated after 1.8.1
            nv.deprecated('offset', 'use chart.tooltip.distance() instead');
        }},

        // options with extra logic
        hidden: {get: function(){return hidden;}, set: function(_){
            if (hidden != _) {
                hidden = !!_;
                nvtooltip();
            }
        }},
        data: {get: function(){return data;}, set: function(_){
            // if showing a single data point, adjust data format with that
            if (_.point) {
                _.value = _.point.x;
                _.series = _.series || {};
                _.series.value = _.point.y;
                _.series.color = _.point.color || _.series.color;
            }
            data = _;
        }},

        // read only properties
        node: {get: function(){return tooltip.node();}, set: function(_){}},
        id: {get: function(){return id;}, set: function(_){}}
    });

    nv.utils.initOptions(nvtooltip);
    return nvtooltip;
};


/*
Gets the browser window size

Returns object with height and width properties
 */
nv.utils.windowSize = function() {
    // Sane defaults
    var size = {width: 640, height: 480};

    // Most recent browsers use
    if (window.innerWidth && window.innerHeight) {
        size.width = window.innerWidth;
        size.height = window.innerHeight;
        return (size);
    }

    // IE can use depending on mode it is in
    if (document.compatMode=='CSS1Compat' &&
        document.documentElement &&
        document.documentElement.offsetWidth ) {

        size.width = document.documentElement.offsetWidth;
        size.height = document.documentElement.offsetHeight;
        return (size);
    }

    // Earlier IE uses Doc.body
    if (document.body && document.body.offsetWidth) {
        size.width = document.body.offsetWidth;
        size.height = document.body.offsetHeight;
        return (size);
    }

    return (size);
};


/* handle dumb browser quirks...  isinstance breaks if you use frames
typeof returns 'object' for null, NaN is a number, etc.
 */
nv.utils.isArray = Array.isArray;
nv.utils.isObject = function(a) {
    return a !== null && typeof a === 'object';
};
nv.utils.isFunction = function(a) {
    return typeof a === 'function';
};
nv.utils.isDate = function(a) {
    return toString.call(a) === '[object Date]';
};
nv.utils.isNumber = function(a) {
    return !isNaN(a) && typeof a === 'number';
};


/*
Binds callback function to run when window is resized
 */
nv.utils.windowResize = function(handler) {
    if (window.addEventListener) {
        window.addEventListener('resize', handler);
    } else {
        nv.log("ERROR: Failed to bind to window.resize with: ", handler);
    }
    // return object with clear function to remove the single added callback.
    return {
        callback: handler,
        clear: function() {
            window.removeEventListener('resize', handler);
        }
    }
};


/*
Backwards compatible way to implement more d3-like coloring of graphs.
Can take in nothing, an array, or a function/scale
To use a normal scale, get the range and pass that because we must be able
to take two arguments and use the index to keep backward compatibility
*/
nv.utils.getColor = function(color) {
    //if you pass in nothing, get default colors back
    if (color === undefined) {
        return nv.utils.defaultColor();

    //if passed an array, turn it into a color scale
    } else if(nv.utils.isArray(color)) {
        var color_scale = d3.scale.ordinal().range(color);
        return function(d, i) {
            var key = i === undefined ? d : i;
            return d.color || color_scale(key);
        };

    //if passed a function or scale, return it, or whatever it may be
    //external libs, such as angularjs-nvd3-directives use this
    } else {
        //can't really help it if someone passes rubbish as color
        return color;
    }
};


/*
Default color chooser uses a color scale of 20 colors from D3
 https://github.com/mbostock/d3/wiki/Ordinal-Scales#categorical-colors
 */
nv.utils.defaultColor = function() {
    // get range of the scale so we'll turn it into our own function.
    return nv.utils.getColor(d3.scale.category20().range());
};


/*
Returns a color function that takes the result of 'getKey' for each series and
looks for a corresponding color from the dictionary
*/
nv.utils.customTheme = function(dictionary, getKey, defaultColors) {
    // use default series.key if getKey is undefined
    getKey = getKey || function(series) { return series.key };
    defaultColors = defaultColors || d3.scale.category20().range();

    // start at end of default color list and walk back to index 0
    var defIndex = defaultColors.length;

    return function(series, index) {
        var key = getKey(series);
        if (nv.utils.isFunction(dictionary[key])) {
            return dictionary[key]();
        } else if (dictionary[key] !== undefined) {
            return dictionary[key];
        } else {
            // no match in dictionary, use a default color
            if (!defIndex) {
                // used all the default colors, start over
                defIndex = defaultColors.length;
            }
            defIndex = defIndex - 1;
            return defaultColors[defIndex];
        }
    };
};


/*
From the PJAX example on d3js.org, while this is not really directly needed
it's a very cool method for doing pjax, I may expand upon it a little bit,
open to suggestions on anything that may be useful
*/
nv.utils.pjax = function(links, content) {

    var load = function(href) {
        d3.html(href, function(fragment) {
            var target = d3.select(content).node();
            target.parentNode.replaceChild(
                d3.select(fragment).select(content).node(),
                target);
            nv.utils.pjax(links, content);
        });
    };

    d3.selectAll(links).on("click", function() {
        history.pushState(this.href, this.textContent, this.href);
        load(this.href);
        d3.event.preventDefault();
    });

    d3.select(window).on("popstate", function() {
        if (d3.event.state) {
            load(d3.event.state);
        }
    });
};


/*
For when we want to approximate the width in pixels for an SVG:text element.
Most common instance is when the element is in a display:none; container.
Forumla is : text.length * font-size * constant_factor
*/
nv.utils.calcApproxTextWidth = function (svgTextElem) {
    if (nv.utils.isFunction(svgTextElem.style) && nv.utils.isFunction(svgTextElem.text)) {
        var fontSize = parseInt(svgTextElem.style("font-size").replace("px",""), 10);
        var textLength = svgTextElem.text().length;
        return nv.utils.NaNtoZero(textLength * fontSize * 0.5);
    }
    return 0;
};


/*
Numbers that are undefined, null or NaN, convert them to zeros.
*/
nv.utils.NaNtoZero = function(n) {
    if (!nv.utils.isNumber(n)
        || isNaN(n)
        || n === null
        || n === Infinity
        || n === -Infinity) {

        return 0;
    }
    return n;
};

/*
Add a way to watch for d3 transition ends to d3
*/
d3.selection.prototype.watchTransition = function(renderWatch){
    var args = [this].concat([].slice.call(arguments, 1));
    return renderWatch.transition.apply(renderWatch, args);
};


/*
Helper object to watch when d3 has rendered something
*/
nv.utils.renderWatch = function(dispatch, duration) {
    if (!(this instanceof nv.utils.renderWatch)) {
        return new nv.utils.renderWatch(dispatch, duration);
    }

    var _duration = duration !== undefined ? duration : 250;
    var renderStack = [];
    var self = this;

    this.models = function(models) {
        models = [].slice.call(arguments, 0);
        models.forEach(function(model){
            model.__rendered = false;
            (function(m){
                m.dispatch.on('renderEnd', function(arg){
                    m.__rendered = true;
                    self.renderEnd('model');
                });
            })(model);

            if (renderStack.indexOf(model) < 0) {
                renderStack.push(model);
            }
        });
    return this;
    };

    this.reset = function(duration) {
        if (duration !== undefined) {
            _duration = duration;
        }
        renderStack = [];
    };

    this.transition = function(selection, args, duration) {
        args = arguments.length > 1 ? [].slice.call(arguments, 1) : [];

        if (args.length > 1) {
            duration = args.pop();
        } else {
            duration = _duration !== undefined ? _duration : 250;
        }
        selection.__rendered = false;

        if (renderStack.indexOf(selection) < 0) {
            renderStack.push(selection);
        }

        if (duration === 0) {
            selection.__rendered = true;
            selection.delay = function() { return this; };
            selection.duration = function() { return this; };
            return selection;
        } else {
            if (selection.length === 0) {
                selection.__rendered = true;
            } else if (selection.every( function(d){ return !d.length; } )) {
                selection.__rendered = true;
            } else {
                selection.__rendered = false;
            }

            var n = 0;
            return selection
                .transition()
                .duration(duration)
                .each(function(){ ++n; })
                .each('end', function(d, i) {
                    if (--n === 0) {
                        selection.__rendered = true;
                        self.renderEnd.apply(this, args);
                    }
                });
        }
    };

    this.renderEnd = function() {
        if (renderStack.every( function(d){ return d.__rendered; } )) {
            renderStack.forEach( function(d){ d.__rendered = false; });
            dispatch.renderEnd.apply(this, arguments);
        }
    }

};


/*
Takes multiple objects and combines them into the first one (dst)
example:  nv.utils.deepExtend({a: 1}, {a: 2, b: 3}, {c: 4});
gives:  {a: 2, b: 3, c: 4}
*/
nv.utils.deepExtend = function(dst){
    var sources = arguments.length > 1 ? [].slice.call(arguments, 1) : [];
    sources.forEach(function(source) {
        for (var key in source) {
            var isArray = nv.utils.isArray(dst[key]);
            var isObject = nv.utils.isObject(dst[key]);
            var srcObj = nv.utils.isObject(source[key]);

            if (isObject && !isArray && srcObj) {
                nv.utils.deepExtend(dst[key], source[key]);
            } else {
                dst[key] = source[key];
            }
        }
    });
};


/*
state utility object, used to track d3 states in the models
*/
nv.utils.state = function(){
    if (!(this instanceof nv.utils.state)) {
        return new nv.utils.state();
    }
    var state = {};
    var _self = this;
    var _setState = function(){};
    var _getState = function(){ return {}; };
    var init = null;
    var changed = null;

    this.dispatch = d3.dispatch('change', 'set');

    this.dispatch.on('set', function(state){
        _setState(state, true);
    });

    this.getter = function(fn){
        _getState = fn;
        return this;
    };

    this.setter = function(fn, callback) {
        if (!callback) {
            callback = function(){};
        }
        _setState = function(state, update){
            fn(state);
            if (update) {
                callback();
            }
        };
        return this;
    };

    this.init = function(state){
        init = init || {};
        nv.utils.deepExtend(init, state);
    };

    var _set = function(){
        var settings = _getState();

        if (JSON.stringify(settings) === JSON.stringify(state)) {
            return false;
        }

        for (var key in settings) {
            if (state[key] === undefined) {
                state[key] = {};
            }
            state[key] = settings[key];
            changed = true;
        }
        return true;
    };

    this.update = function(){
        if (init) {
            _setState(init, false);
            init = null;
        }
        if (_set.call(this)) {
            this.dispatch.change(state);
        }
    };

};


/*
Snippet of code you can insert into each nv.models.* to give you the ability to
do things like:
chart.options({
  showXAxis: true,
  tooltips: true
});

To enable in the chart:
chart.options = nv.utils.optionsFunc.bind(chart);
*/
nv.utils.optionsFunc = function(args) {
    if (args) {
        d3.map(args).forEach((function(key,value) {
            if (nv.utils.isFunction(this[key])) {
                this[key](value);
            }
        }).bind(this));
    }
    return this;
};


/*
numTicks:  requested number of ticks
data:  the chart data

returns the number of ticks to actually use on X axis, based on chart data
to avoid duplicate ticks with the same value
*/
nv.utils.calcTicksX = function(numTicks, data) {
    // find max number of values from all data streams
    var numValues = 1;
    var i = 0;
    for (i; i < data.length; i += 1) {
        var stream_len = data[i] && data[i].values ? data[i].values.length : 0;
        numValues = stream_len > numValues ? stream_len : numValues;
    }
    nv.log("Requested number of ticks: ", numTicks);
    nv.log("Calculated max values to be: ", numValues);
    // make sure we don't have more ticks than values to avoid duplicates
    numTicks = numTicks > numValues ? numTicks = numValues - 1 : numTicks;
    // make sure we have at least one tick
    numTicks = numTicks < 1 ? 1 : numTicks;
    // make sure it's an integer
    numTicks = Math.floor(numTicks);
    nv.log("Calculating tick count as: ", numTicks);
    return numTicks;
};


/*
returns number of ticks to actually use on Y axis, based on chart data
*/
nv.utils.calcTicksY = function(numTicks, data) {
    // currently uses the same logic but we can adjust here if needed later
    return nv.utils.calcTicksX(numTicks, data);
};


/*
Add a particular option from an options object onto chart
Options exposed on a chart are a getter/setter function that returns chart
on set to mimic typical d3 option chaining, e.g. svg.option1('a').option2('b');

option objects should be generated via Object.create() to provide
the option of manipulating data via get/set functions.
*/
nv.utils.initOption = function(chart, name) {
    // if it's a call option, just call it directly, otherwise do get/set
    if (chart._calls && chart._calls[name]) {
        chart[name] = chart._calls[name];
    } else {
        chart[name] = function (_) {
            if (!arguments.length) return chart._options[name];
            chart._overrides[name] = true;
            chart._options[name] = _;
            return chart;
        };
        // calling the option as _option will ignore if set by option already
        // so nvd3 can set options internally but the stop if set manually
        chart['_' + name] = function(_) {
            if (!arguments.length) return chart._options[name];
            if (!chart._overrides[name]) {
                chart._options[name] = _;
            }
            return chart;
        }
    }
};


/*
Add all options in an options object to the chart
*/
nv.utils.initOptions = function(chart) {
    chart._overrides = chart._overrides || {};
    var ops = Object.getOwnPropertyNames(chart._options || {});
    var calls = Object.getOwnPropertyNames(chart._calls || {});
    ops = ops.concat(calls);
    for (var i in ops) {
        nv.utils.initOption(chart, ops[i]);
    }
};


/*
Inherit options from a D3 object
d3.rebind makes calling the function on target actually call it on source
Also use _d3options so we can track what we inherit for documentation and chained inheritance
*/
nv.utils.inheritOptionsD3 = function(target, d3_source, oplist) {
    target._d3options = oplist.concat(target._d3options || []);
    // Find unique d3 options (string) and update d3options
    target._d3options = (target._d3options || []).filter(function(item, i, ar){ return ar.indexOf(item) === i; });
    oplist.unshift(d3_source);
    oplist.unshift(target);
    d3.rebind.apply(this, oplist);
};


/*
Remove duplicates from an array
*/
nv.utils.arrayUnique = function(a) {
    return a.sort().filter(function(item, pos) {
        return !pos || item != a[pos - 1];
    });
};


/*
Keeps a list of custom symbols to draw from in addition to d3.svg.symbol
Necessary since d3 doesn't let you extend its list -_-
Add new symbols by doing nv.utils.symbols.set('name', function(size){...});
*/
nv.utils.symbolMap = d3.map();


/*
Replaces d3.svg.symbol so that we can look both there and our own map
 */
nv.utils.symbol = function() {
    var type,
        size = 64;
    function symbol(d,i) {
        var t = type.call(this,d,i);
        var s = size.call(this,d,i);
        if (d3.svg.symbolTypes.indexOf(t) !== -1) {
            return d3.svg.symbol().type(t).size(s)();
        } else {
            return nv.utils.symbolMap.get(t)(s);
        }
    }
    symbol.type = function(_) {
        if (!arguments.length) return type;
        type = d3.functor(_);
        return symbol;
    };
    symbol.size = function(_) {
        if (!arguments.length) return size;
        size = d3.functor(_);
        return symbol;
    };
    return symbol;
};


/*
Inherit option getter/setter functions from source to target
d3.rebind makes calling the function on target actually call it on source
Also track via _inherited and _d3options so we can track what we inherit
for documentation generation purposes and chained inheritance
*/
nv.utils.inheritOptions = function(target, source) {
    // inherit all the things
    var ops = Object.getOwnPropertyNames(source._options || {});
    var calls = Object.getOwnPropertyNames(source._calls || {});
    var inherited = source._inherited || [];
    var d3ops = source._d3options || [];
    var args = ops.concat(calls).concat(inherited).concat(d3ops);
    args.unshift(source);
    args.unshift(target);
    d3.rebind.apply(this, args);
    // pass along the lists to keep track of them, don't allow duplicates
    target._inherited = nv.utils.arrayUnique(ops.concat(calls).concat(inherited).concat(ops).concat(target._inherited || []));
    target._d3options = nv.utils.arrayUnique(d3ops.concat(target._d3options || []));
};


/*
Runs common initialize code on the svg before the chart builds
*/
nv.utils.initSVG = function(svg) {
    svg.classed({'nvd3-svg':true});
};


/*
Sanitize and provide default for the container height.
*/
nv.utils.sanitizeHeight = function(height, container) {
    return (height || parseInt(container.style('height'), 10) || 400);
};


/*
Sanitize and provide default for the container width.
*/
nv.utils.sanitizeWidth = function(width, container) {
    return (width || parseInt(container.style('width'), 10) || 960);
};


/*
Calculate the available height for a chart.
*/
nv.utils.availableHeight = function(height, container, margin) {
    return Math.max(0,nv.utils.sanitizeHeight(height, container) - margin.top - margin.bottom);
};

/*
Calculate the available width for a chart.
*/
nv.utils.availableWidth = function(width, container, margin) {
    return Math.max(0,nv.utils.sanitizeWidth(width, container) - margin.left - margin.right);
};

/*
Clear any rendered chart components and display a chart's 'noData' message
*/
nv.utils.noData = function(chart, container) {
    var opt = chart.options(),
        margin = opt.margin(),
        noData = opt.noData(),
        data = (noData == null) ? ["No Data Available."] : [noData],
        height = nv.utils.availableHeight(null, container, margin),
        width = nv.utils.availableWidth(null, container, margin),
        x = margin.left + width/2,
        y = margin.top + height/2;

    //Remove any previously created chart components
    container.selectAll('g').remove();

    var noDataText = container.selectAll('.nv-noData').data(data);

    noDataText.enter().append('text')
        .attr('class', 'nvd3 nv-noData')
        .attr('dy', '-.7em')
        .style('text-anchor', 'middle');

    noDataText
        .attr('x', x)
        .attr('y', y)
        .text(function(t){ return t; });
};

/*
 Wrap long labels.
 */
nv.utils.wrapTicks = function (text, width) {
    text.each(function() {
        var text = d3.select(this),
            words = text.text().split(/\s+/).reverse(),
            word,
            line = [],
            lineNumber = 0,
            lineHeight = 1.1,
            y = text.attr("y"),
            dy = parseFloat(text.attr("dy")),
            tspan = text.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");
        while (word = words.pop()) {
            line.push(word);
            tspan.text(line.join(" "));
            if (tspan.node().getComputedTextLength() > width) {
                line.pop();
                tspan.text(line.join(" "));
                line = [word];
                tspan = text.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
            }
        }
    });
};

/*
Check equality of 2 array
*/
nv.utils.arrayEquals = function (array1, array2) {
    if (array1 === array2)
        return true;

    if (!array1 || !array2)
        return false;

    // compare lengths - can save a lot of time
    if (array1.length != array2.length)
        return false;

    for (var i = 0,
        l = array1.length; i < l; i++) {
        // Check if we have nested arrays
        if (array1[i] instanceof Array && array2[i] instanceof Array) {
            // recurse into the nested arrays
            if (!nv.arrayEquals(array1[i], array2[i]))
                return false;
        } else if (array1[i] != array2[i]) {
            // Warning - two different object instances will never be equal: {x:20} != {x:20}
            return false;
        }
    }
    return true;
};

/*
 Check if a point within an arc
 */
nv.utils.pointIsInArc = function(pt, ptData, d3Arc) {
    // Center of the arc is assumed to be 0,0
    // (pt.x, pt.y) are assumed to be relative to the center
    var r1 = d3Arc.innerRadius()(ptData), // Note: Using the innerRadius
      r2 = d3Arc.outerRadius()(ptData),
      theta1 = d3Arc.startAngle()(ptData),
      theta2 = d3Arc.endAngle()(ptData);

    var dist = pt.x * pt.x + pt.y * pt.y,
      angle = Math.atan2(pt.x, -pt.y); // Note: different coordinate system.

    angle = (angle < 0) ? (angle + Math.PI * 2) : angle;

    return (r1 * r1 <= dist) && (dist <= r2 * r2) &&
      (theta1 <= angle) && (angle <= theta2);
};

nv.models.axis = function() {
    "use strict";

    //============================================================
    // Public Variables with Default Settings
    //------------------------------------------------------------

    var axis = d3.svg.axis();
    var scale = d3.scale.linear();

    var margin = {top: 0, right: 0, bottom: 0, left: 0}
        , width = 75 //only used for tickLabel currently
        , height = 60 //only used for tickLabel currently
        , axisLabelText = null
        , showMaxMin = true //TODO: showMaxMin should be disabled on all ordinal scaled axes
        , rotateLabels = 0
        , rotateYLabel = true
        , staggerLabels = false
        , isOrdinal = false
        , ticks = null
        , axisLabelDistance = 0
        , fontSize = undefined
        , duration = 250
        , dispatch = d3.dispatch('renderEnd')
        , tickFormatMaxMin
        ;
    axis
        .scale(scale)
        .orient('bottom')
        .tickFormat(function(d) { return d })
    ;

    //============================================================
    // Private Variables
    //------------------------------------------------------------

    var scale0;
    var renderWatch = nv.utils.renderWatch(dispatch, duration);

    function chart(selection) {
        renderWatch.reset();
        selection.each(function(data) {
            var container = d3.select(this);
            nv.utils.initSVG(container);

            // Setup containers and skeleton of chart
            var wrap = container.selectAll('g.nv-wrap.nv-axis').data([data]);
            var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-axis');
            var gEnter = wrapEnter.append('g');
            var g = wrap.select('g');

            if (ticks !== null)
                axis.ticks(ticks);
            else if (axis.orient() == 'top' || axis.orient() == 'bottom')
                axis.ticks(Math.abs(scale.range()[1] - scale.range()[0]) / 100);

            //TODO: consider calculating width/height based on whether or not label is added, for reference in charts using this component
            g.watchTransition(renderWatch, 'axis').call(axis);

            scale0 = scale0 || axis.scale();

            var fmt = axis.tickFormat();
            if (fmt == null) {
                fmt = scale0.tickFormat();
            }

            var axisLabel = g.selectAll('text.nv-axislabel')
                .data([axisLabelText || null]);
            axisLabel.exit().remove();

            //only skip when fontSize is undefined so it can be cleared with a null or blank string
            if (fontSize !== undefined) {
                g.selectAll('g').select("text").style('font-size', fontSize);
            }

            var xLabelMargin;
            var axisMaxMin;
            var w;
            switch (axis.orient()) {
                case 'top':
                    axisLabel.enter().append('text').attr('class', 'nv-axislabel');
                  w = 0;
                  if (scale.range().length === 1) {
                    w = isOrdinal ? scale.range()[0] * 2 + scale.rangeBand() : 0;
                  } else if (scale.range().length === 2) {
                    w = isOrdinal ? scale.range()[0] + scale.range()[1] + scale.rangeBand() : scale.range()[1];
                  } else if ( scale.range().length > 2){
                    w = scale.range()[scale.range().length-1]+(scale.range()[1]-scale.range()[0]);
                  };
                    axisLabel
                        .attr('text-anchor', 'middle')
                        .attr('y', 0)
                        .attr('x', w/2);
                    if (showMaxMin) {
                        axisMaxMin = wrap.selectAll('g.nv-axisMaxMin')
                            .data(scale.domain());
                        axisMaxMin.enter().append('g').attr('class',function(d,i){
                                return ['nv-axisMaxMin','nv-axisMaxMin-x',(i == 0 ? 'nv-axisMin-x':'nv-axisMax-x')].join(' ')
                        }).append('text');
                        axisMaxMin.exit().remove();
                        axisMaxMin
                            .attr('transform', function(d,i) {
                                return 'translate(' + nv.utils.NaNtoZero(scale(d)) + ',0)'
                            })
                            .select('text')
                            .attr('dy', '-0.5em')
                            .attr('y', -axis.tickPadding())
                            .attr('text-anchor', 'middle')
                            .text(function(d,i) {
                                var formatter = tickFormatMaxMin || fmt;
                                var v = formatter(d);
                                return ('' + v).match('NaN') ? '' : v;
                            });
                        axisMaxMin.watchTransition(renderWatch, 'min-max top')
                            .attr('transform', function(d,i) {
                                return 'translate(' + nv.utils.NaNtoZero(scale.range()[i]) + ',0)'
                            });
                    }
                    break;
                case 'bottom':
                    xLabelMargin = axisLabelDistance + 36;
                    var maxTextWidth = 30;
                    var textHeight = 0;
                    var xTicks = g.selectAll('g').select("text");
                    var rotateLabelsRule = '';
                    if (rotateLabels%360) {
                        //Reset transform on ticks so textHeight can be calculated correctly
                        xTicks.attr('transform', '');
                        //Calculate the longest xTick width
                        xTicks.each(function(d,i){
                            var box = this.getBoundingClientRect();
                            var width = box.width;
                            textHeight = box.height;
                            if(width > maxTextWidth) maxTextWidth = width;
                        });
                        rotateLabelsRule = 'rotate(' + rotateLabels + ' 0,' + (textHeight/2 + axis.tickPadding()) + ')';
                        //Convert to radians before calculating sin. Add 30 to margin for healthy padding.
                        var sin = Math.abs(Math.sin(rotateLabels*Math.PI/180));
                        xLabelMargin = (sin ? sin*maxTextWidth : maxTextWidth)+30;
                        //Rotate all xTicks
                        xTicks
                            .attr('transform', rotateLabelsRule)
                            .style('text-anchor', rotateLabels%360 > 0 ? 'start' : 'end');
                    } else {
                        if (staggerLabels) {
                            xTicks
                                .attr('transform', function(d,i) {
                                    return 'translate(0,' + (i % 2 == 0 ? '0' : '12') + ')'
                                });
                        } else {
                            xTicks.attr('transform', "translate(0,0)");
                        }
                    }
                    axisLabel.enter().append('text').attr('class', 'nv-axislabel');
                    w = 0;
                    if (scale.range().length === 1) {
                        w = isOrdinal ? scale.range()[0] * 2 + scale.rangeBand() : 0;
                    } else if (scale.range().length === 2) {
                        w = isOrdinal ? scale.range()[0] + scale.range()[1] + scale.rangeBand() : scale.range()[1];
                    } else if ( scale.range().length > 2){
                        w = scale.range()[scale.range().length-1]+(scale.range()[1]-scale.range()[0]);
                    };
                    axisLabel
                        .attr('text-anchor', 'middle')
                        .attr('y', xLabelMargin)
                        .attr('x', w/2);
                    if (showMaxMin) {
                        //if (showMaxMin && !isOrdinal) {
                        axisMaxMin = wrap.selectAll('g.nv-axisMaxMin')
                            //.data(scale.domain())
                            .data([scale.domain()[0], scale.domain()[scale.domain().length - 1]]);
                        axisMaxMin.enter().append('g').attr('class',function(d,i){
                                return ['nv-axisMaxMin','nv-axisMaxMin-x',(i == 0 ? 'nv-axisMin-x':'nv-axisMax-x')].join(' ')
                        }).append('text');
                        axisMaxMin.exit().remove();
                        axisMaxMin
                            .attr('transform', function(d,i) {
                                return 'translate(' + nv.utils.NaNtoZero((scale(d) + (isOrdinal ? scale.rangeBand() / 2 : 0))) + ',0)'
                            })
                            .select('text')
                            .attr('dy', '.71em')
                            .attr('y', axis.tickPadding())
                            .attr('transform', rotateLabelsRule)
                            .style('text-anchor', rotateLabels ? (rotateLabels%360 > 0 ? 'start' : 'end') : 'middle')
                            .text(function(d,i) {
                                var formatter = tickFormatMaxMin || fmt;
                                var v = formatter(d);
                                return ('' + v).match('NaN') ? '' : v;
                            });
                        axisMaxMin.watchTransition(renderWatch, 'min-max bottom')
                            .attr('transform', function(d,i) {
                                return 'translate(' + nv.utils.NaNtoZero((scale(d) + (isOrdinal ? scale.rangeBand() / 2 : 0))) + ',0)'
                            });
                    }

                    break;
                case 'right':
                    axisLabel.enter().append('text').attr('class', 'nv-axislabel');
                    axisLabel
                        .style('text-anchor', rotateYLabel ? 'middle' : 'begin')
                        .attr('transform', rotateYLabel ? 'rotate(90)' : '')
                        .attr('y', rotateYLabel ? (-Math.max(margin.right, width) + 12 - (axisLabelDistance || 0)) : -10) //TODO: consider calculating this based on largest tick width... OR at least expose this on chart
                        .attr('x', rotateYLabel ? (d3.max(scale.range()) / 2) : axis.tickPadding());
                    if (showMaxMin) {
                        axisMaxMin = wrap.selectAll('g.nv-axisMaxMin')
                            .data(scale.domain());
                       	axisMaxMin.enter().append('g').attr('class',function(d,i){
                                return ['nv-axisMaxMin','nv-axisMaxMin-y',(i == 0 ? 'nv-axisMin-y':'nv-axisMax-y')].join(' ')
                        }).append('text')
                            .style('opacity', 0);
                        axisMaxMin.exit().remove();
                        axisMaxMin
                            .attr('transform', function(d,i) {
                                return 'translate(0,' + nv.utils.NaNtoZero(scale(d)) + ')'
                            })
                            .select('text')
                            .attr('dy', '.32em')
                            .attr('y', 0)
                            .attr('x', axis.tickPadding())
                            .style('text-anchor', 'start')
                            .text(function(d, i) {
                                var formatter = tickFormatMaxMin || fmt;
                                var v = formatter(d);
                                return ('' + v).match('NaN') ? '' : v;
                            });
                        axisMaxMin.watchTransition(renderWatch, 'min-max right')
                            .attr('transform', function(d,i) {
                                return 'translate(0,' + nv.utils.NaNtoZero(scale.range()[i]) + ')'
                            })
                            .select('text')
                            .style('opacity', 1);
                    }
                    break;
                case 'left':
                    /*
                     //For dynamically placing the label. Can be used with dynamically-sized chart axis margins
                     var yTicks = g.selectAll('g').select("text");
                     yTicks.each(function(d,i){
                     var labelPadding = this.getBoundingClientRect().width + axis.tickPadding() + 16;
                     if(labelPadding > width) width = labelPadding;
                     });
                     */
                    axisLabel.enter().append('text').attr('class', 'nv-axislabel');
                    axisLabel
                        .style('text-anchor', rotateYLabel ? 'middle' : 'end')
                        .attr('transform', rotateYLabel ? 'rotate(-90)' : '')
                        .attr('y', rotateYLabel ? (-Math.max(margin.left, width) + 25 - (axisLabelDistance || 0)) : -10)
                        .attr('x', rotateYLabel ? (-d3.max(scale.range()) / 2) : -axis.tickPadding());
                    if (showMaxMin) {
                        axisMaxMin = wrap.selectAll('g.nv-axisMaxMin')
                            .data(scale.domain());
                        axisMaxMin.enter().append('g').attr('class',function(d,i){
                                return ['nv-axisMaxMin','nv-axisMaxMin-y',(i == 0 ? 'nv-axisMin-y':'nv-axisMax-y')].join(' ')
                        }).append('text')
                            .style('opacity', 0);
                        axisMaxMin.exit().remove();
                        axisMaxMin
                            .attr('transform', function(d,i) {
                                return 'translate(0,' + nv.utils.NaNtoZero(scale0(d)) + ')'
                            })
                            .select('text')
                            .attr('dy', '.32em')
                            .attr('y', 0)
                            .attr('x', -axis.tickPadding())
                            .attr('text-anchor', 'end')
                            .text(function(d,i) {
                                var formatter = tickFormatMaxMin || fmt;
                                var v = formatter(d);
                                return ('' + v).match('NaN') ? '' : v;
                            });
                        axisMaxMin.watchTransition(renderWatch, 'min-max right')
                            .attr('transform', function(d,i) {
                                return 'translate(0,' + nv.utils.NaNtoZero(scale.range()[i]) + ')'
                            })
                            .select('text')
                            .style('opacity', 1);
                    }
                    break;
            }
            axisLabel.text(function(d) { return d });

            if (showMaxMin && (axis.orient() === 'left' || axis.orient() === 'right')) {
                //check if max and min overlap other values, if so, hide the values that overlap
                g.selectAll('g') // the g's wrapping each tick
                    .each(function(d,i) {
                        d3.select(this).select('text').attr('opacity', 1);
                        if (scale(d) < scale.range()[1] + 10 || scale(d) > scale.range()[0] - 10) { // 10 is assuming text height is 16... if d is 0, leave it!
                            if (d > 1e-10 || d < -1e-10) // accounts for minor floating point errors... though could be problematic if the scale is EXTREMELY SMALL
                                d3.select(this).attr('opacity', 0);

                            d3.select(this).select('text').attr('opacity', 0); // Don't remove the ZERO line!!
                        }
                    });

                //if Max and Min = 0 only show min, Issue #281
                if (scale.domain()[0] == scale.domain()[1] && scale.domain()[0] == 0) {
                    wrap.selectAll('g.nv-axisMaxMin').style('opacity', function (d, i) {
                        return !i ? 1 : 0
                    });
                }
            }

            if (showMaxMin && (axis.orient() === 'top' || axis.orient() === 'bottom')) {
                var maxMinRange = [];
                wrap.selectAll('g.nv-axisMaxMin')
                    .each(function(d,i) {
                        try {
                            if (i) // i== 1, max position
                                maxMinRange.push(scale(d) - this.getBoundingClientRect().width - 4);  //assuming the max and min labels are as wide as the next tick (with an extra 4 pixels just in case)
                            else // i==0, min position
                                maxMinRange.push(scale(d) + this.getBoundingClientRect().width + 4)
                        }catch (err) {
                            if (i) // i== 1, max position
                                maxMinRange.push(scale(d) - 4);  //assuming the max and min labels are as wide as the next tick (with an extra 4 pixels just in case)
                            else // i==0, min position
                                maxMinRange.push(scale(d) + 4);
                        }
                    });
                // the g's wrapping each tick
                g.selectAll('g').each(function(d, i) {
                    if (scale(d) < maxMinRange[0] || scale(d) > maxMinRange[1]) {
                        if (d > 1e-10 || d < -1e-10) // accounts for minor floating point errors... though could be problematic if the scale is EXTREMELY SMALL
                            d3.select(this).remove();
                        else
                            d3.select(this).select('text').remove(); // Don't remove the ZERO line!!
                    }
                });
            }

            //Highlight zero tick line
            g.selectAll('.tick')
                .filter(function (d) {
                    /*
                    The filter needs to return only ticks at or near zero.
                    Numbers like 0.00001 need to count as zero as well,
                    and the arithmetic trick below solves that.
                    */
                    return !parseFloat(Math.round(d * 100000) / 1000000) && (d !== undefined)
                })
                .classed('zero', true);

            //store old scales for use in transitions on update
            scale0 = scale.copy();

        });

        renderWatch.renderEnd('axis immediate');
        return chart;
    }

    //============================================================
    // Expose Public Variables
    //------------------------------------------------------------

    // expose chart's sub-components
    chart.axis = axis;
    chart.dispatch = dispatch;

    chart.options = nv.utils.optionsFunc.bind(chart);
    chart._options = Object.create({}, {
        // simple options, just get/set the necessary values
        axisLabelDistance: {get: function(){return axisLabelDistance;}, set: function(_){axisLabelDistance=_;}},
        staggerLabels:     {get: function(){return staggerLabels;}, set: function(_){staggerLabels=_;}},
        rotateLabels:      {get: function(){return rotateLabels;}, set: function(_){rotateLabels=_;}},
        rotateYLabel:      {get: function(){return rotateYLabel;}, set: function(_){rotateYLabel=_;}},
        showMaxMin:        {get: function(){return showMaxMin;}, set: function(_){showMaxMin=_;}},
        axisLabel:         {get: function(){return axisLabelText;}, set: function(_){axisLabelText=_;}},
        height:            {get: function(){return height;}, set: function(_){height=_;}},
        ticks:             {get: function(){return ticks;}, set: function(_){ticks=_;}},
        width:             {get: function(){return width;}, set: function(_){width=_;}},
        fontSize:          {get: function(){return fontSize;}, set: function(_){fontSize=_;}},
        tickFormatMaxMin:  {get: function(){return tickFormatMaxMin;}, set: function(_){tickFormatMaxMin=_;}},

        // options that require extra logic in the setter
        margin: {get: function(){return margin;}, set: function(_){
            margin.top    = _.top !== undefined    ? _.top    : margin.top;
            margin.right  = _.right !== undefined  ? _.right  : margin.right;
            margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
            margin.left   = _.left !== undefined   ? _.left   : margin.left;
        }},
        duration: {get: function(){return duration;}, set: function(_){
            duration=_;
            renderWatch.reset(duration);
        }},
        scale: {get: function(){return scale;}, set: function(_){
            scale = _;
            axis.scale(scale);
            isOrdinal = typeof scale.rangeBands === 'function';
            nv.utils.inheritOptionsD3(chart, scale, ['domain', 'range', 'rangeBand', 'rangeBands']);
        }}
    });

    nv.utils.initOptions(chart);
    nv.utils.inheritOptionsD3(chart, axis, ['orient', 'tickValues', 'tickSubdivide', 'tickSize', 'tickPadding', 'tickFormat']);
    nv.utils.inheritOptionsD3(chart, scale, ['domain', 'range', 'rangeBand', 'rangeBands']);

    return chart;
};

nv.models.distribution = function() {
    "use strict";
    //============================================================
    // Public Variables with Default Settings
    //------------------------------------------------------------

    var margin = {top: 0, right: 0, bottom: 0, left: 0}
        , width = 400 //technically width or height depending on x or y....
        , size = 8
        , axis = 'x' // 'x' or 'y'... horizontal or vertical
        , getData = function(d) { return d[axis] }  // defaults d.x or d.y
        , color = nv.utils.defaultColor()
        , scale = d3.scale.linear()
        , domain
        , duration = 250
        , dispatch = d3.dispatch('renderEnd')
        ;

    //============================================================


    //============================================================
    // Private Variables
    //------------------------------------------------------------

    var scale0;
    var renderWatch = nv.utils.renderWatch(dispatch, duration);

    //============================================================


    function chart(selection) {
        renderWatch.reset();
        selection.each(function(data) {
            var availableLength = width - (axis === 'x' ? margin.left + margin.right : margin.top + margin.bottom),
                naxis = axis == 'x' ? 'y' : 'x',
                container = d3.select(this);
            nv.utils.initSVG(container);

            //------------------------------------------------------------
            // Setup Scales

            scale0 = scale0 || scale;

            //------------------------------------------------------------


            //------------------------------------------------------------
            // Setup containers and skeleton of chart

            var wrap = container.selectAll('g.nv-distribution').data([data]);
            var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-distribution');
            var gEnter = wrapEnter.append('g');
            var g = wrap.select('g');

            wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')

            //------------------------------------------------------------


            var distWrap = g.selectAll('g.nv-dist')
                .data(function(d) { return d }, function(d) { return d.key });

            distWrap.enter().append('g');
            distWrap
                .attr('class', function(d,i) { return 'nv-dist nv-series-' + i })
                .style('stroke', function(d,i) { return color(d, i) });

            var dist = distWrap.selectAll('line.nv-dist' + axis)
                .data(function(d) { return d.values })
            dist.enter().append('line')
                .attr(axis + '1', function(d,i) { return scale0(getData(d,i)) })
                .attr(axis + '2', function(d,i) { return scale0(getData(d,i)) })
            renderWatch.transition(distWrap.exit().selectAll('line.nv-dist' + axis), 'dist exit')
                // .transition()
                .attr(axis + '1', function(d,i) { return scale(getData(d,i)) })
                .attr(axis + '2', function(d,i) { return scale(getData(d,i)) })
                .style('stroke-opacity', 0)
                .remove();
            dist
                .attr('class', function(d,i) { return 'nv-dist' + axis + ' nv-dist' + axis + '-' + i })
                .attr(naxis + '1', 0)
                .attr(naxis + '2', size);
            renderWatch.transition(dist, 'dist')
                // .transition()
                .attr(axis + '1', function(d,i) { return scale(getData(d,i)) })
                .attr(axis + '2', function(d,i) { return scale(getData(d,i)) })


            scale0 = scale.copy();

        });
        renderWatch.renderEnd('distribution immediate');
        return chart;
    }


    //============================================================
    // Expose Public Variables
    //------------------------------------------------------------
    chart.options = nv.utils.optionsFunc.bind(chart);
    chart.dispatch = dispatch;

    chart.margin = function(_) {
        if (!arguments.length) return margin;
        margin.top    = typeof _.top    != 'undefined' ? _.top    : margin.top;
        margin.right  = typeof _.right  != 'undefined' ? _.right  : margin.right;
        margin.bottom = typeof _.bottom != 'undefined' ? _.bottom : margin.bottom;
        margin.left   = typeof _.left   != 'undefined' ? _.left   : margin.left;
        return chart;
    };

    chart.width = function(_) {
        if (!arguments.length) return width;
        width = _;
        return chart;
    };

    chart.axis = function(_) {
        if (!arguments.length) return axis;
        axis = _;
        return chart;
    };

    chart.size = function(_) {
        if (!arguments.length) return size;
        size = _;
        return chart;
    };

    chart.getData = function(_) {
        if (!arguments.length) return getData;
        getData = d3.functor(_);
        return chart;
    };

    chart.scale = function(_) {
        if (!arguments.length) return scale;
        scale = _;
        return chart;
    };

    chart.color = function(_) {
        if (!arguments.length) return color;
        color = nv.utils.getColor(_);
        return chart;
    };

    chart.duration = function(_) {
        if (!arguments.length) return duration;
        duration = _;
        renderWatch.reset(duration);
        return chart;
    };
    //============================================================


    return chart;
}
nv.models.distroPlot = function() {
    "use strict";

    // IMPROVEMENTS:
    // cleanup tooltip to look like candlestick example (don't need color square for everything)
    // extend y scale range to min/max data better visually
    // tips of violins need to be cut off if very long
    // transition from box to violin not great since box only has a few points, and violin has many - need to generate box with as many points as violin
    // when providing colorGroup, should color boxes by either parent or child group category (e.g. isolator)

    //============================================================
    // Public Variables with Default Settings
    //------------------------------------------------------------

    var margin = {top: 0, right: 0, bottom: 0, left: 0},
        width = 960,
        height = 500,
        id = Math.floor(Math.random() * 10000), // Create semi-unique ID in case user doesn't select one
        xScale = d3.scale.ordinal(),
        yScale = d3.scale.linear(),
        getX  = function(d) { return d.label }, // Default data model selectors.
        getY  = function(d) { return d.value },
        getColor = function(d) { return d.color },
        getQ1 = function(d) { return d.values.q1 },
        getQ2 = function(d) { return d.values.q2 },
        getQ3 = function(d) { return d.values.q3 },
        getNl = function(d) { return (centralTendency == 'mean' ? getMean(d) : getQ2(d)) - d.values.notch },
        getNu = function(d) { return (centralTendency == 'mean' ? getMean(d) : getQ2(d)) + d.values.notch },
        getMean = function(d) { return d.values.mean },
        getWl = function(d) { return d.values.wl[whiskerDef] },
        getWh = function(d) { return d.values.wu[whiskerDef] },
        getMin = function(d) { return d.values.min },
        getMax = function(d) { return d.values.max },
        getDev = function(d) { return d.values.dev },
        getValsObj = function(d) { return d.values.observations; },
        getValsArr = function(d) { return d.values.observations.map(function(e) { return e.y }); },
        plotType, // type of background: 'box', 'violin', 'none'/false - default: 'box' - 'none' will activate random scatter automatically
        observationType = false, // type of observations to show: 'random', 'swarm', 'line', 'centered' - default: false (don't show any observations, even if an outlier)
        whiskerDef = 'iqr', // type of whisker to render: 'iqr', 'minmax', 'stddev' - default: iqr
        hideWhiskers = false,
        notchBox = false, // bool whether to notch box
        colorGroup = false, // if specified, each x-category will be split into groups, each colored
        centralTendency = false,
        showOnlyOutliers = true, // show only outliers in box plot
        jitter = 0.7, // faction of that jitter should take up in 'random' observationType, must be in range [0,1]; see jitterX(), default 0.7
        squash = true, // whether to remove the x-axis positions for empty data groups, default is true
        bandwidth = 'scott', // bandwidth for kde calculation, can be float or str, if str, must be one of scott or silverman
        resolution = 50,
        pointSize = 3,
        color = nv.utils.defaultColor(),
        container = null,
        xDomain, xRange,
        yDomain, yRange,
        dispatch = d3.dispatch('elementMouseover', 'elementMouseout', 'elementMousemove', 'renderEnd'),
        duration = 250,
        maxBoxWidth = null;

    //============================================================
    // Helper Functions
    //------------------------------------------------------------

    /**
     * Adds jitter to the scatter point plot
     * @param (int) width - width of container for scatter points, jitter will not
     *    extend beyond this width
     * @param (float) fract - fraction of width that jitter should take up; e.g. 1
     *    will use entire width, 0.25 will use 25% of width
     * @returns {number}
     */
    function jitterX(width, frac) {
        if (typeof frac === 'undefined') frac = .7
        frac = d3.min([1, frac]); // max should be 1
        return width / 2 + Math.floor(Math.random() * width * frac) - (width * frac) / 2;
    }


    /* Returns the smaller of std(X, ddof=1) or normalized IQR(X) over axis 0.
     *
     * @param (list) x - input x formatted as a single list of values
     *
     * @return float
     *
     * Source: https://github.com/statsmodels/statsmodels/blob/master/statsmodels/nonparametric/bandwidths.py#L9
     */
    function select_sigma(x) {
        var sorted = x.sort(d3.ascending); // sort our dat
        var normalize = 1.349;
        var IQR = (d3.quantile(sorted, 0.75) - d3.quantile(sorted, 0.25))/normalize; // normalized IQR
        return d3.min([d3.deviation(sorted), IQR]);
    }

    /*
    Scott's Rule of Thumb

    Parameters
    ----------
    x : array-like
        Array for which to get the bandwidth
    type : string
           The type of estimate to use, must be one of scott or silverman

    Returns
    -------
    bw : float
        The estimate of the bandwidth

    Notes
    -----
    Returns 1.059 * A * n ** (-1/5.) where ::
       A = min(std(x, ddof=1), IQR/1.349)
       IQR = np.subtract.reduce(np.percentile(x, [75,25]))

    References
    ----------
    Scott, D.W. (1992) Multivariate Density Estimation: Theory, Practice, and
        Visualization.
     */
    function calcBandwidth(x, type) {

        if (typeof type === 'undefined') type = 'scott';

        // TODO: consider using https://github.com/jasondavies/science.js
        var A = select_sigma(x);
        var n = x.length;
        return type==='scott' ? Math.pow(1.059 * A * n, -0.2) : Math.pow(.9 * A * n, -0.2);
    }



    /*
     * Prep data for use with distroPlot by grouping data
     * by .x() option set by user and then calculating
     * count, sum, mean, q1, q2 (median), q3, lower whisker (wl)
     * upper whisker (wu), iqr, min, max, and standard dev.
     *
     * NOTE: this will also setup the individual vertical scales
     *       for the violins.
     *
     * @param (list) dat - input data formatted as list of objects,
     *   with an object key that must exist when accessed by getX()
     *
     * @return prepared data in the form for box plotType:
     * [{
     *    key : YY,
     *    values: {
     *      count: XX,
     *      sum: XX,
     *      mean: XX,
     *      q1: XX,
     *      q2: XX,
     *      q3: XX,
     *      wl: XX,
     *      wu: XX,
     *      iqr: XX,
     *      min: XX,
     *      max: XX,
     *      dev: XX,
     *      observations: [{y:XX,..},..],
     *      key: XX,
     *      kdeDat: XX,
     *      notch: XX,
     *    }
     *  },
     *  ...
     *  ]
     * for violin plotType:
     * [{
     *    key : YY,
     *    values: {
     *      original: [{y:XX,..},..]
     *    }
     *  },
     *  ...
     *  ]
     * where YY are those keys in dat that define the
     * x-axis and which are defined by .x()
     */
    function prepData(dat) {

        // helper function to calcuate the various boxplot stats
        function calcStats(g, xGroup) {

            // sort data by Y so we can calc quartiles
            var v = g.map(function(d) {
                if (colorGroup) allColorGroups.add(colorGroup(d)); // list of all colorGroups; used to set x-axis
                return getY(d);
            }).sort(d3.ascending);

            var q1 = d3.quantile(v, 0.25);
            var q3 = d3.quantile(v, 0.75);
            var iqr = q3 - q1;

            /* whisker definitions:
             *  - iqr: also known as Tukey boxplot, the lowest datum still within 1.5 IQR of the lower quartile, and the highest datum still within 1.5 IQR of the upper quartile
             *  - minmax: the minimum and maximum of all of the data
             *  - sttdev: one standard deviation above and below the mean of the data
             * Note that the central tendency type (median or mean) does not impact the whisker location
             */
            var wl = {iqr: d3.max([d3.min(v), q1 - 1.5 * iqr]), minmax: d3.min(v), stddev: d3.mean(v) - d3.deviation(v)};
            var wu = {iqr: d3.min([d3.max(v), q3 + 1.5 * iqr]), minmax: d3.max(v), stddev: d3.mean(v) + d3.deviation(v)};
            var median = d3.median(v);
            var mean = d3.mean(v);
            var observations = [];


            // d3-beeswarm library must be externally loaded if being used
            // https://github.com/Kcnarf/d3-beeswarm
            if (typeof d3.beeswarm !== 'undefined') {
                observations = d3.beeswarm()
                    .data(g.map(function(d) { return getY(d) })) // use unsorted data so we can assigned idx
                    .radius(pointSize+1)
                    .orientation('vertical')
                    .side('symmetric')
                    .distributeOn(function(e) { return yScale(e); })
                    .arrange()

                // add group info for tooltip
                observations.map(function(e,i) {
                    e.key = xGroup;
                    e.idx = g[i].idx;
                    e.isOutlier = (e.datum < wl.iqr || e.datum > wu.iqr) // add isOulier meta for proper class assignment
                    e.isOutlierStdDev = (e.datum < wl.stddev || e.datum > wu.stddev) // add isOulier meta for proper class assignment
                })
            } else {
                v.forEach(function(e,i) {
                    observations.push({
                        idx: i,
                        datum: e,
                        key: xGroup,
                        isOutlier: (e < wl.iqr || e > wu.iqr), // add isOulier meta for proper class assignment
                        isOutlierStdDev: (e < wl.stddev || e > wu.stddev), // add isOulier meta for proper class assignment
                    })
                })
            }


            // calculate bandwidth if no number is provided
            if(isNaN(parseFloat(bandwidth))) { // if not is float
                if (['scott','silverman'].indexOf(bandwidth) != -1) {
                    bandwidth = calcBandwidth(v, bandwidth);
                } else {
                    bandwidth = calcBandwidth(v); // calculate with default 'scott'
                }
            }
            var kde = kernelDensityEstimator(eKernel(bandwidth), yScale.ticks(resolution));
            var kdeDat = kde(v);

            // make a new vertical for each group
            var tmpScale = d3.scale.linear()
                .domain([0, d3.max(kdeDat, function (e) { return e.y;})])
                .clamp(true);
            yVScale.push(tmpScale);

            var reformat = {
                count: v.length,
                num_outlier: observations.filter(function (e) { return e.isOutlier; }).length,
                sum: d3.sum(v),
                mean: mean,
                q1: q1,
                q2: median,
                q3: q3,
                wl: wl,
                wu: wu,
                iqr: iqr,
                min: d3.min(v),
                max: d3.max(v),
                dev: d3.deviation(v),
                observations: observations,
                key: xGroup,
                kde: kdeDat,
                notch: 1.57 * iqr / Math.sqrt(v.length), // notch distance from mean/median
            };

            if (colorGroup) {reformatDatFlat.push({key: xGroup, values: reformat});}

            return reformat;
        }

        // assigned idx for object constancy
        // TODO - how do we ensure the key (idx) doesn't already exist?
        dat.forEach(function(d,i) { d.idx = i; })


        // TODO not DRY
        // couldn't find a conditional way of doing the key() grouping
        var formatted;
        if (!colorGroup) {
            formatted = d3.nest()
                .key(function(d) { return getX(d); })
                .rollup(function(v,i) {
                    return calcStats(v);
                })
                .entries(dat);
        } else {
            allColorGroups = d3.set() // reset
            var tmp = d3.nest()
                .key(function(d) { return getX(d); })
                .key(function(d) { return colorGroup(d); })
                .rollup(function(v) {
                    return calcStats(v, getX(v[0]));
                })
                .entries(dat);

            // generate a final list of all x & colorGroup combinations
            // this is used to properly set the x-axis domain
            allColorGroups = allColorGroups.values(); // convert from d3.set to list
            var xGroups = tmp.map(function(d) { return d.key; });
            var allGroups = [];
            for (var i = 0; i < xGroups.length; i++) {
                for (var j = 0; j < allColorGroups.length; j++) {
                    allGroups.push(xGroups[i] + '_' + allColorGroups[j]);
                }
            }
            allColorGroups = allGroups;

            // flatten the inner most level so that
            // the plot retains the same DOM structure
            // to allow for smooth updating between
            // all groups.
            formatted = [];
            tmp.forEach(function(d) {
                d.values.forEach(function(e) { e.key = d.key +'_'+e.key }) // generate a combo key so that each boxplot has a distinct x-position
                formatted.push.apply(formatted, d.values)
            });

        }
        return formatted;
    }

    // https://bl.ocks.org/mbostock/4341954
    function kernelDensityEstimator(kernel, x) {
        return function (sample) {
            return x.map(function (x) {
                return {x:x, y:d3.mean(sample, function (v) {return kernel(x - v);})};
            });
        };
    }

    // https://bl.ocks.org/mbostock/4341954
    function eKernel(scale) {
        return function (u) {
            return Math.abs(u /= scale) <= 1 ? .75 * (1 - u * u) / scale : 0;
        };
    }

    /**
     * Makes the svg polygon string for a boxplot in either a notched
     * or square version
     *
     * NOTE: this actually only draws the left half of the box, since
     * the shape is symmetric (and since this is how violins are drawn)
     * we can simply generate half the box and mirror it.
     *
     * @param boxLeft {float} - left position of box
     * @param notchLeft {float} - left position of notch
     * @param dat {obj} - box plot data that was run through prepDat, must contain
     *      data for Q1, median, Q2, notch upper and notch lower
     * @returns {string} A string in the proper format for a svg polygon
     */
    function makeNotchBox(boxLeft, notchLeft, boxCenter, dat) {

        var boxPoints;
        var y = centralTendency == 'mean' ? getMean(dat) : getQ2(dat); // if centralTendency is not specified, we still want to notch boxes on 'median'
        if (notchBox) {
            boxPoints = [
                    {x:boxCenter, y:yScale(getQ1(dat))},
                    {x:boxLeft, y:yScale(getQ1(dat))},
                    {x:boxLeft, y:yScale(getNl(dat))},
                    {x:notchLeft, y:yScale(y)},
                    {x:boxLeft, y:yScale(getNu(dat))},
                    {x:boxLeft, y:yScale(getQ3(dat))},
                    {x:boxCenter, y:yScale(getQ3(dat))},
                ];
        } else {
            boxPoints = [
                    {x:boxCenter, y:yScale(getQ1(dat))},
                    {x:boxLeft, y:yScale(getQ1(dat))},
                    {x:boxLeft, y:yScale(y)}, // repeated point so that transition between notched/regular more smooth
                    {x:boxLeft, y:yScale(y)},
                    {x:boxLeft, y:yScale(y)}, // repeated point so that transition between notched/regular more smooth
                    {x:boxLeft, y:yScale(getQ3(dat))},
                    {x:boxCenter, y:yScale(getQ3(dat))},
                ];
        }

        return boxPoints;
    }

    /**
     * Given an x-axis group, return the available color groups within it
     * provided that colorGroups is set, if not, x-axis group is returned
     */
    function getAvailableColorGroups(x) {
        if (!colorGroup) return x;
        var tmp = reformatDat.find(function(d) { return d.key == x });
        return tmp.values.map(function(d) { return d.key }).sort(d3.ascending);
    }

    // return true if point is an outlier
    function isOutlier(d) {
        return (whiskerDef == 'iqr' && d.isOutlier) || (whiskerDef == 'stddev' && d.isOutlierStdDev)
    }

    //============================================================
    // Private Variables
    //------------------------------------------------------------

    var allColorGroups = d3.set()
    var yVScale = [], reformatDat, reformatDatFlat = [];
    var renderWatch = nv.utils.renderWatch(dispatch, duration);
    var availableWidth, availableHeight;

    function chart(selection) {
        renderWatch.reset();
        selection.each(function(data) {
            availableWidth = width - margin.left - margin.right,
            availableHeight = height - margin.top - margin.bottom;

            container = d3.select(this);
            nv.utils.initSVG(container);

            // Setup y-scale so that beeswarm layout can use it in prepData()
            yScale.domain(yDomain || d3.extent(data.map(function(d) { return getY(d)}))).nice()
                .range(yRange || [availableHeight, 0]);

            if (typeof reformatDat === 'undefined') reformatDat = prepData(data); // this prevents us from reformatted data all the time

            // Setup x-scale
            xScale.rangeBands(xRange || [0, availableWidth], 0.1)
                  .domain(xDomain || (colorGroup && !squash) ? allColorGroups : reformatDat.map(function(d) { return d.key }))

            // Setup containers and skeleton of chart
            var wrap = container.selectAll('g.nv-wrap').data([reformatDat]);
            var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap');
            wrap.watchTransition(renderWatch, 'nv-wrap: wrap')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            var areaEnter,
                distroplots = wrap.selectAll('.nv-distroplot-x-group')
                    .data(function(d) { return d; });

            // rebind new data
            // we don't rebuild individual x-axis groups so that we can update transition them
            // however the data associated with each x-axis group needs to be updated
            // so we manually update it here
            distroplots.each(function(d,i) {
                d3.select(this).selectAll('line.nv-distroplot-middle').datum(d);
            })

            areaEnter = distroplots.enter()
                .append('g')
                .attr('class', 'nv-distroplot-x-group')
                .style('stroke-opacity', 1e-6).style('fill-opacity', 1e-6)
                .style('fill', function(d,i) { return getColor(d) || color(d,i) })
                .style('stroke', function(d,i) { return getColor(d) || color(d,i) })

            distroplots.exit().remove();

            var rangeBand = function() { return xScale.rangeBand() };
            var areaWidth = function() { return d3.min([maxBoxWidth,rangeBand() * 0.9]); };
            var areaCenter = function() { return areaWidth()/2; };
            var areaLeft  = function() { return areaCenter() - areaWidth()/2; };
            var areaRight = function() { return areaCenter() + areaWidth()/2; };
            var tickLeft  = function() { return areaCenter() - areaWidth()/5; };
            var tickRight = function() { return areaCenter() + areaWidth()/5; };

            areaEnter.attr('transform', function(d) {
                    return 'translate(' + (xScale(d.key) + (rangeBand() - areaWidth()) * 0.5) + ', 0)';
                });

            distroplots
                .watchTransition(renderWatch, 'nv-distroplot-x-group: distroplots')
                .style('stroke-opacity', 1)
                .style('fill-opacity', 0.5)
                .attr('transform', function(d) {
                    return 'translate(' + (xScale(d.key) + (rangeBand() - areaWidth()) * 0.5) + ', 0)';
                });

            // set range for violin scale
            yVScale.map(function(d) { d.range([areaWidth()/2, 0]) });

            // ----- add the SVG elements for each plot type -----

            // showOnlyOutliers
            if (!plotType) {
                showOnlyOutliers = false; // force all observations to be seen
                if (!observationType) observationType = 'random'
            }

            // conditionally append whisker lines
            areaEnter.each(function(d,i) {
                var box = d3.select(this);
                [getWl, getWh].forEach(function (f) {
                    var key = (f === getWl) ? 'low' : 'high';
                    box.append('line')
                      .style('opacity', function() { return !hideWhiskers ? '0' : '1' })
                      .attr('class', 'nv-distroplot-whisker nv-distroplot-' + key);
                    box.append('line')
                      .style('opacity', function() { return hideWhiskers ? '0' : '1' })
                      .attr('class', 'nv-distroplot-tick nv-distroplot-' + key);
                });
            });

            // update whisker lines and ticks
            [getWl, getWh].forEach(function (f) {
                var key = (f === getWl) ? 'low' : 'high';
                var endpoint = (f === getWl) ? getQ1 : getQ3;
                distroplots.select('line.nv-distroplot-whisker.nv-distroplot-' + key)
                  .watchTransition(renderWatch, 'nv-distroplot-x-group: distroplots')
                    .attr('x1', areaCenter())
                    .attr('y1', function(d) { return plotType=='box' ? yScale(f(d)) : yScale(getQ2(d)); })
                    .attr('x2', areaCenter())
                    .attr('y2', function(d) { return plotType=='box' ? yScale(endpoint(d)) : yScale(getQ2(d)); })
                    .style('opacity', function() { return hideWhiskers ? '0' : '1' })
                distroplots.select('line.nv-distroplot-tick.nv-distroplot-' + key)
                  .watchTransition(renderWatch, 'nv-distroplot-x-group: distroplots')
                    .attr('x1', function(d) { return plotType=='box' ? tickLeft() : areaCenter()} )
                    .attr('y1', function(d,i) { return plotType=='box' ? yScale(f(d)) : yScale(getQ2(d)); })
                    .attr('x2', function(d) { return plotType=='box' ? tickRight() : areaCenter()} )
                    .attr('y2', function(d,i) { return plotType=='box' ? yScale(f(d)) : yScale(getQ2(d)); })
                    .style('opacity', function() { return (hideWhiskers || plotType!=='box') ? '0' : '1' })
            });

            [getWl, getWh].forEach(function (f) {
                var key = (f === getWl) ? 'low' : 'high';
                areaEnter.selectAll('.nv-distroplot-' + key)
                  .on('mouseover', function(d,i,j) {
                      d3.select(this.parentNode).selectAll('line.nv-distroplot-'+key).classed('hover',true);
                      dispatch.elementMouseover({
                          value: key == 'low' ? 'Lower whisker' : 'Upper whisker',
                          series: { key: f(d).toFixed(2), color: getColor(d) || color(d,j) },
                          e: d3.event
                      });
                  })
                  .on('mouseout', function(d,i,j) {
                      d3.select(this.parentNode).selectAll('line.nv-distroplot-'+key).classed('hover',false);
                      dispatch.elementMouseout({
                          value: key == 'low' ? 'Lower whisker' : 'Upper whisker',
                          series: { key: f(d).toFixed(2), color: getColor(d) || color(d,j) },
                          e: d3.event
                      });
                  })
                  .on('mousemove', function(d,i) {
                      dispatch.elementMousemove({e: d3.event});
                  });
            });

            // setup boxes as 4 parts: left-area, left-line, right-area, right-line,
            // this way we can transition to a violin
            areaEnter.each(function(d,i) {
                var violin = d3.select(this);

                ['left','right'].forEach(function(side) {
                    ['line','area'].forEach(function(d) {
                        violin.append('path')
                            .attr('class', 'nv-distribution-' + d + ' nv-distribution-' + side)
                            .attr("transform", "rotate(90,0,0)   translate(0," + (side == 'left' ? -areaWidth() : 0) + ")" + (side == 'left' ? '' : ' scale(1,-1)')); // rotate violin
                    })

                })

                areaEnter.selectAll('.nv-distribution-line')
                    .style('fill','none')
                areaEnter.selectAll('.nv-distribution-area')
                    .style('stroke','none')
                    .style('opacity',0.7)

            });

            // transitions
            distroplots.each(function(d,i) {
                var violin = d3.select(this);
                var objData = plotType == 'box' ? makeNotchBox(areaLeft(), tickLeft(), areaCenter(), d) : d.values.kde;
                violin.selectAll('path')
                    .datum(objData)

                var tmpScale = yVScale[i];

                var interp = plotType=='box' ? 'linear' : 'cardinal';

                if (plotType == 'box' || plotType == 'violin') {
                    ['left','right'].forEach(function(side) {

                        // line
                        distroplots.selectAll('.nv-distribution-line.nv-distribution-' + side)
                          .watchTransition(renderWatch, 'nv-distribution-line: distroplots')
                            .attr("d", d3.svg.line()
                                    .x(function(e) { return plotType=='box' ? e.y : yScale(e.x); })
                                    .y(function(e) { return plotType=='box' ? e.x : tmpScale(e.y) })
                                    .interpolate(interp)
                            )
                            .attr("transform", "rotate(90,0,0)   translate(0," + (side == 'left' ? -areaWidth() : 0) + ")" + (side == 'left' ? '' : ' scale(1,-1)')) // rotate violin
                            .style('opacity', !plotType ? '0' : '1');

                        // area
                        distroplots.selectAll('.nv-distribution-area.nv-distribution-' + side)
                          .watchTransition(renderWatch, 'nv-distribution-line: distroplots')
                            .attr("d", d3.svg.area()
                                    .x(function(e) { return plotType=='box' ? e.y : yScale(e.x); })
                                    .y(function(e) { return plotType=='box' ? e.x : tmpScale(e.y) })
                                    .y0(areaWidth()/2)
                                    .interpolate(interp)
                            )
                            .attr("transform", "rotate(90,0,0)   translate(0," + (side == 'left' ? -areaWidth() : 0) + ")" + (side == 'left' ? '' : ' scale(1,-1)')) // rotate violin
                            .style('opacity', !plotType ? '0' : '1');

                    })
                } else { // scatter type, hide areas
                    distroplots.selectAll('.nv-distribution-area')
                        .watchTransition(renderWatch, 'nv-distribution-area: distroplots')
                        .style('opacity', !plotType ? '0' : '1');

                    distroplots.selectAll('.nv-distribution-line')
                        .watchTransition(renderWatch, 'nv-distribution-line: distroplots')
                        .style('opacity', !plotType ? '0' : '1');
                }

            })

            // tooltip events
            distroplots.selectAll('path')
                .on('mouseover', function(d,i,j) {
                    d = d3.select(this.parentNode).datum(); // grab data from parent g
                    d3.select(this).classed('hover', true);
                    dispatch.elementMouseover({
                        key: d.key,
                        value: 'Group ' + d.key + ' stats',
                        series: [
                            { key: 'max', value: getMax(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'Q3', value: getQ3(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'Q2', value: getQ2(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'Q1', value: getQ1(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'min', value: getMin(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'mean', value: getMean(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'std. dev.', value: getDev(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'count', value: d.values.count, color: getColor(d) || color(d,j) },
                            { key: 'num. outliers', value: d.values.num_outlier, color: getColor(d) || color(d,j) },
                        ],
                        data: d,
                        index: i,
                        e: d3.event
                    });
                })
                .on('mouseout', function(d,i,j) {
                    d3.select(this).classed('hover', false);
                    d = d3.select(this.parentNode).datum(); // grab data from parent g
                    dispatch.elementMouseout({
                        key: d.key,
                        value: 'Group ' + d.key + ' stats',
                        series: [
                            { key: 'max', value: getMax(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'Q3', value: getQ3(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'Q2', value: getQ2(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'Q1', value: getQ1(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'min', value: getMin(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'mean', value: getMean(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'std. dev.', value: getDev(d).toFixed(2), color: getColor(d) || color(d,j) },
                            { key: 'count', value: d.values.count, color: getColor(d) || color(d,j) },
                            { key: 'num. outliers', value: d.values.num_outlier, color: getColor(d) || color(d,j) },
                        ],
                        data: d,
                        index: i,
                        e: d3.event
                    });
                })
                .on('mousemove', function(d,i) {
                    dispatch.elementMousemove({e: d3.event});
                });


            // median/mean line
            areaEnter.append('line')
                .attr('class', function(d) { return 'nv-distroplot-middle'})


            distroplots.selectAll('line.nv-distroplot-middle')
                .watchTransition(renderWatch, 'nv-distroplot-x-group: distroplots line')
                .attr('x1', notchBox ? tickLeft : plotType == 'box' ? areaLeft : tickLeft())
                .attr('y1', function(d,i,j) { return centralTendency == 'mean' ? yScale(getMean(d)) : yScale(getQ2(d)); })
                .attr('x2', notchBox ? tickRight : plotType == 'box' ? areaRight : tickRight())
                .attr('y2', function(d,i) { return centralTendency == 'mean' ? yScale(getMean(d)) : yScale(getQ2(d)); })
                .style('opacity', centralTendency ? '1' : '0');


            // tooltip
            distroplots.selectAll('.nv-distroplot-middle')
                .on('mouseover', function(d,i,j) {
                    if (d3.select(this).style('opacity') == 0) return; // don't show tooltip for hidden lines
                    var fillColor = d3.select(this.parentNode).style('fill'); // color set by parent g fill
                    d3.select(this).classed('hover', true);
                    dispatch.elementMouseover({
                        value: centralTendency == 'mean' ? 'Mean' : 'Median',
                        series: { key: centralTendency == 'mean' ? getMean(d).toFixed(2) : getQ2(d).toFixed(2), color: fillColor },
                        e: d3.event
                    });
                })
                .on('mouseout', function(d,i,j) {
                    if (d3.select(this).style('opacity') == 0) return; // don't show tooltip for hidden lines
                    d3.select(this).classed('hover', false);
                    var fillColor = d3.select(this.parentNode).style('fill'); // color set by parent g fill
                    dispatch.elementMouseout({
                        value: centralTendency == 'mean' ? 'Mean' : 'Median',
                        series: { key: centralTendency == 'mean' ? getMean(d).toFixed(2) : getQ2(d).toFixed(2), color: fillColor },
                        e: d3.event
                    });
                })
                .on('mousemove', function(d,i) {
                    dispatch.elementMousemove({e: d3.event});
                });


            // setup observations
            // create DOMs even if not requested (and hide them), so that
            // we can do updates
            var obsWrap = distroplots.selectAll('g.nv-distroplot-observation')
                .data(function(d) { return getValsObj(d) }, function(d,i) { return d.idx; });

            var obsGroup = obsWrap.enter()
                .append('g')
                .attr('class', 'nv-distroplot-observation')

            obsGroup.append('circle')
                .style({'opacity': 0})

            obsGroup.append('line')
                .style('stroke-width', 1)
                .style({'stroke': d3.rgb(85, 85, 85), 'opacity': 0})

            obsWrap.exit().remove();
            obsWrap.attr('class', function(d,i,j) { return 'nv-distroplot-observation ' + (isOutlier(d) && plotType == 'box' ? 'nv-distroplot-outlier' : 'nv-distroplot-non-outlier')})

            // TODO only call when window finishes resizing, otherwise jitterX call slows things down
            // transition observations
            if (observationType == 'line') {
                distroplots.selectAll('g.nv-distroplot-observation line')
                  .watchTransition(renderWatch, 'nv-distrolot-x-group: nv-distoplot-observation')
                    .attr("x1", tickLeft() + areaWidth()/4)
                    .attr("x2", tickRight() - areaWidth()/4)
                    .attr('y1', function(d) { return yScale(d.datum)})
                    .attr('y2', function(d) { return yScale(d.datum)});
            } else {
                distroplots.selectAll('g.nv-distroplot-observation circle')
                  .watchTransition(renderWatch, 'nv-distroplot: nv-distroplot-observation')
                    .attr('cx', function(d) { return observationType == 'swarm' ? d.x + areaWidth()/2 : observationType == 'random' ? jitterX(areaWidth(), jitter) : areaWidth()/2; })
                    .attr('cy', function(d) { return observationType == 'swarm' ? d.y : yScale(d.datum); })
                    .attr('r', pointSize);

            }

            // set opacity on outliers/non-outliers
            // any circle/line entering has opacity 0
            if (observationType !== false) { // observationType is False when hidding all circle/lines
                if (!showOnlyOutliers) { // show all line/circle
                    distroplots.selectAll(observationType== 'line' ? 'line':'circle')
                        .style('opacity',1)
                } else { // show only outliers
                    distroplots.selectAll('.nv-distroplot-outlier '+ (observationType== 'line' ? 'line':'circle'))
                        .style('opacity',1)
                    distroplots.selectAll('.nv-distroplot-non-outlier '+ (observationType== 'line' ? 'line':'circle'))
                        .style('opacity',0)
                }
            }

            // hide all other observations
            distroplots.selectAll('.nv-distroplot-observation' + (observationType=='line'?' circle':' line'))
              .watchTransition(renderWatch, 'nv-distroplot: nv-distoplot-observation')
                .style('opacity',0)

            // tooltip events for observations
            distroplots.selectAll('.nv-distroplot-observation')
                    .on('mouseover', function(d,i,j) {
                        var pt = d3.select(this);
                        if (showOnlyOutliers && plotType == 'box' && !isOutlier(d)) return; // don't show tooltip for hidden observation
                        var fillColor = d3.select(this.parentNode).style('fill'); // color set by parent g fill
                        pt.classed('hover', true);
                        dispatch.elementMouseover({
                            value: (plotType == 'box' && isOutlier(d)) ? 'Outlier' : 'Observation',
                            series: { key: d.datum.toFixed(2), color: fillColor },
                            e: d3.event
                        });
                    })
                    .on('mouseout', function(d,i,j) {
                        var pt = d3.select(this);
                        var fillColor = d3.select(this.parentNode).style('fill'); // color set by parent g fill
                        pt.classed('hover', false);
                        dispatch.elementMouseout({
                            value: (plotType == 'box' && isOutlier(d)) ? 'Outlier' : 'Observation',
                            series: { key: d.datum.toFixed(2), color: fillColor },
                            e: d3.event
                        });
                    })
                    .on('mousemove', function(d,i) {
                        dispatch.elementMousemove({e: d3.event});
                    });

        });

        renderWatch.renderEnd('nv-distroplot-x-group immediate');
        return chart;
    }

    //============================================================
    // Expose Public Variables
    //------------------------------------------------------------

    chart.dispatch = dispatch;
    chart.options = nv.utils.optionsFunc.bind(chart);

    chart._options = Object.create({}, {
        // simple options, just get/set the necessary values
        width:            {get: function(){return width;}, set: function(_){width=_;}},
        height:           {get: function(){return height;}, set: function(_){height=_;}},
        maxBoxWidth:      {get: function(){return maxBoxWidth;}, set: function(_){maxBoxWidth=_;}},
        x:                {get: function(){return getX;}, set: function(_){getX=_;}},
        y:                {get: function(){return getY;}, set: function(_){getY=_;}},
        plotType:         {get: function(){return plotType;}, set: function(_){plotType=_;}}, // plotType of background: 'box', 'violin' - default: 'box'
        observationType:  {get: function(){return observationType;}, set: function(_){observationType=_;}}, // type of observations to show: 'random', 'swarm', 'line', 'point' - default: false (don't show observations)
        whiskerDef:       {get: function(){return whiskerDef;}, set: function(_){whiskerDef=_;}}, // type of whisker to render: 'iqr', 'minmax', 'stddev' - default: iqr
        notchBox:         {get: function(){return notchBox;}, set: function(_){notchBox=_;}}, // bool whether to notch box
        hideWhiskers:     {get: function(){return hideWhiskers;}, set: function(_){hideWhiskers=_;}},
        colorGroup:       {get: function(){return colorGroup;}, set: function(_){colorGroup=_;}}, // data key to use to set color group of each x-category - default: don't group
        centralTendency:       {get: function(){return centralTendency;}, set: function(_){centralTendency=_;}}, // add a mean or median line to the data - default: don't show, must be one of 'mean' or 'median'
        bandwidth:        {get: function(){return bandwidth;}, set: function(_){bandwidth=_;}}, // bandwidth for kde calculation, can be float or str, if str, must be one of scott or silverman
        resolution:       {get: function(){return resolution;}, set: function(_){resolution=_;}}, // resolution for kde calculation, default 50
        xScale:           {get: function(){return xScale;}, set: function(_){xScale=_;}},
        yScale:           {get: function(){return yScale;}, set: function(_){yScale=_;}},
        showOnlyOutliers: {get: function(){return showOnlyOutliers;}, set: function(_){showOnlyOutliers=_;}}, // show only outliers in box plot, default true
        jitter:           {get: function(){return jitter;}, set: function(_){jitter=_;}}, // faction of that jitter should take up in 'random' observationType, must be in range [0,1]; see jitterX(), default 0.7
        squash:           {get: function(){return squash;}, set: function(_){squash=_;}}, // whether to squash sparse distribution of color groups towards middle of x-axis position
        pointSize:     {get: function(){return pointSize;}, set: function(_){pointSize=_;}},
        xDomain: {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
        yDomain: {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
        xRange:  {get: function(){return xRange;}, set: function(_){xRange=_;}},
        yRange:  {get: function(){return yRange;}, set: function(_){yRange=_;}},
        recalcData:   {get: function() { reformatDat = prepData(d3.select('svg').data()[0]); } }, // TODO is there a better way to grab attached data?
        itemColor:    {get: function(){return getColor;}, set: function(_){getColor=_;}},
        id:           {get: function(){return id;}, set: function(_){id=_;}},

        // options that require extra logic in the setter
        margin: {get: function(){return margin;}, set: function(_){
            margin.top    = _.top    !== undefined ? _.top    : margin.top;
            margin.right  = _.right  !== undefined ? _.right  : margin.right;
            margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
            margin.left   = _.left   !== undefined ? _.left   : margin.left;
        }},
        color:  {get: function(){return color;}, set: function(_){
            color = nv.utils.getColor(_);
        }},
        duration: {get: function(){return duration;}, set: function(_){
            duration = _;
            renderWatch.reset(duration);
        }}
    });

    nv.utils.initOptions(chart);

    return chart;
};
nv.models.distroPlotChart = function() {
    "use strict";

    //============================================================
    // Public Variables with Default Settings
    //------------------------------------------------------------

    var distroplot = nv.models.distroPlot(),
        xAxis = nv.models.axis(),
        yAxis = nv.models.axis()

    var margin = {top: 25, right: 10, bottom: 40, left: 60},
        width = null,
        height = null,
        color = nv.utils.getColor(),
        showXAxis = true,
        showYAxis = true,
        rightAlignYAxis = false,
        staggerLabels = false,
        xLabel = false,
        yLabel = false,
        tooltip = nv.models.tooltip(),
        x, y,
        state = nv.utils.state(),
        defaultState = null,
        noData = 'No Data Available.',
        dispatch = d3.dispatch('stateChange', 'beforeUpdate', 'renderEnd'),
        duration = 500;

    xAxis
        .orient('bottom')
        .showMaxMin(false)
        .tickFormat(function(d) { return d })
    ;
    yAxis
        .orient((rightAlignYAxis) ? 'right' : 'left')
        .tickFormat(d3.format(',.1f'))
    ;

    tooltip.duration(0);


    //============================================================
    // Private Variables
    //------------------------------------------------------------

    var renderWatch = nv.utils.renderWatch(dispatch, duration);
    var colorGroup0, marginTop0 = margin.top, x0, y0;

    var stateGetter = function(data) {
        return function(){
            return {
                active: data.map(function(d) { return !d.disabled }),
            };
        }
    };

    var stateSetter = function(data) {
        return function(state) {
            if (state.active !== undefined)
                data.forEach(function(series,i) {
                    series.disabled = !state.active[i];
                });
        }
    };


    function chart(selection) {
        renderWatch.reset();
        renderWatch.models(distroplot);
        if (showXAxis) renderWatch.models(xAxis);
        if (showYAxis) renderWatch.models(yAxis);

        selection.each(function(data) {
            var container = d3.select(this), that = this;
            nv.utils.initSVG(container);
            var availableWidth = (width  || parseInt(container.style('width')) || 960) - margin.left - margin.right;
            var availableHeight = (height || parseInt(container.style('height')) || 400) - margin.top - margin.bottom;

            chart.update = function() {
                dispatch.beforeUpdate();
                var opts = distroplot.options()
                if (colorGroup0 !== opts.colorGroup() || // recalc data when any of the axis accessors are changed
                    x0 !== opts.x() ||
                    y0 !== opts.y()
                ) {
                    distroplot.recalcData();
                }
                container.transition().duration(duration).call(chart);
            };
            chart.container = this;

            state
                .setter(stateSetter(data), chart.update)
                .getter(stateGetter(data))
                .update();


            if (!defaultState) {
                var key;
                defaultState = {};
                for (key in state) {
                    if (state[key] instanceof Array)
                        defaultState[key] = state[key].slice(0);
                    else
                        defaultState[key] = state[key];
                }
            }

            if (typeof d3.beeswarm !== 'function' && chart.options().observationType() == 'swarm') {
                var xPos = margin.left + availableWidth/2;
                noData = 'Please include the library https://github.com/Kcnarf/d3-beeswarm to use "swarm".'
                nv.utils.noData(chart, container);
                return chart;
            } else if (!data || !data.length) {
                nv.utils.noData(chart, container);
                return chart;
            } else {
                container.selectAll('.nv-noData').remove();
            }

            // Setup Scales
            x = distroplot.xScale();
            y = distroplot.yScale().clamp(true);

            // Setup containers and skeleton of chart
            var wrap = container.selectAll('g.nv-wrap.nv-distroPlot').data([data]);
            var gEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-distroPlot').append('g');
            var defsEnter = gEnter.append('defs');
            var g = wrap.select('g');

            gEnter.append('g').attr('class', 'nv-x nv-axis');
            gEnter.append('g').attr('class', 'nv-y nv-axis')
                .append('g').attr('class', 'nv-zeroLine')
                .append('line');

            gEnter.append('g').attr('class', 'nv-distroWrap');
            gEnter.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
            g.watchTransition(renderWatch, 'nv-wrap: wrap')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            if (rightAlignYAxis) {
                g.select('.nv-y.nv-axis')
                    .attr('transform', 'translate(' + availableWidth + ',0)');
            }


            // Main Chart Component(s)
            distroplot.width(availableWidth).height(availableHeight);

            var distroWrap = g.select('.nv-distroWrap')
                .datum(data)

            distroWrap.transition().call(distroplot);

            defsEnter.append('clipPath')
                .attr('id', 'nv-x-label-clip-' + distroplot.id())
                .append('rect');

            g.select('#nv-x-label-clip-' + distroplot.id() + ' rect')
                .attr('width', x.rangeBand() * (staggerLabels ? 2 : 1))
                .attr('height', 16)
                .attr('x', -x.rangeBand() / (staggerLabels ? 1 : 2 ));

            // Setup Axes
            if (showXAxis) {
                xAxis
                    .scale(x)
                    .ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    .tickSize(-availableHeight, 0);

                g.select('.nv-x.nv-axis').attr('transform', 'translate(0,' + y.range()[0] + ')')
                g.select('.nv-x.nv-axis').call(xAxis);

                g.select('.nv-x.nv-axis').select('.nv-axislabel')
                    .style('font-size', d3.min([availableWidth * 0.05,20]) + 'px')

                var xTicks = g.select('.nv-x.nv-axis').selectAll('g');
                if (staggerLabels) {
                    xTicks
                        .selectAll('text')
                        .attr('transform', function(d,i,j) { return 'translate(0,' + (j % 2 === 0 ? '5' : '17') + ')' })
                }
            }

            if (showYAxis) {
                yAxis
                    .scale(y)
                    .ticks( Math.floor(availableHeight/36) ) // can't use nv.utils.calcTicksY with Object data
                    .tickSize( -availableWidth, 0);

                g.select('.nv-y.nv-axis').call(yAxis);

                g.select('.nv-y.nv-axis').select('.nv-axislabel')
                    .style('font-size', d3.min([availableHeight * 0.05,20]) + 'px')
            }




            // Zero line on chart bottom
            g.select('.nv-zeroLine line')
                .attr('x1',0)
                .attr('x2',availableWidth)
                .attr('y1', y(0))
                .attr('y2', y(0))
            ;

            // store original values so that we can update things properly
            colorGroup0 = distroplot.options().colorGroup();
            x0 = distroplot.options().x();
            y0 = distroplot.options().y();

            //============================================================
            // Event Handling/Dispatching (in chart's scope)
            //------------------------------------------------------------

        });

        renderWatch.renderEnd('nv-distroplot chart immediate');
        return chart;
    }

    //============================================================
    // Event Handling/Dispatching (out of chart's scope)
    //------------------------------------------------------------

    distroplot.dispatch.on('elementMouseover.tooltip', function(evt) {
        tooltip.data(evt).hidden(false);
    });

    distroplot.dispatch.on('elementMouseout.tooltip', function(evt) {
        tooltip.data(evt).hidden(true);
    });

    distroplot.dispatch.on('elementMousemove.tooltip', function(evt) {
        tooltip();
    });

    //============================================================
    // Expose Public Variables
    //------------------------------------------------------------

    chart.dispatch = dispatch;
    chart.distroplot = distroplot;
    chart.xAxis = xAxis;
    chart.yAxis = yAxis;
    chart.tooltip = tooltip;
    chart.state = state;

    chart.options = nv.utils.optionsFunc.bind(chart);

    chart._options = Object.create({}, {
        // simple options, just get/set the necessary values
        width:      {get: function(){return width;}, set: function(_){width=_;}},
        height:     {get: function(){return height;}, set: function(_){height=_;}},
        staggerLabels: {get: function(){return staggerLabels;}, set: function(_){staggerLabels=_;}},
        showXAxis: {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
        showYAxis: {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
        tooltipContent:    {get: function(){return tooltip;}, set: function(_){tooltip=_;}},
        noData:    {get: function(){return noData;}, set: function(_){noData=_;}},
        defaultState:    {get: function(){return defaultState;}, set: function(_){defaultState=_;}},

        // options that require extra logic in the setter
        margin: {get: function(){return margin;}, set: function(_){
            margin.top    = _.top    !== undefined ? _.top    : margin.top;
            margin.right  = _.right  !== undefined ? _.right  : margin.right;
            margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
            margin.left   = _.left   !== undefined ? _.left   : margin.left;
        }},
        duration: {get: function(){return duration;}, set: function(_){
            duration = _;
            renderWatch.reset(duration);
            distroplot.duration(duration);
            xAxis.duration(duration);
            yAxis.duration(duration);
        }},
        color:  {get: function(){return color;}, set: function(_){
            color = nv.utils.getColor(_);
            distroplot.color(color);
        }},
        rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
            rightAlignYAxis = _;
            yAxis.orient( (_) ? 'right' : 'left');
        }},
        xLabel:  {get: function(){return xLabel;}, set: function(_){
            xLabel=_;
            xAxis.axisLabel(xLabel);
        }},
        yLabel:  {get: function(){return yLabel;}, set: function(_){
            yLabel=_;
            yAxis.axisLabel(yLabel);
        }},
    });


    nv.utils.inheritOptions(chart, distroplot);
    nv.utils.initOptions(chart);

    return chart;
}
nv.models.focus = function(content) {
    "use strict";

    //============================================================
    // Public Variables with Default Settings
    //------------------------------------------------------------

    var content = content || nv.models.line()
        , xAxis = nv.models.axis()
        , yAxis = nv.models.axis()
        , brush = d3.svg.brush()
        ;

    window.brush = brush;
    brush.on('brushend', window.onBrushEnd);

    var margin = {top: 10, right: 0, bottom: 30, left: 0}
        , color = nv.utils.defaultColor()
        , width = null
        , height = 70
        , showXAxis = true
        , showYAxis = false
        , rightAlignYAxis = false
        , ticks = null
        , x
        , y
        , brushExtent = null
        , duration = 250
        , dispatch = d3.dispatch('brush', 'onBrush', 'renderEnd')
        , syncBrushing = true
        ;

    content.interactive(false);
    content.pointActive(function(d) { return false; });

    //============================================================
    // Private Variables
    //------------------------------------------------------------

    var renderWatch = nv.utils.renderWatch(dispatch, duration);

    function chart(selection) {
        renderWatch.reset();
        renderWatch.models(content);
        if (showXAxis) renderWatch.models(xAxis);
        if (showYAxis) renderWatch.models(yAxis);

        selection.each(function(data) {
            var container = d3.select(this);
            nv.utils.initSVG(container);
            var availableWidth = nv.utils.availableWidth(width, container, margin),
                availableHeight = height - margin.top - margin.bottom;

            chart.update = function() {
                if( duration === 0 ) {
                    container.call( chart );
                } else {
                    container.transition().duration(duration).call(chart);
                }
            };
            chart.container = this;

            // Setup Scales
            x = content.xScale();
            y = content.yScale();

            // Setup containers and skeleton of chart
            var wrap = container.selectAll('g.nv-focus').data([data]);
            var gEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-focus').append('g');
            var g = wrap.select('g');

            wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            gEnter.append('g').attr('class', 'nv-background').append('rect');
            gEnter.append('g').attr('class', 'nv-x nv-axis');
            gEnter.append('g').attr('class', 'nv-y nv-axis');
            gEnter.append('g').attr('class', 'nv-contentWrap');
            gEnter.append('g').attr('class', 'nv-brushBackground');
            gEnter.append('g').attr('class', 'nv-x nv-brush');

            if (rightAlignYAxis) {
                g.select(".nv-y.nv-axis")
                    .attr("transform", "translate(" + availableWidth + ",0)");
            }

            g.select('.nv-background rect')
                .attr('width', availableWidth)
                .attr('height', availableHeight);

            content
                .width(availableWidth)
                .height(availableHeight)
                .color(data.map(function(d,i) {
                    return d.color || color(d, i);
                }).filter(function(d,i) { return !data[i].disabled; }));

            var contentWrap = g.select('.nv-contentWrap')
                .datum(data.filter(function(d) { return !d.disabled; }));

            d3.transition(contentWrap).call(content);

            // Setup Brush
            brush
                .x(x)
                .on('brush', function() {
                    onBrush(syncBrushing);
                });

            brush.on('brushend', function () {
                window.onBrushEnd();
                if (!syncBrushing) {
                    dispatch.onBrush(brush.empty() ? x.domain() : brush.extent());
                }
            });

            if (brushExtent) brush.extent(brushExtent);

            var brushBG = g.select('.nv-brushBackground').selectAll('g')
                .data([brushExtent || brush.extent()]);

            var brushBGenter = brushBG.enter()
                .append('g');

            brushBGenter.append('rect')
                .attr('class', 'left')
                .attr('x', 0)
                .attr('y', 0)
                .attr('height', availableHeight);

            brushBGenter.append('rect')
                .attr('class', 'right')
                .attr('x', 0)
                .attr('y', 0)
                .attr('height', availableHeight);

            var gBrush = g.select('.nv-x.nv-brush')
                .call(brush);
            gBrush.selectAll('rect')
                .attr('height', availableHeight);
            gBrush.selectAll('.resize').append('path').attr('d', resizePath);

            onBrush(true);

            g.select('.nv-background rect')
                .attr('width', availableWidth)
                .attr('height', availableHeight);

            if (showXAxis) {
                xAxis.scale(x)
                    ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    .tickSize(-availableHeight, 0);

                g.select('.nv-x.nv-axis')
                    .attr('transform', 'translate(0,' + y.range()[0] + ')');
                d3.transition(g.select('.nv-x.nv-axis'))
                    .call(xAxis);
            }

            if (showYAxis) {
                yAxis
                    .scale(y)
                    ._ticks( nv.utils.calcTicksY(availableHeight/36, data) )
                    .tickSize( -availableWidth, 0);

                d3.transition(g.select('.nv-y.nv-axis'))
                    .call(yAxis);
            }

            g.select('.nv-x.nv-axis')
                .attr('transform', 'translate(0,' + y.range()[0] + ')');

            //============================================================
            // Event Handling/Dispatching (in chart's scope)
            //------------------------------------------------------------

            //============================================================
            // Functions
            //------------------------------------------------------------

            // Taken from crossfilter (http://square.github.com/crossfilter/)
            function resizePath(d) {
                var e = +(d == 'e'),
                    x = e ? 1 : -1,
                    y = availableHeight / 3;
                return 'M' + (0.5 * x) + ',' + y
                    + 'A6,6 0 0 ' + e + ' ' + (6.5 * x) + ',' + (y + 6)
                    + 'V' + (2 * y - 6)
                    + 'A6,6 0 0 ' + e + ' ' + (0.5 * x) + ',' + (2 * y)
                    + 'Z'
                    + 'M' + (2.5 * x) + ',' + (y + 8)
                    + 'V' + (2 * y - 8)
                    + 'M' + (4.5 * x) + ',' + (y + 8)
                    + 'V' + (2 * y - 8);
            }


            function updateBrushBG() {
                if (!brush.empty()) brush.extent(brushExtent);
                brushBG
                    .data([brush.empty() ? x.domain() : brushExtent])
                    .each(function(d,i) {
                        var leftWidth = x(d[0]) - x.range()[0],
                            rightWidth = availableWidth - x(d[1]);
                        d3.select(this).select('.left')
                            .attr('width',  leftWidth < 0 ? 0 : leftWidth);

                        d3.select(this).select('.right')
                            .attr('x', x(d[1]))
                            .attr('width', rightWidth < 0 ? 0 : rightWidth);
                    });
            }


            function onBrush(shouldDispatch) {
                brushExtent = brush.empty() ? null : brush.extent();
                var extent = brush.empty() ? x.domain() : brush.extent();
                dispatch.brush({extent: extent, brush: brush});
                updateBrushBG();
                if (shouldDispatch) {
                    dispatch.onBrush(extent);
                }
            }
        });

        renderWatch.renderEnd('focus immediate');
        return chart;
    }


    //============================================================
    // Event Handling/Dispatching (out of chart's scope)
    //------------------------------------------------------------

    //============================================================
    // Expose Public Variables
    //------------------------------------------------------------

    // expose chart's sub-components
    chart.dispatch = dispatch;
    chart.content = content;
    chart.brush = brush;
    chart.xAxis = xAxis;
    chart.yAxis = yAxis;
    chart.options = nv.utils.optionsFunc.bind(chart);

    chart._options = Object.create({}, {
        // simple options, just get/set the necessary values
        width:      {get: function(){return width;}, set: function(_){width=_;}},
        height:     {get: function(){return height;}, set: function(_){height=_;}},
        showXAxis:      {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
        showYAxis:    {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
        brushExtent: {get: function(){return brushExtent;}, set: function(_){brushExtent=_;}},
        syncBrushing: {get: function(){return syncBrushing;}, set: function(_){syncBrushing=_;}},

        // options that require extra logic in the setter
        margin: {get: function(){return margin;}, set: function(_){
            margin.top    = _.top    !== undefined ? _.top    : margin.top;
            margin.right  = _.right  !== undefined ? _.right  : margin.right;
            margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
            margin.left   = _.left   !== undefined ? _.left   : margin.left;
        }},
        duration: {get: function(){return duration;}, set: function(_){
            duration = _;
            renderWatch.reset(duration);
            content.duration(duration);
            xAxis.duration(duration);
            yAxis.duration(duration);
        }},
        color:  {get: function(){return color;}, set: function(_){
            color = nv.utils.getColor(_);
            content.color(color);
        }},
        interpolate: {get: function(){return content.interpolate();}, set: function(_){
            content.interpolate(_);
        }},
        xTickFormat: {get: function(){return xAxis.tickFormat();}, set: function(_){
            xAxis.tickFormat(_);
        }},
        yTickFormat: {get: function(){return yAxis.tickFormat();}, set: function(_){
            yAxis.tickFormat(_);
        }},
        x: {get: function(){return content.x();}, set: function(_){
            content.x(_);
        }},
        y: {get: function(){return content.y();}, set: function(_){
            content.y(_);
        }},
        rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
            rightAlignYAxis = _;
            yAxis.orient( rightAlignYAxis ? 'right' : 'left');
        }}
    });

    nv.utils.inheritOptions(chart, content);
    nv.utils.initOptions(chart);

    return chart;
};

nv.models.furiousLegend = function() {
    "use strict";

    //============================================================
    // Public Variables with Default Settings
    //------------------------------------------------------------

    var margin = {top: 5, right: 0, bottom: 5, left: 0}
        , width = 400
        , height = 20
        , getKey = function(d) { return d.key }
        , keyFormatter = function (d) { return d }
        , color = nv.utils.getColor()
        , maxKeyLength = 20 //default value for key lengths
        , align = true
        , padding = 28 //define how much space between legend items. - recommend 32 for furious version
        , rightAlign = true
        , updateState = true   //If true, legend will update data.disabled and trigger a 'stateChange' dispatch.
        , radioButtonMode = false   //If true, clicking legend items will cause it to behave like a radio button. (only one can be selected at a time)
        , expanded = false
        , dispatch = d3.dispatch('legendClick', 'legendDblclick', 'legendMouseover', 'legendMouseout', 'stateChange')
        , vers = 'classic' //Options are "classic" and "furious"
        ;

    function chart(selection) {
        selection.each(function(data) {
            var availableWidth = width - margin.left - margin.right,
                container = d3.select(this);
            nv.utils.initSVG(container);

            // Setup containers and skeleton of chart
            var wrap = container.selectAll('g.nv-legend').data([data]);
            var gEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-legend').append('g');
            var g = wrap.select('g');

            wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            var series = g.selectAll('.nv-series')
                .data(function(d) {
                    if(vers != 'furious') return d;

                    return d.filter(function(n) {
                        return expanded ? true : !n.disengaged;
                    });
                });
            var seriesEnter = series.enter().append('g').attr('class', 'nv-series')

            var seriesShape;

            if(vers == 'classic') {
                seriesEnter.append('circle')
                    .style('stroke-width', 2)
                    .attr('class','nv-legend-symbol')
                    .attr('r', 5);

                seriesShape = series.select('circle');
            } else if (vers == 'furious') {
                seriesEnter.append('rect')
                    .style('stroke-width', 2)
                    .attr('class','nv-legend-symbol')
                    .attr('rx', 3)
                    .attr('ry', 3);

                seriesShape = series.select('rect');

                seriesEnter.append('g')
                    .attr('class', 'nv-check-box')
                    .property('innerHTML','<path d="M0.5,5 L22.5,5 L22.5,26.5 L0.5,26.5 L0.5,5 Z" class="nv-box"></path><path d="M5.5,12.8618467 L11.9185089,19.2803556 L31,0.198864511" class="nv-check"></path>')
                    .attr('transform', 'translate(-10,-8)scale(0.5)');

                var seriesCheckbox = series.select('.nv-check-box');

                seriesCheckbox.each(function(d,i) {
                    d3.select(this).selectAll('path')
                        .attr('stroke', setTextColor(d,i));
                });
            }

            seriesEnter.append('text')
                .attr('text-anchor', 'start')
                .attr('class','nv-legend-text')
                .attr('dy', '.32em')
                .attr('dx', '8');

            var seriesText = series.select('text.nv-legend-text');

            series
                .on('mouseover', function(d,i) {
                    dispatch.legendMouseover(d,i);  //TODO: Make consistent with other event objects
                })
                .on('mouseout', function(d,i) {
                    dispatch.legendMouseout(d,i);
                })
                .on('click', function(d,i) {
                    dispatch.legendClick(d,i);
                    // make sure we re-get data in case it was modified
                    var data = series.data();
                    if (updateState) {
                        if(vers =='classic') {
                            if (radioButtonMode) {
                                //Radio button mode: set every series to disabled,
                                //  and enable the clicked series.
                                data.forEach(function(series) { series.disabled = true});
                                d.disabled = false;
                            }
                            else {
                                d.disabled = !d.disabled;
                                if (data.every(function(series) { return series.disabled})) {
                                    //the default behavior of NVD3 legends is, if every single series
                                    // is disabled, turn all series' back on.
                                    data.forEach(function(series) { series.disabled = false});
                                }
                            }
                        } else if(vers == 'furious') {
                            if(expanded) {
                                d.disengaged = !d.disengaged;
                                d.userDisabled = d.userDisabled == undefined ? !!d.disabled : d.userDisabled;
                                d.disabled = d.disengaged || d.userDisabled;
                            } else if (!expanded) {
                                d.disabled = !d.disabled;
                                d.userDisabled = d.disabled;
                                var engaged = data.filter(function(d) { return !d.disengaged; });
                                if (engaged.every(function(series) { return series.userDisabled })) {
                                    //the default behavior of NVD3 legends is, if every single series
                                    // is disabled, turn all series' back on.
                                    data.forEach(function(series) {
                                        series.disabled = series.userDisabled = false;
                                    });
                                }
                            }
                        }
                        dispatch.stateChange({
                            disabled: data.map(function(d) { return !!d.disabled }),
                            disengaged: data.map(function(d) { return !!d.disengaged })
                        });

                    }
                })
                .on('dblclick', function(d,i) {
                    if(vers == 'furious' && expanded) return;
                    dispatch.legendDblclick(d,i);
                    if (updateState) {
                        // make sure we re-get data in case it was modified
                        var data = series.data();
                        //the default behavior of NVD3 legends, when double clicking one,
                        // is to set all other series' to false, and make the double clicked series enabled.
                        data.forEach(function(series) {
                            series.disabled = true;
                            if(vers == 'furious') series.userDisabled = series.disabled;
                        });
                        d.disabled = false;
                        if(vers == 'furious') d.userDisabled = d.disabled;
                        dispatch.stateChange({
                            disabled: data.map(function(d) { return !!d.disabled })
                        });
                    }
                });

            series.classed('nv-disabled', function(d) { return d.userDisabled });
            series.exit().remove();

            seriesText
                .attr('fill', setTextColor)
                .text(function (d) { return keyFormatter(getKey(d)) });

            //TODO: implement fixed-width and max-width options (max-width is especially useful with the align option)
            // NEW ALIGNING CODE, TODO: clean up

            var versPadding;
            switch(vers) {
                case 'furious' :
                    versPadding = 23;
                    break;
                case 'classic' :
                    versPadding = 20;
            }

            if (align) {

                var seriesWidths = [];
                series.each(function(d,i) {
                    var legendText;
                    if (keyFormatter(getKey(d)) && keyFormatter(getKey(d)).length > maxKeyLength) {
                        var trimmedKey = keyFormatter(getKey(d)).substring(0, maxKeyLength);
                        legendText = d3.select(this).select('text').text(trimmedKey + "...");
                        d3.select(this).append("svg:title").text(keyFormatter(getKey(d)));
                    } else {
                        legendText = d3.select(this).select('text');
                    }
                    var nodeTextLength;
                    try {
                        nodeTextLength = legendText.node().getComputedTextLength();
                        // If the legendText is display:none'd (nodeTextLength == 0), simulate an error so we approximate, instead
                        if(nodeTextLength <= 0) throw Error();
                    }
                    catch(e) {
                        nodeTextLength = nv.utils.calcApproxTextWidth(legendText);
                    }

                    seriesWidths.push(nodeTextLength + padding);
                });

                var seriesPerRow = 0;
                var legendWidth = 0;
                var columnWidths = [];

                while ( legendWidth < availableWidth && seriesPerRow < seriesWidths.length) {
                    columnWidths[seriesPerRow] = seriesWidths[seriesPerRow];
                    legendWidth += seriesWidths[seriesPerRow++];
                }
                if (seriesPerRow === 0) seriesPerRow = 1; //minimum of one series per row

                while ( legendWidth > availableWidth && seriesPerRow > 1 ) {
                    columnWidths = [];
                    seriesPerRow--;

                    for (var k = 0; k < seriesWidths.length; k++) {
                        if (seriesWidths[k] > (columnWidths[k % seriesPerRow] || 0) )
                            columnWidths[k % seriesPerRow] = seriesWidths[k];
                    }

                    legendWidth = columnWidths.reduce(function(prev, cur, index, array) {
                        return prev + cur;
                    });
                }

                var xPositions = [];
                for (var i = 0, curX = 0; i < seriesPerRow; i++) {
                    xPositions[i] = curX;
                    curX += columnWidths[i];
                }

                series
                    .attr('transform', function(d, i) {
                        return 'translate(' + xPositions[i % seriesPerRow] + ',' + (5 + Math.floor(i / seriesPerRow) * versPadding) + ')';
                    });

                //position legend as far right as possible within the total width
                if (rightAlign) {
                    g.attr('transform', 'translate(' + (width - margin.right - legendWidth) + ',' + margin.top + ')');
                }
                else {
                    g.attr('transform', 'translate(0' + ',' + margin.top + ')');
                }

                height = margin.top + margin.bottom + (Math.ceil(seriesWidths.length / seriesPerRow) * versPadding);

            } else {

                var ypos = 5,
                    newxpos = 5,
                    maxwidth = 0,
                    xpos;
                series
                    .attr('transform', function(d, i) {
                        var length = d3.select(this).select('text').node().getComputedTextLength() + padding;
                        xpos = newxpos;

                        if (width < margin.left + margin.right + xpos + length) {
                            newxpos = xpos = 5;
                            ypos += versPadding;
                        }

                        newxpos += length;
                        if (newxpos > maxwidth) maxwidth = newxpos;

                        return 'translate(' + xpos + ',' + ypos + ')';
                    });

                //position legend as far right as possible within the total width
                g.attr('transform', 'translate(' + (width - margin.right - maxwidth) + ',' + margin.top + ')');

                height = margin.top + margin.bottom + ypos + 15;
            }

            if(vers == 'furious') {
                // Size rectangles after text is placed
                seriesShape
                    .attr('width', function(d,i) {
                        return seriesText[0][i].getComputedTextLength() + 27;
                    })
                    .attr('height', 18)
                    .attr('y', -9)
                    .attr('x', -15)
            }

            seriesShape
                .style('fill', setBGColor)
                .style('stroke', function(d,i) { return d.color || color(d, i) });
        });

        function setTextColor(d,i) {
            if(vers != 'furious') return '#000';
            if(expanded) {
                return d.disengaged ? color(d,i) : '#fff';
            } else if (!expanded) {
                return !!d.disabled ? color(d,i) : '#fff';
            }
        }

        function setBGColor(d,i) {
            if(expanded && vers == 'furious') {
                return d.disengaged ? '#fff' : color(d,i);
            } else {
                return !!d.disabled ? '#fff' : color(d,i);
            }
        }

        return chart;
    }

    //============================================================
    // Expose Public Variables
    //------------------------------------------------------------

    chart.dispatch = dispatch;
    chart.options = nv.utils.optionsFunc.bind(chart);

    chart._options = Object.create({}, {
        // simple options, just get/set the necessary values
        width:          {get: function(){return width;}, set: function(_){width=_;}},
        height:         {get: function(){return height;}, set: function(_){height=_;}},
        key:            {get: function(){return getKey;}, set: function(_){getKey=_;}},
        keyFormatter:   {get: function(){return keyFormatter;}, set: function(_){keyFormatter=_;}},
        align:          {get: function(){return align;}, set: function(_){align=_;}},
        rightAlign:     {get: function(){return rightAlign;}, set: function(_){rightAlign=_;}},
        maxKeyLength:   {get: function(){return maxKeyLength;}, set: function(_){maxKeyLength=_;}},
        padding:        {get: function(){return padding;}, set: function(_){padding=_;}},
        updateState:    {get: function(){return updateState;}, set: function(_){updateState=_;}},
        radioButtonMode:{get: function(){return radioButtonMode;}, set: function(_){radioButtonMode=_;}},
        expanded:       {get: function(){return expanded;}, set: function(_){expanded=_;}},
        vers:           {get: function(){return vers;}, set: function(_){vers=_;}},

        // options that require extra logic in the setter
        margin: {get: function(){return margin;}, set: function(_){
            margin.top    = _.top    !== undefined ? _.top    : margin.top;
            margin.right  = _.right  !== undefined ? _.right  : margin.right;
            margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
            margin.left   = _.left   !== undefined ? _.left   : margin.left;
        }},
        color:  {get: function(){return color;}, set: function(_){
            color = nv.utils.getColor(_);
        }}
    });

    nv.utils.initOptions(chart);

    return chart;
};

nv.models.legend = function() {
    "use strict";

    //============================================================
    // Public Variables with Default Settings
    //------------------------------------------------------------

    var margin = {top: 5, right: 0, bottom: 5, left: 0}
        , width = 400
        , height = 20
        , getKey = function(d) { return d.key }
        , keyFormatter = function (d) { return d }
        , color = nv.utils.getColor()
        , maxKeyLength = 20 //default value for key lengths
        , align = true
        , padding = 32 //define how much space between legend items. - recommend 32 for furious version
        , rightAlign = true
        , updateState = true   //If true, legend will update data.disabled and trigger a 'stateChange' dispatch.
        , enableDoubleClick = true   //If true, legend will enable double click handling
        , radioButtonMode = false   //If true, clicking legend items will cause it to behave like a radio button. (only one can be selected at a time)
        , expanded = false
        , dispatch = d3.dispatch('legendClick', 'legendDblclick', 'legendMouseover', 'legendMouseout', 'stateChange')
        , vers = 'classic' //Options are "classic" and "furious"
        ;

    function chart(selection) {
        selection.each(function(data) {
            var availableWidth = width - margin.left - margin.right,
                container = d3.select(this);
            nv.utils.initSVG(container);

            // Setup containers and skeleton of chart
            var wrap = container.selectAll('g.nv-legend').data([data]);
            var gEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-legend').append('g');
            var g = wrap.select('g');

            if (rightAlign)
                wrap.attr('transform', 'translate(' + (- margin.right) + ',' + margin.top + ')');
            else
                wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            var series = g.selectAll('.nv-series')
                .data(function(d) {
                    if(vers != 'furious') return d;

                    return d.filter(function(n) {
                        return expanded ? true : !n.disengaged;
                    });
                });

            var seriesEnter = series.enter().append('g').attr('class', 'nv-series');
            var seriesShape;

            var versPadding;
            switch(vers) {
                case 'furious' :
                    versPadding = 23;
                    break;
                case 'classic' :
                    versPadding = 20;
            }

            if(vers == 'classic') {
                seriesEnter.append('circle')
                    .style('stroke-width', 2)
                    .attr('class','nv-legend-symbol')
                    .attr('r', 5);

                seriesShape = series.select('.nv-legend-symbol');
            } else if (vers == 'furious') {
                seriesEnter.append('rect')
                    .style('stroke-width', 2)
                    .attr('class','nv-legend-symbol')
                    .attr('rx', 3)
                    .attr('ry', 3);
                seriesShape = series.select('.nv-legend-symbol');

                seriesEnter.append('g')
                    .attr('class', 'nv-check-box')
                    .property('innerHTML','<path d="M0.5,5 L22.5,5 L22.5,26.5 L0.5,26.5 L0.5,5 Z" class="nv-box"></path><path d="M5.5,12.8618467 L11.9185089,19.2803556 L31,0.198864511" class="nv-check"></path>')
                    .attr('transform', 'translate(-10,-8)scale(0.5)');

                var seriesCheckbox = series.select('.nv-check-box');

                seriesCheckbox.each(function(d,i) {
                    d3.select(this).selectAll('path')
                        .attr('stroke', setTextColor(d,i));
                });
            }

            seriesEnter.append('text')
                .attr('text-anchor', 'start')
                .attr('class','nv-legend-text')
                .attr('dy', '.32em')
                .attr('dx', '8');

            var seriesText = series.select('text.nv-legend-text');

            series
                .on('mouseover', function(d,i) {
                    dispatch.legendMouseover(d,i);  //TODO: Make consistent with other event objects
                })
                .on('mouseout', function(d,i) {
                    dispatch.legendMouseout(d,i);
                })
                .on('click', function(d,i) {
                    dispatch.legendClick(d,i);
                    // make sure we re-get data in case it was modified
                    var data = series.data();
                    if (updateState) {
                        if(vers =='classic') {
                            if (radioButtonMode) {
                                //Radio button mode: set every series to disabled,
                                //  and enable the clicked series.
                                data.forEach(function(series) { series.disabled = true});
                                d.disabled = false;
                            }
                            else {
                                d.disabled = !d.disabled;
                                if (data.every(function(series) { return series.disabled})) {
                                    //the default behavior of NVD3 legends is, if every single series
                                    // is disabled, turn all series' back on.
                                    data.forEach(function(series) { series.disabled = false});
                                }
                            }
                        } else if(vers == 'furious') {
                            if(expanded) {
                                d.disengaged = !d.disengaged;
                                d.userDisabled = d.userDisabled == undefined ? !!d.disabled : d.userDisabled;
                                d.disabled = d.disengaged || d.userDisabled;
                            } else if (!expanded) {
                                d.disabled = !d.disabled;
                                d.userDisabled = d.disabled;
                                var engaged = data.filter(function(d) { return !d.disengaged; });
                                if (engaged.every(function(series) { return series.userDisabled })) {
                                    //the default behavior of NVD3 legends is, if every single series
                                    // is disabled, turn all series' back on.
                                    data.forEach(function(series) {
                                        series.disabled = series.userDisabled = false;
                                    });
                                }
                            }
                        }
                        dispatch.stateChange({
                            disabled: data.map(function(d) { return !!d.disabled }),
                            disengaged: data.map(function(d) { return !!d.disengaged })
                        });

                    }
                })
                .on('dblclick', function(d,i) {
                    if (enableDoubleClick) {
                        if (vers == 'furious' && expanded) return;
                        dispatch.legendDblclick(d, i);
                        if (updateState) {
                            // make sure we re-get data in case it was modified
                            var data = series.data();
                            //the default behavior of NVD3 legends, when double clicking one,
                            // is to set all other series' to false, and make the double clicked series enabled.
                            data.forEach(function (series) {
                                series.disabled = true;
                                if (vers == 'furious') series.userDisabled = series.disabled;
                            });
                            d.disabled = false;
                            if (vers == 'furious') d.userDisabled = d.disabled;
                            dispatch.stateChange({
                                disabled: data.map(function (d) {
                                    return !!d.disabled
                                })
                            });
                        }
                    }
                });

            series.classed('nv-disabled', function(d) { return d.userDisabled });
            series.exit().remove();

            seriesText
                .attr('fill', setTextColor)
                .text(function (d) { return keyFormatter(getKey(d)) });

            //TODO: implement fixed-width and max-width options (max-width is especially useful with the align option)
            // NEW ALIGNING CODE, TODO: clean up
            var legendWidth = 0;
            if (align) {

                var seriesWidths = [];
                series.each(function(d,i) {
                    var legendText;
                    if (keyFormatter(getKey(d)) && keyFormatter(getKey(d)).length > maxKeyLength) {
                        var trimmedKey = keyFormatter(getKey(d)).substring(0, maxKeyLength);
                        legendText = d3.select(this).select('text').text(trimmedKey + "...");
                        d3.select(this).append("svg:title").text(keyFormatter(getKey(d)));
                    } else {
                        legendText = d3.select(this).select('text');
                    }
                    var nodeTextLength;
                    try {
                        nodeTextLength = legendText.node().getComputedTextLength();
                        // If the legendText is display:none'd (nodeTextLength == 0), simulate an error so we approximate, instead
                        if(nodeTextLength <= 0) throw Error();
                    }
                    catch(e) {
                        nodeTextLength = nv.utils.calcApproxTextWidth(legendText);
                    }

                    seriesWidths.push(nodeTextLength + padding);
                });

                var seriesPerRow = 0;
                var columnWidths = [];
                legendWidth = 0;

                while ( legendWidth < availableWidth && seriesPerRow < seriesWidths.length) {
                    columnWidths[seriesPerRow] = seriesWidths[seriesPerRow];
                    legendWidth += seriesWidths[seriesPerRow++];
                }
                if (seriesPerRow === 0) seriesPerRow = 1; //minimum of one series per row

                while ( legendWidth > availableWidth && seriesPerRow > 1 ) {
                    columnWidths = [];
                    seriesPerRow--;

                    for (var k = 0; k < seriesWidths.length; k++) {
                        if (seriesWidths[k] > (columnWidths[k % seriesPerRow] || 0) )
                            columnWidths[k % seriesPerRow] = seriesWidths[k];
                    }

                    legendWidth = columnWidths.reduce(function(prev, cur, index, array) {
                        return prev + cur;
                    });
                }

                var xPositions = [];
                for (var i = 0, curX = 0; i < seriesPerRow; i++) {
                    xPositions[i] = curX;
                    curX += columnWidths[i];
                }

                series
                    .attr('transform', function(d, i) {
                        return 'translate(' + xPositions[i % seriesPerRow] + ',' + (5 + Math.floor(i / seriesPerRow) * versPadding) + ')';
                    });

                //position legend as far right as possible within the total width
                if (rightAlign) {
                    g.attr('transform', 'translate(' + (width - margin.right - legendWidth) + ',' + margin.top + ')');
                }
                else {
                    g.attr('transform', 'translate(0' + ',' + margin.top + ')');
                }

                height = margin.top + margin.bottom + (Math.ceil(seriesWidths.length / seriesPerRow) * versPadding);

            } else {

                var ypos = 5,
                    newxpos = 5,
                    maxwidth = 0,
                    xpos;
                series
                    .attr('transform', function(d, i) {
                        var length = d3.select(this).select('text').node().getComputedTextLength() + padding;
                        xpos = newxpos;

                        if (width < margin.left + margin.right + xpos + length) {
                            newxpos = xpos = 5;
                            ypos += versPadding;
                        }

                        newxpos += length;
                        if (newxpos > maxwidth) maxwidth = newxpos;

                        if(legendWidth < xpos + maxwidth) {
                            legendWidth = xpos + maxwidth;
                        }
                        return 'translate(' + xpos + ',' + ypos + ')';
                    });

                //position legend as far right as possible within the total width
                g.attr('transform', 'translate(' + (width - margin.right - maxwidth) + ',' + margin.top + ')');

                height = margin.top + margin.bottom + ypos + 15;
            }

            if(vers == 'furious') {
                // Size rectangles after text is placed
                seriesShape
                    .attr('width', function(d,i) {
                        return seriesText[0][i].getComputedTextLength() + 27;
                    })
                    .attr('height', 18)
                    .attr('y', -9)
                    .attr('x', -15);

                // The background for the expanded legend (UI)
                gEnter.insert('rect',':first-child')
                    .attr('class', 'nv-legend-bg')
                    .attr('fill', '#eee')
                    // .attr('stroke', '#444')
                    .attr('opacity',0);

                var seriesBG = g.select('.nv-legend-bg');

                seriesBG
                .transition().duration(300)
                    .attr('x', -versPadding )
                    .attr('width', legendWidth + versPadding - 12)
                    .attr('height', height + 10)
                    .attr('y', -margin.top - 10)
                    .attr('opacity', expanded ? 1 : 0);


            }

            seriesShape
                .style('fill', setBGColor)
                .style('fill-opacity', setBGOpacity)
                .style('stroke', setBGColor);
        });

        function setTextColor(d,i) {
            if(vers != 'furious') return '#000';
            if(expanded) {
                return d.disengaged ? '#000' : '#fff';
            } else if (!expanded) {
                if(!d.color) d.color = color(d,i);
                return !!d.disabled ? d.color : '#fff';
            }
        }

        function setBGColor(d,i) {
            if(expanded && vers == 'furious') {
                return d.disengaged ? '#eee' : d.color || color(d,i);
            } else {
                return d.color || color(d,i);
            }
        }


        function setBGOpacity(d,i) {
            if(expanded && vers == 'furious') {
                return 1;
            } else {
                return !!d.disabled ? 0 : 1;
            }
        }

        return chart;
    }

    //============================================================
    // Expose Public Variables
    //------------------------------------------------------------

    chart.dispatch = dispatch;
    chart.options = nv.utils.optionsFunc.bind(chart);

    chart._options = Object.create({}, {
        // simple options, just get/set the necessary values
        width:          {get: function(){return width;}, set: function(_){width=_;}},
        height:         {get: function(){return height;}, set: function(_){height=_;}},
        key:            {get: function(){return getKey;}, set: function(_){getKey=_;}},
        keyFormatter:   {get: function(){return keyFormatter;}, set: function(_){keyFormatter=_;}},
        align:          {get: function(){return align;}, set: function(_){align=_;}},
        maxKeyLength:   {get: function(){return maxKeyLength;}, set: function(_){maxKeyLength=_;}},
        rightAlign:     {get: function(){return rightAlign;}, set: function(_){rightAlign=_;}},
        padding:        {get: function(){return padding;}, set: function(_){padding=_;}},
        updateState:    {get: function(){return updateState;}, set: function(_){updateState=_;}},
        enableDoubleClick: {get: function(){return enableDoubleClick;}, set: function(_){enableDoubleClick=_;}},
        radioButtonMode:{get: function(){return radioButtonMode;}, set: function(_){radioButtonMode=_;}},
        expanded:       {get: function(){return expanded;}, set: function(_){expanded=_;}},
        vers:           {get: function(){return vers;}, set: function(_){vers=_;}},

        // options that require extra logic in the setter
        margin: {get: function(){return margin;}, set: function(_){
            margin.top    = _.top    !== undefined ? _.top    : margin.top;
            margin.right  = _.right  !== undefined ? _.right  : margin.right;
            margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
            margin.left   = _.left   !== undefined ? _.left   : margin.left;
        }},
        color:  {get: function(){return color;}, set: function(_){
            color = nv.utils.getColor(_);
        }}
    });

    nv.utils.initOptions(chart);

    return chart;
};


nv.models.scatter = function() {
    "use strict";

    //============================================================
    // Public Variables with Default Settings
    //------------------------------------------------------------

    var margin       = {top: 0, right: 0, bottom: 0, left: 0}
        , width        = null
        , height       = null
        , color        = nv.utils.defaultColor() // chooses color
        , pointBorderColor = null
        , id           = Math.floor(Math.random() * 100000) //Create semi-unique ID incase user doesn't select one
        , container    = null
        , x            = d3.scale.linear()
        , y            = d3.scale.linear()
        , z            = d3.scale.linear() //linear because d3.svg.shape.size is treated as area
        , getX         = function(d) { return d.x } // accessor to get the x value
        , getY         = function(d) { return d.y } // accessor to get the y value
        , getSize      = function(d) { return d.size || 1} // accessor to get the point size
        , getShape     = function(d) { return d.shape || 'circle' } // accessor to get point shape
        , forceX       = [] // List of numbers to Force into the X scale (ie. 0, or a max / min, etc.)
        , forceY       = [] // List of numbers to Force into the Y scale
        , forceSize    = [] // List of numbers to Force into the Size scale
        , interactive  = true // If true, plots a voronoi overlay for advanced point intersection
        , pointActive  = function(d) { return !d.notActive } // any points that return false will be filtered out
        , padData      = false // If true, adds half a data points width to front and back, for lining up a line chart with a bar chart
        , padDataOuter = .1 //outerPadding to imitate ordinal scale outer padding
        , clipEdge     = false // if true, masks points within x and y scale
        , clipVoronoi  = true // if true, masks each point with a circle... can turn off to slightly increase performance
        , showVoronoi  = false // display the voronoi areas
        , clipRadius   = function() { return 25 } // function to get the radius for voronoi point clips
        , xDomain      = null // Override x domain (skips the calculation from data)
        , yDomain      = null // Override y domain
        , xRange       = null // Override x range
        , yRange       = null // Override y range
        , sizeDomain   = null // Override point size domain
        , sizeRange    = null
        , singlePoint  = false
        , dispatch     = d3.dispatch('elementClick', 'elementDblClick', 'elementMouseover', 'elementMouseout', 'renderEnd')
        , useVoronoi   = true
        , duration     = 250
        , interactiveUpdateDelay = 300
        , showLabels    = false
        ;


    //============================================================
    // Private Variables
    //------------------------------------------------------------

    var x0, y0, z0 // used to store previous scales
        , xDom, yDom // used to store previous domains
        , width0
        , height0
        , timeoutID
        , needsUpdate = false // Flag for when the points are visually updating, but the interactive layer is behind, to disable tooltips
        , renderWatch = nv.utils.renderWatch(dispatch, duration)
        , _sizeRange_def = [16, 256]
        , _cache = {}
        ;

    //============================================================
    // Diff and Cache Utilities
    //------------------------------------------------------------
    // getDiffs is used to filter unchanged points from the update
    // selection. It implicitly updates it's cache when called and
    // therefor the diff is based upon the previous invocation NOT
    // the previous update.
    //
    // getDiffs takes a point as its first argument followed by n
    // key getter pairs (d, [key, get... key, get]) this approach
    // was chosen for efficiency. (The filter will call it a LOT).
    //
    // It is important to call delCache on point exit to prevent a
    // memory leak. It is also needed to prevent invalid caches if
    // a new point uses the same series and point id key.
    //
    // Argument Performance Concerns:
    // - Object property lists for key getter pairs would be very
    // expensive (points * objects for the GC every update).
    // - ES6 function names for implicit keys would be nice but
    // they are not guaranteed to be unique.
    // - function.toString to obtain implicit keys is possible
    // but long object keys are not free (internal hash).
    // - Explicit key without objects are the most efficient.

    function getCache(d) {
        var key, val;
        key = d[0].series + ':' + d[1];
        val = _cache[key] = _cache[key] || {};
        return val;
    }

    function delCache(d) {
        var key, val;
        key = d[0].series + ':' + d[1];
        delete _cache[key];
    }

    function getDiffs(d) {
        var i, key, val,
            cache = getCache(d),
            diffs = false;
        for (i = 1; i < arguments.length; i += 2) {
            key = arguments[i];
            val = arguments[i + 1](d[0], d[1]);
            if (cache[key] !== val || !cache.hasOwnProperty(key)) {
                cache[key] = val;
                diffs = true;
            }
        }
        return diffs;
    }

    function chart(selection) {
        renderWatch.reset();
        selection.each(function(data) {
            container = d3.select(this);
            var availableWidth = nv.utils.availableWidth(width, container, margin),
                availableHeight = nv.utils.availableHeight(height, container, margin);

            nv.utils.initSVG(container);

            //add series index to each data point for reference
            data.forEach(function(series, i) {
                series.values.forEach(function(point) {
                    point.series = i;
                });
            });

            // Setup Scales
            var logScale = (typeof(chart.yScale().base) === "function"); // Only log scale has a method "base()"
            // remap and flatten the data for use in calculating the scales' domains
            var seriesData = (xDomain && yDomain && sizeDomain) ? [] : // if we know xDomain and yDomain and sizeDomain, no need to calculate.... if Size is constant remember to set sizeDomain to speed up performance
                d3.merge(
                    data.map(function(d) {
                        return d.values.map(function(d,i) {
                            return { x: getX(d,i), y: getY(d,i), size: getSize(d,i) }
                        })
                    })
                );

            x   .domain(xDomain || d3.extent(seriesData.map(function(d) { return d.x; }).concat(forceX)))

            if (padData && data[0])
                x.range(xRange || [(availableWidth * padDataOuter +  availableWidth) / (2 *data[0].values.length), availableWidth - availableWidth * (1 + padDataOuter) / (2 * data[0].values.length)  ]);
            //x.range([availableWidth * .5 / data[0].values.length, availableWidth * (data[0].values.length - .5)  / data[0].values.length ]);
            else
                x.range(xRange || [0, availableWidth]);

             if (logScale) {
                    var min = d3.min(seriesData.map(function(d) { if (d.y !== 0) return d.y; }));
                    y.clamp(true)
                        .domain(yDomain || d3.extent(seriesData.map(function(d) {
                            if (d.y !== 0) return d.y;
                            else return min * 0.1;
                        }).concat(forceY)))
                        .range(yRange || [availableHeight, 0]);
                } else {
                        y.domain(yDomain || d3.extent(seriesData.map(function (d) { return d.y;}).concat(forceY)))
                        .range(yRange || [availableHeight, 0]);
                }

            z   .domain(sizeDomain || d3.extent(seriesData.map(function(d) { return d.size }).concat(forceSize)))
                .range(sizeRange || _sizeRange_def);

            // If scale's domain don't have a range, slightly adjust to make one... so a chart can show a single data point
            singlePoint = x.domain()[0] === x.domain()[1] || y.domain()[0] === y.domain()[1];

            if (x.domain()[0] === x.domain()[1])
                x.domain()[0] ?
                    x.domain([x.domain()[0] - x.domain()[0] * 0.01, x.domain()[1] + x.domain()[1] * 0.01])
                    : x.domain([-1,1]);

            if (y.domain()[0] === y.domain()[1])
                y.domain()[0] ?
                    y.domain([y.domain()[0] - y.domain()[0] * 0.01, y.domain()[1] + y.domain()[1] * 0.01])
                    : y.domain([-1,1]);

            if ( isNaN(x.domain()[0])) {
                x.domain([-1,1]);
            }

            if ( isNaN(y.domain()[0])) {
                y.domain([-1,1]);
            }

            x0 = x0 || x;
            y0 = y0 || y;
            z0 = z0 || z;

            var scaleDiff = x(1) !== x0(1) || y(1) !== y0(1) || z(1) !== z0(1);

            width0 = width0 || width;
            height0 = height0 || height;

            var sizeDiff = width0 !== width || height0 !== height;

            // Domain Diffs

            xDom = xDom || [];
            var domainDiff = xDom[0] !== x.domain()[0] || xDom[1] !== x.domain()[1];
            xDom = x.domain();

            yDom = yDom || [];
            domainDiff = domainDiff || yDom[0] !== y.domain()[0] || yDom[1] !== y.domain()[1];
            yDom = y.domain();

            // Setup containers and skeleton of chart
            var wrap = container.selectAll('g.nv-wrap.nv-scatter').data([data]);
            var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-scatter nv-chart-' + id);
            var defsEnter = wrapEnter.append('defs');
            var gEnter = wrapEnter.append('g');
            var g = wrap.select('g');

            wrap.classed('nv-single-point', singlePoint);
            gEnter.append('g').attr('class', 'nv-groups');
            gEnter.append('g').attr('class', 'nv-point-paths');
            wrapEnter.append('g').attr('class', 'nv-point-clips');

            wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            defsEnter.append('clipPath')
                .attr('id', 'nv-edge-clip-' + id)
                .append('rect')
                .attr('transform', 'translate( -10, -10)');

            wrap.select('#nv-edge-clip-' + id + ' rect')
                .attr('width', availableWidth + 20)
                .attr('height', (availableHeight > 0) ? availableHeight + 20 : 0);

            g.attr('clip-path', clipEdge ? 'url(#nv-edge-clip-' + id + ')' : '');

            function updateInteractiveLayer() {
                // Always clear needs-update flag regardless of whether or not
                // we will actually do anything (avoids needless invocations).
                needsUpdate = false;

                if (!interactive) return false;
                container.selectAll(".nv-point.hover").classed("hover", false);
                // inject series and point index for reference into voronoi
                if (useVoronoi === true) {


                    // nuke all voronoi paths on reload and recreate them
                    wrap.select('.nv-point-paths').selectAll('path').remove();

                    var vertices = d3.merge(data.map(function(group, groupIndex) {
                            return group.values
                                .map(function(point, pointIndex) {
                                    // *Adding noise to make duplicates very unlikely
                                    // *Injecting series and point index for reference
                                    // *Adding a 'jitter' to the points, because there's an issue in d3.geom.voronoi.
                                    var pX = getX(point,pointIndex);
                                    var pY = getY(point,pointIndex);

                                    return [nv.utils.NaNtoZero(x(pX)) + Math.random() * 1e-4,
                                            nv.utils.NaNtoZero(y(pY)) + Math.random() * 1e-4,
                                        groupIndex,
                                        pointIndex, point];
                                })
                                .filter(function(pointArray, pointIndex) {
                                    return pointActive(pointArray[4], pointIndex); // Issue #237.. move filter to after map, so pointIndex is correct!
                                })
                        })
                    );

                    if (vertices.length == 0) return false;  // No active points, we're done
                    if (vertices.length < 3) {
                        // Issue #283 - Adding 2 dummy points to the voronoi b/c voronoi requires min 3 points to work
                        vertices.push([x.range()[0] - 20, y.range()[0] - 20, null, null]);
                        vertices.push([x.range()[1] + 20, y.range()[1] + 20, null, null]);
                        vertices.push([x.range()[0] - 20, y.range()[0] + 20, null, null]);
                        vertices.push([x.range()[1] + 20, y.range()[1] - 20, null, null]);
                    }

                    // keep voronoi sections from going more than 10 outside of graph
                    // to avoid overlap with other things like legend etc
                    var bounds = d3.geom.polygon([
                        [-10,-10],
                        [-10,height + 10],
                        [width + 10,height + 10],
                        [width + 10,-10]
                    ]);

                    // delete duplicates from vertices - essential assumption for d3.geom.voronoi
                    var epsilon = 1e-4; // Uses 1e-4 to determine equivalence.
                    vertices = vertices.sort(function(a,b){return ((a[0] - b[0]) || (a[1] - b[1]))});
                    for (var i = 0; i < vertices.length - 1; ) {
                        if ((Math.abs(vertices[i][0] - vertices[i+1][0]) < epsilon) &&
                        (Math.abs(vertices[i][1] - vertices[i+1][1]) < epsilon)) {
                            vertices.splice(i+1, 1);
                        } else {
                            i++;
                        }
                    }

                    var voronoi = d3.geom.voronoi(vertices).map(function(d, i) {
                        return {
                            'data': bounds.clip(d),
                            'series': vertices[i][2],
                            'point': vertices[i][3]
                        }
                    });

                    var pointPaths = wrap.select('.nv-point-paths').selectAll('path').data(voronoi);
                    var vPointPaths = pointPaths
                        .enter().append("svg:path")
                        .attr("d", function(d) {
                            if (!d || !d.data || d.data.length === 0)
                                return 'M 0 0';
                            else
                                return "M" + d.data.join(",") + "Z";
                        })
                        .attr("id", function(d,i) {
                            return "nv-path-"+i; })
                        .attr("clip-path", function(d,i) { return "url(#nv-clip-"+id+"-"+i+")"; })
                        ;

                    // good for debugging point hover issues
                    if (showVoronoi) {
                        vPointPaths.style("fill", d3.rgb(230, 230, 230))
                            .style('fill-opacity', 0.4)
                            .style('stroke-opacity', 1)
                            .style("stroke", d3.rgb(200,200,200));
                    }

                    if (clipVoronoi) {
                        // voronoi sections are already set to clip,
                        // just create the circles with the IDs they expect
                        wrap.select('.nv-point-clips').selectAll('*').remove(); // must do * since it has sub-dom
                        var pointClips = wrap.select('.nv-point-clips').selectAll('clipPath').data(vertices);
                        var vPointClips = pointClips
                            .enter().append("svg:clipPath")
                            .attr("id", function(d, i) { return "nv-clip-"+id+"-"+i;})
                            .append("svg:circle")
                            .attr('cx', function(d) { return d[0]; })
                            .attr('cy', function(d) { return d[1]; })
                            .attr('r', clipRadius);
                    }

                    var mouseEventCallback = function(el, d, mDispatch) {
                        if (needsUpdate) return 0;
                        var series = data[d.series];
                        if (series === undefined) return;
                        var point  = series.values[d.point];
                        point['color'] = color(series, d.series);

                        // standardize attributes for tooltip.
                        point['x'] = getX(point);
                        point['y'] = getY(point);

                        // can't just get box of event node since it's actually a voronoi polygon
                        var box = container.node().getBoundingClientRect();
                        var scrollTop  = window.pageYOffset || document.documentElement.scrollTop;
                        var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

                        var pos = {
                            left: x(getX(point, d.point)) + box.left + scrollLeft + margin.left + 10,
                            top: y(getY(point, d.point)) + box.top + scrollTop + margin.top + 10
                        };

                        mDispatch({
                            point: point,
                            series: series,
                            pos: pos,
                            relativePos: [x(getX(point, d.point)) + margin.left, y(getY(point, d.point)) + margin.top],
                            seriesIndex: d.series,
                            pointIndex: d.point,
                            event: d3.event,
                            element: el
                        });
                    };

                    pointPaths
                        .on('click', function(d) {
                            mouseEventCallback(this, d, dispatch.elementClick);
                        })
                        .on('dblclick', function(d) {
                            mouseEventCallback(this, d, dispatch.elementDblClick);
                        })
                        .on('mouseover', function(d) {
                            mouseEventCallback(this, d, dispatch.elementMouseover);
                        })
                        .on('mouseout', function(d, i) {
                            mouseEventCallback(this, d, dispatch.elementMouseout);
                        });

                } else {
                    // add event handlers to points instead voronoi paths
                    wrap.select('.nv-groups').selectAll('.nv-group')
                        .selectAll('.nv-point')
                        //.data(dataWithPoints)
                        //.style('pointer-events', 'auto') // recativate events, disabled by css
                        .on('click', function(d,i) {
                            //nv.log('test', d, i);
                            if (needsUpdate || !data[d.series]) return 0; //check if this is a dummy point
                            var series = data[d.series],
                                point  = series.values[i];
                            var element = this;
                            dispatch.elementClick({
                                point: point,
                                series: series,
                                pos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top], //TODO: make this pos base on the page
                                relativePos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],
                                seriesIndex: d.series,
                                pointIndex: i,
                                event: d3.event,
                                element: element
                            });
                        })
                        .on('dblclick', function(d,i) {
                            if (needsUpdate || !data[d.series]) return 0; //check if this is a dummy point
                            var series = data[d.series],
                                point  = series.values[i];

                            dispatch.elementDblClick({
                                point: point,
                                series: series,
                                pos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],//TODO: make this pos base on the page
                                relativePos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],
                                seriesIndex: d.series,
                                pointIndex: i
                            });
                        })
                        .on('mouseover', function(d,i) {
                            if (needsUpdate || !data[d.series]) return 0; //check if this is a dummy point
                            var series = data[d.series],
                                point  = series.values[i];

                            dispatch.elementMouseover({
                                point: point,
                                series: series,
                                pos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],//TODO: make this pos base on the page
                                relativePos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],
                                seriesIndex: d.series,
                                pointIndex: i,
                                color: color(d, i)
                            });
                        })
                        .on('mouseout', function(d,i) {
                            if (needsUpdate || !data[d.series]) return 0; //check if this is a dummy point
                            var series = data[d.series],
                                point  = series.values[i];

                            dispatch.elementMouseout({
                                point: point,
                                series: series,
                                pos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],//TODO: make this pos base on the page
                                relativePos: [x(getX(point, i)) + margin.left, y(getY(point, i)) + margin.top],
                                seriesIndex: d.series,
                                pointIndex: i,
                                color: color(d, i)
                            });
                        });
                }
            }

            needsUpdate = true;
            var groups = wrap.select('.nv-groups').selectAll('.nv-group')
                .data(function(d) { return d }, function(d) { return d.key });
            groups.enter().append('g')
                .style('stroke-opacity', 1e-6)
                .style('fill-opacity', 1e-6);
            groups.exit()
                .remove();
            groups
                .attr('class', function(d,i) {
                    return (d.classed || '') + ' nv-group nv-series-' + i;
                })
                .classed('nv-noninteractive', !interactive)
                .classed('hover', function(d) { return d.hover });
            groups.watchTransition(renderWatch, 'scatter: groups')
                .style('fill', function(d,i) { return color(d, i) })
                .style('stroke', function(d,i) { return d.pointBorderColor || pointBorderColor || color(d, i) })
                .style('stroke-opacity', 1)
                .style('fill-opacity', .5);

            // create the points, maintaining their IDs from the original data set
            var points = groups.selectAll('path.nv-point')
                .data(function(d) {
                    return d.values.map(
                        function (point, pointIndex) {
                            return [point, pointIndex]
                        }).filter(
                            function(pointArray, pointIndex) {
                                return pointActive(pointArray[0], pointIndex)
                            })
                    });
            points.enter().append('path')
                .attr('class', function (d) {
                    return 'nv-point nv-point-' + d[1];
                })
                .style('fill', function (d) { return d.color })
                .style('stroke', function (d) { return d.color })
                .attr('transform', function(d) {
                    return 'translate(' + nv.utils.NaNtoZero(x0(getX(d[0],d[1]))) + ',' + nv.utils.NaNtoZero(y0(getY(d[0],d[1]))) + ')'
                })
                .attr('d',
                    nv.utils.symbol()
                    .type(function(d) { return getShape(d[0]); })
                    .size(function(d) { return z(getSize(d[0],d[1])) })
            );
            points.exit().each(delCache).remove();
            groups.exit().selectAll('path.nv-point')
                .watchTransition(renderWatch, 'scatter exit')
                .attr('transform', function(d) {
                    return 'translate(' + nv.utils.NaNtoZero(x(getX(d[0],d[1]))) + ',' + nv.utils.NaNtoZero(y(getY(d[0],d[1]))) + ')'
                })
                .remove();

            //============================================================
            // Point Update Optimisation Notes
            //------------------------------------------------------------
            // The following update selections are filtered with getDiffs
            // (defined at the top of this file) this brings a performance
            // benefit for charts with large data sets that accumulate a
            // subset of changes or additions over time.
            //
            // Uneccesary and expensive DOM calls are avoided by culling
            // unchanged points from the selection in exchange for the
            // cheaper overhead of caching and diffing each point first.
            //
            // Due to the way D3 and NVD3 work, other global changes need
            // to be considered in addition to local point properties.
            // This is a potential source of bugs (if any of the global
            // changes that possibly affect points are missed).

            // Update Point Positions [x, y]
            points.filter(function (d) {
                // getDiffs must always be called to update cache
                return getDiffs(d, 'x', getX, 'y', getY) ||
                    scaleDiff || sizeDiff || domainDiff;
            })
            .watchTransition(renderWatch, 'scatter points')
            .attr('transform', function (d) {
                return 'translate(' +
                    nv.utils.NaNtoZero(x(getX(d[0], d[1]))) + ',' +
                    nv.utils.NaNtoZero(y(getY(d[0], d[1]))) + ')'
            });

            // Update Point Appearance [shape, size]
            points.filter(function (d) {
                // getDiffs must always be called to update cache
                return getDiffs(d, 'shape', getShape, 'size', getSize) ||
                    scaleDiff || sizeDiff || domainDiff;
            })
            .watchTransition(renderWatch, 'scatter points')
            .attr('d', nv.utils.symbol()
                .type(function (d) { return getShape(d[0]) })
                .size(function (d) { return z(getSize(d[0], d[1])) })
            );

            // add label a label to scatter chart
            if(showLabels)
            {
                var titles =  groups.selectAll('.nv-label')
                    .data(function(d) {
                        return d.values.map(
                            function (point, pointIndex) {
                                return [point, pointIndex]
                            }).filter(
                                function(pointArray, pointIndex) {
                                    return pointActive(pointArray[0], pointIndex)
                                })
                        });

                titles.enter().append('text')
                    .style('fill', function (d,i) {
                        return d.color })
                    .style('stroke-opacity', 0)
                    .style('fill-opacity', 1)
                    .attr('transform', function(d) {
                        var dx = nv.utils.NaNtoZero(x0(getX(d[0],d[1]))) + Math.sqrt(z(getSize(d[0],d[1]))/Math.PI) + 2;
                        return 'translate(' + dx + ',' + nv.utils.NaNtoZero(y0(getY(d[0],d[1]))) + ')';
                    })
                    .text(function(d,i){
                        return d[0].label;});

                titles.exit().remove();
                groups.exit().selectAll('path.nv-label')
                    .watchTransition(renderWatch, 'scatter exit')
                    .attr('transform', function(d) {
                        var dx = nv.utils.NaNtoZero(x(getX(d[0],d[1])))+ Math.sqrt(z(getSize(d[0],d[1]))/Math.PI)+2;
                        return 'translate(' + dx + ',' + nv.utils.NaNtoZero(y(getY(d[0],d[1]))) + ')';
                    })
                    .remove();
               titles.each(function(d) {
                  d3.select(this)
                    .classed('nv-label', true)
                    .classed('nv-label-' + d[1], false)
                    .classed('hover',false);
                });
                titles.watchTransition(renderWatch, 'scatter labels')
                    .attr('transform', function(d) {
                        var dx = nv.utils.NaNtoZero(x(getX(d[0],d[1])))+ Math.sqrt(z(getSize(d[0],d[1]))/Math.PI)+2;
                        return 'translate(' + dx + ',' + nv.utils.NaNtoZero(y(getY(d[0],d[1]))) + ')'
                    });
            }

            // Delay updating the invisible interactive layer for smoother animation
            if( interactiveUpdateDelay )
            {
                clearTimeout(timeoutID); // stop repeat calls to updateInteractiveLayer
                timeoutID = setTimeout(updateInteractiveLayer, interactiveUpdateDelay );
            }
            else
            {
                updateInteractiveLayer();
            }

            //store old scales for use in transitions on update
            x0 = x.copy();
            y0 = y.copy();
            z0 = z.copy();

            width0 = width;
            height0 = height;

        });
        renderWatch.renderEnd('scatter immediate');
        return chart;
    }

    //============================================================
    // Expose Public Variables
    //------------------------------------------------------------

    chart.dispatch = dispatch;
    chart.options = nv.utils.optionsFunc.bind(chart);

    // utility function calls provided by this chart
    chart._calls = new function() {
        this.clearHighlights = function () {
            nv.dom.write(function() {
                container.selectAll(".nv-point.hover").classed("hover", false);
            });
            return null;
        };
        this.highlightPoint = function (seriesIndex, pointIndex, isHoverOver) {
            nv.dom.write(function() {
                container.select('.nv-groups')
                  .selectAll(".nv-series-" + seriesIndex)
                  .selectAll(".nv-point-" + pointIndex)
                  .classed("hover", isHoverOver);
            });
        };
    };

    // trigger calls from events too
    dispatch.on('elementMouseover.point', function(d) {
        if (interactive) chart._calls.highlightPoint(d.seriesIndex,d.pointIndex,true);
    });

    dispatch.on('elementMouseout.point', function(d) {
        if (interactive) chart._calls.highlightPoint(d.seriesIndex,d.pointIndex,false);
    });

    chart._options = Object.create({}, {
        // simple options, just get/set the necessary values
        width:        {get: function(){return width;}, set: function(_){width=_;}},
        height:       {get: function(){return height;}, set: function(_){height=_;}},
        xScale:       {get: function(){return x;}, set: function(_){x=_;}},
        yScale:       {get: function(){return y;}, set: function(_){y=_;}},
        pointScale:   {get: function(){return z;}, set: function(_){z=_;}},
        xDomain:      {get: function(){return xDomain;}, set: function(_){xDomain=_;}},
        yDomain:      {get: function(){return yDomain;}, set: function(_){yDomain=_;}},
        pointDomain:  {get: function(){return sizeDomain;}, set: function(_){sizeDomain=_;}},
        xRange:       {get: function(){return xRange;}, set: function(_){xRange=_;}},
        yRange:       {get: function(){return yRange;}, set: function(_){yRange=_;}},
        pointRange:   {get: function(){return sizeRange;}, set: function(_){sizeRange=_;}},
        forceX:       {get: function(){return forceX;}, set: function(_){forceX=_;}},
        forceY:       {get: function(){return forceY;}, set: function(_){forceY=_;}},
        forcePoint:   {get: function(){return forceSize;}, set: function(_){forceSize=_;}},
        interactive:  {get: function(){return interactive;}, set: function(_){interactive=_;}},
        pointActive:  {get: function(){return pointActive;}, set: function(_){pointActive=_;}},
        padDataOuter: {get: function(){return padDataOuter;}, set: function(_){padDataOuter=_;}},
        padData:      {get: function(){return padData;}, set: function(_){padData=_;}},
        clipEdge:     {get: function(){return clipEdge;}, set: function(_){clipEdge=_;}},
        clipVoronoi:  {get: function(){return clipVoronoi;}, set: function(_){clipVoronoi=_;}},
        clipRadius:   {get: function(){return clipRadius;}, set: function(_){clipRadius=_;}},
        showVoronoi:   {get: function(){return showVoronoi;}, set: function(_){showVoronoi=_;}},
        id:           {get: function(){return id;}, set: function(_){id=_;}},
        interactiveUpdateDelay: {get:function(){return interactiveUpdateDelay;}, set: function(_){interactiveUpdateDelay=_;}},
        showLabels: {get: function(){return showLabels;}, set: function(_){ showLabels = _;}},
        pointBorderColor: {get: function(){return pointBorderColor;}, set: function(_){pointBorderColor=_;}},

        // simple functor options
        x:     {get: function(){return getX;}, set: function(_){getX = d3.functor(_);}},
        y:     {get: function(){return getY;}, set: function(_){getY = d3.functor(_);}},
        pointSize: {get: function(){return getSize;}, set: function(_){getSize = d3.functor(_);}},
        pointShape: {get: function(){return getShape;}, set: function(_){getShape = d3.functor(_);}},

        // options that require extra logic in the setter
        margin: {get: function(){return margin;}, set: function(_){
            margin.top    = _.top    !== undefined ? _.top    : margin.top;
            margin.right  = _.right  !== undefined ? _.right  : margin.right;
            margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
            margin.left   = _.left   !== undefined ? _.left   : margin.left;
        }},
        duration: {get: function(){return duration;}, set: function(_){
            duration = _;
            renderWatch.reset(duration);
        }},
        color: {get: function(){return color;}, set: function(_){
            color = nv.utils.getColor(_);
        }},
        useVoronoi: {get: function(){return useVoronoi;}, set: function(_){
            useVoronoi = _;
            if (useVoronoi === false) {
                clipVoronoi = false;
            }
        }}
    });

    nv.utils.initOptions(chart);
    return chart;
};

nv.models.stackedArea = function() {
    "use strict";

    //============================================================
    // Public Variables with Default Settings
    //------------------------------------------------------------

    var margin = {top: 0, right: 0, bottom: 0, left: 0}
        , width = 960
        , height = 500
        , color = nv.utils.defaultColor() // a function that computes the color
        , id = Math.floor(Math.random() * 100000) //Create semi-unique ID incase user doesn't selet one
        , container = null
        , getX = function(d) { return d.x } // accessor to get the x value from a data point
        , getY = function(d) { return d.y } // accessor to get the y value from a data point
        , defined = function(d,i) { return !isNaN(getY(d,i)) && getY(d,i) !== null } // allows a line to be not continuous when it is not defined
        , style = 'stack'
        , offset = 'zero'
        , order = 'default'
        , interpolate = 'linear'  // controls the line interpolation
        , clipEdge = false // if true, masks lines within x and y scale
        , x //can be accessed via chart.xScale()
        , y //can be accessed via chart.yScale()
        , scatter = nv.models.scatter()
        , duration = 250
        , dispatch =  d3.dispatch('areaClick', 'areaMouseover', 'areaMouseout','renderEnd', 'elementClick', 'elementMouseover', 'elementMouseout')
        ;

    scatter
        .pointSize(2.2) // default size
        .pointDomain([2.2, 2.2]) // all the same size by default
    ;

    /************************************
     * offset:
     *   'wiggle' (stream)
     *   'zero' (stacked)
     *   'expand' (normalize to 100%)
     *   'silhouette' (simple centered)
     *
     * order:
     *   'inside-out' (stream)
     *   'default' (input order)
     ************************************/

    var renderWatch = nv.utils.renderWatch(dispatch, duration);

    function chart(selection) {
        renderWatch.reset();
        renderWatch.models(scatter);
        selection.each(function(data) {
            var availableWidth = width - margin.left - margin.right,
                availableHeight = height - margin.top - margin.bottom;

            container = d3.select(this);
            nv.utils.initSVG(container);

            // Setup Scales
            x = scatter.xScale();
            y = scatter.yScale();

            var dataRaw = data;
            // Injecting point index into each point because d3.layout.stack().out does not give index
            data.forEach(function(aseries, i) {
                aseries.seriesIndex = i;
                aseries.values = aseries.values.map(function(d, j) {
                    d.index = j;
                    d.seriesIndex = i;
                    return d;
                });
            });

            var dataFiltered = data.filter(function(series) {
                return !series.disabled;
            });

            data = d3.layout.stack()
                .order(order)
                .offset(offset)
                .values(function(d) { return d.values })  //TODO: make values customizeable in EVERY model in this fashion
                .x(getX)
                .y(getY)
                .out(function(d, y0, y) {
                    d.display = {
                        y: y,
                        y0: y0
                    };
                })
            (dataFiltered);

            // Setup containers and skeleton of chart
            var wrap = container.selectAll('g.nv-wrap.nv-stackedarea').data([data]);
            var wrapEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-stackedarea');
            var defsEnter = wrapEnter.append('defs');
            var gEnter = wrapEnter.append('g');
            var g = wrap.select('g');

            gEnter.append('g').attr('class', 'nv-areaWrap');
            gEnter.append('g').attr('class', 'nv-scatterWrap');

            wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            // If the user has not specified forceY, make sure 0 is included in the domain
            // Otherwise, use user-specified values for forceY
            if (scatter.forceY().length == 0) {
                scatter.forceY().push(0);
            }

            scatter
                .width(availableWidth)
                .height(availableHeight)
                .x(getX)
                .y(function(d) {
                    if (d.display !== undefined) { return d.display.y + d.display.y0; }
                })
                .color(data.map(function(d,i) {
                    d.color = d.color || color(d, d.seriesIndex);
                    return d.color;
                }));

            var scatterWrap = g.select('.nv-scatterWrap')
                .datum(data);

            scatterWrap.call(scatter);

            defsEnter.append('clipPath')
                .attr('id', 'nv-edge-clip-' + id)
                .append('rect');

            wrap.select('#nv-edge-clip-' + id + ' rect')
                .attr('width', availableWidth)
                .attr('height', availableHeight);

            g.attr('clip-path', clipEdge ? 'url(#nv-edge-clip-' + id + ')' : '');

            var area = d3.svg.area()
                .defined(defined)
                .x(function(d,i)  { return x(getX(d,i)) })
                .y0(function(d) {
                    return y(d.display.y0)
                })
                .y1(function(d) {
                    return y(d.display.y + d.display.y0)
                })
                .interpolate(interpolate);

            var zeroArea = d3.svg.area()
                .defined(defined)
                .x(function(d,i)  { return x(getX(d,i)) })
                .y0(function(d) { return y(d.display.y0) })
                .y1(function(d) { return y(d.display.y0) });

            var path = g.select('.nv-areaWrap').selectAll('path.nv-area')
                .data(function(d) { return d });

            path.enter().append('path').attr('class', function(d,i) { return 'nv-area nv-area-' + i })
                .attr('d', function(d,i){
                    return zeroArea(d.values, d.seriesIndex);
                })
                .on('mouseover', function(d,i) {
                    d3.select(this).classed('hover', true);
                    dispatch.areaMouseover({
                        point: d,
                        series: d.key,
                        pos: [d3.event.pageX, d3.event.pageY],
                        seriesIndex: d.seriesIndex
                    });
                })
                .on('mouseout', function(d,i) {
                    d3.select(this).classed('hover', false);
                    dispatch.areaMouseout({
                        point: d,
                        series: d.key,
                        pos: [d3.event.pageX, d3.event.pageY],
                        seriesIndex: d.seriesIndex
                    });
                })
                .on('click', function(d,i) {
                    d3.select(this).classed('hover', false);
                    dispatch.areaClick({
                        point: d,
                        series: d.key,
                        pos: [d3.event.pageX, d3.event.pageY],
                        seriesIndex: d.seriesIndex
                    });
                });

            path.exit().remove();
            path.style('fill', function(d,i){
                    return d.color || color(d, d.seriesIndex)
                })
                .style('stroke', function(d,i){ return d.color || color(d, d.seriesIndex) });
            path.watchTransition(renderWatch,'stackedArea path')
                .attr('d', function(d,i) {
                    return area(d.values,i)
                });

            //============================================================
            // Event Handling/Dispatching (in chart's scope)
            //------------------------------------------------------------

            scatter.dispatch.on('elementMouseover.area', function(e) {
                g.select('.nv-chart-' + id + ' .nv-area-' + e.seriesIndex).classed('hover', true);
            });
            scatter.dispatch.on('elementMouseout.area', function(e) {
                g.select('.nv-chart-' + id + ' .nv-area-' + e.seriesIndex).classed('hover', false);
            });

            //Special offset functions
            chart.d3_stackedOffset_stackPercent = function(stackData) {
                var n = stackData.length,    //How many series
                    m = stackData[0].length,     //how many points per series
                    i,
                    j,
                    o,
                    y0 = [];

                for (j = 0; j < m; ++j) { //Looping through all points
                    for (i = 0, o = 0; i < dataRaw.length; i++) { //looping through all series
                        o += getY(dataRaw[i].values[j]); //total y value of all series at a certian point in time.
                    }

                    if (o) for (i = 0; i < n; i++) { //(total y value of all series at point in time i) != 0
                        stackData[i][j][1] /= o;
                    } else { //(total y value of all series at point in time i) == 0
                        for (i = 0; i < n; i++) {
                            stackData[i][j][1] = 0;
                        }
                    }
                }
                for (j = 0; j < m; ++j) y0[j] = 0;
                return y0;
            };

        });

        renderWatch.renderEnd('stackedArea immediate');
        return chart;
    }

    //============================================================
    // Global getters and setters
    //------------------------------------------------------------

    chart.dispatch = dispatch;
    chart.scatter = scatter;

    scatter.dispatch.on('elementClick', function(){ dispatch.elementClick.apply(this, arguments); });
    scatter.dispatch.on('elementMouseover', function(){ dispatch.elementMouseover.apply(this, arguments); });
    scatter.dispatch.on('elementMouseout', function(){ dispatch.elementMouseout.apply(this, arguments); });

    chart.interpolate = function(_) {
        if (!arguments.length) return interpolate;
        interpolate = _;
        return chart;
    };

    chart.duration = function(_) {
        if (!arguments.length) return duration;
        duration = _;
        renderWatch.reset(duration);
        scatter.duration(duration);
        return chart;
    };

    chart.dispatch = dispatch;
    chart.scatter = scatter;
    chart.options = nv.utils.optionsFunc.bind(chart);

    chart._options = Object.create({}, {
        // simple options, just get/set the necessary values
        width:      {get: function(){return width;}, set: function(_){width=_;}},
        height:     {get: function(){return height;}, set: function(_){height=_;}},
        defined: {get: function(){return defined;}, set: function(_){defined=_;}},
        clipEdge: {get: function(){return clipEdge;}, set: function(_){clipEdge=_;}},
        offset:      {get: function(){return offset;}, set: function(_){offset=_;}},
        order:    {get: function(){return order;}, set: function(_){order=_;}},
        interpolate:    {get: function(){return interpolate;}, set: function(_){interpolate=_;}},

        // simple functor options
        x:     {get: function(){return getX;}, set: function(_){getX = d3.functor(_);}},
        y:     {get: function(){return getY;}, set: function(_){getY = d3.functor(_);}},

        // options that require extra logic in the setter
        margin: {get: function(){return margin;}, set: function(_){
            margin.top    = _.top    !== undefined ? _.top    : margin.top;
            margin.right  = _.right  !== undefined ? _.right  : margin.right;
            margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
            margin.left   = _.left   !== undefined ? _.left   : margin.left;
        }},
        color:  {get: function(){return color;}, set: function(_){
            color = nv.utils.getColor(_);
        }},
        style: {get: function(){return style;}, set: function(_){
            style = _;
            switch (style) {
                case 'stack':
                    chart.offset('zero');
                    chart.order('default');
                    break;
                case 'stream':
                    chart.offset('wiggle');
                    chart.order('inside-out');
                    break;
                case 'stream-center':
                    chart.offset('silhouette');
                    chart.order('inside-out');
                    break;
                case 'expand':
                    chart.offset('expand');
                    chart.order('default');
                    break;
                case 'stack_percent':
                    chart.offset(chart.d3_stackedOffset_stackPercent);
                    chart.order('default');
                    break;
            }
        }},
        duration: {get: function(){return duration;}, set: function(_){
            duration = _;
            renderWatch.reset(duration);
            scatter.duration(duration);
        }}
    });

    nv.utils.inheritOptions(chart, scatter);
    nv.utils.initOptions(chart);

    return chart;
};

nv.models.stackedAreaChart = function() {
    "use strict";

    //============================================================
    // Public Variables with Default Settings
    //------------------------------------------------------------

    var stacked = nv.models.stackedArea()
        , xAxis = nv.models.axis()
        , yAxis = nv.models.axis()
        , legend = nv.models.legend()
        , controls = nv.models.legend()
        , interactiveLayer = nv.interactiveGuideline()
        , tooltip = nv.models.tooltip()
        , focus = nv.models.focus(nv.models.stackedArea())
        ;

    var margin = {top: 10, right: 25, bottom: 50, left: 60}
        , marginTop = null
        , width = null
        , height = null
        , color = nv.utils.defaultColor()
        , showControls = true
        , showLegend = true
        , legendPosition = 'top'
        , showXAxis = true
        , showYAxis = true
        , rightAlignYAxis = false
        , focusEnable = false
        , useInteractiveGuideline = false
        , showTotalInTooltip = true
        , totalLabel = 'TOTAL'
        , x //can be accessed via chart.xScale()
        , y //can be accessed via chart.yScale()
        , state = nv.utils.state()
        , defaultState = null
        , noData = null
        , dispatch = d3.dispatch('stateChange', 'changeState','renderEnd')
        , controlWidth = 250
        , controlOptions = ['Stacked','Stream','Expanded']
        , controlLabels = {}
        , duration = 250
        ;

    state.style = stacked.style();
    xAxis.orient('bottom').tickPadding(7);
    yAxis.orient((rightAlignYAxis) ? 'right' : 'left');

    tooltip
        .headerFormatter(function(d, i) {
            return xAxis.tickFormat()(d, i);
        })
        .valueFormatter(function(d, i) {
            return yAxis.tickFormat()(d, i);
        });

    interactiveLayer.tooltip
        .headerFormatter(function(d, i) {
            return xAxis.tickFormat()(d, i);
        })
        .valueFormatter(function(d, i) {
            return d == null ? "N/A" : yAxis.tickFormat()(d, i);
        });

    var oldYTickFormat = null,
        oldValueFormatter = null;

    controls.updateState(false);

    //============================================================
    // Private Variables
    //------------------------------------------------------------

    var renderWatch = nv.utils.renderWatch(dispatch);
    var style = stacked.style();

    var stateGetter = function(data) {
        return function(){
            return {
                active: data.map(function(d) { return !d.disabled }),
                style: stacked.style()
            };
        }
    };

    var stateSetter = function(data) {
        return function(state) {
            if (state.style !== undefined)
                style = state.style;
            if (state.active !== undefined)
                data.forEach(function(series,i) {
                    series.disabled = !state.active[i];
                });
        }
    };

    var percentFormatter = d3.format('%');

    function chart(selection) {
        renderWatch.reset();
        renderWatch.models(stacked);
        if (showXAxis) renderWatch.models(xAxis);
        if (showYAxis) renderWatch.models(yAxis);

        selection.each(function(data) {
            var container = d3.select(this),
                that = this;
            nv.utils.initSVG(container);

            var availableWidth = nv.utils.availableWidth(width, container, margin),
                availableHeight = nv.utils.availableHeight(height, container, margin) - (focusEnable ? focus.height() : 0);

            chart.update = function() { container.transition().duration(duration).call(chart); };
            chart.container = this;

            state
                .setter(stateSetter(data), chart.update)
                .getter(stateGetter(data))
                .update();

            // DEPRECATED set state.disabled
            state.disabled = data.map(function(d) { return !!d.disabled });

            if (!defaultState) {
                var key;
                defaultState = {};
                for (key in state) {
                    if (state[key] instanceof Array)
                        defaultState[key] = state[key].slice(0);
                    else
                        defaultState[key] = state[key];
                }
            }

            // Display No Data message if there's nothing to show.
            if (!data || !data.length || !data.filter(function(d) { return d.values.length }).length) {
                nv.utils.noData(chart, container)
                return chart;
            } else {
                container.selectAll('.nv-noData').remove();
            }
            // Setup Scales
            x = stacked.xScale();
            y = stacked.yScale();

            // Setup containers and skeleton of chart
            var wrap = container.selectAll('g.nv-wrap.nv-stackedAreaChart').data([data]);
            var gEnter = wrap.enter().append('g').attr('class', 'nvd3 nv-wrap nv-stackedAreaChart').append('g');
            var g = wrap.select('g');

            gEnter.append('g').attr('class', 'nv-legendWrap');
            gEnter.append('g').attr('class', 'nv-controlsWrap');

            var focusEnter = gEnter.append('g').attr('class', 'nv-focus');
            focusEnter.append('g').attr('class', 'nv-background').append('rect');
            focusEnter.append('g').attr('class', 'nv-x nv-axis');
            focusEnter.append('g').attr('class', 'nv-y nv-axis');
            focusEnter.append('g').attr('class', 'nv-stackedWrap');
            focusEnter.append('g').attr('class', 'nv-interactive');

            // g.select("rect").attr("width",availableWidth).attr("height",availableHeight);

            var contextEnter = gEnter.append('g').attr('class', 'nv-focusWrap');

            // Legend
            if (!showLegend) {
                g.select('.nv-legendWrap').selectAll('*').remove();
            } else {
                var legendWidth = (showControls && legendPosition === 'top') ? availableWidth - controlWidth : availableWidth;

                legend.width(legendWidth);
                g.select('.nv-legendWrap').datum(data).call(legend);

                if (legendPosition === 'bottom') {
                	// constant from axis.js, plus some margin for better layout
                	var xAxisHeight = (showXAxis ? 12 : 0) + 10;
                   	margin.bottom = Math.max(legend.height() + xAxisHeight, margin.bottom);
                   	availableHeight = nv.utils.availableHeight(height, container, margin) - (focusEnable ? focus.height() : 0);
                	var legendTop = availableHeight + xAxisHeight;
                    g.select('.nv-legendWrap')
                        .attr('transform', 'translate(0,' + legendTop +')');
                } else if (legendPosition === 'top') {
                    if (!marginTop && margin.top != legend.height()) {
                        margin.top = legend.height();
                        availableHeight = nv.utils.availableHeight(height, container, margin) - (focusEnable ? focus.height() : 0);
                    }

                    g.select('.nv-legendWrap')
                    	.attr('transform', 'translate(' + (availableWidth-legendWidth) + ',' + (-margin.top) +')');
                }
            }

            // Controls
            if (!showControls) {
                 g.select('.nv-controlsWrap').selectAll('*').remove();
            } else {
                var controlsData = [
                    {
                        key: controlLabels.stacked || 'Stacked',
                        metaKey: 'Stacked',
                        disabled: stacked.style() != 'stack',
                        style: 'stack'
                    },
                    {
                        key: controlLabels.stream || 'Stream',
                        metaKey: 'Stream',
                        disabled: stacked.style() != 'stream',
                        style: 'stream'
                    },
                    {
                        key: controlLabels.expanded || 'Expanded',
                        metaKey: 'Expanded',
                        disabled: stacked.style() != 'expand',
                        style: 'expand'
                    },
                    {
                        key: controlLabels.stack_percent || 'Stack %',
                        metaKey: 'Stack_Percent',
                        disabled: stacked.style() != 'stack_percent',
                        style: 'stack_percent'
                    }
                ];

                controlWidth = (controlOptions.length/3) * 260;
                controlsData = controlsData.filter(function(d) {
                    return controlOptions.indexOf(d.metaKey) !== -1;
                });

                controls
                    .width( controlWidth )
                    .color(['#444', '#444', '#444']);

                g.select('.nv-controlsWrap')
                    .datum(controlsData)
                    .call(controls);

                var requiredTop = Math.max(controls.height(), showLegend && (legendPosition === 'top') ? legend.height() : 0);

                if ( margin.top != requiredTop ) {
                    margin.top = requiredTop;
                    availableHeight = nv.utils.availableHeight(height, container, margin) - (focusEnable ? focus.height() : 0);
                }

                g.select('.nv-controlsWrap')
                    .attr('transform', 'translate(0,' + (-margin.top) +')');
            }

            wrap.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

            if (rightAlignYAxis) {
                g.select(".nv-y.nv-axis")
                    .attr("transform", "translate(" + availableWidth + ",0)");
            }

            //Set up interactive layer
            if (useInteractiveGuideline) {
                interactiveLayer
                    .width(availableWidth)
                    .height(availableHeight)
                    .margin({left: margin.left, top: margin.top})
                    .svgContainer(container)
                    .xScale(x);
                wrap.select(".nv-interactive").call(interactiveLayer);
            }

            g.select('.nv-focus .nv-background rect')
                .attr('width', availableWidth)
                .attr('height', availableHeight);

            stacked
                .width(availableWidth)
                .height(availableHeight)
                .color(data.map(function(d,i) {
                    return d.color || color(d, i);
                }).filter(function(d,i) { return !data[i].disabled; }));

            var stackedWrap = g.select('.nv-focus .nv-stackedWrap')
                .datum(data.filter(function(d) { return !d.disabled; }));

            // Setup Axes
            if (showXAxis) {
                xAxis.scale(x)
                    ._ticks( nv.utils.calcTicksX(availableWidth/100, data) )
                    .tickSize( -availableHeight, 0);
            }

            if (showYAxis) {
                var ticks;
                if (stacked.offset() === 'wiggle') {
                    ticks = 0;
                }
                else {
                    ticks = nv.utils.calcTicksY(availableHeight/36, data);
                }
                yAxis.scale(y)
                    ._ticks(ticks)
                    .tickSize(-availableWidth, 0);
            }

            //============================================================
            // Update Axes
            //============================================================
            function updateXAxis() {
                if(showXAxis) {
                    g.select('.nv-focus .nv-x.nv-axis')
                        .attr('transform', 'translate(0,' + availableHeight + ')')
                        .transition()
                        .duration(duration)
                        .call(xAxis)
                        ;
                }
            }

            function updateYAxis() {
                if(showYAxis) {
                    if (stacked.style() === 'expand' || stacked.style() === 'stack_percent') {
                        var currentFormat = yAxis.tickFormat();

                        if ( !oldYTickFormat || currentFormat !== percentFormatter )
                            oldYTickFormat = currentFormat;

                        //Forces the yAxis to use percentage in 'expand' mode.
                        yAxis.tickFormat(percentFormatter);
                    }
                    else {
                        if (oldYTickFormat) {
                            yAxis.tickFormat(oldYTickFormat);
                            oldYTickFormat = null;
                        }
                    }

                    g.select('.nv-focus .nv-y.nv-axis')
                    .transition().duration(0)
                    .call(yAxis);
                }
            }

            //============================================================
            // Update Focus
            //============================================================
            if(!focusEnable) {
                stackedWrap.transition().call(stacked);
                updateXAxis();
                updateYAxis();
            } else {
                focus.width(availableWidth);
                g.select('.nv-focusWrap')
                    .attr('transform', 'translate(0,' + ( availableHeight + margin.bottom + focus.margin().top) + ')')
                    .datum(data.filter(function(d) { return !d.disabled; }))
                    .call(focus);
                var extent = focus.brush.empty() ? focus.xDomain() : focus.brush.extent();
                if(extent !== null){
                    onBrush(extent);
                }
            }

            //============================================================
            // Event Handling/Dispatching (in chart's scope)
            //------------------------------------------------------------

            stacked.dispatch.on('areaClick.toggle', function(e) {
                if (data.filter(function(d) { return !d.disabled }).length === 1)
                    data.forEach(function(d) {
                        d.disabled = false;
                    });
                else
                    data.forEach(function(d,i) {
                        d.disabled = (i != e.seriesIndex);
                    });

                state.disabled = data.map(function(d) { return !!d.disabled });
                dispatch.stateChange(state);

                chart.update();
            });

            legend.dispatch.on('stateChange', function(newState) {
                for (var key in newState)
                    state[key] = newState[key];
                dispatch.stateChange(state);
                chart.update();
            });

            controls.dispatch.on('legendClick', function(d,i) {
                if (!d.disabled) return;

                controlsData = controlsData.map(function(s) {
                    s.disabled = true;
                    return s;
                });
                d.disabled = false;

                stacked.style(d.style);


                state.style = stacked.style();
                dispatch.stateChange(state);

                chart.update();
            });

            interactiveLayer.dispatch.on('elementMousemove', function(e) {
                stacked.clearHighlights();
                var singlePoint, pointIndex, pointXLocation, allData = [], valueSum = 0, allNullValues = true, atleastOnePoint = false;
                data
                    .filter(function(series, i) {
                        series.seriesIndex = i;
                        return !series.disabled;
                    })
                    .forEach(function(series,i) {
                        pointIndex = nv.interactiveBisect(series.values, e.pointXValue, chart.x());
                        var point = series.values[pointIndex];
                        var pointYValue = chart.y()(point, pointIndex);
                        if (pointYValue != null && pointYValue > 0) {
                            stacked.highlightPoint(i, pointIndex, true);
                            atleastOnePoint = true;
                        }

                        // Draw at least one point if all values are zero.
                        if (i === (data.length - 1) && !atleastOnePoint) {
                            stacked.highlightPoint(i, pointIndex, true);
                        }
                        if (typeof point === 'undefined') return;
                        if (typeof singlePoint === 'undefined') singlePoint = point;
                        if (typeof pointXLocation === 'undefined') pointXLocation = chart.xScale()(chart.x()(point,pointIndex));

                        //If we are in 'expand' mode, use the stacked percent value instead of raw value.
                        var tooltipValue = (stacked.style() == 'expand') ? point.display.y : chart.y()(point,pointIndex);
                        allData.push({
                            key: series.key,
                            value: tooltipValue,
                            color: color(series,series.seriesIndex),
                            point: point
                        });

                        if (showTotalInTooltip && stacked.style() != 'expand' && tooltipValue != null) {
                          valueSum += tooltipValue;
                          allNullValues = false;
                        };
                    });

                allData.reverse();

                //Highlight the tooltip entry based on which stack the mouse is closest to.
                if (allData.length > 2) {
                    var yValue = chart.yScale().invert(e.mouseY);
                    var yDistMax = Infinity, indexToHighlight = null;
                    allData.forEach(function(series,i) {

                        //To handle situation where the stacked area chart is negative, we need to use absolute values
                        //when checking if the mouse Y value is within the stack area.
                        yValue = Math.abs(yValue);
                        var stackedY0 = Math.abs(series.point.display.y0);
                        var stackedY = Math.abs(series.point.display.y);
                        if ( yValue >= stackedY0 && yValue <= (stackedY + stackedY0))
                        {
                            indexToHighlight = i;
                            return;
                        }
                    });
                    if (indexToHighlight != null)
                        allData[indexToHighlight].highlight = true;
                }

                //If we are not in 'expand' mode, add a 'Total' row to the tooltip.
                if (showTotalInTooltip && stacked.style() != 'expand' && allData.length >= 2 && !allNullValues) {
                    allData.push({
                        key: totalLabel,
                        value: valueSum,
                        total: true
                    });
                }

                var xValue = chart.x()(singlePoint,pointIndex);

                var valueFormatter = interactiveLayer.tooltip.valueFormatter();
                // Keeps track of the tooltip valueFormatter if the chart changes to expanded view
                if (stacked.style() === 'expand' || stacked.style() === 'stack_percent') {
                    if ( !oldValueFormatter ) {
                        oldValueFormatter = valueFormatter;
                    }
                    //Forces the tooltip to use percentage in 'expand' mode.
                    valueFormatter = d3.format(".1%");
                }
                else {
                    if (oldValueFormatter) {
                        valueFormatter = oldValueFormatter;
                        oldValueFormatter = null;
                    }
                }

                interactiveLayer.tooltip
                    .valueFormatter(valueFormatter)
                    .data(
                    {
                        value: xValue,
                        series: allData
                    }
                )();

                interactiveLayer.renderGuideLine(pointXLocation);

            });

            interactiveLayer.dispatch.on("elementMouseout",function(e) {
                stacked.clearHighlights();
            });

            /* Update `main' graph on brush update. */
            focus.dispatch.on("onBrush", function(extent) {
                onBrush(extent);
            });

            // Update chart from a state object passed to event handler
            dispatch.on('changeState', function(e) {

                if (typeof e.disabled !== 'undefined' && data.length === e.disabled.length) {
                    data.forEach(function(series,i) {
                        series.disabled = e.disabled[i];
                    });

                    state.disabled = e.disabled;
                }

                if (typeof e.style !== 'undefined') {
                    stacked.style(e.style);
                    style = e.style;
                }

                chart.update();
            });

            //============================================================
            // Functions
            //------------------------------------------------------------

            function onBrush(extent) {
                // Update Main (Focus)
                window.timeRange = extent;

                var stackedWrap = g.select('.nv-focus .nv-stackedWrap')
                    .datum(
                    data.filter(function(d) { return !d.disabled; })
                        .map(function(d,i) {
                            return {
                                key: d.key,
                                area: d.area,
                                classed: d.classed,
                                values: d.values.filter(function(d,i) {
                                    return stacked.x()(d,i) >= extent[0] && stacked.x()(d,i) <= extent[1];
                                }),
                                disableTooltip: d.disableTooltip
                            };
                        })
                );
                stackedWrap.transition().duration(duration).call(stacked);

                // Update Main (Focus) Axes
                updateXAxis();
                updateYAxis();
            }

        });

        renderWatch.renderEnd('stacked Area chart immediate');
        return chart;
    }

    //============================================================
    // Event Handling/Dispatching (out of chart's scope)
    //------------------------------------------------------------

    stacked.dispatch.on('elementMouseover.tooltip', function(evt) {
        evt.point['x'] = stacked.x()(evt.point);
        evt.point['y'] = stacked.y()(evt.point);
        tooltip.data(evt).hidden(false);
    });

    stacked.dispatch.on('elementMouseout.tooltip', function(evt) {
        tooltip.hidden(true)
    });
    //============================================================
    // Expose Public Variables
    //------------------------------------------------------------

    // expose chart's sub-components
    chart.dispatch = dispatch;
    chart.stacked = stacked;
    chart.legend = legend;
    chart.controls = controls;
    chart.xAxis = xAxis;
    chart.x2Axis = focus.xAxis;
    chart.yAxis = yAxis;
    chart.y2Axis = focus.yAxis;
    chart.interactiveLayer = interactiveLayer;
    chart.tooltip = tooltip;
    chart.focus = focus;

    chart.dispatch = dispatch;
    chart.options = nv.utils.optionsFunc.bind(chart);

    chart._options = Object.create({}, {
        // simple options, just get/set the necessary values
        width:      {get: function(){return width;}, set: function(_){width=_;}},
        height:     {get: function(){return height;}, set: function(_){height=_;}},
        showLegend: {get: function(){return showLegend;}, set: function(_){showLegend=_;}},
        legendPosition: {get: function(){return legendPosition;}, set: function(_){legendPosition=_;}},
        showXAxis:      {get: function(){return showXAxis;}, set: function(_){showXAxis=_;}},
        showYAxis:    {get: function(){return showYAxis;}, set: function(_){showYAxis=_;}},
        defaultState:    {get: function(){return defaultState;}, set: function(_){defaultState=_;}},
        noData:    {get: function(){return noData;}, set: function(_){noData=_;}},
        showControls:    {get: function(){return showControls;}, set: function(_){showControls=_;}},
        controlLabels:    {get: function(){return controlLabels;}, set: function(_){controlLabels=_;}},
        controlOptions:    {get: function(){return controlOptions;}, set: function(_){controlOptions=_;}},
        showTotalInTooltip:      {get: function(){return showTotalInTooltip;}, set: function(_){showTotalInTooltip=_;}},
        totalLabel:      {get: function(){return totalLabel;}, set: function(_){totalLabel=_;}},
        focusEnable:    {get: function(){return focusEnable;}, set: function(_){focusEnable=_;}},
        focusHeight:     {get: function(){return focus.height();}, set: function(_){focus.height(_);}},
        brushExtent: {get: function(){return focus.brushExtent();}, set: function(_){focus.brushExtent(_);}},

        // options that require extra logic in the setter
        margin: {get: function(){return margin;}, set: function(_){
            if (_.top !== undefined) {
                margin.top = _.top;
                marginTop = _.top;
            }
            margin.right  = _.right  !== undefined ? _.right  : margin.right;
            margin.bottom = _.bottom !== undefined ? _.bottom : margin.bottom;
            margin.left   = _.left   !== undefined ? _.left   : margin.left;
        }},
        focusMargin: {get: function(){return focus.margin}, set: function(_){
            focus.margin.top    = _.top    !== undefined ? _.top    : focus.margin.top;
            focus.margin.right  = _.right  !== undefined ? _.right  : focus.margin.right;
            focus.margin.bottom = _.bottom !== undefined ? _.bottom : focus.margin.bottom;
            focus.margin.left   = _.left   !== undefined ? _.left   : focus.margin.left;
        }},
        duration: {get: function(){return duration;}, set: function(_){
            duration = _;
            renderWatch.reset(duration);
            stacked.duration(duration);
            xAxis.duration(duration);
            yAxis.duration(duration);
        }},
        color:  {get: function(){return color;}, set: function(_){
            color = nv.utils.getColor(_);
            legend.color(color);
            stacked.color(color);
            focus.color(color);
        }},
        x: {get: function(){return stacked.x();}, set: function(_){
            stacked.x(_);
            focus.x(_);
        }},
        y: {get: function(){return stacked.y();}, set: function(_){
            stacked.y(_);
            focus.y(_);
        }},
        rightAlignYAxis: {get: function(){return rightAlignYAxis;}, set: function(_){
            rightAlignYAxis = _;
            yAxis.orient( rightAlignYAxis ? 'right' : 'left');
        }},
        useInteractiveGuideline: {get: function(){return useInteractiveGuideline;}, set: function(_){
            useInteractiveGuideline = !!_;
            chart.interactive(!_);
            chart.useVoronoi(!_);
            stacked.scatter.interactive(!_);
        }}
    });

    nv.utils.inheritOptions(chart, stacked);
    nv.utils.initOptions(chart);

    return chart;
};

nv.models.stackedAreaWithFocusChart = function() {
  return nv.models.stackedAreaChart()
    .margin({ bottom: 30 })
    .focusEnable( true );
};
})();
//# sourceMappingURL=nv.d3.js.map
