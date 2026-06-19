// main js for microdep-map to be included at bottom of html

import LatLon from "./latlon-spherical.js";
import {parms, conffile, prop_sum, update_url, stats_on, net_names, net_desc, net_long_desc, net_ip_version,
	event_names, event_desc, event_long_desc, event_index, event_sum_type,
	prop_names, prop_desc, prop_long_desc, prop_aggr,
	colors, get_color, make_palette, threshes, get_thresholds, 
	get_parms,removeParam, parse_hhmm, hhmm , adjust_to_timezone,
	get_config, update_props, make_prop_select, add_tab,
	round_number, zero_fill, selected_date_is_today_or_future, selected_hour_is_future }
from "./map-lib.js" ;
import { heatmap } from "./graph.js";
import { ls_tab } from "./ls-tab.js";

  var start, end;  // startend time for current period

// Shrink Leaflet's default marker icon. The defaults (25x41 / 41x41
// shadow) read heavy at our zoom levels where pairs sit close and pins
// overlap. Setting these BEFORE any L.marker() runs propagates to every
// marker. (CSS transform: scale() can't be used — Leaflet positions
// markers via transform: translate3d() and the two would compete.)
if (typeof L !== 'undefined' && L.Icon && L.Icon.Default) {
    L.Icon.Default.mergeOptions({
        iconSize:    [16, 27],
        iconAnchor:  [ 8, 27],
        popupAnchor: [ 0, -22],
        shadowSize:  [27, 27],
        shadowAnchor:[ 8, 27]
    });
}

// =============================================================================
// Tab persistence — remembers which tabs (Routes, Queues, Heatmap, ...) were
// open across page reloads. Specs are stored in localStorage; on init we wait
// for the network/parms to settle, then recreate each tab by replaying the
// same code paths the user would trigger by clicking.
// =============================================================================
const TAB_STORE_KEY = 'microdep-open-tabs';
const tabSpecs = new Map();        // divid -> spec (in-memory mirror of storage)
let restoringTabs = false;         // suppress persistence while we replay specs

function persistTab(divid, spec) {
    if (restoringTabs) return;     // avoid feedback loops during restore
    tabSpecs.set(divid, spec);
    syncTabsToStorage();
}
function unpersistTab(divid) {
    if (!tabSpecs.has(divid)) return;
    tabSpecs.delete(divid);
    syncTabsToStorage();
}
function syncTabsToStorage() {
    try { localStorage.setItem(TAB_STORE_KEY, JSON.stringify(Array.from(tabSpecs.values()))); }
    catch (_) { /* private mode, quota etc. */ }
}
function loadStoredTabSpecs() {
    try { return JSON.parse(localStorage.getItem(TAB_STORE_KEY) || '[]'); }
    catch (_) { return []; }
}
document.addEventListener('microdep-tab-closed', function (e) {
    unpersistTab(e.detail.divid);
});

// =============================================================================
// Active-tab persistence — remembers which tab was visible before reload.
// We store a *spec identity* rather than the divid, since divids change
// session-to-session as add_tab assigns sequential numbers. `null` means the
// Map tab (which has no spec, just the static <a href="#mapid">).
// =============================================================================
const ACTIVE_TAB_KEY = 'microdep-active-tab';

function specIdentity(spec) {
    if (!spec) return null;
    if (spec.kind === 'routes')  return 'routes|' + spec.from + '|' + spec.to;
    if (spec.kind === 'curve')   return 'curve|' + spec.url;
    if (spec.kind === 'check')   return 'check|' + spec.report_type;
    return null;
}

function saveActiveTab() {
    try {
        const idx = $('main#tabs').tabs('option', 'active');
        const $a = $('main#tabs > ul > li > a').eq(idx);
        const panelId = $a.attr('href') ? $a.attr('href').replace('#', '') : 'mapid';
        if (panelId === 'mapid') {
            localStorage.setItem(ACTIVE_TAB_KEY, 'map');
        } else {
            const spec = tabSpecs.get(panelId);
            const ident = specIdentity(spec);
            if (ident) localStorage.setItem(ACTIVE_TAB_KEY, ident);
        }
    } catch (_) { /* ignore */ }
}

function loadActiveTabIdent() {
    try { return localStorage.getItem(ACTIVE_TAB_KEY) || 'map'; }
    catch (_) { return 'map'; }
}

function applyActiveAfterRestore() {
    const target = loadActiveTabIdent();
    let activeIdx = 0;
    if (target !== 'map') {
        for (const [divid, spec] of tabSpecs.entries()) {
            if (specIdentity(spec) === target) {
                const allTabs = $('main#tabs > ul > li > a').toArray();
                const a = document.querySelector('a[href="#' + divid + '"]');
                const idx = a ? allTabs.indexOf(a) : -1;
                if (idx >= 0) { activeIdx = idx; break; }
            }
        }
    }
    $('main#tabs').tabs('option', 'active', activeIdx);

    // Force correct map-container/legend visibility regardless of whether
    // tabsactivate fires reliably after the programmatic activation above
    // (jQuery UI sometimes skips the event when the new active index equals
    // the just-set value, which is what we observed in restore flow).
    const isMap = activeIdx === 0;
    const mapContainer = document.querySelector('.map-container');
    const legend = document.getElementById('legend');
    if (mapContainer) mapContainer.style.display = isMap ? '' : 'none';
    if (legend)       legend.style.display       = isMap ? '' : 'none';

    // Leaflet may have been hidden during restoration; if the map is the
    // active panel, ask Leaflet to recompute its size so the tiles redraw.
    if (isMap && window.mymap && typeof window.mymap.invalidateSize === 'function') {
        setTimeout(function () { window.mymap.invalidateSize(); }, 80);
    }
}

// Replays stored specs to recreate the tabs after a page reload. Called once
// from the init flow (see end of get_config().then or similar). Wrapped in
// `restoringTabs` so the persistence hooks inside the tab openers don't
// double-write while we're rebuilding state.
function restoreSavedTabs() {
    const specs = loadStoredTabSpecs();
    if (!specs.length) return;

    // Pre-flight sanity: if microdep-map didn't finish wiring up the
    // primary handlers we'd just create broken tabs, so skip and try later.
    if (typeof event_index === 'undefined' || jQuery.isEmptyObject(event_index)) {
        console.log('Tab restore deferred — config not ready yet, retrying in 2s');
        setTimeout(restoreSavedTabs, 2000);
        return;
    }

    restoringTabs = true;
    try {
        for (const spec of specs) {
            try { restoreOneTab(spec); }
            catch (err) { console.warn('Tab restore skipped:', spec, err); }
        }
    } finally {
        restoringTabs = false;
        syncTabsToStorage();   // write back with the new (this session's) divids
        // Restore which tab was visible before the reload. The handlers
        // inside add_tab activated each new tab as it was created (so the
        // last restored is currently active and the map-container is
        // hidden); applyActiveAfterRestore() flips that back to the right
        // panel and the tabsactivate listener (in index.html) re-shows the
        // map-container if needed.
        applyActiveAfterRestore();
    }
}

function restoreOneTab(spec) {
    const before = $("main#tabs > ul > li").length;
    if (spec.kind === 'routes') {
        add_tab('div', spec.title, before,
            '<div class="center-text" style="padding:40px">' +
              '<div class="spinner"></div><p>Restoring routes…</p>' +
            '</div>');
        const tab_id = 'tab' + before;
        ls_tab(tab_id, spec.from, spec.to, spec.startEpoch, spec.endEpoch, spec.options || {});
        tabSpecs.set(tab_id, spec);
    } else if (spec.kind === 'curve') {
        const sep = spec.url.indexOf('?') >= 0 ? '&' : '?';
        const bustedUrl = spec.url + sep + '_t=' + Date.now();
        const iframe_html =
            '<div class="curve-iframe-wrap">' +
                '<iframe class="curve-iframe" src="' + bustedUrl + '" frameborder="0" sandbox="allow-scripts allow-same-origin"></iframe>' +
            '</div>';
        add_tab('div', spec.title, before, iframe_html);
        tabSpecs.set('tab' + before, spec);
    } else if (spec.kind === 'check') {
        // Simulate user picking the option from the #check dropdown — the
        // existing change-handler does all the work; we just need to
        // remember the divid afterwards.
        $('#check').val(spec.report_type).trigger('change');
        const after = $("main#tabs > ul > li").length;
        if (after > before) tabSpecs.set('tab' + before, spec);
    }
}

var point_distance_min = 50;  // meters between
var point_distance_stretch = 0.001;  // delta degrees
var period_length = 86400; // a day - to be replaced by dynamic length
var mymap; var myRenderer;
var markers = [];
var clustergroup=[];
var active_cluster;
var links=[];
var color_store=[];
var color_on=[]; // bool by color focused
var linkByName=[];
var linkByNameDashed=[];
var linkHidden=[]; // 
var ip_to_name=[]; // 
var name_to_ip=[]; //
var name_loaded=[]; // by network
var ends=[];
var last_hits=[]; // last query detail data (gaps)
var summary=[]; // last summary of query data (gapsum, gaps)
var aggregates=[]; // last aggregate data (jitter)
// Snapshot compare — baseline (prior-period) values keyed "from,to";
// re-fetched when the composite key (event/prop/period/offset) changes.
var baselineSummary = {};
var baselineCompareKey = '';
var focus_node="";
var middle_point=[],
    line_bearing=[],
    line_utslag=[],
    line_offset=[];   // bearing_offset shared between A→B / B→A halves so tangents at cp1 align
var n_excluded=0;

var current_parm="down_ppm";

var refresh_period=60000; // one minute refresh of data
var refresh_active=false;
var active_color="LightGray"; // to store actual color
var refresh_color="Aqua";

var no_coords= new LatLon(70.98584, -8.49243); // Jan Mayen
var points=[];

var empty_color="LightGray";

var stats_types = { "1.0": "1%", "50.0": "50%", "95.0": "95%", "99.0": "99%" };
  

var a=1;
var lat, lng;
var loads=0; // number of loaded point series
var duplines=[];
var points_cache=[];
var arrowMarkers=[]; // store arrow direction markers by link name
var extendedLinks=[]; // track links extended to full length

// --- Arrow direction marker helpers ---

function getPointOnQuadBezier(t, p0, p1, p2) {
    var mt = 1 - t;
    return [
        mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
        mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
    ];
}

function getBezierAngle(t, p0, p1, p2) {
    var mt = 1 - t;
    var dlat = 2 * mt * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
    var dlng = 2 * mt * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    var angle = Math.atan2(dlng, dlat) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return angle;
}

function makeArrowSvg(color, angle) {
    return '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<polygon points="18,12 6,4 6,20" fill="' + color + '" ' +
        'transform="rotate(' + angle.toFixed(1) + ' 12 12)"/></svg>';
}

