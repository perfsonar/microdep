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

export function heatmap(div, hits, property, get_color, threshes, title, template_url, on_cell_click) {
    const container = document.getElementById(div);
    if (!container) return;

    // Flatten _source out so the rest of the function works with plain rows.
    const data = [];
    for (const hit of hits) data.push(hit._source);

    if (!data.length) {
        container.innerHTML =
            '<div class="empty-state">' +
              '<div class="empty-state-icon">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
                  '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
                  '<path d="M9 9h6v6H9z"/>' +
                  '<path d="M3 9h18M9 3v18"/>' +
                '</svg>' +
              '</div>' +
              '<h3 class="empty-state-title">No measurements to plot</h3>' +
              '<p class="empty-state-msg">There are no records for the selected event-type in this period.</p>' +
              '<ul class="empty-state-suggestions">' +
                '<li>Try a different date or a longer period (week / 4 weeks).</li>' +
                '<li>Switch the event type in the sidebar — not every host runs every test.</li>' +
                '<li>Open the map to confirm the property has any coloured links right now.</li>' +
              '</ul>' +
            '</div>';
        return;
    }

    data.sort((a, b) => (b[property] || 0) - (a[property] || 0));

    const numeric = data.map(d => d[property]).filter(v => typeof v === "number" && isFinite(v));
    const min = numeric.length ? Math.min(...numeric) : null;
    const max = numeric.length ? Math.max(...numeric) : null;

    // Show all unique hosts on both axes; .heatmap-scroll handles horizontal
    // overflow and the sticky row header keeps the source column readable.
    // (The legacy d3 version was capped at x_dim/y_dim because rendering a
    // big SVG matrix was awkward — that constraint doesn't apply to a table.)
    const froms = _hm_uniq(data.map(d => d.from));
    const tos   = _hm_uniq(data.map(d => d.to));

    const lookup = {};
    for (const rec of data) {
        if (froms.indexOf(rec.from) < 0 || tos.indexOf(rec.to) < 0) continue;
        lookup[rec.from + "\u0000" + rec.to] = rec[property];
    }

    function expand_template(s, args) {
        if (!s) return null;
        return s.replace(/\{(\d+)\}/g, (m, n) => args[n] !== undefined ? args[n] : m);
    }

    function fmt_val(v) {
        if (v === undefined || v === null) return "";
        if (typeof v !== "number") return String(v);
        if (!isFinite(v)) return String(v);
        const abs = Math.abs(v);
        if (abs === 0)  return "0";
        if (abs < 0.01) return v.toExponential(1);
        if (abs < 10)   return v.toFixed(2);
        if (abs < 100)  return v.toFixed(1);
        return Math.round(v).toString();
    }

    // Each heatmap rendering gets a unique id for the table — needed
    // so the CSV-export button (in the header) can find this specific
    // table even when several heatmap tabs are open simultaneously.
    const tableId = 'heatmap-table-' + div;

    let html = "";
    html += '<div class="heatmap-header">';
    html += '  <div class="tab-header-row">';
    html += '    <h2 class="heatmap-title">Heatmap — ' + _hm_esc(property) + "</h2>";
    // Inline button HTML — graph.js can't import the helper from
    // microdep-map.js without restructuring; we duplicate the markup
    // here. The delegated click handler in microdep-map.js still
    // intercepts the click via the .export-csv-btn class.
    html += '    <button type="button" class="export-csv-btn" ' +
            'data-csv-table="' + tableId + '" data-csv-name="heatmap" ' +
            'title="Download this heatmap as CSV">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
                '<path d="M7 10l5 5 5-5"/>' +
                '<path d="M12 15V3"/>' +
              '</svg>' +
              '<span class="export-csv-label">Export CSV</span>' +
              '<span class="export-csv-done-label">Downloaded</span>' +
            '</button>';
    html += '  </div>';
    html += '  <p class="heatmap-subtitle">' + _hm_esc(title || "") + "</p>";
    if (min !== null && max !== null) {
        html += '  <p class="heatmap-range">min ' + fmt_val(min) +
                " · max " + fmt_val(max) + " · " + data.length +
                " link" + (data.length === 1 ? "" : "s") + "</p>";
    }
    html += "</div>";

    html += '<div class="heatmap-scroll"><table class="heatmap-table" id="' + tableId + '">';
    html += '<thead><tr><th class="heatmap-corner">From&nbsp;\\&nbsp;To</th>';
    for (const to of tos) {
        html += '<th class="heatmap-col-header" title="' + _hm_esc(to) +
                '"><span>' + _hm_esc(to) + "</span></th>";
    }
    html += "</tr></thead><tbody>";

    for (const from of froms) {
        html += "<tr>";
        html += '<th class="heatmap-row-header" title="' + _hm_esc(from) + '">' +
                _hm_esc(from) + "</th>";
        for (const to of tos) {
            const v = lookup[from + "\u0000" + to];
            if (v === undefined) {
                // Empty cells emit empty CSV column rather than "—" so
                // numeric columns stay numeric when opened in Excel/Sheets.
                html += '<td class="heatmap-cell" data-csv=""><div class="heatmap-cell-inner heatmap-cell-empty">—</div></td>';
                continue;
            }
            const color = get_color ? get_color(v, threshes) : "#888";
            const url = expand_template(template_url, [from, to, from, to]);
            const cellTitle = from + " → " + to + " = " + fmt_val(v);
            // data-csv carries the RAW numeric value so the export is
            // analysis-friendly (Excel sees a number, not "1.5K").
            const csvVal = String(v);
            html += '<td class="heatmap-cell" title="' + _hm_esc(cellTitle) + '" data-csv="' + _hm_esc(csvVal) + '">';
            if (url) {
                if (on_cell_click) {
                    // Cell becomes a button — JS handler dispatches via the
                    // page's open-as-tab mechanism. Data attributes carry
                    // the URL + endpoints so a single delegated listener can
                    // serve all cells.
                    html += '<button type="button" class="heatmap-cell-link"' +
                            ' data-cell-url="' + _hm_esc(url) + '"' +
                            ' data-cell-from="' + _hm_esc(from) + '"' +
                            ' data-cell-to="' + _hm_esc(to) + '">';
                } else {
                    // No callback — fall back to a plain anchor that opens
                    // the URL in a new browser window/tab.
                    html += '<a class="heatmap-cell-link" href="' + _hm_esc(url) +
                            '" target="_blank" rel="noopener">';
                }
            }
            html += '<div class="heatmap-cell-inner" style="background:' +
                    _hm_esc(color) + '">' + _hm_esc(fmt_val(v)) + "</div>";
            if (url) html += on_cell_click ? "</button>" : "</a>";
            html += "</td>";
        }
        html += "</tr>";
    }
    html += "</tbody></table></div>";

    container.innerHTML = html;

    // Wire up the integrated-tab click handler if one was provided.
    if (on_cell_click) {
        container.addEventListener('click', function (ev) {
            const btn = ev.target.closest('button.heatmap-cell-link');
            if (!btn) return;
            ev.preventDefault();
            on_cell_click(btn.dataset.cellUrl, btn.dataset.cellFrom, btn.dataset.cellTo);
        });
    }
}

function _hm_uniq(arr) {
    const seen = new Set();
    const out = [];
    for (const v of arr) { if (!seen.has(v)) { seen.add(v); out.push(v); } }
    return out;
}

function _hm_esc(s) {
    if (s === undefined || s === null) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
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
                    // The main page loads only chart.umd.js (no date adapter — see
                    // the sparkline note in microdep-map.js), so a 'time' scale won't
                    // work here. Use a linear epoch-ms axis and format ticks ourselves.
                    type: 'linear',
                    grid:   { color: _alpha(border, 0.5), drawTicks: true, tickColor: borderH, drawBorder: false },
                    border: { display: false },
                    ticks:  { color: text3, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 18,
                              callback: function (v) {
                                  var d = new Date(v);
                                  return ('0'+d.getDate()).slice(-2) + ' ' +
                                         ('0'+d.getHours()).slice(-2) + ':' +
                                         ('0'+d.getMinutes()).slice(-2);
                              } },
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
                    usePointStyle: true,
                    callbacks: {
                        // No date adapter → format the epoch-ms x ourselves.
                        title: function (items) {
                            return items && items.length ? new Date(items[0].parsed.x).toLocaleString() : '';
                        }
                    }
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
