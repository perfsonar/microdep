// library to produce graphs
// Pure HTML/CSS implementation — no D3 dependency

import {parms, prop_desc, prop_long_desc, event_sum_type} from "./map-lib.js";

export var chart;

export function heatmap( div, hits, property, get_color, threshes, title, template_url){
    var container = document.getElementById(div);
    if (!container) return;

    var data = [];
    for (var i = 0; i < hits.length; i++) {
        data.push(hits[i]._source);
    }

    // Sort by property value descending
    data.sort(function(a, b) { return (b[property] || 0) - (a[property] || 0); });

    // Extract unique from/to hosts
    var fromSet = {}, toSet = {};
    for (var i = 0; i < data.length; i++) {
        fromSet[data[i].from.trim()] = true;
        toSet[data[i].to.trim()] = true;
    }
    var froms = Object.keys(fromSet).sort();
    var tos = Object.keys(toSet).sort();

    // Build lookup: from,to -> record
    var lookup = {};
    for (var i = 0; i < data.length; i++) {
        var key = data[i].from.trim() + ',' + data[i].to.trim();
        lookup[key] = data[i];
    }

    // Calculate min/max for display
    var values = data.map(function(d) { return d[property]; }).filter(function(v) { return typeof v === 'number'; });
    var min = values.length > 0 ? Math.min.apply(null, values) : 0;
    var max = values.length > 0 ? Math.max.apply(null, values) : 0;

    // Property description
    var propLabel = '';
    if (prop_desc[event_sum_type[parms.event]] && prop_desc[event_sum_type[parms.event]][property]) {
        propLabel = prop_desc[event_sum_type[parms.event]][property];
    } else if (prop_desc[parms.event] && prop_desc[parms.event][property]) {
        propLabel = prop_desc[parms.event][property];
    } else {
        propLabel = property;
    }

    // Build HTML
    var html = '';

    // Title
    html += '<div class="heatmap-header">';
    html += '<h3 class="heatmap-title">Heatmap: ' + propLabel + '</h3>';
    html += '<div class="heatmap-subtitle">' + title + '</div>';
    html += '<div class="heatmap-range">Range: [' + min.toFixed(1) + ' &ndash; ' + max.toFixed(1) + ']</div>';
    html += '</div>';

    // Table wrapper for horizontal scroll
    html += '<div class="heatmap-scroll">';
    html += '<table class="heatmap-table">';

    // Header row — To hosts
    html += '<thead><tr>';
    html += '<th class="heatmap-corner">From \\ To</th>';
    for (var j = 0; j < tos.length; j++) {
        html += '<th class="heatmap-col-header" title="' + tos[j] + '"><span>' + tos[j] + '</span></th>';
    }
    html += '</tr></thead>';

    // Data rows — From hosts
    html += '<tbody>';
    for (var i = 0; i < froms.length; i++) {
        html += '<tr>';
        html += '<td class="heatmap-row-header" title="' + froms[i] + '">' + froms[i] + '</td>';
        for (var j = 0; j < tos.length; j++) {
            var key = froms[i] + ',' + tos[j];
            var rec = lookup[key];
            if (froms[i] === tos[j]) {
                // Diagonal — same host, no self-measurement
                html += '<td class="heatmap-cell heatmap-diagonal"><div class="heatmap-cell-inner"></div></td>';
            } else if (rec && typeof rec[property] === 'number' && !isNaN(rec[property])) {
                var val = rec[property];
                var color = get_color(val, threshes);
                var displayVal = val < 100 ? val.toFixed(1) : Math.round(val);
                var cellUrl = template_url ? template_url.format(rec.from, rec.to, rec.from, rec.to) : '';
                var clickAttr = cellUrl ? ' onclick="window.open(\'' + cellUrl + '\')" style="cursor:pointer"' : '';
                var textColor = isLightColor(color) ? '#000' : '#fff';
                html += '<td class="heatmap-cell" title="' + froms[i] + ' → ' + tos[j] + ': ' + displayVal + '"' +
                    clickAttr + '>' +
                    '<div class="heatmap-cell-inner" style="background-color:' + color + ';color:' + textColor + '">' +
                    displayVal + '</div></td>';
            } else {
                // No data or NaN
                html += '<td class="heatmap-cell heatmap-nodata"><div class="heatmap-cell-inner">-</div></td>';
            }
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    html += '</div>'; // .heatmap-scroll

    container.innerHTML = html;
}

// Helper: determine if a color is light (for text contrast)
function isLightColor(color) {
    var r, g, b;
    if (color.charAt(0) === '#') {
        var hex = color.replace('#', '');
        if (hex.length === 3) { hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2]; }
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    } else if (color.indexOf('rgb') === 0) {
        var parts = color.match(/\d+/g);
        r = parseInt(parts[0]); g = parseInt(parts[1]); b = parseInt(parts[2]);
    } else {
        return true; // default to dark text
    }
    // Perceived brightness formula
    var brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 140;
}


export function curve( div, hits, property, title){
    // Keeping curve as-is for now — it still uses D3
    // TODO: replace with Chart.js or pure HTML implementation
    var container = document.getElementById(div);
    if (!container) return;
    container.innerHTML = '<div style="padding:20px;color:var(--c-text-2);">Curve chart requires D3 library. Use the external chart link from the link panel instead.</div>';
}