function createArrowMarker(latlng, angle, color) {
    var svgAngle = angle - 90;
    var icon = L.divIcon({
        html: makeArrowSvg(color, svgAngle),
        className: 'arrow-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    return L.marker(latlng, { icon: icon, interactive: false, zIndexOffset: -100 });
}

function addArrowsToLine(lineName, p0, p1, p2, color) {
    removeArrowMarkers(lineName);
    var markers = [];
    var positions = [0.33, 0.66];

    var zoom = mymap.getZoom();
    var px0 = mymap.project(p0, zoom);
    var px1 = mymap.project(p1, zoom);
    var px2 = mymap.project(p2, zoom);

    for (var i = 0; i < positions.length; i++) {
        var t = positions[i];
        var mt = 1 - t;
        var px = mt * mt * px0.x + 2 * mt * t * px1.x + t * t * px2.x;
        var py = mt * mt * px0.y + 2 * mt * t * px1.y + t * t * px2.y;
        var latlng = mymap.unproject([px, py], zoom);

        var dx = 2 * mt * (px1.x - px0.x) + 2 * t * (px2.x - px1.x);
        var dy = 2 * mt * (px1.y - px0.y) + 2 * t * (px2.y - px1.y);
        // Flip 180° so the arrow tip points from "to" → "from" along the curve
        // direction, matching how the tooltip ("from X to Y") reads the link.
        var angle = Math.atan2(dx, -dy) * 180 / Math.PI + 180;
        if (angle >= 360) angle -= 360;
        if (angle < 0)    angle += 360;

        var m = createArrowMarker([latlng.lat, latlng.lng], angle, color);
        m.addTo(mymap);
        markers.push(m);
    }
    arrowMarkers[lineName] = markers;
}

function removeArrowMarkers(lineName) {
    if (arrowMarkers[lineName]) {
        for (var i = 0; i < arrowMarkers[lineName].length; i++) {
            arrowMarkers[lineName][i].remove();
        }
        delete arrowMarkers[lineName];
    }
}

function addArrowsToCubicLine(lineName, p0, c1, c2, p3, color) {
    removeArrowMarkers(lineName);
    var markers = [];
    var positions = [0.25, 0.5, 0.75];

    var zoom = mymap.getZoom();
    var px0 = mymap.project(p0, zoom);
    var pxC1 = mymap.project(c1, zoom);
    var pxC2 = mymap.project(c2, zoom);
    var px3 = mymap.project(p3, zoom);

    for (var i = 0; i < positions.length; i++) {
        var t = positions[i];
        var mt = 1 - t;
        var px = mt*mt*mt*px0.x + 3*mt*mt*t*pxC1.x + 3*mt*t*t*pxC2.x + t*t*t*px3.x;
        var py = mt*mt*mt*px0.y + 3*mt*mt*t*pxC1.y + 3*mt*t*t*pxC2.y + t*t*t*px3.y;
        var latlng = mymap.unproject([px, py], zoom);

        var dx = 3*mt*mt*(pxC1.x-px0.x) + 6*mt*t*(pxC2.x-pxC1.x) + 3*t*t*(px3.x-pxC2.x);
        var dy = 3*mt*mt*(pxC1.y-px0.y) + 6*mt*t*(pxC2.y-pxC1.y) + 3*t*t*(px3.y-pxC2.y);
        var angle = Math.atan2(dx, -dy) * 180 / Math.PI;
        if (angle < 0) angle += 360;

        var m = createArrowMarker([latlng.lat, latlng.lng], angle, color);
        m.addTo(mymap);
        markers.push(m);
    }
    arrowMarkers[lineName] = markers;
}

function updateArrowColors(lineName, color) {
    if (arrowMarkers[lineName]) {
        for (var i = 0; i < arrowMarkers[lineName].length; i++) {
            var m = arrowMarkers[lineName][i];
            var html = m.getIcon().options.html;
            var match = html.match(/rotate\(([-\d.]+)/);
            var svgAngle = match ? parseFloat(match[1]) : 0;
            var newIcon = L.divIcon({
                html: makeArrowSvg(color, svgAngle),
                className: 'arrow-marker',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            m.setIcon(newIcon);
        }
    }
}

var currentPanelLink = null; // track which link source is shown in panel
var highlightedLink = null; // track which leaflet line is highlighted for open panel

function openLinkPanel(content, linkSource) {
    var panel = document.getElementById('link-panel');
    var body = document.getElementById('linkPanelBody');
    if (panel && body) {
        if (linkSource) currentPanelLink = linkSource;
        body.innerHTML = '';
        if (typeof content === 'string') {
            body.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            body.appendChild(content);
        }
        panel.classList.remove('hidden');
        // Sparkline render at CLICK time (not in link_popup, which runs at
        // link-draw time against detached canvases). The render fn itself
        // waits via rAF for the panel to settle to a non-zero size before
        // instantiating Chart.js.
        var sparkCanvas = body.querySelector('.link-sparkline');
        if (sparkCanvas && currentPanelLink) {
            var lk = currentPanelLink;
            var go = function () {
                _render_link_sparkline(sparkCanvas, lk, parms.event, parms.property,
                                       $("#datepicker").val(), parms.period);
            };
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(function () { requestAnimationFrame(go); });
            } else {
                setTimeout(go, 32);
            }
        }
    }
}

function setHighlightedLink(leafletLine) {
    // Remove highlight from previous link
    if (highlightedLink && highlightedLink !== leafletLine) {
        var prevColor = color_store[highlightedLink.leaflet_id] || highlightedLink._originalColor || empty_color;
        highlightedLink.setStyle({"color": prevColor});
        // Restore arrow colors on previous link
        for (var abs in linkByName) {
            if (linkByName[abs] === highlightedLink) {
                updateArrowColors(abs, prevColor);
                break;
            }
        }
        // Close tooltip on previous link
        if (highlightedLink.getTooltip && highlightedLink.getTooltip()) {
            highlightedLink.closeTooltip();
        }
    }
    // Highlight current link
    if (leafletLine) {
        if (!leafletLine._originalColor || leafletLine._originalColor === "blue") {
            leafletLine._originalColor = color_store[leafletLine.leaflet_id] || leafletLine.options.color;
        }
        leafletLine.setStyle({"color": "blue"});
        leafletLine.bringToFront();
        // Update arrow colors to blue
        for (var abs in linkByName) {
            if (linkByName[abs] === leafletLine) {
                updateArrowColors(abs, "blue");
                break;
            }
        }
    }
    highlightedLink = leafletLine;
}

function clearHighlightedLink() {
    if (highlightedLink) {
        var prevColor = color_store[highlightedLink.leaflet_id] || highlightedLink._originalColor || empty_color;
        highlightedLink.setStyle({"color": prevColor});
        // Restore arrow colors
        for (var abs in linkByName) {
            if (linkByName[abs] === highlightedLink) {
                updateArrowColors(abs, prevColor);
                break;
            }
        }
        highlightedLink = null;
    }
}
window.clearHighlightedLink = clearHighlightedLink;

function refreshLinkPanel() {
    if (currentPanelLink && !document.getElementById('link-panel').classList.contains('hidden')) {
        var newContent = link_popup(currentPanelLink);
        openLinkPanel(newContent);
    }
}

  // sorting table
  function comparer(index) {
      return function(a, b) {
          var valA = getCellValue(a, index), valB = getCellValue(b, index)
          return $.isNumeric(valA) && $.isNumeric(valB) ? valA - valB : valA.toString().localeCompare(valB)
      }
  }
  function getCellValue(row, index){ return $(row).children('td').eq(index).text() }

  function fill_select(select_id, types){
      var select = $("#".select_id);
      select.empty();
      for ( const type in types){
	  select.append( $('<option>', { value: type, text: types[type] } ) );
      }
  }

function show_map (network) {
    console.log ("Showing map");
    if ( ! mymap ){
	mymap = L.map('mapid');
	window.mymap = mymap;     // expose for invalidateSize() from index.html
	myRenderer = L.canvas({ padding: 0.5, tolerance: 20 });
	var osmUrl='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
	var osmAttrib='Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors';
	// noWrap: don't repeat the world tiles east-west — otherwise NZ at
	// lon=175 also shows at -185/+535 etc. as the map repeats in adjacent
	// world copies (the "two New Zealands" effect, very visible with
	// trans-Pacific routes). bounds: cap tile requests to the real world
	// so fitBounds across the antimeridian doesn't request out-of-range
	// tiles (which OSM 400s on).
	var osm = new L.TileLayer(osmUrl, {
	    minZoom: 1,
	    maxZoom: 20,
	    attribution: osmAttrib,
	    noWrap: true,
	    bounds: [[-90, -180], [90, 180]]
	});
	mymap.addLayer(osm);

	mymap.addEventListener('mousemove', function(ev) {
	    lat = ev.latlng.lat;
	    lng = ev.latlng.lng;
	});

	$(window).on("resize", function () {
	    $("#mapid").height( $(window).height()-250 );
	}).trigger("resize");
    }

    if ( active_cluster){
	mymap.removeLayer(active_cluster);
    }
    if ( ! clustergroup.includes(network) ){
	clustergroup[network] = new L.markerClusterGroup();
	make_markers( network, points, true);
    }
    active_cluster = clustergroup[network];
    mymap.addLayer( active_cluster);
    points_cache[network]=points;
}

function remove_markers(){
    clustergroup.eachLayer(function(m) {
	clustergroup.removeLayer(m);
    });
}

function spread_points(points){
    var locations=[];
    for ( var i=0; i < points.length; i++ ){
	var p1=new LatLon(points[i].lat, points[i].lon);
	for ( var j=0; j < points.length; j++ ){
	    var p2=new LatLon(points[j].lat, points[j].lon);
	    var distance = 0 + ( p1.distanceTo(p2) );
	    if ( distance < point_distance_min ){
		points[j].lat += point_distance_stretch * ( Math.random() - 0.5 );
		points[j].lon += point_distance_stretch * ( Math.random() - 0.5 );
	    }
	}
    }
}

function make_markers ( network, points, focus) {
    var i;
    var bounds = new L.LatLngBounds();
    spread_points(points);

    for (i=0; i < points.length; i++){
	var id=points[i].id;
	var marker = L.marker ([points[i].lat, points[i].lon]).addTo(clustergroup[network]);
	bounds.extend(marker.getLatLng());
	marker.bindTooltip( points[i].name, {permanent: false, className: "my-label", offset: [0, 0] });
	var html = '<br><a href="#" class=trigger id="' + id + '">Focus on</a>';
	var url;
	if (points[i].url){
	    url = points[i].url;
	} else {
	    url = "http://" + id;
	}
	marker.bindPopup("<b><a href=\"" + url + "\">" + "Home for " + id + "</a></b>"+html);
	$("#" + id ).on('click', "a.trigger", function(e){
	    focus_links( e.id, 'flip' );
	});
    }

    if ( points.length == 0 ){
        bounds =  [[-90,-180],   [90,180]];
    }
    if ( focus ){
	// padding gives the edge markers breathing room; maxZoom 6 stops
	// the fit from zooming to street level when a network has just one
	// pair (or tightly-clustered pairs). The first-show gate is handled
	// by the caller (make_markers only runs with focus=true on the
	// first show per network), so this doesn't fight user pan/zoom on
	// later refreshes.
	mymap.fitBounds(bounds, { padding: [12, 12], maxZoom: 6 });
    }
}

function remove_links(){
    var i;
    for ( i=0; i<links.length; i++ ){
	if ( links[i] ) links[i].remove();
    }
    for (var name in arrowMarkers) {
        removeArrowMarkers(name);
    }
    arrowMarkers=[];
    links=[];
    linkByName=[];
    ends=[];
}

function remove_link(ab){
    if ( linkByName[ab] ){
	linkByName[ab].remove();
	removeArrowMarkers(ab);
	delete linkByName[ab];
	ends.splice( ends, ends.indexOf(ab), 1);
    }
}

function showArrows(ab) {
    if (arrowMarkers[ab]) {
        for (var i = 0; i < arrowMarkers[ab].length; i++) { arrowMarkers[ab][i].addTo(mymap); }
    }
}

function hideArrows(ab) {
    if (arrowMarkers[ab]) {
        for (var i = 0; i < arrowMarkers[ab].length; i++) { arrowMarkers[ab][i].remove(); }
    }
}

function show_links(){
    for ( var ab in linkByName ){
	linkByName[ab].addTo(mymap);
	showArrows(ab);
    }
}

function hide_links_by_color(color){
    for ( var ab in linkByName ){
	var link=linkByName[ab];
	if ( link.options.color === color){
	    link.remove();
	    hideArrows(ab);
	    linkHidden[ab]=true;
	} else if (linkHidden[ab]) {
	    link.addTo(mymap);
	    showArrows(ab);
	    linkHidden[ab]=false;
	}
    }
}

function show_links_by_color(color){
    for ( var ab in linkByName ){
	var link=linkByName[ab];
	if ( link.options.color === color){
	    link.addTo(mymap);
	    showArrows(ab);
	    linkHidden[ab]=false;
	}
    }
}

function refresh_links_by_color(){
    if ( links_on ){
	show_links_by_color(empty_color);
    } else {
	hide_links_by_color(empty_color);
    }
}

function only_links_by_color(color){
    if ( color_on[color] ){
	for ( var ab in linkByName ){
	    if ( linkHidden[ab] ) {
		linkByName[ab].addTo(mymap);
		showArrows(ab);
	    }
	}
	color_on[color]=false;
    } else {
	for ( var ab in linkByName ){
	    var link=linkByName[ab];
	    if ( link.options.color === color){
		if ( linkHidden[ab] ) {
		    link.addTo(mymap);
		    showArrows(ab);
		}
		link.bringToFront();
	    } else {
		link.remove();
		hideArrows(ab);
		linkHidden[ab]=true;
	    }
	}
	for ( var c of colors)
	    color_on[c]=false;
	color_on[color]=true;
    }
}

  function focus_links( node, mode ){
    if ( mode === 'flip' && focus_node === node ){
	focus_node = "";
	links_on=true;
	show_links();
	removeParam("node");
    } else {
	if ( focus_node !== "" && node !== focus_node ) {
	    focus_node="";
	    links_on=true;
	    show_links();
	}
	var search=node;
	var inverse=false;
	if (node.indexOf("!") >= 0){
	    inverse=true;
	    search=node.substr(1,node.length);
	}
	var asn_search=false;
	if (node.indexOf("@") >= 0){
	    asn_search=true;
	    search=node.substr(1,node.length);
	}
	for ( var ab in linkByName ){
	    if (asn_search) {
		if ( ! linkByName[ab].asn_search || linkByName[ab].asn_search.indexOf(search) < 0) {
		    linkByName[ab].remove();
		    hideArrows(ab);
		}
	    } else if ( ab.indexOf(search) < 0 ){
		if ( ! inverse ) {
		    linkByName[ab].remove();
		    hideArrows(ab);
		}
	    } else {
		if ( inverse ) {
		    linkByName[ab].remove();
		    hideArrows(ab);
		}
	    }
	}
	links_on=false;
	focus[node]=true;
	focus_node=node;
	update_url("node", node);
    }
}

function update_legend(title, threshes){
    var html="<table border=1 align=center id=legend> ";
    html+="<tr align=center>";
    html+='<th><button class=knapp id="farge0" title="Push to hide/show grey links">' + title + '</button>';
    var i;
    var lower=threshes.slice();
    lower.unshift(0);
    for ( i in lower ){
	// Trim binary-rounding noise (e.g. 0.30000000000004) to 2 decimals.
	var _v = lower[i];
	if (typeof _v === 'number' && !isNaN(_v)) _v = Math.round(_v * 100) / 100;
	html += "<td width=200>" +
	    "<button class=knapp title='Push to hide/show other links' style=width:100%" + " id=legend" + i + " bgcolor="
	    + colors[i] + ">" + _v + "</button></td>";
    }
    if (! jQuery.isEmptyObject(conffile[parms.net].dashboardURL)) {
	html += '<td><button class=knapp title="Database dashboard" onclick=\'window.open("' + conffile[parms.net].dashboardURL + '", "_blank");\'>Dashboard</button>';
    }
    html +=  "</tr></table>";
    $("#legend").html(html);

    $("#farge0").click(  function () {
	only_links_by_color(empty_color);
    });
    for ( i in lower ){
	var id="legend"+i;
	$("#legend" + i).click( function(e){
	    only_links_by_color(this.attributes.bgcolor.value);
	    $("#tabs").tabs("option", "active", 0);
	});
	$("#legend" + i).css( "background-color", colors[i] );
	color_on[colors[i]]=false;
    }
}

function gap_popup( containerDiv, link){
    const button = document.createElement("button");
    button.className = "knapp";
    let etype = parms.event;
    let etypeLabel = (event_desc[etype] || etype);
    button.innerHTML = "Top " + etypeLabel;
    button.onclick = function(event) {
	let idiv;
	let etag = 'event ' + parms.event + ' ' + parms.date + ' ' + parms.period;
	if ( this[etag]){
	    idiv = this[etag];
	    if ( this.innerText.substr(0,4) == 'Hide'){
		idiv.style.display = "none";
		this.innerText='Top';
	    } else {
		idiv.style.display = "block";
		if ( this.innerText.substr(0,3) == 'All'){
		    idiv.innerHTML=gap_list( link.from, link.to, idiv['hits'+parms.event] );
		    this.innerText='Hide';
		} else {
		    idiv.innerHTML=gap_list( link.from, link.to, idiv['hits'+parms.event], 10, 'num_desc');
		    this.innerText='All';
		}
	    }
	    this.innerText += ' ' + etypeLabel;
	    var sortables = idiv.getElementsByClassName('sortable');
	    if (sortables.length > 0) sorttable.makeSortable( sortables[0] );
	} else {
	    idiv = document.createElement("div");
	    idiv.classList.add("sprettopp");
	    // Append results div to the parent card, not the button container
	    var parentCard = containerDiv.closest ? containerDiv.closest('.panel-card') : containerDiv.parentElement;
	    if (parentCard) parentCard.appendChild(idiv);
	    else containerDiv.appendChild(idiv);
	    this[etag]=idiv;
	    get_peer_data( link.from, link.to, idiv);
	    this.innerText='All ' + etypeLabel;
	}
    }
    containerDiv.appendChild(button);
}

// In-flight AJAX + Chart.js instance for the link-details sparkline,
// tracked at module level so we can abort / destroy when the user
// clicks a different link before the previous fetch returns.
var _linkSparkXhr = null;
var _linkSparkChart = null;
var _linkSparkRAF  = null;  // rAF id for deferred-until-sized rendering
function _render_link_sparkline(canvas, link, etype, prop, dato, period, forceEtype) {
    if (!canvas || typeof Chart === 'undefined') return;
    // Abort the previous fetch — we don't want a stale response to
    // overwrite the freshly-clicked link's chart.
    if (_linkSparkXhr && _linkSparkXhr.abort) try { _linkSparkXhr.abort(); } catch (_) {}
    if (_linkSparkChart) try { _linkSparkChart.destroy(); } catch (_) {}
    if (_linkSparkRAF) try { cancelAnimationFrame(_linkSparkRAF); } catch (_) {}
    _linkSparkXhr = null;
    _linkSparkChart = null;
    _linkSparkRAF   = null;

    if (!link || !link.from || !link.to || !etype || !prop) return;
    if (!event_index || !event_index[etype]) return;

    // Wait for the panel layout to settle before kicking off the fetch
    // + Chart.js instantiation. On the very first link click the panel
    // is going from display:none (the .hidden class) to display:flex,
    // and a CSS transform transition runs for ~200ms — Chart.js often
    // measures the canvas while it's still 0×0 (or mid-transition), so
    // we get a chart with no visible drawing on the first open. We poll
    // via rAF for up to ~16 frames looking for a stable, non-zero size
    // for two consecutive frames before proceeding. The canvas.offsetWidth
    // read inside the loop force-flushes any pending layout.
    var attempt = 0, lastW = -1, lastH = -1;
    function _waitForSize() {
        var w = canvas.clientWidth;
        var h = canvas.clientHeight;
        var _ = canvas.offsetWidth; // force layout flush
        attempt++;
        if (w > 0 && h > 0 && w === lastW && h === lastH) {
            console.log('sparkline: canvas settled at', w + 'x' + h, 'after', attempt, 'frame(s)');
            _linkSparkRAF = null;
            _render_link_sparkline_inner(canvas, link, etype, prop, dato, period, forceEtype);
            return;
        }
        lastW = w; lastH = h;
        if (attempt > 16) {
            console.log('sparkline: gave up waiting at', w + 'x' + h, 'frame=', attempt, '— rendering anyway');
            _linkSparkRAF = null;
            _render_link_sparkline_inner(canvas, link, etype, prop, dato, period, forceEtype);
            return;
        }
        _linkSparkRAF = requestAnimationFrame(_waitForSize);
    }
    _linkSparkRAF = requestAnimationFrame(_waitForSize);
}

// Body of the sparkline render — extracted so the public entry point can
// defer until the canvas is properly sized (see _render_link_sparkline
// for the rAF-based stable-size wait).
function _render_link_sparkline_inner(canvas, link, etype, prop, dato, period, forceEtype) {

    // Mirror get_connections() window logic so the sparkline asks for
    // EXACTLY the same time range the rest of the map is painted from
    // — including the sub-24h period_input offset.
    var dstart = new Date(dato);
    var msstart = dstart.getTime();
    if (isNaN(msstart)) return;
    var tz = dstart.getTimezoneOffset() / 60;
    var per = parseInt($("#period").val(), 10);
    if (isNaN(per)) per = (period || 24);
    var start_iso, end_iso;
    if (per < 24) {
        var hour = parse_hhmm($("#period_input").val()) + tz;
        var ds   = new Date(msstart + hour * 3600 * 1000);
        start_iso = ds.toISOString();
        end_iso   = new Date(ds.getTime() + 3600 * 1000).toISOString();
    } else {
        start_iso = new Date(msstart).toISOString();
        end_iso   = new Date(msstart + per * 3600 * 1000).toISOString();
    }

    // Pick the event type. Strategy: try raw FIRST (one record per
    // measurement → densest series). If the raw query returns 0 usable
    // points (typical when the property only exists on summary records
    // — e.g. gap.down_ppm — the config can claim it's on raw too but
    // the actual elastic docs don't carry it), the .done callback below
    // recurses with `forceEtype = sumEtype` to fall back. Data-driven,
    // not config-driven, because prop_desc and reality disagree.
    var sumEtype = (event_sum_type && event_sum_type[etype]) || '';
    var queryEtype = forceEtype || etype;

    // Match the existing call pattern in get_peer_data / get_connections:
    // raw concatenation (no encodeURIComponent — colons in ISO stamps
    // and the IPv6-style addresses are passed through literally), and
    // include ip_version when the network requires it.
    var url = 'elastic-get-date-type.pl?index=' + event_index[etype] +
              '&event_type=' + queryEtype +
              '&start=' + adjust_to_timezone(start_iso) +
              '&end='   + adjust_to_timezone(end_iso) +
              '&from='  + link.from +
              '&to='    + link.to;
    if (net_ip_version && net_ip_version[parms.net]) {
        url += '&ip_version=' + net_ip_version[parms.net];
    }

    // Ask the server for time-bucketed averages via the date_histogram
    // path (interval+prop in elastic-get-date-type.pl, ~line 274). The
    // server runs the aggregation against the matching raw records —
    // bypasses the hardcoded size:10000 limit for very long periods AND
    // gives evenly-distributed buckets independent of raw measurement
    // timing. Bucket width targets ~500 points across the period so the
    // chart is dense without overwhelming Chart.js. The Perl-side regex
    // accepts /^\d+[smhd]$/ so we pick the smallest unit that keeps the
    // count integer.
    function _spark_interval(perH) {
        var totalMin = Math.max(1, Math.round(perH * 60));
        var bMin = Math.max(1, Math.ceil(totalMin / 500));
        if (bMin >= 1440) return Math.ceil(bMin / 1440) + 'd';
        if (bMin >= 60)   return Math.ceil(bMin / 60)   + 'h';
        return bMin + 'm';
    }
    var bucketInterval = _spark_interval(per);
    url += '&interval=' + bucketInterval + '&prop=' + prop;
    if (parms && parms.debug) console.log('sparkline url:', url);

    _linkSparkXhr = $.getJSON(url).done(function (resp) {
        var hits = (resp && resp.hits && resp.hits.hits) || [];
        var buckets = (resp && resp.aggregations && resp.aggregations.by_time &&
                       resp.aggregations.by_time.buckets) || [];
        var totalVal = (resp && resp.hits && resp.hits.total && (resp.hits.total.value || resp.hits.total)) || 0;
        console.log('sparkline: hits =', hits.length, 'buckets =', buckets.length,
                    'total =', totalVal, 'prop =', prop, 'event =', etype, 'queried =', queryEtype,
                    'interval =', bucketInterval || 'none');
        if (!hits.length && !buckets.length) {
            // Two-step auto-fallback: raw → "<sum>_h" (hourly aggregator's
            // gapsum_h / routesum_h / ... — finer rezolution than the
            // daily summary records qstream-gap-ana etc. emit on restart)
            // → "<sum>" (the daily summary, last resort).
            //
            // This lets the sparkline pick up the densest available
            // pre-aggregated data for properties that don't live on raw
            // events (e.g. gap.down_ppm). If microdep-hourly-aggregator
            // hasn't been deployed yet, the gapsum_h query simply returns
            // 0 records and we transparently slide down to gapsum.
            var nextFallback = null;
            if (!forceEtype && sumEtype) {
                nextFallback = sumEtype + '_h';   // try hourly first
            } else if (forceEtype && /_h$/.test(forceEtype)) {
                // We just tried hourly summary; drop the suffix and try
                // the daily summary as a final fallback.
                nextFallback = forceEtype.replace(/_h$/, '');
            }
            if (nextFallback && nextFallback !== queryEtype) {
                console.log('sparkline: "' + queryEtype + '" returned 0 hits/buckets; falling back to "' + nextFallback + '"');
                _render_link_sparkline(canvas, link, etype, prop, dato, period, nextFallback);
                return;
            }
            _draw_sparkline_empty(canvas);
            return;
        }
        // Build {t, y} pairs from either the date_histogram buckets
        // (preferred when interval was requested) or raw record hits.
        // For buckets: `key` is already epoch ms, `value.value` is the
        // computed average for that interval (null when the slot has
        // records but the property field is absent on all of them).
        var pts = [];
        var rawSample = null;
        if (buckets.length) {
            for (var bi = 0; bi < buckets.length; bi++) {
                var b = buckets[bi];
                if (!b) continue;
                if (!rawSample) rawSample = { _bucket: true, key: b.key, value: b.value };
                var bts = Number(b.key);
                if (!bts || isNaN(bts)) continue;
                var bv = b.value && (b.value.value !== null && b.value.value !== undefined ? b.value.value : null);
                if (bv === null) continue;
                bv = Number(bv);
                if (isNaN(bv)) continue;
                pts.push({ t: bts, y: bv });
            }
        } else {
            // Mirror chart_curve's lenient parsing — server returns
            // timestamp as epoch seconds (sometimes as a string) and
            // property as a number-ish value. Coerce both via Number().
            for (var i = 0; i < hits.length; i++) {
                var s = hits[i] && hits[i]._source;
                if (!s) continue;
                if (!rawSample) rawSample = s;
                var ts = Number(s.timestamp) * 1000;
                if (!ts || isNaN(ts)) {
                    if (s['@timestamp']) ts = Date.parse(s['@timestamp']);
                }
                if (!ts || isNaN(ts)) continue;
                var v = s[prop];
                if (v === null || v === undefined) continue;
                v = Number(v);
                if (isNaN(v)) continue;
                pts.push({ t: ts, y: v });
            }
        }
        if (!pts.length) {
            // Same two-step fallback as the no-hits/no-buckets branch
            // above: raw → "<sum>_h" (hourly aggregator) → "<sum>" (daily
            // summary). Triggers when the response had records but none
            // of them carried the property (e.g. raw `gap` records have
            // tloss/jitter/delay-ish fields but no `down_ppm`).
            var nextFallback2 = null;
            if (!forceEtype && sumEtype) {
                nextFallback2 = sumEtype + '_h';
            } else if (forceEtype && /_h$/.test(forceEtype)) {
                nextFallback2 = forceEtype.replace(/_h$/, '');
            }
            if (nextFallback2 && nextFallback2 !== queryEtype) {
                console.log('sparkline: "' + queryEtype + '" had no usable points for "' + prop +
                            '"; falling back to "' + nextFallback2 + '"');
                _render_link_sparkline(canvas, link, etype, prop, dato, period, nextFallback2);
                return;
            }
            // Help the user (and us) figure out why nothing rendered:
            // dump the first record so we can see actual field names,
            // plus the keys list as a plain string (objects don't survive
            // a copy-paste from DevTools the way primitives do).
            if (rawSample) {
                console.log('sparkline: no usable points; sample _source =', rawSample,
                            'looking for prop =', prop);
                try {
                    console.log('sparkline: sample keys =', Object.keys(rawSample).join(', '));
                    console.log('sparkline: sample[' + prop + '] =', rawSample[prop],
                                ' typeof =', typeof rawSample[prop]);
                    console.log('sparkline: sample.timestamp =', rawSample.timestamp,
                                ' typeof =', typeof rawSample.timestamp);
                } catch (_) {}
            }
            _draw_sparkline_empty(canvas);
            return;
        }
        pts.sort(function (a, b) { return a.t - b.t; });

        // Downsample for display when raw events return a flood of points
        // (e.g., 4 weeks × 5-min delay measurements ≈ 8000 records).
        // Drawing 8k points on a ~270px-wide canvas is wasted work and
        // slows the panel open noticeably; ~500 points is plenty for
        // sparkline visual fidelity. Take every Nth — a simple even
        // stride preserves the overall shape; we keep the LAST point
        // explicitly so the highlighted endpoint always reflects the
        // most-recent reading and not a stride artefact.
        var MAX_PTS = 500;
        var rawPtsLen = pts.length;
        if (pts.length > MAX_PTS) {
            var step = Math.ceil(pts.length / MAX_PTS);
            var sampled = [];
            for (var s = 0; s < pts.length; s += step) sampled.push(pts[s]);
            if (sampled[sampled.length - 1] !== pts[pts.length - 1]) {
                sampled.push(pts[pts.length - 1]);
            }
            pts = sampled;
        }

        console.log('sparkline: rendering', pts.length, 'points (raw =', rawPtsLen, ');',
                    'first =', pts[0], 'last =', pts[pts.length - 1],
                    'canvas size =', canvas.clientWidth + 'x' + canvas.clientHeight);

        // Render — labels are date-strings rather than Date objects so
        // we don't need a time-scale adapter (chart.umd.js alone, no
        // moment dep). Label granularity tracks the period: HH:MM for
        // <24h windows (date is implicit), "DD MMM" for multi-day
        // periods where repeating "12:00" labels would be ambiguous.
        var monthsShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var labelMode = (per <= 24) ? 'time' : 'date';
        var labels = pts.map(function (p) {
            var d = new Date(p.t);
            if (labelMode === 'time') {
                return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
            }
            return d.getDate() + ' ' + monthsShort[d.getMonth()];
        });
        var values = pts.map(function (p) { return p.y; });
        var tsArr  = pts.map(function (p) { return p.t; });

        // Full "DD MMM YYYY, HH:MM" formatter for the tooltip title —
        // always shows the absolute moment regardless of x-axis scale.
        function fmtFull(ms) {
            var d = new Date(ms);
            var hh = ('0' + d.getHours()).slice(-2);
            var mm = ('0' + d.getMinutes()).slice(-2);
            return d.getDate() + ' ' + monthsShort[d.getMonth()] + ' ' + d.getFullYear() +
                   ', ' + hh + ':' + mm;
        }

        // Resolve theme tokens at render time so dark/light switch
        // applies on the next-clicked link.
        var cs = getComputedStyle(document.documentElement);
        function tk(name, fb) { var v = cs.getPropertyValue(name).trim(); return v || fb; }
        var accent = tk('--c-accent',  '#2f81f7');
        var text   = tk('--c-text',    '#e6e9ee');
        var text2  = tk('--c-text-2',  '#b1b8c2');
        var text3  = tk('--c-text-3',  '#7e8794');
        var border = tk('--c-border',  '#2a313a');
        var elev   = tk('--c-elevated','#1c2229');

        // Property description for tooltip body — same lookup precedence
        // as the card label (sum-type takes priority since for past
        // periods we're querying gapsum/routesum etc.).
        var propDesc = (prop_desc[event_sum_type[etype]] && prop_desc[event_sum_type[etype]][prop])
                    || (prop_desc[etype] && prop_desc[etype][prop])
                    || prop
                    || 'value';

        // Min / avg / max — populate the badges sitting above the chart
        // (built up-front in link_popup) so the user gets exact numbers
        // alongside the visual trend. Without these the chart looks
        // anemic when the data is sparse (e.g. 3 points for raw `gap`),
        // because Chart.js interpolates a near-flat line and the human
        // eye has nothing to anchor to.
        var minV = values[0], maxV = values[0], sumV = 0;
        for (var k = 0; k < values.length; k++) {
            if (values[k] < minV) minV = values[k];
            if (values[k] > maxV) maxV = values[k];
            sumV += values[k];
        }
        var avgV  = sumV / values.length;
        var lastV = values[values.length - 1];
        var fmt = function (n) {
            if (!isFinite(n)) return '–';
            if (Math.abs(n) >= 100) return Math.round(n).toString();
            if (Math.abs(n) >= 1)   return (Math.round(n * 10) / 10).toString();
            return (Math.round(n * 100) / 100).toString();
        };
        var statsHost = canvas.parentNode && canvas.parentNode.parentNode &&
                        canvas.parentNode.parentNode.querySelector('.link-sparkline-stats');
        if (statsHost) {
            statsHost.innerHTML =
                '<span class="lss-item"><span class="lss-k">last</span> <span class="lss-v">' + fmt(lastV) + '</span></span>' +
                '<span class="lss-item"><span class="lss-k">min</span> <span class="lss-v">'  + fmt(minV)  + '</span></span>' +
                '<span class="lss-item"><span class="lss-k">avg</span> <span class="lss-v">'  + fmt(avgV)  + '</span></span>' +
                '<span class="lss-item"><span class="lss-k">max</span> <span class="lss-v">'  + fmt(maxV)  + '</span></span>' +
                '<span class="lss-item lss-n"><span class="lss-k">n</span> <span class="lss-v">' + values.length + '</span></span>';
        }

        // Sparse data → show points so the user sees something even when
        // the line is short (Chart.js draws nothing visible for a single
        // segment between two near-equal values when pointRadius=0).
        var sparse = pts.length < 30;

        // Threshold-based colour: tie the sparkline to the SAME palette
        // logic that paints the link on the map. We use the LATEST value
        // (most recent reading is what the link is "currently" showing)
        // so the user sees green/yellow/red at-a-glance status.
        var zoneColor = accent;
        if (typeof get_color === 'function' && Array.isArray(threshes) && threshes.length) {
            zoneColor = get_color(lastV, threshes) || accent;
        }

        // Build a vertical area-fill gradient so the chart reads as
        // shape-with-volume rather than a hairline.
        var ctx2 = canvas.getContext('2d');
        var grad = ctx2.createLinearGradient(0, 0, 0, canvas.clientHeight || 110);
        grad.addColorStop(0, zoneColor + '66');
        grad.addColorStop(1, zoneColor + '0a');

        // Per-point arrays — the LAST point is always rendered as a big
        // highlighted dot (with a contrasting border) so the user's eye
        // lands on the most recent value first.
        var lastIx = values.length - 1;
        var ptRadius     = values.map(function (_, i) { return i === lastIx ? 5 : (sparse ? 3 : 0); });
        var ptBg         = values.map(function (_, i) { return i === lastIx ? zoneColor : zoneColor; });
        var ptBorder     = values.map(function (_, i) { return i === lastIx ? '#fff'    : elev; });
        var ptBorderW    = values.map(function (_, i) { return i === lastIx ? 2         : 1; });

        // Belt-and-braces: force a re-measure on the next frame after
        // instantiation. If the panel was mid-transition when Chart.js
        // initially measured the canvas (and got a smaller box than the
        // settled size), this catches up to the final layout.
        function _kickResize(c) {
            if (!c) return;
            requestAnimationFrame(function () {
                try { c.resize(); } catch (_) {}
            });
        }
        _linkSparkChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    borderColor: zoneColor,
                    backgroundColor: grad,
                    borderWidth: 2,
                    pointRadius:        ptRadius,
                    pointBackgroundColor: ptBg,
                    pointBorderColor:   ptBorder,
                    pointBorderWidth:   ptBorderW,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: zoneColor,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                animation: { duration: 200 },
                // Right-pad layout so the highlighted last point isn't
                // clipped at the canvas edge.
                layout: { padding: { top: 4, right: 8, bottom: 0, left: 4 } },
                // Pad y-axis 8% above/below so the line doesn't lick
                // the chart edges; a flat-line dataset gets a synthetic
                // band so it reads as "stable around X" not "vanished".
                // Y-axis labels are HIDDEN — exact min/avg/max numbers
                // already sit in the stats badge above, so the labels
                // were just visual noise eating ~30px of chart width.
                scales: {
                    x: {
                        ticks: { color: text3, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
                        grid:  { display: false },
                        border: { display: false }
                    },
                    y: (function () {
                        var range = maxV - minV;
                        var pad   = range > 0 ? range * 0.08 : Math.max(Math.abs(maxV) * 0.1, 1);
                        return {
                            min: minV - pad,
                            max: maxV + pad,
                            ticks: { display: false },
                            grid:  { color: border, drawBorder: false, drawTicks: false },
                            border: { display: false }
                        };
                    })()
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: elev,
                        titleColor: text,
                        bodyColor:  text2,
                        borderColor: border,
                        borderWidth: 1,
                        padding: 8,
                        cornerRadius: 6,
                        displayColors: false,
                        callbacks: {
                            // Title: full "DD MMM YYYY, HH:MM" so the
                            // tooltip stays unambiguous on multi-day
                            // periods where the x-axis only shows dates.
                            title: function (items) {
                                if (!items || !items.length) return '';
                                var i = items[0].dataIndex;
                                return (typeof tsArr[i] === 'number') ? fmtFull(tsArr[i]) : items[0].label;
                            },
                            // Body: "<propDesc>: <value>" — gives the
                            // tooltip more semantic weight than a bare
                            // number floating next to a timestamp.
                            label: function (ctx) {
                                var v = ctx.parsed && ctx.parsed.y;
                                return (typeof v === 'number') ? (propDesc + ': ' + fmt(v)) : propDesc;
                            }
                        }
                    }
                }
            }
        });
        _kickResize(_linkSparkChart);
    }).fail(function (xhr, textStatus, error) {
        // Aborted requests (we explicitly abort when a new link is clicked)
        // are not failures from the user's perspective — silence them.
        if (textStatus === 'abort') return;
        console.log('sparkline failed:', textStatus, error, 'url:', url);
        _draw_sparkline_empty(canvas, 'Failed to load');
    });
}
function _draw_sparkline_empty(canvas, msg) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var w = canvas.width || canvas.clientWidth || 200;
    var h = canvas.height || canvas.clientHeight || 80;
    ctx.clearRect(0, 0, w, h);
    var cs = getComputedStyle(document.documentElement);
    ctx.fillStyle = cs.getPropertyValue('--c-text-3').trim() || '#7e8794';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg || 'No data for this period', w / 2, h / 2);
}

