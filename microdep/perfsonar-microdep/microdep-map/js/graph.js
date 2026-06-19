// library to produce graphs
// depends on d3.js

import {parms, prop_desc, prop_long_desc, event_sum_type} from "./map-lib.js";

export var chart;

var svg_height, svg_width;
const x_dim=10;  // number of columns in heatmap
const y_dim=10;

export function init_d3(div){

    $("#"+div).html(''); // blank div
    // set the dimensions and margins of the graph
    var h= window.innerHeight * 0.6;
    var wmax= window.innerWidth * 0.9;
    var w= Math.min( h * 16 / 9, wmax) ;
    h = w * 9 / 16;
    
    var margin = {top: 80, right: 25, bottom: 80, left: 200},
	width = w - margin.left - margin.right,
	height = h - margin.top - margin.bottom;
    svg_height=height;  // can't find it in the svg-object..
    svg_width=width;


    // append the svg object to the body of the page
    var svg = d3.select("#"+div)
	.append("svg")
	.attr("width", width + margin.left + margin.right)
	.attr("height", height + margin.top + margin.bottom)
	.append("g")
	.attr("transform",
              "translate(" + margin.left + "," + margin.top + ")");
    return svg;
}

export function heatmap( div, hits, property, get_color, threshes, title, template_url){
    var svg=init_d3(div );
    
    var data=[];
    for ( let hit of hits)
	data.push(hit._source);

    data.sort((a,b) => { return b[property] - a[property]; } );

    var values=data.map( function(d){ return d[property] } );
    var max = d3.max(values);
    var min = d3.min(values);
    
    // Labels of row and columns -> unique identifier of the column called 'from' and 'to'
    // produce an array with the matrix values
    var froms = d3.map( data, function(d){return d.from;}).keys().slice(0, x_dim);
    var tos = d3.map( data, function(d){return d.to;}).keys().slice(0, y_dim);
    var top=[]; 
    for ( let rec of data){
	if ( froms.indexOf( rec.from) >= 0 && tos.indexOf( rec.to) >= 0)
	    top.push(rec);
	    //top[from + ':' + to] = rec[property];
    }

    // Build X scales and axis:
    var x = d3.scaleBand()
	.range([ 0, svg_width ])
	.domain(froms)
	.padding(0.05);
    svg.append("g")
	.style("font-size", "18px")
	.attr("transform", "translate(0," + svg_height + ")")
	.call(d3.axisBottom(x).tickSize(0))
    //.select(".domain").remove();
	.selectAll(".tick text")
	.style("text-anchor", "start")
        .attr("dx", "0em")
        .attr("dy", "+2em")
        .attr("transform", "rotate(15)");

	//.attr("transform", function(d) {
	//    return "rotate(-30)" });

    // Build Y scales and axis:
    var y = d3.scaleBand()
	.range([ svg_height, 0 ])
	.domain(tos)
	.padding(0.05);
    svg.append("g")
	.style("font-size", "18px")  
	.call(d3.axisLeft(y).tickSize(0))
	.select(".domain").remove()

    // Build color scale
    var myColor = d3.scaleSequential()
	.interpolator(d3.interpolateInferno)
	.domain([min,max])

    // create a tooltip
    var tooltip = d3.select("#"+div)
	.append("div")
	.style("opacity", 0)
	.attr("class", "tooltip")
	.style("background-color", "white")
	.style("border", "solid")
	.style("border-width", "2px")
	.style("border-radius", "5px")
	.style("padding", "5px")

    // Three function that change the tooltip when user hover / move / leave a cell
    var mouseover = function(d) {
	tooltip
	    .style("opacity", 1)
	d3.select(this)
	    .style("stroke", "black")
	    .style("opacity", 1)
    }
    var mousemove = function(d) {
	tooltip
	    .html(d.from + ' - ' + d.to + " : " + d[property].toFixed(1) )
	    .style("left", (d3.mouse(this)[0]+70) + "px")
	    .style("top", (d3.mouse(this)[1]) + "px")
	    .style("font-size", "22px")
    }
    var mouseleave = function(d) {
	tooltip
	    .style("opacity", 0)
	d3.select(this)
	    .style("stroke", "none")
	    .style("opacity", 0.8)
    }

    // add the squares
    svg.selectAll()
	.data(top, function(d, i) {
	    return d.from + ':' + d.to;})
	.enter()
	.append("rect")
	.attr("x", function(d) {
	    return x(d.from) })
	.attr("y", function(d) {
	    return y(d.to) })
	.attr("rx", 4)
	.attr("ry", 4)
	.attr("width", x.bandwidth() )
	.attr("height", y.bandwidth() )
	.style("fill", function(d, i) {
	    // console.log( 'property: '+d[property]);
	    // get_color now returns null for NaN/missing — paint such cells
	    // light grey ("no data") rather than leaving the fill unset.
	    return get_color( d[property], threshes) || "#e8e8e8" } )
    //	    return myColor(d[property])} )
	.style("stroke-width", 4)
	.style("stroke", "none")
	.style("opacity", 0.8)
	.on("mouseover", mouseover)
	.on("mousemove", mousemove)
	.on("mouseleave", mouseleave)
	.on("click", function(d){
	    window.open( template_url.format( d.from, d.to, d.from, d.to) );
	});

    // Add title to graph
    svg.append("text")
        .attr("x", 0)
        .attr("y", -50)
        .attr("text-anchor", "left")
        .style("font-size", "22px")
        .text( 'Heatmap of ' + prop_desc[event_sum_type[parms.event]][property] + ' for ' + title);

    // Add subtitle to graph
    svg.append("text")
        .attr("x", 0)
        .attr("y", -20)
        .attr("text-anchor", "left")
        .style("font-size", "18px")
        .style("fill", "grey")
        .style("max-width", 400)
        .text("Range: [ " + min.toFixed(1) + ', ' + max.toFixed[1] + ']');

}