function link_popup(link){
    var dato = $("#datepicker").val();
    var html = make_tooltip_v2(link.from, link.to, link);

    const div = document.createElement("div");
    div.classList.add("sprettom");
    div.innerHTML = html;

    if (Object.keys(link).length > 2) {
	/* IRRELEVANT CODE
	// Link object has more than just "from" and "to" properties.
	var to_adr=link.to; // aggregations don't have *_adr.
	var from_adr=link.from; // aggregations don't have *_adr.
	if (link.to_adr)
	    to_adr=link.to_adr;
	else if ( name_to_ip[link.to] )
	    to_adr = name_to_ip[link.to];
	if (link.from_adr)
	    from_adr=link.from_adr;
	else if ( name_to_ip[link.from] )
	    from_adr = name_to_ip[link.from];
	*/
	
	// --- "Trend" sparkline card ---
	// Compact Chart.js line graph showing the currently-selected
	// property over the active period for THIS link, so the user can
	// see at a glance whether the value is trending up / down /
	// stable without opening a full Plot tab. Card is built up-front
	// here (so it's in DOM by the time openLinkPanel attaches it),
	// and then _render_link_sparkline kicks off the AJAX fetch +
	// Chart.js instantiation on next tick.
	var sparkCard = document.createElement('div');
	sparkCard.className = 'panel-card link-sparkline-card';
	var sparkLabel = document.createElement('label');
	sparkLabel.className = 'panel-card-label';
	var sparkPropDesc = (prop_desc[event_sum_type[parms.event]] && prop_desc[event_sum_type[parms.event]][parms.property])
	    || (prop_desc[parms.event] && prop_desc[parms.event][parms.property])
	    || parms.property
	    || 'Trend';
	sparkLabel.innerHTML =
	    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
	      '<path d="M3 18 L9 12 L13 16 L21 6"/>' +
	    '</svg> Trend — <span class="link-sparkline-prop">' + escapeHtml(String(sparkPropDesc)) + '</span>';
	sparkCard.appendChild(sparkLabel);
	var sparkStats = document.createElement('div');
	sparkStats.className = 'link-sparkline-stats';
	sparkCard.appendChild(sparkStats);
	var sparkWrap = document.createElement('div');
	sparkWrap.className = 'link-sparkline-wrap';
	var sparkCanvas = document.createElement('canvas');
	sparkCanvas.className = 'link-sparkline';
	sparkWrap.appendChild(sparkCanvas);
	sparkCard.appendChild(sparkWrap);
	div.appendChild(sparkCard);

	// NOTE: we do NOT kick off the sparkline render here. link_popup()
	// is called at link-DRAW time (from get_connections / draw_links),
	// not at click time — the resulting div is stashed on the bezier
	// as _panelPopup and re-used. If we deferred the render here, it
	// would fire for every link on the map (hundreds of times) against
	// detached canvases, AND would capture stale parms.event/property/
	// dato from draw time. Instead, openLinkPanel() finds the canvas
	// and renders at CLICK time with fresh parms.

	// --- "See" card ---
	var seeCard = document.createElement("div");
	seeCard.className = "panel-card";
	var seeLabel = document.createElement("label");
	seeLabel.className = "panel-card-label";
	seeLabel.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> See';
	seeCard.appendChild(seeLabel);

	var seeBtns = document.createElement("div");
	seeBtns.className = "panel-card-buttons";

	var routesBtn = document.createElement("button");
	routesBtn.className = "knapp";
	routesBtn.title = "See the routes graph and stats in this period";
	routesBtn.innerHTML = 'Routes';
	routesBtn.onclick = function(){
	    let num_tabs = $("main#tabs > ul > li").length;
	    let fromShort = link.from.split('.').slice(0,2).join('.');
	    let toShort = link.to.split('.').slice(0,2).join('.');
	    let title = 'Routes: ' + fromShort + ' \u2192 ' + toShort;
	    add_tab('div', title, num_tabs, '<div class="center-text" style="padding:40px"><div class="spinner"></div><p>Loading traceroute data\u2026</p></div>');
	    let tab_id = 'tab' + num_tabs;
	    let start_epoch = new Date(dato).getTime() / 1000;
	    let end_epoch = start_epoch + parms.period * 3600;
	    var routesOpts = {
		net: parms.net,
		mahost: 'https://localhost:9200/',
		verify_SSL: 0,
		api: 'opensearch'
	    };
	    if(! jQuery.isEmptyObject(conffile[parms.net].archive) ) {
		routesOpts.mahost = conffile[parms.net].archive;
	    }
	    ls_tab(tab_id, link.from, link.to, start_epoch, end_epoch, routesOpts);
	    persistTab(tab_id, {
		kind: 'routes',
		title: title,
		from: link.from,
		to: link.to,
		startEpoch: start_epoch,
		endEpoch: end_epoch,
		options: routesOpts
	    });
	    // Ensure the newly added Routes tab is actually the active one
	    // (add_tab() counts ALL <li> children including non-tab ones, so
	    // its active-index can be off-by-one for our header layout).
	    const tab_count = $('main#tabs > ul > li > a').length;
	    if (tab_count > 0) {
		$('main#tabs').tabs('option', 'active', tab_count - 1);
	    }
	};
	seeBtns.appendChild(routesBtn);

	seeCard.appendChild(seeBtns);
	div.appendChild(seeCard);

	// Add "Top events" button via gap_popup (appends to seeCard buttons)
	gap_popup( seeBtns, link);

	// --- "Plot" card ---
	var plotCard = document.createElement("div");
	plotCard.className = "panel-card";
	var plotLabel = document.createElement("label");
	plotLabel.className = "panel-card-label";
	plotLabel.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> Plot';
	plotCard.appendChild(plotLabel);

	var plotBtns = document.createElement("div");
	plotBtns.className = "panel-card-buttons";

	// Helper — open a curve-chart URL as an integrated tab (iframe-embedded)
	// instead of a new browser window, mirroring the Routes flow.
	var fromShortPlot = link.from.split('.').slice(0, 2).join('.');
	var toShortPlot   = link.to.split('.').slice(0, 2).join('.');
	function open_curve_tab(label, url) {
	    var num_tabs = $("main#tabs > ul > li").length;
	    var title = label + ': ' + fromShortPlot + ' → ' + toShortPlot;
	    // Cache-buster — iframes get cached aggressively and the Queues view
	    // is small/static, so fresh load each click is cheap and avoids
	    // showing stale HTML/CSS after deploys.
	    var sep = url.indexOf('?') >= 0 ? '&' : '?';
	    var bustedUrl = url + sep + '_t=' + Date.now();
	    var iframe_html =
		'<div class="curve-iframe-wrap">' +
		    '<iframe class="curve-iframe" src="' + bustedUrl + '" frameborder="0" sandbox="allow-scripts allow-same-origin"></iframe>' +
		'</div>';
	    add_tab('div', title, num_tabs, iframe_html);
	    var divid = 'tab' + num_tabs;
	    persistTab(divid, {
		kind: 'curve',
		title: title,
		label: label,
		url: url    // store the *uncached* URL — restore will re-add a fresh _t
	    });
	    var tab_count = $('main#tabs > ul > li > a').length;
	    if (tab_count > 0) {
		$('main#tabs').tabs('option', 'active', tab_count - 1);
	    }
	}

	// --- Queues (jitter / h_ddelay) ---
	var queuesUrl = 'curve-chart.html?net=' + parms.net + '&index=' + parms.net + '_jitter&from=' + link.from + '&to=' + link.to + '&event=jitter&property=h_ddelay&start=' + start + '&end=' + end + "&title=From " + link.from + " to " + link.to;
	var queuesBtn = document.createElement("button");
	queuesBtn.className = "knapp";
	queuesBtn.title = "Curve over queues in this period";
	queuesBtn.textContent = 'Queues';
	queuesBtn.onclick = function () { open_curve_tab('Queues', queuesUrl); };
	plotBtns.appendChild(queuesBtn);

	// --- Unavailability (gap / down_ppm) ---
	var unavailIndex = (event_index && event_index['gap']) ? event_index['gap'] : (parms.net + '_gap');
	var unavailUrl = 'curve-chart.html?net=' + parms.net + '&index=' + unavailIndex + '&from=' + link.from + '&to=' + link.to + '&event=gap&property=down_ppm&start=' + start + '&end=' + end + '&title=Unavailability ' + link.from + ' to ' + link.to;
	var unavailBtn = document.createElement("button");
	unavailBtn.className = "knapp";
	unavailBtn.title = "Unavailability over this period";
	unavailBtn.textContent = 'Unavailability';
	unavailBtn.onclick = function () { open_curve_tab('Unavailability', unavailUrl); };
	plotBtns.appendChild(unavailBtn);

	// --- Current property (dynamic, depends on currently-selected event/property) ---
	// Skip this button when it would duplicate Queues or Unavailability — the
	// dynamic prop selection happens to match those fixed buttons sometimes.
	var isQueuesDup     = (parms.event === 'jitter' && parms.property === 'h_ddelay');
	var isUnavailDup    = (parms.event === 'gap'    && parms.property === 'down_ppm');
	if (!isQueuesDup && !isUnavailDup) {
	    var propUrl = 'curve-chart.html?net=' + parms.net + '&index=' + event_index[parms.event] + '&from=' + link.from + '&to=' + link.to + '&event=' + parms.event + '&property=' + parms.property + '&start=' + start + '&end=' + end + '&title="From ' + link.from + ' to ' + link.to + ' for ' + parms.property + '"';
	    var propBtn = document.createElement("button");
	    propBtn.className = "knapp";
	    propBtn.title = "Detailed report for the currently selected metric";
	    var propLabel = (prop_desc[parms.event] && prop_desc[parms.event][parms.property]) ? prop_desc[parms.event][parms.property] : (prop_desc[event_sum_type[parms.event]] && prop_desc[event_sum_type[parms.event]][parms.property]) ? prop_desc[event_sum_type[parms.event]][parms.property] : parms.property;
	    propBtn.textContent = propLabel;
	    propBtn.onclick = function () { open_curve_tab(propLabel, propUrl); };
	    plotBtns.appendChild(propBtn);
	}

	plotCard.appendChild(plotBtns);
	div.appendChild(plotCard);
    }
    return div;
}

// Small clipboard button rendered next to each hostname in the link
// panel, so users can copy an FQDN straight into a ticket. One delegated
// handler (wired below) serves every button via the .link-copy-btn class.
function _link_copy_btn(val) {
    var v = escapeHtml(String(val == null ? '' : val));
    return '<button type="button" class="link-copy-btn" data-copy-value="' + v + '" title="Copy hostname" aria-label="Copy hostname">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
          '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
        '</svg></button>';
}
function _link_copy_delegate(e) {
    var btn = e.target && e.target.closest && e.target.closest('.link-copy-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var value = btn.dataset.copyValue || '';
    if (!value) return;
    function _flash() {
        btn.classList.add('copied');
        setTimeout(function () { btn.classList.remove('copied'); }, 1100);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(_flash, function () { _link_copy_fallback(value, _flash); });
    } else {
        _link_copy_fallback(value, _flash);
    }
}
function _link_copy_fallback(text, onDone) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); onDone && onDone(); } catch (_) {}
    document.body.removeChild(ta);
}
$(document).on('click', '.link-copy-btn', _link_copy_delegate);

function make_tooltip_v2(fromHost, toHost, link){
    if (! jQuery.isEmptyObject(conffile)) {
	var nrows=0;
	var tip='<div class="link-panel-endpoints">';
	tip += '<div class="link-endpoint"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> <span>' + fromHost + '</span>' + _link_copy_btn(fromHost) + '</div>';
	tip += '<div class="link-endpoint"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> <span>' + toHost + '</span>' + _link_copy_btn(toHost) + '</div>';
	tip += '</div>';
	tip += "<table width=100%>";
	if ( selected_date_is_today_or_future() ) {
	    for (const sum_var in conffile[parms.net].event_type[parms.event].field) {
		if ( typeof link[sum_var] != 'undefined' ) {
		    var prop_value = Math.round((link[sum_var] + Number.EPSILON) * 100) / 100;
		    tip+= '<tr><td>' + prop_desc[parms.event][sum_var] + '<td align=right>' + prop_value;
		    nrows++;
		}
	    }
	} else {
	    for (const sum_var of conffile[parms.net].event_type[parms.event].popup.summary) {
		if ( typeof link[sum_var] != 'undefined' ) {
		    var prop_value = Math.round((link[sum_var] + Number.EPSILON) * 100) / 100;
		    tip+= '<tr><td>' + prop_desc[conffile[parms.net].event_type[parms.event].summary_event_type][sum_var] + '<td align=right>' + prop_value;
		    nrows++;
		}
	    }
	}
	tip+="</table>";
	return tip;
    } else {
	console.log('Error: No config loaded. Not able to prepare tooltips.');
	return;
    }
}

function link_tooltip( title, link, prop){
    if ( prop in link ){
	var val=link[prop];
	var event = event_sum_type[parms.event]
	if ( selected_date_is_today_or_future() ) {
	    event = parms.event
	}
	var tip='<b>' + title + '</b>' + "<p>" + prop_desc[event][prop] + ": " ;
	if ( typeof(val) !== "string" ){
	    tip += val.toFixed(1);
	    if ( prop === "down_ppm" && typeof link[prop] == 'number' ){
		tip+= " ( " + ( val * 86400 / 10**6 ).toFixed(0) + " sec/day )";
	    }
	}
    } else {
	tip += "undef";
    }
    return tip;
}

function gap_list( from, to, hits, lines, sort_type){
    var etype, html;
    var n=0;
    if ( sort_type){
	let sort_col = conffile[parms.net].event_type[parms.event].default_field;
	hits.sort( function(a,b){
	    if ( sort_type === 'num_desc')
		return b._source[sort_col] - a._source[sort_col];
	    else
		return a._source[sort_col] - a._source[sort_col];
	} );
    }
    for ( var hit of hits){
	var gap = hit._source;
	if ( ! etype) {
	    etype = gap.event_type;
	    var amount_head = etype === "gap" ? "Queue(ms)" : "Cause";
	    html="<table class=sortable><thead><td>Day Time<td>Lost(s)<td>" + amount_head + "</thead>";
	    if (! jQuery.isEmptyObject(prop_desc)) {
		html="<table class=sortable><thead title=\"Click to sort on column\"><th>Day Time";
		for (const col in conffile[parms.net].event_type[etype].popup.table) {
		    var title_text = "";
		    if (typeof prop_long_desc[etype][conffile[parms.net].event_type[etype].popup.table[col]] != "undefined") {
			title_text = prop_long_desc[etype][conffile[parms.net].event_type[etype].popup.table[col]];
		    }
		    html += "<th  title='" + title_text + "'>" + prop_desc[etype][conffile[parms.net].event_type[etype].popup.table[col]];
		}
		html += "</thead>";
	    }
	}
	if ( gap.from === from && gap.to === to ){
	    var d = new Date( Number(gap.timestamp * 1000) );
	    var tid = zero_fill( d.getDate() ) + " " + zero_fill( d.getHours() ) + ":" + zero_fill( d.getMinutes() );
	    var syslog_url = 'https://iou2.uninett.no/es-syslog-lookup/es-syslog-lookup.cgi?syslogwindow=3600&epoch=1&redirect=1'
		+ '&timestamp=' + gap.timestamp + '&from=' + gap.from_adr + '&to=' + gap.to_adr + '&ip=1';
	    var telemetry_url = 'https://telemetri.uninett.no/telemetri-lookup/telemetri-lookup.cgi?telemetrywindow=60'
                  + '&redirect=1&timestamp=' + gap.timestamp + '&from=' + gap.from_adr + '&to=' + gap.to_adr + '&ip=1';
	    var telemetry_href = tid;
	    var sec;
	    if ( etype === "gap"){ sec = ( gap.tloss / 1000 ).toFixed(1); }
	    else if ( etype === "routeerr" ) sec = ( gap.duration ).toFixed(1);
	    var syslog_href= sec;
	    var tail="";
	    if ( $("#network").val() === "uninett" ){
	        syslog_href = '<a title="See router logs" href="' + syslog_url + '" target=_blank>' + "Log" + '</a>';
	        telemetry_href = '<a title="See telemetry data" href="' + telemetry_url + '" target=_blank>' + "Mon" + '</a>';
		tail =  "<td><button class=knapp>" + syslog_href + "</button>" + "<td><button class=knapp>" + telemetry_href + "</button>";
	    }
	    var amount;
	    if ( etype === "gap"){
		amount = gap.h_ddelay;
		if ( typeof amount == "number") amount = amount.toFixed(1) ;
	    } else if ( etype === "routeerr" ){
		amount = gap.cause + " " + gap.last_reply_from;
	    }
	    if (! jQuery.isEmptyObject(event_desc)){
		html += "<tr><td>" + tid;
		for (const col in conffile[parms.net].event_type[etype].popup.table) {
		    if (typeof gap[conffile[parms.net].event_type[etype].popup.table[col]] != "undefined" ) {
			var value_tooltip_field = conffile[parms.net].event_type[etype].field[ conffile[parms.net].event_type[etype].popup.table[col] ].mouseover;
			var value_tooltip = "";
			if (typeof value_tooltip_field != "undefined" ) { value_tooltip = gap[ value_tooltip_field ]; }
			html += "<td align=right title='" + value_tooltip + "' >" + gap[conffile[parms.net].event_type[etype].popup.table[col]];
		    } else { html += "<td align=right>-"; }
		}
		html += "<td>" + tail + "\n";
	    } else {
		html += "<tr><td>" + tid +  "<td align=right>" + sec + "<td align=right>" + amount + "<td>" + tail + "\n";
	    }
	    if ( lines &&  n >= lines) break;
	    n++;
	}
    }
    html += "</table>";
    if (n>0) return(html);
    else return("No events.");
}