export function curve( div, hits, property, title){
    var svg=init_d3(div )
	.call(d3.zoom().on("zoom", function () {
	    svg.attr("transform", d3.event.transform)
	} ) );
    
    var data=[];
    for ( let hit of hits)
	data.push(hit._source);

    var values=data.map( function(d){ return d[property] } );
    var xy=data.map( function(d){
	return { date: d.datetime, value: d[property] } } );
    var max = d3.max(values);
    var min = d3.min(values);
    var times=data.map( function(d){ return d.datetime } );
    times.sort();
    var parseTime=d3.timeParse("%Y-%m-%dT%T");

    // Add X axis --> it is a date format
    var x = d3.scaleTime()
	.domain( d3.extent( data, function(d) { return new Date(d.datetime) } ) )
	.range([ 0, svg_width ]);
    svg.append("g")
      .attr("transform", "translate(0," + svg_height + ")")
	.call(d3.axisBottom(x))
    	.style("font-size", "18px")  

	//.ticks(timeHour.every(1));

    // Add Y axis
    var y = d3.scaleLinear()
      .domain([0, max])
      .range([ svg_height, 0 ]);
    svg.append("g")
	.call(d3.axisLeft(y))
    	.style("font-size", "18px")  ;

    var tooltip = d3.select( "#"+div)
	.append("div")
	.style("opacity", 0)
	.attr("class", "tooltip")
	.style("background-color", "white")
	.style("border", "solid")
	.style("border-width", "1px")
	.style("border-radius", "5px")
	.style("padding", "10px")
    
    var mouseover = function(d) {
	tooltip
	    .style("opacity", 1)
    }

    var format_time = function(epoch){
	let d = new Date(epoch);
	let hh = fix2( d.getHours() ) + ':' + fix2( d.getMinutes()) + ':' + fix2( d.getSeconds()) ;
	return hh;
    }

    function fix2(n){
	return ('00' + n).slice(-2);
    }

    var mousemove = function(d) {
	tooltip
	    .html( property + " is " + d[property].toFixed(1) + ' at ' + format_time( d.datetime ) + ' datetime ' + d.datetime)
	    .style("left", (d3.mouse(this)[0]+90) + "px") // It is important to put the +90: other wise the tooltip is exactly where the point is an it creates a weird effect
	    .style("top", (d3.mouse(this)[1]) + "px")
    }

    // A function that change this tooltip when the leaves a point: just need to set opacity to 0 again
    var mouseleave = function(d) {
	tooltip
	    .transition()
	    .duration(200)
	    .style("opacity", 0)
    }

    // Add dots
    svg.append('g')
	.selectAll("dot")
	.data( data) // the .filter part is just to keep a few dots on the chart, not all of them
	.enter()
	.append("circle")
	.attr("cx", function (d) { return x( new Date( d.datetime) ); } )
	.attr("cy", function (d) { return y(d[property]); } )
	.attr("r", 7)
	.style("fill", "#69b3a2")
	.style("opacity", 0.3)
	.style("stroke", "white")
	.on("mouseover", mouseover )
	.on("mousemove", mousemove )
	.on("mouseleave", mouseleave )
    
    // Add the line
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-width", 1.5)
      .attr("d", d3.line()
            .x( function(d) {
		return x( new Date( d.datetime) ) })
            .y( function(d) {
		return y(d[property]) })
           );

    // Add title to graph
    svg.append("text")
        .attr("x", 0)
        .attr("y", -50)
        .attr("text-anchor", "left")
        .style("font-size", "22px")
        .text( title + ' for ' + property);


    // A function that update the chart for given boundaries
    function updateChart() {

      // What are the selected boundaries?
      extent = d3.event.selection

      // If no selection, back to initial coordinate. Otherwise, update X axis domain
      if(!extent){
        if (!idleTimeout) return idleTimeout = setTimeout(idled, 350); // This allows to wait a little bit
        x.domain([ 4,8])
      }else{
        x.domain([ x.invert(extent[0]), x.invert(extent[1]) ])
        line.select(".brush").call(brush.move, null) // This remove the grey brush area as soon as the selection has been done
      }

      // Update axis and line position
      xAxis.transition().duration(1000).call(d3.axisBottom(x))
      line
          .select('.line')
          .transition()
          .duration(1000)
          .attr("d", d3.line()
            .x(function(d) { return x(d.date) })
            .y(function(d) { return y(d.value) })
          )
    }

    // If user double click, reinitialize the chart
    svg.on("dblclick",function(){
      x.domain(d3.extent(data, function(d) { return d.date; }))
      xAxis.transition().call(d3.axisBottom(x))
      line
        .select('.line')
        .transition()
        .attr("d", d3.line()
          .x(function(d) { return x(d.date) })
          .y(function(d) { return y(d.value) })
      )
    });
}