// summarize gap and jitter records into gapsum format
  function digest_es_data(etype, hits){
      var stat=[]; var msg=[]; var digest=[];
    for (var i=0; i < hits.length; i++){
	var event = hits[i]._source;
	if ( event.event_type === etype){
	    var ab = event.from + "," + event.to;
	    if ( ! (ab in stat) ){
		stat[ab]=[]; stat[ab].from = event.from; stat[ab].to = event.to;
		for ( const prop of prop_names[etype]){ stat[ab][prop]=new stats(); }
		msg[ab]=[]; msg[ab].from = event.from; msg[ab].to = event.to;
		for ( const prop of prop_names[etype]){ msg[ab][prop]=[]; }
	    }
	    for ( const prop of prop_names[etype] ){
		let value=event[prop];
		if ( typeof(value) === "undefined" ) value="";
		else if ( typeof value === "object" ) value = JSON.stringify(value);
		if ( typeof value === "string"){
		    if ( msg[ab][prop].indexOf( value) < 0 ) msg[ab][prop].push(value);
		} else { stat[ab][prop].add( value ); }
	    }
	}
    }
    for ( const ab in stat ){
	var rec={ from: stat[ab].from, to: stat[ab].to};
	for ( const prop of prop_names[etype] ){
	    if ( stat[ab][prop].n > 0 ){
		if ( prop in prop_aggr[etype] ) {
		    switch (prop_aggr[etype][prop]) {
		    case "sum": rec[prop]=stat[ab][prop].sum; break;
		    case "avg": rec[prop]=stat[ab][prop].average()
		    case "max": rec[prop]=stat[ab][prop].max(); break;
		    case "min": rec[prop]=stat[ab][prop].min(); break;
		    default: rec[prop]=stat[ab][prop].average()
		    }
		} else { rec[prop]=stat[ab][prop].average() }
		rec[prop]=Math.round((rec[prop] + Number.EPSILON) * 100) / 100;
		rec[prop + "_max"] = stat[ab][prop].max();
		rec[prop + "_sum"] = stat[ab][prop].sum;
	    } else { rec[prop] = msg[ab][prop].join(); }
	}
	if ( stat[ab].tloss ){ rec.down_ppm = ( stat[ab].tloss.sum * 1000000 / 1000 / period_length ); }
	digest.push( {_source: rec} );
    }
    return digest;
}

function count_aggregates(aggs){
    var n = 0;
    var from_buckets=aggs.from.buckets;
    for (var i=0; i < from_buckets.length; i++){ n += from_buckets[i].doc_count; }
    return ("" + n + ", skipped " + aggs.from.sum_other_doc_count);
}

function digest_aggregates(aggs, stats_type){
    var digest=[];
    var from_buckets=aggs.from.buckets;
    for (var i=0; i < from_buckets.length; i++){
	var fra = from_buckets[i].key;
	var to_buckets= from_buckets[i].to.buckets;
	for (var j=0; j < to_buckets.length; j++){
	    var til=to_buckets[j].key;
	    if (parms.debug) console.log(fra + " - " + til + " = " + to_buckets[j].h_ddelay.avg );
	    var rec={ from: fra, to: til};
	    for ( const prop in to_buckets[j] ){
		if ( typeof( to_buckets[j][prop] ) === 'object' ) { rec[prop]= to_buckets[j][prop]['values'][stats_type]; }
	    }
	    digest.push( {_source: rec} );
	}
    }
    return digest;
}

function draw_links(hits, prop){
    get_thresholds(hits, prop);
    update_legend(prop_desc[event_sum_type[parms.event]][prop],threshes);
    hits.sort(sort_hits);
    var new_ends=[];
    for (var i=0; i < hits.length; i++){
	var link=hits[i]; var ab=[link._source.from, link._source.to]; var abs=ab.join();
	if(!new_ends[abs]) new_ends.length++; new_ends[abs]=1;
	if ( focus_node === "" || ab.indexOf(focus_node) >= 0 ){
	    var color=get_color( link._source[prop], threshes) || empty_color;
	    if ( ! linkByName[abs]){
		var tooltip= link_tooltip( link._source.from + " to " + link._source.to , link._source, prop );
		var l=draw_link(ab, color, tooltip, link_popup(link._source) );
		if (l){
		    links.push(l);
		    if(!linkByName[abs]) linkByName.length++;
 		    linkByName[abs]=l; ends.push(abs);
		    l.on("mouseover", function(e){
			if (! mouseover) { mouseover = true; color_store[e.target.leaflet_id]=e.target.options.color; e.target.bringToFront(); taint_link(e.target,"blue"); }
		    });
		    l.on("mouseout", function(e){ taint_link(e.target, color_store[e.target.leaflet_id]); mouseover=false; });
		}
	    }
	} else { n_excluded++; remove_link(ab); }
    }
    var stale_link=[];
    for (var i=0; i < ends.length; i++){ if ( ! new_ends[ ends[i]] ) { stale_link.push(ends[i]); } }
    for (var i=0; i < stale_link.length; i++){ remove_link(stale_link[i]); }
    taint_links(hits, prop);
}

function get_topology(source = "archive"){
    if (points.length == 0) {
	load_coords_from_all_sources(network);
	return;
    }
    let start = new Date($("#datepicker").val() + " 00:00:00").getTime()/1000;
    let start_iso = new Date($("#datepicker").val() + " 00:00:00").toISOString();
    let end= new Date($("#datepicker").val() + " 23:59:59").getTime()/1000;
    let end_iso = new Date($("#datepicker").val() + " 23:59:59").toISOString();
    var network=parms.net;

    switch (source) {
    case "sqlite-db":
	//var url="microdep-config.cgi?secret=\"" + conffile[parms.net].database_secret + "\"&variant=mp-" + network + "&start=" + start + "&end=" + end;
	var url="microdep-config.cgi?net=" + network + "&start=" + start + "&end=" + end;
	$.getJSON( url, function(topology){
	    if (topology.length == 0) {
		$("#error").html(hhmmss(new Date()) + " : No topology data found for " + parms.event + " events on " + $("#datepicker").val() + " " + $("#period_input").val() + ";;");
		remove_links(links);
	    } else {
		if (points.length == 0) { load_coords_from_all_sources(network); return; }
		draw_topology( topology ); get_connections();
	    }
	}).fail( function( jqxhr, textStatus, error ) { console.log( "Request" + url + " Failed: " + textStatus + ", " + error ); });
	break;
    case "archive":
	var query_index = event_index[parms.event];
	if ( conffile[parms.net].event_type.topology.index ) { query_index = conffile[parms.net].event_type.topology.index; }
	else if (conffile[parms.net].event_type[parms.event].topology_index) { query_index = conffile[parms.net].event_type[parms.event].topology_index ; }
	var url="elastic-get-date-type.pl?net=" + parms.net + "&index=" + query_index + "&start=" + start_iso + "&end=" + end_iso;
	if (net_ip_version[parms.net]) { url += "&ip_version=" + net_ip_version[parms.net]; }
	$.getJSON( url, function(result){
	    if (jQuery.isEmptyObject(result.aggregations)) {
		// Something went wrong. Log failure.
		console.log("Warning: Failed to fetch data from archive. Check archive url in mapconfig.yml.");
		if (!jQuery.isEmptyObject(result.error)) {
		    console.log("        (\"" + result.error.msg  + "\")");
		}
		// No topology data returned. Try sqlite-db instead.
		get_topology("sqlite-db");
		return;
	    }
	    var topology = [];
	    if (! result.aggregations.peer.buckets.length) {
		console.log("No topology data returned from archive. Trying sqlite db ...");
		get_topology("sqlite-db");
	    } else {
		for (var p=0; p < result.aggregations.peer.buckets.length; p++) { topology.push(result.aggregations.peer.buckets[p].key.split("_")); }
		draw_topology( topology ); get_connections();
	    }
	}).fail( function(e, textStatus, error ) { console.log("failed to get data from server :" + textStatus + ", " + error); });
	break;
    }
}

function duplex_topology(topo){
    var dup=[]; for ( var link of topo ){ dup.push( [ link[1], link[0] ] ); } return topo.concat(dup);
}

var mouseover=false;

function draw_topology(topo){
    if (topo.length == 0) { remove_links(links); return; }
    var new_ends=[];
    for (var i=0; i < topo.length; i++){
        var ab=topo[i]; var abs= ab.join();
	if (! new_ends[abs]) new_ends.length++; new_ends[abs]=1;
	if ( ! linkByName[abs]){
	    var l=draw_link(ab, empty_color, ab, ab );
	    if (l){
		links.push(l); linkByName[abs]=l; ends.push(abs);
		l.on("mouseover", function(e){ if (! mouseover) { mouseover = true; color_store[e.target.leaflet_id]=e.target.options.color; e.target.bringToFront(); taint_link(e.target,"blue"); } });
		l.on("mouseout", function(e){ taint_link(e.target, color_store[e.target.leaflet_id]); mouseover=false; });
	    }
	} else { taint_link(linkByName[abs], empty_color); }
    }
    var stale_link=[];
    for (var i=0; i < ends.length; i++){ if ( ! new_ends[ ends[i]] ) { stale_link.push(ends[i]); } }
    for (var i=0; i < stale_link.length; i++){ remove_link(stale_link[i]); }
    links_on=true;
}

function taint_topology( topo, prop){
    get_thresholds(topo, prop);
    update_legend(prop_desc[event_sum_type[parms.event]][prop],threshes);
    for (var i=0; i < topo.length; i++){
	var link=topo[i]; var ab=[link._source.from, link._source.to]; var abs = ab.join();
	if ( linkByName[abs] ){
	    var color=get_color( link._source[prop], threshes) || empty_color;
	    taint_link( linkByName[abs], color );
	    var popup=link_popup(link._source);
	    var tooltip= link_tooltip( link._source.from + " to " + link._source.to , link._source, prop );
	    annotate_link( abs, linkByName[abs], tooltip, popup, link._source );
	}
    }
}

// ============================================================
// SNAPSHOT COMPARE — diff palette + baseline fetch helpers
// ============================================================
// Compare-mode color palette. When the user picks "Compare with
// yesterday/last week/4 weeks ago", the link is coloured by the SIGNED
// percentage change rather than its absolute value. Negative pct =
// improvement (green), positive = degradation (red), near-zero = grey.
// Polarity assumes "lower is better" for the property — true for
// every microdep summary metric we care about (delay, loss,
// down_ppm, jitter, asymmetry, ...).
var COMPARE_COLORS = {
    bigGreen: '#00a854',   // ≤ -30%   → much better
    smallGreen: '#5cb85c', // -30…-10% → mildly better
    grey: '#888888',       // -10…+10% → unchanged
    smallRed: '#d9534f',   // +10…+30% → mildly worse
    bigRed: '#c11919',     // ≥ +30%   → much worse
    noBaseline: '#9aa3ad'  // no baseline value — paler grey, distinct from "unchanged"
};

function _compare_color_for_pct(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return COMPARE_COLORS.noBaseline;
    if (pct <= -30) return COMPARE_COLORS.bigGreen;
    if (pct <= -10) return COMPARE_COLORS.smallGreen;
    if (pct >=  30) return COMPARE_COLORS.bigRed;
    if (pct >=  10) return COMPARE_COLORS.smallRed;
    return COMPARE_COLORS.grey;
}

// Translate the dropdown value to a millisecond offset to subtract
// from the current window's start/end. Returns 0 for "off".
function _compare_offset_ms(mode) {
    switch (mode) {
        case 'day':   return 24 * 3600 * 1000;
        case 'week':  return 7 * 24 * 3600 * 1000;
        case 'month': return 28 * 24 * 3600 * 1000;
        default:      return 0;
    }
}

function _compare_label(mode) {
    switch (mode) {
        case 'day':   return 'yesterday';
        case 'week':  return 'last week';
        case 'month': return '4 weeks ago';
        default:      return '';
    }
}

// Fetch the baseline series for the same query as get_connections, but
// shifted backwards by the compare offset. Calls cb(success) — true if
// the baselineSummary map got populated, false on any error / empty.
function _fetch_baseline_summary(currStart, currEnd, etype, prop, cb) {
    var mode = parms.compare || 'off';
    if (mode === 'off') { baselineSummary = {}; cb && cb(false); return; }
    var offsetMs = _compare_offset_ms(mode);
    if (!offsetMs) { baselineSummary = {}; cb && cb(false); return; }

    // Cache key — skip refetch if event/prop/period/compare/start match
    var key = [etype, prop, currStart, currEnd, mode].join('|');
    if (key === baselineCompareKey && Object.keys(baselineSummary).length) {
        cb && cb(true);
        return;
    }

    var bStartMs = new Date(currStart).getTime() - offsetMs;
    var bEndMs   = new Date(currEnd).getTime()   - offsetMs;
    var bStart   = new Date(bStartMs).toISOString();
    var bEnd     = new Date(bEndMs).toISOString();

    var index   = (event_index && event_index[etype]) || parms.net + '_' + etype;
    var sumType = (event_sum_type && event_sum_type[etype]) || etype;
    // Mirror get_connections's logic for past-period queries: prefer summary
    // when one exists (we're always in past for compare mode). The baseline
    // is by definition older than now.
    var queryEtype = sumType || etype;

    var url = 'elastic-get-date-type.pl?index=' + index +
              '&event_type=' + queryEtype +
              '&start=' + adjust_to_timezone(bStart) +
              '&end='   + adjust_to_timezone(bEnd);
    if (net_ip_version && net_ip_version[parms.net]) {
        url += '&ip_version=' + net_ip_version[parms.net];
    }
    if (parms.debug) console.log('compare: baseline url:', url);

    $.getJSON(url).done(function (resp) {
        var hits = (resp && resp.hits && resp.hits.hits) || [];
        baselineSummary = {};
        for (var i = 0; i < hits.length; i++) {
            var s = hits[i] && hits[i]._source;
            if (!s || !s.from || !s.to) continue;
            var v = s[prop];
            if (typeof v !== 'number' || isNaN(v)) continue;
            baselineSummary[s.from + ',' + s.to] = v;
        }
        baselineCompareKey = key;
        console.log('compare: baseline loaded —', Object.keys(baselineSummary).length, 'pairs');
        cb && cb(true);
    }).fail(function (e, ts, err) {
        console.log('compare: baseline fetch failed —', ts, err);
        baselineSummary = {};
        baselineCompareKey = '';
        cb && cb(false);
    });
}

// Layer group holding the floating "+12%" / "-7%" chips that hover
// next to each link in compare mode. Created lazily, attached to the
// Leaflet map, and cleared (not destroyed) on each repaint so we
// don't leak L.divIcon DOM nodes across toggles.
var _compare_label_layer = null;

function _ensure_compare_layer() {
    if (!_compare_label_layer) {
        _compare_label_layer = L.layerGroup();
    }
    if (typeof mymap !== 'undefined' && mymap && !mymap.hasLayer(_compare_label_layer)) {
        _compare_label_layer.addTo(mymap);
    }
    return _compare_label_layer;
}

function _clear_compare_labels() {
    if (_compare_label_layer) _compare_label_layer.clearLayers();
}

// Threshold below which a chip is suppressed. Matches the legend's
// "same" bucket — if the value is essentially unchanged from baseline
// the chip would just clutter the map without telling the user
// anything new. They can still hover the link for the exact value.
var COMPARE_LABEL_MIN_PCT = 10;

// Build a single floating chip at the link's geographic centre.
// pct comes from _compare_pct_for_link — null means we have no
// baseline for that pair, in which case we skip the chip entirely
// (cluttering the map with "?" badges helps no one).
function _add_compare_label(link, pct) {
    if (!link || pct === null || pct === undefined || isNaN(pct)) return;
    // Hide chips for the "same" bucket — they all read "0%" / "±2%"
    // and just clutter the map without communicating anything useful.
    if (Math.abs(pct) < COMPARE_LABEL_MIN_PCT) return;
    // Real-path mode splits a single A→B route into N hop-segment
    // polylines (annotated with _isRealPathLine = true). All segments
    // share the same end-to-end pct value, so labeling each one
    // creates a vertical stack of identical chips. Skip them — the
    // main bezier (no _isRealPathLine flag) gets the only label.
    if (link._isRealPathLine) return;
    // Use the polyline's actual midpoint by vertex count — for curved
    // / great-circle lines (Norway→NZ, etc.) the bounds rectangle's
    // centre falls way off the rendered line. Walking to vertices/2
    // gives a point that's actually ON the curve.
    //
    // Defensive: getLatLngs() returns wildly different shapes
    // depending on which Leaflet primitive backs the link:
    //   • L.polyline       → flat [LatLng, LatLng, ...]
    //   • L.polygon        → nested [[LatLng, ...]]
    //   • L.curve (plugin) → SVG-path commands: ['M', [lat,lon], 'L', [lat,lon], 'Q', [c1], [end], ...]
    // We collect every coordinate-shaped element regardless of nesting
    // / command letters, then pick the middle one.
    var center = null;
    try {
        var raw = link.getLatLngs ? link.getLatLngs() : [];
        var coords = [];
        var _walk = function (x) {
            if (!x) return;
            if (typeof x.lat === 'number' && typeof x.lng === 'number') {
                coords.push(x);
                return;
            }
            if (Array.isArray(x)) {
                // [lat, lon] tuple of plain numbers (L.curve commands use these)
                if (x.length >= 2 && typeof x[0] === 'number' && typeof x[1] === 'number') {
                    coords.push(L.latLng(x[0], x[1]));
                    return;
                }
                for (var i = 0; i < x.length; i++) _walk(x[i]);
            }
            // strings ('M' / 'L' / 'Q' / 'C') and anything else: skip
        };
        _walk(raw);
        if (coords.length === 1) center = coords[0];
        else if (coords.length >= 2) center = coords[Math.floor(coords.length / 2)];
    } catch (_) {}
    // Fallback to bounds-center if for some reason the link has no
    // introspectable vertices (e.g. fully custom renderer).
    if (!center && link.getBounds) {
        try {
            var b = link.getBounds();
            if (b && b.isValid && b.isValid()) center = b.getCenter();
        } catch (_) {}
    }
    if (!center || typeof center.lat !== 'number') return;

    // Format: arrow + sign + rounded percent. Round to 1 decimal under
    // 10%, integer otherwise — matches the at-a-glance feel of the
    // legend buckets and keeps the chip narrow.
    var abs = Math.abs(pct);
    var rounded = abs >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
    var sign = pct > 0 ? '+' : '';                  // negative already prints '-'
    var arrow = pct > 5 ? '▲' : pct < -5 ? '▼' : '·';
    var color = _compare_color_for_pct(pct);
    var label = arrow + ' ' + sign + rounded + '%';

    var html = '<div class="compare-pct-chip" style="background:' + color + '">' +
               escapeHtml(label) + '</div>';

    var marker = L.marker(center, {
        icon: L.divIcon({
            className: 'compare-pct-marker',
            html: html,
            iconSize: null
        }),
        interactive: false,        // chip doesn't capture clicks — link below stays clickable
        keyboard:    false,
        zIndexOffset: 100          // above link lines so the chip doesn't get hidden
    });
    _ensure_compare_layer().addLayer(marker);
}

// Compute pct change for a (from, to) pair. Returns null when no
// baseline value exists for that pair.
function _compare_pct_for_link(from, to, currVal) {
    if (typeof currVal !== 'number' || isNaN(currVal)) return null;
    var bv = baselineSummary[from + ',' + to];
    if (typeof bv !== 'number' || isNaN(bv)) return null;
    if (bv === 0) {
        // Avoid div-by-zero: any nonzero change from 0 reads as ∞%; cap at
        // ±100 so the legend stays sensible. Treat 0→0 as no change.
        return currVal === 0 ? 0 : (currVal > 0 ? 100 : -100);
    }
    return ((currVal - bv) / bv) * 100;
}

// Wrapper around taint_links/draw_links that fetches the baseline
// first when compare mode is on. Acts as a drop-in replacement at all
// the existing taint_links call sites inside get_connections so the
// compare flow can wait for baseline data before painting.
function _paint_with_compare(summary, etype, prop, start_iso, end_iso) {
    var paint = function () {
        if (!parms.connections) taint_links(summary, prop);
        else                    draw_links(summary, prop);
    };
    if (parms.compare && parms.compare !== 'off') {
        _fetch_baseline_summary(start_iso, end_iso, etype, prop, function () {
            paint();
        });
    } else {
        // Compare turned off → wipe any stale baseline so a later toggle
        // back ON actually refetches with current params.
        baselineSummary = {};
        baselineCompareKey = '';
        paint();
    }
}

// Compare-mode legend — replaces the threshold semaphore with five
// fixed buckets (much better / mildly better / unchanged / mildly
// worse / much worse + no-baseline). Reuses the same #legend table
// the threshold legend lives in so positioning/styling carry over.
function update_compare_legend(propTitle, baselineLabel) {
    var $leg = $('#legend').empty();
    var rows = [
        { col: COMPARE_COLORS.bigGreen,   label: '≤-30%'    },
        { col: COMPARE_COLORS.smallGreen, label: '-10..-30' },
        { col: COMPARE_COLORS.grey,       label: '±10%'     },
        { col: COMPARE_COLORS.smallRed,   label: '+10..+30' },
        { col: COMPARE_COLORS.bigRed,     label: '≥+30%'    }
    ];
    // Mirror update_legend()'s exact structure — ONE <tr> with the
    // title <th> as first child and bucket <td>s as siblings. Flex CSS
    // (#legend tr { display: flex; flex-wrap: wrap; }) makes the th
    // (flex 0 0 100%) wrap to its own line above the bucket row, but
    // because it's the same <tr>, the row gap and overall height
    // calculation matches the threshold legend exactly.
    var html = '<table id="legend" class="compare-legend"><tr align=center>';
    html += '<th><button class="knapp" id="farge0" type="button" ' +
            'title="Compare-mode legend (negative = improved, positive = degraded)">' +
            escapeHtml(propTitle || '') + ' vs ' + escapeHtml(baselineLabel || 'baseline') +
            '</button></th>';
    for (var i = 0; i < rows.length; i++) {
        html += '<td><button class="knapp" type="button" ' +
                'style="background:' + rows[i].col + ';color:#fff;width:100%" ' +
                'disabled>' + escapeHtml(rows[i].label) + '</button></td>';
    }
    html += '</tr></table>';
    $leg.html(html);
}

function taint_links( hits, prop){
    var done=[];
    var compareMode = parms.compare && parms.compare !== 'off';
    if ( hits.length > 0){
        get_thresholds(hits, prop);
	if (compareMode) {
	    update_compare_legend(prop_desc[event_sum_type[parms.event]][prop], _compare_label(parms.compare));
	    _clear_compare_labels();
	} else {
	    update_legend(prop_desc[event_sum_type[parms.event]][prop],threshes);
	    _clear_compare_labels();
	}
	for (var i=0; i < hits.length; i++){
	    var link=hits[i]; var ab=[link._source.from, link._source.to]; var abs = ab.join();
	    done[abs]=1;
	    if ( linkByName[abs] ){
		var color, compPct = null;
		if (compareMode) {
		    compPct = _compare_pct_for_link(link._source.from, link._source.to, link._source[prop]);
		    color = _compare_color_for_pct(compPct);
		} else {
		    color = get_color( link._source[prop], threshes) || empty_color;
		}
		taint_link( linkByName[abs], color );
		if (compareMode) _add_compare_label(linkByName[abs], compPct);
		var popup=link_popup(link._source);
		var tooltip= link_tooltip( link._source.from + " to " + link._source.to , link._source, prop );
		annotate_link( abs, linkByName[abs], tooltip, popup, link._source );
	    } else {
		console.log("Property " + prop + " reported on unexpected link " + abs + ". Adopting.");
		var color=get_color( link._source[prop], threshes);
		var tooltip= link_tooltip( link._source.from + " to " + link._source.to , link._source, prop );
		var l=draw_link(ab, color, tooltip, link_popup(link._source) );
		if (l){
		    linkByName[abs]=l; links.push(l); ends.push(abs);
		    l.on("mouseover", function(e){ if (! mouseover) { mouseover = true; color_store[e.target.leaflet_id]=e.target.options.color; e.target.bringToFront(); taint_link(e.target,"blue"); } });
		    l.on("mouseout", function(e){ taint_link(e.target, color_store[e.target.leaflet_id]); mouseover = false; });
		}
	    }
	}
    }
    for ( var abs of ends ){
	if ( ! done[abs]){
	    if ( linkByName[abs] ){
		var ft = abs.split(",");
		taint_link( linkByName[abs], empty_color );
		annotate_link( abs, linkByName[abs], abs + ': no data', link_popup( {"from":ft[0], "to":ft[1]} ) );
	    }
	}
    }
    refresh_links_by_color();
    extend_unidirectional_links();
    refreshLinkPanel();
    if ( $("#search_input").val() !== "" )
	focus_links( $("#search_input").val(), 'noflip' );
}

function taint_link( link, color ){
    if (link){
	link.setStyle( {"color": color} );
        for (var abs in linkByName) {
            if (linkByName[abs] === link) {
                updateArrowColors(abs, color);
                break;
            }
        }
    }
}

function extend_unidirectional_links() {
    for (var abs in extendedLinks) {
        if (linkByName[abs] && extendedLinks[abs]) {
            var orig = extendedLinks[abs];
            var currentColor = linkByName[abs].options.color;
            linkByName[abs].remove();
            var halfLine = L.curve(['M', orig.bp0, 'Q', orig.bp1, orig.bp2], { color: currentColor, fill: false, weight: 6 });
            halfLine._bezierP0 = orig.bp0; halfLine._bezierP1 = orig.bp1; halfLine._bezierP2 = orig.bp2;
            halfLine._fullStart = orig.fullStart; halfLine._fullEnd = orig.fullEnd; halfLine._fullControl = orig.fullControl;
            halfLine.addTo(mymap);
            if (orig.tooltip) halfLine.bindTooltip(orig.tooltip, {"sticky":true});
            if (orig.popup) halfLine.on('click', function(){ openLinkPanel(orig.popup); });
            halfLine.on("mouseover", function(e){ if (!mouseover) { mouseover = true; color_store[e.target.leaflet_id] = e.target.options.color; e.target.bringToFront(); taint_link(e.target, "blue"); } });
            halfLine.on("mouseout", function(e){ taint_link(e.target, color_store[e.target.leaflet_id]); mouseover = false; });
            linkByName[abs] = halfLine;
            removeArrowMarkers(abs);
            addArrowsToLine(abs, orig.bp0, orig.bp1, orig.bp2, currentColor);
        }
    }
    extendedLinks = [];
    for (var abs in linkByName) {
        var parts = abs.split(","); var inverse = parts[1] + "," + parts[0];
        if (!linkByName[inverse] && linkByName[abs]) {
            var link = linkByName[abs];
            if (link._fullStart && link._fullEnd && link._fullControl) {
                var color = link.options.color;
                var tooltipContent = link.getTooltip() ? link.getTooltip().getContent() : null;
                var popupContent = link.getPopup ? null : null;
                extendedLinks[abs] = { bp0: link._bezierP0, bp1: link._bezierP1, bp2: link._bezierP2, fullStart: link._fullStart, fullEnd: link._fullEnd, fullControl: link._fullControl, tooltip: tooltipContent, popup: popupContent };
                link.remove();
                var newBP0 = link._fullStart; var newBP2 = link._fullEnd;
                var cubicC1 = link._fullControl; var cubicC2 = link._bezierP1 || link._fullControl;
                var newLine = L.curve(['M', newBP0, 'C', cubicC1, cubicC2, newBP2], { color: color, fill: false, weight: 6 });
                newLine._bezierP0 = link._bezierP0; newLine._bezierP1 = link._bezierP1; newLine._bezierP2 = link._bezierP2;
                newLine._fullStart = link._fullStart; newLine._fullEnd = link._fullEnd; newLine._fullControl = link._fullControl;
                newLine.addTo(mymap);
                if (tooltipContent) newLine.bindTooltip(tooltipContent, {"sticky":true});
                if (popupContent) newLine.on('click', function(){ openLinkPanel(popupContent); });
                newLine.on("mouseover", function(e){ if (!mouseover) { mouseover = true; color_store[e.target.leaflet_id] = e.target.options.color; e.target.bringToFront(); taint_link(e.target, "blue"); } });
                newLine.on("mouseout", function(e){ taint_link(e.target, color_store[e.target.leaflet_id]); mouseover = false; });
                linkByName[abs] = newLine;
                removeArrowMarkers(abs);
                addArrowsToCubicLine(abs, newBP0, cubicC1, cubicC2, newBP2, color);
            }
        }
    }
}

function dash_link( link, dash=true){
    if (link){ if (dash) { link.setStyle( { "dashArray": "10 10" }); } else { link.setStyle( { "dashArray": "" }); } }
}

function annotate_link(abs,link, tooltip, popup, linkSourceData){
    if (link){
	link.bindTooltip( tooltip, {"sticky":true} );
	link.off('click');
	link.off('mouseout');
	if (linkSourceData) {
	    link._panelSource = linkSourceData;
	    link.on('click', function(e){ setHighlightedLink(e.target); openLinkPanel(popup, linkSourceData); });
	} else {
	    link.on('click', function(e){ setHighlightedLink(e.target); openLinkPanel(popup); });
	}
	link.on("mouseout", function(e){
	    mouseover = false;
	    e.target.closeTooltip();
	    // Don't restore color if this link is highlighted (panel open)
	    if (highlightedLink !== e.target) {
	        if (color_store[e.target.leaflet_id]) {
	            e.target.setStyle({"color": color_store[e.target.leaflet_id]});
	            for (var k in linkByName) {
	                if (linkByName[k] === e.target) { updateArrowColors(k, color_store[e.target.leaflet_id]); break; }
	            }
	        }
	    }
	});
    }
    $("#" + abs + '-from' ).on('click', "button.knapp" , function( e){ focus_links(e.id, 'flip'); });
    $("#" + abs + '-to' ).on('click', "button.knapp" , function( e){ focus_links(e.id, 'flip'); });
}

function draw_link( ends, color, tooltip, popup){
    var line_name=ends.join("-");
    var inverse_line=ends.reverse().join("-");
    var latlon1 = get_coords(ends[0]);
    var latlon2 = get_coords(ends[1] ) ;
    var cp1, cp2, mp1, bear2, utslag;
    if ( parms.debug) console.log(ends + latlon1);
    if ( latlon1 && latlon2 && latlon1.lat && latlon1.lon && latlon2.lat && latlon2.lon ){
        let distance = (0+(latlon1.distanceTo(latlon2)));
	if ( distance < 5000000) { mp1 = latlon1.midpointTo(latlon2); }
	else { mp1 = new LatLon ( latlon1.lat + (latlon2.lat - latlon1.lat) / 2, latlon1.lon + (latlon2.lon - latlon1.lon) / 2 ); }
        let bearing = mp1.initialBearingTo(latlon2);
        if ( typeof bearing === "undefined" || isNaN(bearing) ) {
	    console.log( "No bearing for ends " + ends + " : latlon1: "+latlon1,", latlon2: ",latlon2);
            return(0);
        }
	// Bearing offset controls how far the bezier control point cp2 sits off
	// the direct line — randomised to spread out duplicate links visually.
	// For the SECOND direction of an already-drawn pair we reuse the same
	// offset so cp2_AB and cp2_BA are antiparallel through cp1; that makes
	// the two half-curves share a tangent there and visually appear as one
	// continuous link (no zig-zag at the meeting point on short links).
	let bearing_offset;
	if (line_offset[inverse_line] !== undefined) {
	    bearing_offset = line_offset[inverse_line];
	} else {
	    let sign=1;
	    if (! duplines[line_name] ) { duplines[line_name]=0; } else { if (duplines[line_name] % 2 ){ sign=1; } }
	    bearing_offset = sign * ( 5 * ( 1+ ++duplines[line_name]) + ( 5 * Math.random())*10 );
	}
	line_offset[line_name] = bearing_offset;
	if ( middle_point[inverse_line]){
	    cp1 = middle_point[inverse_line]; utslag = line_utslag[inverse_line];
	} else {
	    utslag= ( Math.random() - 0.5 )/ 10 ;
	    if ( distance < 5000000 ){ cp1 = latlon1.destinationPoint((distance/2), bearing + bearing_offset); }
	    else { cp1 =new LatLon( mp1.lat + (latlon2.lat - latlon1.lat) * utslag, mp1.lon + (latlon2.lon - latlon1.lon) * utslag ); }
	    if (parms.debug){ var m=L.circle([cp1.lat,cp1.lon], {weight:6, radius:100, color:"blue"}).addTo(mymap).bindTooltip('cp1 '+line_name); }
	}
	middle_point[line_name]=cp1; line_utslag[line_name]=utslag;
	var mid = cp1.midpointTo(latlon2); var dist2=(0+(cp1.distanceTo(latlon2)));
	if ( line_bearing[inverse_line]){ bear2 = 360 - line_bearing[inverse_line] % 360; }
	else { bear2 = bearing; }
	line_bearing[line_name]=bear2;
	if ( distance < 50000000 ){ cp2 = cp1.destinationPoint((dist2/2), bearing + bearing_offset); }
	else { cp2 =new LatLon( mp1.lat + (latlon2.lat - mp1.lat) * utslag, mp1.lon + (latlon2.lon - mp1.lon) * utslag ); }
	if (parms.debug){
	    console.log(ends + [[cp2.lat, cp2.lon], [latlon2.lat, latlon2.lon]] + ' dist: ' + distance);
	    var m=L.circle([cp2.lat,cp2.lon], {weight:6, radius:100, color:"red"}).addTo(mymap).bindTooltip('cp2 '+line_name);
	    var m=L.circle([mp1.lat,mp1.lon], {weight:6, radius:100, color:"violet"}).addTo(mymap).bindTooltip('mp1 '+line_name);
	}
	var line;
	var bezierP0, bezierP1, bezierP2;
	if (parms.curve === 'line' ) {
	    line =L.polyline( [mid, latlon2], {color: color, weight:6, renderer: myRenderer});
	} else {
	    bezierP0 = [cp1.lat, cp1.lon]; bezierP1 = [cp2.lat, cp2.lon]; bezierP2 = [latlon2.lat, latlon2.lon];
	    line = L.curve(['M', bezierP0, 'Q', bezierP1, bezierP2 ], { color: color, fill: false, weight:6 });
	}
	line._bezierP0 = bezierP0; line._bezierP1 = bezierP1; line._bezierP2 = bezierP2;
	line._fullStart = [latlon1.lat, latlon1.lon]; line._fullEnd = [latlon2.lat, latlon2.lon]; line._fullControl = [cp1.lat, cp1.lon];
	if (line) line.addTo(mymap);
	else console.log('Line draw failed ' + line_name);
	if (bezierP0 && bezierP1 && bezierP2) { addArrowsToLine(ends.slice().reverse().join(","), bezierP0, bezierP1, bezierP2, color); }
	line.bindTooltip(tooltip, {"sticky":true});
	line.on('click', function(){ openLinkPanel(popup); });
    } else { console.log("no coords for ends" + ends.length + ' ends ' + ends + ' coords ' + latlon1 + ' - ' + latlon2); }
    return(line);
}