export function vis_curve( div, hits, property, title ){
    var container = document.getElementById(div);

    var data=[];
    for ( let hit of hits)
	data.push(hit._source);

    var items=hits.map( function(hit){
	var d=hit._source;
	return { 'x': d.datetime, 'y': d[property]}
    });
    var dataset = new vis.DataSet(items);
    var options = {
	defaultGroup: title,
	legend: true
	// start: "2014-06-10",
	// end: "2014-06-18",
    };
    var graph2d = new vis.Graph2d(container, dataset, options);

}

// Read a CSS custom property from :root, with a fallback if undefined.
function _theme_var(name, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch (_) { return fallback; }
}

// Convert "#rrggbb" to "rgba(r, g, b, a)" for translucent fills.
function _alpha(hex, alpha) {
    if (!hex || hex[0] !== '#') return hex;
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(full.substring(0, 2), 16);
    const g = parseInt(full.substring(2, 4), 16);
    const b = parseInt(full.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function chart_curve( div, hits, property, title, unit ){
    var container = document.getElementById(div); // .getContext('2d');
    var h= window.innerHeight * 0.6;
    var wmax= window.innerWidth * 0.9;
    var w= Math.min( h * 16 / 9, wmax) ;
    h = w * 9 / 16;
    container.height=h;
    container.width=w;

    var data=[];
    for ( let hit of hits){
	let rec= hit._source;
	data.push( {"x": rec.timestamp * 1000, "y": rec[property] });
    }

    // Resolve theme tokens from :root (works for both light and dark themes
    // via curve-chart.html's localStorage-driven data-theme on <html>).
    const accent   = _theme_var('--c-accent',   '#2f81f7');
    const border   = _theme_var('--c-border',   '#2a313a');
    const borderH  = _theme_var('--c-border-h', '#3a4350');
    const text     = _theme_var('--c-text',     '#e6e9ee');
    const text2    = _theme_var('--c-text-2',   '#b1b8c2');
    const text3    = _theme_var('--c-text-3',   '#7e8794');
    const elevated = _theme_var('--c-elevated', '#1c2229');

    const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = fontFamily;
        Chart.defaults.font.size = 12;
        Chart.defaults.color = text2;
    }

    const data_desc = {
        datasets: [{
            label: prop_long_desc[parms.event][property],
            data: data,
            backgroundColor: _alpha(accent, 0.55),
            borderColor: accent,
            borderWidth: 1,
            pointBackgroundColor: _alpha(accent, 0.55),
            pointBorderColor: accent,
            pointBorderWidth: 1,
            pointRadius: 3.5,
            pointHoverRadius: 7,
            pointHoverBackgroundColor: accent,
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            pointStyle: 'circle'
        }]
    };
    
    const config = {
        type: 'scatter',
        data: data_desc,

        options: {
            responsive: false,
            maintainAspectRatio: false,
            animation: { duration: 500, easing: 'easeOutQuart' },
            interaction: { mode: 'nearest', intersect: false, axis: 'x' },
            layout: { padding: { top: 8, right: 18, bottom: 8, left: 8 } },

            scales: {
                x: {
                    type: 'time',
                    time: {
                        tooltipFormat: 'DD HH:mm',
                        round: true,
                        displayFormats: {
                            millisecond: 'HH:mm:ss.SSS',
                            second:      'HH:mm:ss',
                            minute:      'HH:mm',
                            hour:        'DD HH:mm',
                            day:         'DD HH',
                            week:        'DD HH',
                            month:       'MM DD'
                        }
                    },
                    grid:   { color: _alpha(border, 0.5), drawTicks: true, tickColor: borderH, drawBorder: false },
                    border: { display: false },
                    ticks:  { color: text3, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 18 },
                    title:  { display: true, text: 'Time', color: text3,
                              font: { size: 11, weight: '600' },
                              padding: { top: 8, bottom: 0 } }
                },
                y: {
                    grid:   { color: _alpha(border, 0.5), drawTicks: true, tickColor: borderH, drawBorder: false },
                    border: { display: false },
                    ticks:  { color: text3, font: { size: 11 }, padding: 6 },
                    title:  { display: true, text: prop_desc[parms.event][property], color: text3,
                              font: { size: 11, weight: '600' } }
                }
            },

            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: text2,
                        font: { size: 12 },
                        boxWidth: 12,
                        boxHeight: 12,
                        padding: 14,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                title: {
                    display: !!title,
                    text: title,
                    align: 'start',
                    color: text,
                    padding: { top: 4, bottom: 14 },
                    font: { size: 14, weight: '600' }
                },
                tooltip: {
                    backgroundColor: elevated,
                    titleColor: text,
                    bodyColor: text2,
                    borderColor: border,
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                    boxPadding: 6,
                    titleFont: { size: 12, weight: '600' },
                    bodyFont:  { size: 12 },
                    displayColors: true,
                    usePointStyle: true
                },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'xy',
                        modifierKey: 'ctrl'
                    },
                    zoom: {
                        wheel: { enabled: true },
                        drag:  { enabled: true,
                                 backgroundColor: _alpha(accent, 0.12),
                                 borderColor: accent,
                                 borderWidth: 1 },
                        pinch: { enabled: true },
                        mode:  'xy'
                    }
                }
            }
        }
    };

    chart = new Chart(container, config);

} // of chart_curve