function load_coords(network, service, goal){
    if ( service === "topoevents" ) {
	var start_iso = new Date($("#datepicker").val() + " 00:00:00").toISOString();
	var end_iso = new Date($("#datepicker").val() + " 23:59:59").toISOString();
	// Query for both source (from) nodes and destination (to) nodes
	var query_index = event_index[parms.event] ; 
	if ( conffile[parms.net].event_type.topology.index ) {
	    // Override with index from config
	    query_index = conffile[parms.net].event_type.topology.index ; 
	} else if (conffile[parms.net].event_type[parms.event].topology_index) {
	    // Override with index from config
	    query_index = conffile[parms.net].event_type[parms.event].topology_index;
	}

	var url="elastic-get-date-type.pl?net=" + parms.net + "&index=" + query_index + "&start=" + start_iso + "&end=" + end_iso + "&event_type=topology";
	if (net_ip_version[parms.net]) {
	    // Add filtering on ip version
	    url += "&ip_version=" + net_ip_version[parms.net];
	}
    
	$.getJSON( url,function(result){
	    if (jQuery.isEmptyObject(result.responses)) {
		// Something went wrong. Log failure.
		console.log("Warning: Failed to fetch data from archive. Check archive url inn mapconfig.yml.");
		if (!jQuery.isEmptyObject(result.error)) { console.log("        (\"" + result.error.msg  + "\")");}
	    } else {
		for (var r = 0; r < result.responses.length; r++) {
		    if (typeof result.responses[r].aggregations != "undefined" ) {
			// Aggregated results are available
			for (var n=0; n < result.responses[r].aggregations.nodes.buckets.length; n++) {
			    // Add node info to points structure
			    var p={ id: "", name: "Unknown", lat: 0, lon: 0, ip: "n/a"};
			    p.id = result.responses[r].aggregations.nodes.buckets[n].key;
			    if (typeof result.responses[r].aggregations.nodes.buckets[n].city.buckets[0] != "undefined" ) {
				p.name = result.responses[r].aggregations.nodes.buckets[n].city.buckets.at(-1).key;  // Grab last city in list
			    } else { p.name = p.id; }			       
			    if (typeof result.responses[r].aggregations.nodes.buckets[n].lat.buckets[0] != "undefined")
				p.lat = result.responses[r].aggregations.nodes.buckets[n].lat.buckets.at(-1).key ?? 0 ; // Get last value seen
			    if (typeof result.responses[r].aggregations.nodes.buckets[n].lon.buckets[0] != "undefined") 
				p.lon = result.responses[r].aggregations.nodes.buckets[n].lon.buckets.at(-1).key ?? 0 ; // Get last value seen
			    if (typeof result.responses[r].aggregations.nodes.buckets[n].ip.buckets[0] != "undefined") { 
				reg_ip_adr(p.id, result.responses[r].aggregations.nodes.buckets[n].ip.buckets.at(-1).key );  // Register last ip in list
				p.ip = result.responses[r].aggregations.nodes.buckets[n].ip.buckets.at(-1).key;
			    }
			    let point_already_loaded = points.find(o => o.id === p.id);
			    if (! point_already_loaded) { points.push( p); }
			}
		    } else if (typeof result.responses[r].error.reason != "undefined" ) {
			// Something is "suboptimal"
			console.log("Failed to access data from Opensearch: " + result.responses[r].error.reason + ". Check if Microdep analytics is operational.");
		    }
		}
		if ( ! result.responses.length ) { console.log("No node data returned from archive for time period " + start_iso + " to " + end_iso + "."); }
	    }
	    loads++;
	    if (loads >= goal) {
		// All other calls to load_coords() have completed.
		loads=0;
		show_map(network);
		if (points.length > 0)
		    // Some nodes are available. Plot the links too.
		    get_topology();
	    }
	}).fail( function(e, textStatus, error ) { console.log( "Request" + url + " Failed: " + textStatus + ", " + error ); loads++; });
	return;
    }
    if ( service === "db" ) {
	start = new Date($("#datepicker").val() + " 00:00:00").getTime()/1000;
	end= new Date($("#datepicker").val() + " 23:59:59").getTime()/1000;
	var network=parms.net;
	var url="microdep-config.cgi?mode=nodes&net=" + network + "&start=" + start + "&end=" + end;
	$.getJSON( url, function(nodes){
	    for ( var n=0; n < nodes.length; n++) {
		var p={}; p.id = nodes[n][0]; p.name = nodes[n][1]; p.lat = nodes[n][2]; p.lon = nodes[n][3];
		reg_ip_adr(p.name, nodes[n][4]);
		let point_already_loaded = points.find(o => o.id === p.id);
		if (! point_already_loaded) { points.push( p); } else { console.log( "Duplicate node info for node " + p.id ); }
	    }
	    loads++;
	    if (loads >= goal) { loads=0; show_map(network); if (points.length > 0) get_topology(); }
	}).fail( function( jqxhr, textStatus, error ) { console.log( "Request" + url + " Failed: " + textStatus + ", " + error ); loads++; });
	return;
    }
    var url= "./" + network + "/" + network + "-" + service + "-geo.json";
    $.getJSON( url, function(tjenester){
	if ( "_meta" in tjenester ){
	    $.each(tjenester._meta.hostvars, function(id, host){
		if( host.utm){
		    var utm=host.utm.split(" "); var utm_o = L.utm( { x:utm[2], y:utm[1], zone: utm[0], band:"N" } ); var latlon = utm_o.latLng();
		    var ytid=id; if ( id.indexOf("ytelse") >= 0){ ytid = id.substr(0, id.indexOf(".uninett.no") ); }
		    points.push( {id:ytid, name:host.nettinstallasjon, lat:latlon.lat, lon:latlon.lng });
		}
	    });
	} else {
	    for (var t=0; t<tjenester.length; t++) {
		let point_already_loaded = points.find(o => o.id === tjenester[t].id);
		if (! point_already_loaded) { points.push( tjenester[t]); } else { console.log( "Duplicate node info for node " + t.id ); }
	    }
	}
	loads++;
	if (loads >= goal) { loads=0; show_map(network); if (points.length > 0) get_topology(); }
    }).fail( function( jqxhr, textStatus, error ) { console.log( "Request" + url + " Failed: " + textStatus + ", " + error ); loads++; });
}

function load_coords_from_all_sources(network){
    load_coords(network, "topoevents", 2);
    load_coords(network, "db", 2);
}

function show_network(network){
    points=[];
    if ( network in points_cache){ points=points_cache[network]; }
    if (points.length == 0) { load_coords_from_all_sources(network); }
    else { show_map(network); get_topology(); }
}

function get_coords(end){
    var coords, i;
    for (i=0; i < points.length; i++){
	var p=points[i];
	if ( p.id === end ){ coords=new LatLon(p.lat,p.lon); return coords; }
    }
    var p={id:end, name:end, lat:no_coords.lat, lon:no_coords.lon};
    points.push( p); make_markers( $("#network").val(), [p], false);
    return no_coords;
}

function sort_missing(a ,b){
    var aa=a.split(" "); var bb=b.split(" ");
    if ( aa[0] === bb[0]){ return aa[1].localeCompare( bb[1] ); } else { return aa[0].localeCompare( bb[0] ); }
}

function check_ends(){
    var html= '<h2>Missing flows in dataset? </h2>'; html += '<table><tr><th>From<th>To';
    var ab=[], i; var nok=0, nmiss=0, missing=[];
    for (i=0;i<ends.length;i++){ a=ends[i][0] + ' ' + ends[i][1]; ab[a]=true; }
    for (i=0;i<ends.length;i++){ var b=ends[i][1] + ' ' + ends[i][0]; if (ab[b]){ nok++; } else { missing.push(b); nmiss++; } }
    missing.sort(sort_missing);
    for (i=0; i< missing.length; i++){ var ft=missing[i].split(" "); html+='<tr><td>' +ft[0] + '<td>'+ ft[1]; }
    html+='</table>'; html+='<p>' + "Ok " + nok + " Missing " + nmiss;
    $("#missing").html(html); $("#missing").dialog("open");
}

function sort_diff(a , b){
    var aa=a.split(" "); var bb=b.split(" ");
    if ( aa[0] === bb[0]){ return aa[1].localeCompare( bb[1] ); } else { return aa[0].localeCompare( bb[0] ); }
}

// ============================================================
// CSV export — Summary / Asymmetry / Missing report tables
// ============================================================
// Table -> RFC 4180-ish CSV. Cells with the From/To link-stack expand
// into two columns; cells carrying a `data-csv` attribute export that
// raw value instead of their rendered text.
function _csv_escape(s) {
    if (s === null || s === undefined) return '';
    s = String(s);
    if (/[",\r\n]/.test(s)) {
        s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function _table_to_csv(table) {
    if (!table) return '';
    var lines = [];
    var rows = table.rows;
    for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].cells;
        var fields = [];
        for (var c = 0; c < cells.length; c++) {
            var cell = cells[c];
            // Header & body cells with the linked-pair stack become two CSV cols
            if (cell.classList && cell.classList.contains('summary-link-header')) {
                fields.push(_csv_escape('From'));
                fields.push(_csv_escape('To'));
                continue;
            }
            if (cell.classList && cell.classList.contains('summary-link-cell')) {
                var fromEl = cell.querySelector('.summary-from span, .summary-from');
                var toEl   = cell.querySelector('.summary-to span,   .summary-to');
                fields.push(_csv_escape(fromEl ? fromEl.textContent.trim() : ''));
                fields.push(_csv_escape(toEl   ? toEl.textContent.trim()   : ''));
                continue;
            }
            if (cell.dataset && cell.dataset.csv !== undefined) {
                fields.push(_csv_escape(cell.dataset.csv));
                continue;
            }
            var txt = cell.textContent || '';
            txt = txt.replace(/\s+/g, ' ').trim();
            fields.push(_csv_escape(txt));
        }
        lines.push(fields.join(','));
    }
    return lines.join('\r\n') + '\r\n';
}

function _csv_filename(prefix) {
    var date = ($('#datepicker').val() || new Date().toISOString().slice(0, 10));
    var d = new Date(date);
    if (!isNaN(d.getTime())) {
        date = d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }
    var net  = (parms && parms.net)      || 'unknown';
    var ev   = (parms && parms.event)    || 'unknown';
    var prop = (parms && parms.property) || '';
    var bits = ['microdep', prefix, date, net, ev];
    if (prop) bits.push(prop);
    return bits.map(function (b) { return String(b).replace(/[^A-Za-z0-9._-]/g, '_'); }).join('-') + '.csv';
}

function _csv_download(filename, csv) {
    // BOM helps Excel detect UTF-8 on Windows; harmless elsewhere.
    var blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}

// One delegated handler for every <button class="export-csv-btn">.
$(document).on('click', '.export-csv-btn', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var btn = e.currentTarget;
    var sel = btn.getAttribute('data-csv-table');
    var name = btn.getAttribute('data-csv-name') || 'export';
    var table = sel ? document.getElementById(sel) : null;
    if (!table) {
        var pane = btn.closest('.ui-tabs-panel, [role="tabpanel"], .tab-pane') || btn.parentNode;
        table = pane ? pane.querySelector('table') : null;
    }
    if (!table) {
        console.warn('export-csv: no table found (data-csv-table=' + sel + ')');
        return;
    }
    _csv_download(_csv_filename(name), _table_to_csv(table));
    btn.classList.add('exported');
    setTimeout(function () { btn.classList.remove('exported'); }, 900);
});

// Reusable button markup; drops in next to a report <h2>.
function _csv_button_html(tableId, namePrefix) {
    return '<button type="button" class="export-csv-btn" ' +
           'data-csv-table="' + tableId + '" ' +
           'data-csv-name="' + namePrefix + '" ' +
           'title="Download this table as CSV">' +
             '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
               '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
               '<path d="M7 10l5 5 5-5"/>' +
               '<path d="M12 15V3"/>' +
             '</svg>' +
             '<span class="export-csv-label">Export CSV</span>' +
             '<span class="export-csv-done-label">Downloaded</span>' +
           '</button>';
}

function check_asymmetry(report, div_id){
    var ab=[], down=[], diff=[], pair=[], i; var nok=0, nmiss=0, missing=[];
    for (i=0;i< summary.length;i++){ var entry=summary[i]._source; var a=entry.from + " " + entry.to; down[a]= entry[ parms.property ]; ab[a]=true; }
    for (i=0;i<summary.length;i++){
	var entry=summary[i]._source; var a=entry.from + " " + entry.to; var b=entry.to + " " + entry.from;
	if ( ! ( b in pair ) ){ var delta=0; if ( typeof(down[b]) === "number" && typeof(down[a]) === "number" ) delta= down[b] - down[a]; diff.push( {id: a, val: Math.abs( delta ) } ); }
	pair[a] = b; pair[b] = a;
	if (ab[b]){ nok++; } else { missing.push(b); nmiss++; }
    }
    let html='';
    if ( report === 'missing' ){
	if (nmiss > 0) {
	    html+= '<div class="tab-header-row"><h2>Missing opposite flows for ' + title_state() + '</h2>' + _csv_button_html(div_id + '_miss_table', 'missing') + '</div>';
	    html+='<p>The below ' + nmiss + ' (out of ' + summary.length + ") flows might be missing";
	    html += '<table id=' + div_id + '_miss_table title="Missing opposite flows?" class=sortable>';
	    html += '<thead><tr><th class="summary-link-header">' + fromIcon + 'From<br>' + toIcon + 'To</th></tr></thead>';
	    missing.sort(sort_missing);
	    for (i=0; i< missing.length; i++){
		var ft=missing[i].split(" ");
		html+='<tr><td class="summary-link-cell">';
		html+='<div class="summary-from">' + fromIcon + '<span>' + ft[0] + '</span></div>';
		html+='<div class="summary-to">' + toIcon + '<span>' + ft[1] + '</span></div>';
		html+='</td>';
	    }
	    html+='</table>';
	    html += "<p>The above analysis is based on " + prop_desc[event_sum_type[parms.event]][ parms.property ] + " data sets.</p>";
	} else { html+= '<h2>No missing flows for ' + title_state() + '</h2>'; }
    } else {
	if (diff.length > 0) {
	    html+='<div class="tab-header-row"><h2>Asymmetry in ' + prop_desc[event_sum_type[parms.event]][parms.property] + ' for ' + title_state() + '</h2>' + _csv_button_html(div_id + '_table', 'asymmetry') + '</div>';
	    html += '<table id=' + div_id + '_table border=1 class=sortable><thead title="Click to sort on column"><tr>';
	    html += '<th class="summary-link-header">' + fromIcon + 'From<br>' + toIcon + 'To';
	    html += '<th align=right>From→To<th align=right>To→From<th align=right>Diff</tr></thead>';
	    diff.sort( function(a,b){ if ( typeof(a.val) === "number" && typeof(b.val) === "number" ) return b.val - a.val; return 0; });
	    for (i=0; i< diff.length; i++){
		let a = diff[i].id; let ft=a.split(" ");
		let aval= down[a] ? down[a].toFixed(1) : down[a]; let bval= down[pair[a]] ? down[pair[a]].toFixed(1) : down[pair[a]];
		let diffval = diff[i].val ? diff[i].val.toFixed(1) : 0 ;
		html+='<tr><td class="summary-link-cell">';
		html+='<div class="summary-from">' + fromIcon + '<span>' + ft[0] + '</span></div>';
		html+='<div class="summary-to">' + toIcon + '<span>' + ft[1] + '</span></div>';
		html+='</td>';
		html+='<td align=right>' + aval + '<td align=right>' + bval + '<td align=right>' + diffval;
	    }
	    html+='</table>';
	} else { html+= '<h2>No asymmetry found in ' + prop_desc[event_sum_type[parms.event]][parms.property] + ' for ' + title_state() + '</h2>'; }
    }
    return(html);
}

var fromIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;color:var(--c-accent)"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>';
var toIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;color:var(--c-accent)"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

function report_summary(div_id){
    let html='';
    html+='<div class="tab-header-row"><h2>Summary for ' + title_state() + '</h2>' + _csv_button_html(div_id + '_table', 'summary') + '</div>';
    html+='<table border=1 id=' + div_id + '_table class=sortable>\n';
    var header_missing=true;
    for (let i=0;i< summary.length;i++){
	var entry=summary[i]._source;
	if (header_missing){
	    html += '<thead title="Click to sort"><tr><th class="summary-link-header">' + fromIcon + 'From<br>' + toIcon + 'To';
	    for ( const prop of prop_names[event_sum_type[parms.event]]){
		var desc = prop_desc[event_sum_type[parms.event]][prop] || prop;
		var longDesc = prop_long_desc[event_sum_type[parms.event]][prop] || '';
		html+='<th align=right title="' + longDesc + ' - Click to sort" class="summary-prop-header">' + desc;
	    }
	    html+='</tr></thead><tbody>'; header_missing=false;
	}
	html+='<tr><td class="summary-link-cell">';
	html+='<div class="summary-from">' + fromIcon + '<span>' + entry['from'] + '</span></div>';
	html+='<div class="summary-to">' + toIcon + '<span>' + entry['to'] + '</span></div>';
	html+='</td>';
	for ( const prop of prop_names[event_sum_type[parms.event]]){
	    let val= entry[prop];
	    if ( typeof val === 'number' && ! val.isInteger){ if ( val < 100 ) val = val.toFixed(1); else val = val.toFixed(0); }
	    html+='<td align=right>' + val;
	}
    }
    html+='</tbody></table>';
    return(html);
}

function change_date(delta){
    var p= $("#datepicker").datepicker("getDate");
    var increment=$("#period").val(); var hour=0;
    if ( increment === "now" || increment < 24 ){
	increment = 1; var period_input=$("#period_input").val(); hour=parse_hhmm(period_input);
	p.setHours(p.getHours() + hour + increment * delta);
    } else { var days = Math.round(increment / 24); p.setDate( p.getDate() + days * delta ); }
    $("#period_input").val(hhmm(p)); $("#datepicker").datepicker('setDate', p);
    update_url(); show_network(parms.net); update_url();
}

function reg_ip_adr(name, adr){
    if ( name && adr ){ if ( ! ip_to_name[adr] ) ip_to_name[adr] = name; if ( ! name_to_ip[name] ) name_to_ip[name] = adr; }
}

function harvest_ip_name(summary){
    for (var link_obj of summary){ var link=link_obj._source; reg_ip_adr( link.from, link.from_adr); reg_ip_adr( link.to, link.to_adr); }
}

function log_summary(summary){ for (let i=0; i<summary.length; i++){ console.log( summary[i]._source.from + "-" + summary[i]._source.to ); } }
function present_table( parameters, div, data){}

function get_peer_data(from, to, div){
    var data=[];
    let tz_start = adjust_to_timezone(start); let tz_end = adjust_to_timezone(end);
    var url="elastic-get-date-type.pl?net=" + parms.net + "&index=" + event_index[parms.event] + "&event_type=" + parms.event + "&start=" + tz_start + "&end=" + tz_end + "&from=" + from + "&to=" + to;
    if (net_ip_version[parms.net]) { url += "&ip_version=" + net_ip_version[parms.net]; }
    $.getJSON( url, function(resp){
	if (jQuery.isEmptyObject(resp.hits)) {
	    console.log("Warning: Failed to fetch data from archive. Check archive url inn mapconfig.yml.");
	    if (!jQuery.isEmptyObject(resp.error)) { console.log("        (\"" + resp.error.msg  + "\")");}
	    // No topology data returned. Try sqlite-db instead.
	    get_topology("sqlite-db");
	    return;
	}
        if (resp.hits && resp.hits.total.value > 0){
            let html=gap_list( from, to, resp.hits.hits, 10, 'num_desc');
            div.innerHTML = html; div['hits'+parms.event] = resp.hits.hits;
            sorttable.makeSortable( div.getElementsByClassName('sortable')[0] );
            // panel auto-updates, no need for popup update
        } else { $("#error").html(hhmmss(new Date()) + " : No " + parms.event + " data for " + $("#datepicker").val() + " " + $("#period_input").val() + ";;"); }
    }).fail( function(e, textStatus, error ) { console.log("failed to get data from server :" + textStatus + ", " + error); });
}

var links_on = false;
const index_extension={};

// Expose get_connections on window so inline handlers in index.html
// (auto-refresh, "Refresh now" on the stale-data banner) can call it —
// ES module top-level declarations don't leak to the global object.
window.get_connections = function () { return get_connections.apply(this, arguments); };
function get_connections(){
    var index=parms.net; var etype= parms.event; var sum_etype=""; var sum_index="";
    if ( ! jQuery.isEmptyObject(event_index)) { index = event_index[parms.event]; sum_etype = event_sum_type[parms.event]; }
    else { index = index + "_" + etype; console.log("Warning: No index specified. Missing config file? Applying '", + index + "'"); }
    var hour=0; var period=$("#period").val(); var now=new Date();
    if ( refresh_active){ $("#datepicker").datepicker('setDate', now); if ( period < 24 ){ var startd= new Date(now - 3600*1000); $("#period_input").val( hhmm(startd ) ); } }
    start = $("#datepicker").val(); var dstart=new Date(start); var msstart=dstart.getTime(); var tz= dstart.getTimezoneOffset() / 60;
    let tloss;
    if ( period < 24 ){
	var period_input= $("#period_input").val(); hour=parse_hhmm( period_input ) + tz; period=1;
	dstart= new Date( msstart + hour * 3600*1000 ); start = dstart.toISOString(); end = new Date(dstart.getTime() + 3600*1000).toISOString(); tloss=0;
    } else {
	var msperiod=period * 3600*1000; var msend= msstart + msperiod;
	if ( (msend - now) > (msperiod/2) ){ if ( period > 24 ){ dstart=new Date(msstart); var cd = dstart.getDate() - dstart.getDay(); var sow = new Date(dstart.setDate(cd + 1)); msstart=sow.getTime(); $("#datepicker").datepicker('setDate', new Date(msstart)); } }
	if ( etype === "gapsum" ) msend += 5 * 60 * 1000;
	start= new Date(msstart).toISOString(); end= new Date(msend).toISOString();
	if ( period < 2*24 ){ tloss=1000; } else if ( period <= 7*24 ){ tloss=5000; } else { tloss=60000; }
    }
    last_hits=[]; summary=[]; var now = new Date();
    if ( ! sum_etype || typeof sum_etype == 'undefined' || start.substr(0,10) === now.toISOString().substr(0,10) || period < 24){
	var url="elastic-get-date-type.pl?net=" + parms.net + "&index=" + index + "&event_type=" + etype + "&start=" + start + "&end=" + end ;
	if (net_ip_version[parms.net]) { url += "&ip_version=" + net_ip_version[parms.net]; }
	if ( tloss > 0 && etype === "gap" ) url += "&tloss=" + tloss;
	if (parms.debug) console.log(url);
	$.getJSON( url, function(resp){
	    if (jQuery.isEmptyObject(resp.hits)) {
		console.log("Warning: Failed to fetch data from archive. Check archive url in mapconfig.yml.");
		if (!jQuery.isEmptyObject(resp.error)) { console.log("        (\"" + resp.error.msg  + "\")"); }
		// No topology data returned. Try sqlite-db instead.
		get_topology("sqlite-db"); return;
	    }
	    if (resp.hits && resp.hits.total.value > 0){
		var nrecs=resp.hits.total.value.toString();
		if ( etype === "gapsum" || etype === "routesum" ){ summary=resp.hits.hits; }
		else if ( resp.aggregations){ aggregates=resp.aggregations; summary=digest_aggregates(aggregates, $("#stats_type").val()); nrecs = count_aggregates( aggregates ); }
		else { if (! sum_etype || start.substr(0,10) === now.toISOString().substr(0,10)) { summary=digest_es_data(etype, resp.hits.hits); } last_hits=resp.hits.hits; }
		harvest_ip_name(summary);
		var msg = hhmmss(new Date()) + " Found " + nrecs + " " + etype + " records for " + $("#datepicker").val() + " " + $("#period_input").val() + " ;;";
		$("#status").html( msg );
		if (! jQuery.isEmptyObject(conffile) && conffile[parms.net].event_type[parms.event].asn_source ) {
		    for (const h in last_hits) { var ab = last_hits[h]._source.from + ',' + last_hits[h]._source.to; if (linkByName[ab] && last_hits[h]._source.routechange_asn ) { linkByName[ab].asn_search += last_hits[h]._source[conffile[parms.net].event_type[parms.event].asn_source] + " "; } }
		}
		_paint_with_compare(summary, etype, $("#prop_select").val(), start, end);
	    } else { taint_links([], "empty"); $("#error").html(hhmmss(new Date()) + " : No " + $("#event_type").val() + " data for " + $("#datepicker").val() + " " + $("#period_input").val() + ";;"); }
	}).fail( function(e, textStatus, error ) { console.log("### Failed to get data from server :" + textStatus + ", " + error + " url: " + url); });
    } else if ( sum_etype) {

	//if ( etype === 'jitter'){ console.log("Warning: jitter data do no have sum records."); index = parms.net; sum_etype = 'gapsum'; }   THIS IS MANAGE IN mapconfig.yml
	
	var sum_url="elastic-get-date-type.pl?net=" + parms.net + "&index=" + index + "&event_type=" + sum_etype + "&start=" + start + "&end=" + end;
	if (net_ip_version[parms.net]) { sum_url += "&ip_version=" + net_ip_version[parms.net]; }
	if (parms.debug) console.log(sum_url);
	$.getJSON( sum_url, function(resp){
	    if (resp.hits && resp.hits.total.value > 0){
		var nrecs=resp.hits.total.value.toString(); summary=resp.hits.hits; harvest_ip_name(summary);
		var msg = hhmmss(new Date()) + " Got " + nrecs + " " + sum_etype + " records for " + $("#datepicker").val() + " " + $("#period_input").val() + " ;;";
		$("#status").html( msg );
		_paint_with_compare(summary, etype, $("#prop_select").val(), start, end);
	    } else { taint_links([], "empty"); $("#error").html(hhmmss(new Date()) + " : No " + sum_etype + " data for " + $("#datepicker").val() + " " + $("#period_input").val() + ";;"); }
	}).fail( function(e, textStatus, error ) { console.log("failed to get data from server :" + textStatus + ", " + error); });
    }
    if (parms.report) { $("#check").val(parms.report).trigger('change'); delete parms.report; }
    $("#tabs").tabs("option", "active", 0);
};

function pad(d){ return ("0"+d).slice(-2) ; }
function hhmmss(d){ return( pad( d.getHours() ) + ":" + pad( d.getMinutes()) + ":" + pad( d.getSeconds() ) ); }

function title_state(){
    let state = event_desc[parms.event] + ' in ' + net_desc[parms.net] + ' from ' + $("#datepicker").val() + ' for ' + $("#period").val() + ' hours';
    return state;
}

function init_map(){
    if ( parms.net){ $("#network").val(parms.net); } else { parms.net = $("#network").val(); }
    update_props(); make_palette( parms.palette);
    var busy_no=0;
    $.ajaxSetup({ beforeSend:function(){ $("#busy").show(); busy_no++; }, complete:function(){ busy_no--; if ( busy_no <= 0) $("#busy").hide(); } });
    $("#busy").height( $("#network").height() );
    $("#tabs").tabs();
    $( "#datepicker" ).datepicker({dateFormat: "yy-mm-dd", "defaultDate": -1, "firstDay": 1, "maxDate": 0 });
    var dato; if ( parms.date) dato=parms.date; else dato="-1d";
    $("#datepicker").datepicker('setDate', dato).on("change", function() {
	$("#next").prop('dsabled', selected_hour_is_future() ); update_url(); show_network(parms.net);
    });
    $("#period").change( function(){ parms.period = $("#period").val(); update_props(); update_url(); get_topology(); $("#period_input").val('00:00'); });
    $("#period_input").change( function(){ parms.period_input = $("#period").val(); $("#period").val(1); parms.period = $("#period").val(); update_url(); get_topology(); });
    $("#prev").click( function(){ change_date(-1); $("#next").prop('disabled', selected_hour_is_future() ); } );
    $("#next").click( function(){ change_date(+1); $("#next").prop('disabled', selected_hour_is_future() ); } );
    $("#live").click( function(){
	if ( refresh_active){ clearInterval(); refresh_active=false; $(this).css("background-color", active_color); }
	else { refresh_active=true; $("#datepicker").datepicker('setDate', new Date()); get_topology(); active_color=$(this).css("background-color"); $(this).css("background-color", refresh_color); setInterval( function(){ get_topology(); }, refresh_period ); }
    } );
    $("#search_input").keyup( function(){ var str = $("#search_input").val(); focus_links( str, 'flip' ); } );
    $("#network").change( async function(){ parms.net= $("#network").val(); update_props(); remove_links(links); show_network(parms.net); update_url(); $("#tabs").tabs("option", "active", 0); });
    $("#event_type").change( function(){ parms.event = $("#event_type").val(); update_props(); load_coords_from_all_sources(network); update_url(); $("#tabs").tabs("option", "active", 0); });
    $("#prop_select").change( function(){ parms.property = $("#prop_select").val(); baselineCompareKey=''; _paint_with_compare(summary, parms.event, $("#prop_select").val(), start, end); update_url(); $("#tabs").tabs("option", "active", 0); });
    // Snapshot compare dropdown — flips threshold vs diff-vs-baseline palette.
    $("#compare_select").change( function(){ parms.compare = $("#compare_select").val(); baselineCompareKey=''; _paint_with_compare(summary, parms.event, $("#prop_select").val(), start, end); update_url(); });
    fill_select( "stats_type", stats_types );
    $("#stats_type").change( function(){ summary=digest_aggregates(aggregates, $("#stats_type").val()); _paint_with_compare(summary, parms.event, $("#prop_select").val(), start, end); update_url(); $("#tabs").tabs("option", "active", 0); });
    if ( parms.node){ focus_node=parms.node; get_topology(); links_on=true; }
    $("#check").change( function(){
	var report_type = $("#check").val(); var title = $("#check").find(":selected").text();
	let num_tabs = $("main#tabs > ul > li").length ; let tab_id = 'tab' + num_tabs;
	switch(report_type ){
	case 'missing': add_tab( 'div', title, num_tabs, check_asymmetry(report_type, tab_id) ); break;
	case 'asymmetry': add_tab( 'div', title, num_tabs, check_asymmetry(report_type, tab_id) ); break;
	case 'summary': add_tab( 'div', title, num_tabs, report_summary(tab_id) ); break;
	case 'heatmap':
	    let template_url='curve-chart.html?net=' + parms.net + '&index=' + event_index[parms.event] + '&from={0}&to={1}&event=' + parms.event + '&property=h_ddelay&start=' + start + '&end=' + end + "&title=\"From {2} to {3}\"";
	    add_tab( 'div', title, num_tabs, 'This will be graph soon'); heatmap(tab_id, summary, $("#prop_select").val(), get_color, threshes, title_state(), template_url ); break;
	case 'curve': add_tab( 'div', title, num_tabs, 'This will be graph soon'); curve(tab_id, last_hits, $("#prop_select").val(), title_state() ); break;
	}
	if (report_type !== 'choose') {
	    persistTab(tab_id, { kind: 'check', report_type: report_type, title: title });
	}
	$("#check").val('choose'); $("#tabs").tabs("option", "active", num_tabs);
    });
    document.getElementById("mapid").addEventListener("contextmenu", function (event) {
	event.preventDefault(); alert(lat.toFixed(5) + ', ' + lng.toFixed(5)); return false;
    });
    $( "#missing" ).dialog({ autoOpen: false, minWidth: 800 });
    $("#mapid").on('click', "a.trigger", function(e){ var node=e.target.id; focus_links( node, 'flip' ) });
    if (parms.compare) { $("#compare_select").val(parms.compare); }
    $("#network").trigger("change");

    // Whenever the user switches tabs, remember the active one so we can
    // restore it after a page reload. (Skipped while restoring, since we'd
    // otherwise overwrite the saved value with the temporarily-active
    // last-restored tab.)
    $('main#tabs').on('tabsactivate', function () {
        if (!restoringTabs) saveActiveTab();
    });

    // After the initial network/topology load settles, replay any persisted
    // tabs from the previous session. 1.5s is enough for the AJAX chain
    // triggered by the network change above (config + topology + summary).
    setTimeout(restoreSavedTabs, 1500);
}

$(document).ready ( function(){ get_parms( ); get_config( parms.conffile, init_map ); });
