// main js for microdep-map to be included at bottom of html

import LatLon from "./latlon-spherical.js";
import {parms, conffile, reversed, prop_sum, update_url, stats_on,
	event_names, event_desc, event_long_desc, event_index, event_sum_type,
	prop_names, prop_names_list, prop_desc, prop_long_desc, prop_aggr,
	colors, get_color, make_palette, threshes, get_thresholds, 
	get_parms,removeParam, parse_hhmm, hhmm , adjust_to_timezone,
	get_config, update_props, make_prop_select, add_tab,
	round_number, zero_fill, selected_date_is_today_or_future, selected_hour_is_future }
from "./map-lib.js" ;
import { heatmap } from "./graph.js";

  var start, end;  // startend time for current period
 
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
var focus_node="";
var middle_point=[],
    line_bearing=[],
    line_utslag=[];
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
	myRenderer = L.canvas({ padding: 0.5, tolerance: 20 });
	// create the tile layer with correct attribution
	var osmUrl='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
	var osmAttrib='Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors';
	var osm = new L.TileLayer(osmUrl, {minZoom: 1, maxZoom: 20, attribution: osmAttrib});		
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


  /*
  function  make_prop_select(id, names, desc, long_desc = {}){
    var selectList=document.getElementById(id);
    selectList.options.length = 0; // remove previous
   
    for (var i = 0; i < names.length; i++) {
	var option = document.createElement("option");
	option.value = names[i];
	var text=desc[names[i]];
	if ( ! text ) text = names[i];
	option.text = text;
	if (typeof long_desc[names[i]] != "undefined")
	    option.title = long_desc[names[i]]; 
	selectList.appendChild(option);
    }
    // Sort list alphabetically (from https://stackoverflow.com/questions/667010/sorting-dropdown-list-using-javascript/667198#667198)
    $("#" + id).html($("#" + id + " option").sort(function (a, b) {
	return a.text == b.text ? 0 : a.text < b.text ? -1 : 1
    }))
} */

function remove_markers(){
    clustergroup.eachLayer(function(m) {
	clustergroup.removeLayer(m);
	// console.log('marker', m._tooltip.options._content + " " + m);
    });
}

// spread points that share position

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
	// var nodeurl= window.location.origin + window.location.pathname+ "?net=" + parms.net + "&;
	// var nodeurl = fix_url( window.location.href, "node", id );
	// var html = '<br><a href="' + nodeurl + '">Focus on</a>';
	// var html = '<br><button id="' + id + '" class="trigger">Focus on</button>';
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
	// No markers to focus on. Show the whole world (repeated as many times as necessary)
        bounds =  [[-90,-180],   [90,180]];
    }
    
    if ( focus ){
	mymap.fitBounds(bounds);
    }
}

//function draw_net(){
//}


function remove_links(){
    var i;
    for ( i=0; i<links.length; i++ ){
	// mymap.removeLayer(links[i]);
	if ( links[i] ) links[i].remove();
    }
    links=[];
    linkByName=[];
    ends=[];
}

function remove_link(ab){
    if ( linkByName[ab] ){
	linkByName[ab].remove();
	delete linkByName[ab];
	ends.splice( ends, ends.indexOf(ab), 1);
    }
}

function show_links(){
    for ( var ab in linkByName ){
	linkByName[ab].addTo(mymap);
    }
}

function hide_links_by_color(color){
    for ( var ab in linkByName ){
	var link=linkByName[ab];
	if ( link.options.color === color){
	    link.remove(); // remove from map
	    linkHidden[ab]=true;
	} else if (linkHidden[ab]) {
	    link.addTo(mymap);	    
	    linkHidden[ab]=false;
	}
	    
    }
}

function show_links_by_color(color){
    for ( var ab in linkByName ){
	var link=linkByName[ab];
	if ( link.options.color === color){
	    link.addTo(mymap); // add to map
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
	    if ( linkHidden[ab] )
		linkByName[ab].addTo(mymap); // add to map
	}
	color_on[color]=false;
    } else {
	
	for ( var ab in linkByName ){
	    var link=linkByName[ab];
	    if ( link.options.color === color){
		if ( linkHidden[ab] )
		    link.addTo(mymap); // add to map
		link.bringToFront();
	    } else {
		link.remove(); // remove from map
		linkHidden[ab]=true;
	    }
	}
	for ( var c of colors)
	    color_on[c]=false;
	color_on[color]=true;
    }
}


  function focus_links( node, mode ){
    if ( mode === 'flip' && focus_node === node ){ // flip back
	focus_node = "";
	links_on=true;
	show_links();
	removeParam("node");
    } else {

	if ( focus_node !== "" && node !== focus_node ) { // redraw first
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
	    // Search for AS numbers specified
	    asn_search=true;
	    search=node.substr(1,node.length);
	}
	
	for ( var ab in linkByName ){
	    if (asn_search) {
		if ( ! linkByName[ab].asn_search || linkByName[ab].asn_search.indexOf(search) < 0) {
		    // AS num not available or not found
		    linkByName[ab].remove();
		}
	    } else if ( ab.indexOf(search) < 0 ){ // string not found
		if ( ! inverse )
		    linkByName[ab].remove();
	    } else { // string found
		if ( inverse )
		    linkByName[ab].remove();
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
	html += "<td width=200>" +
	    "<button class=knapp title='Push to hide/show other links' style=width:100%" + " id=legend" + i + " bgcolor="
	    + colors[i] + ">" + lower[i] + "</button></td>";
    }

    // Add dashboard button if configured
    if (! jQuery.isEmptyObject(conffile[parms.net].dashboardURL)) {
	html += '<td><button class=knapp title="Database dashboard" onclick=\'window.open("' + conffile[parms.net].dashboardURL + '", "_blank");\'>Dashboard</button>';
    }
    html +=  "</tr></table>";
    $("#legend").html(html);
    
    $("#farge0").click(  function () {
	// only_links_by_color(empty_color);
	/* better to see only grey
	if ( links_on ){
	    hide_links_by_color(empty_color);
	    links_on=false;
	} else {
	    links_on=true;
	    show_links_by_color(empty_color);
	} */
	only_links_by_color(empty_color);
    });
    for ( i in lower ){
	var id="legend"+i;
	$("#legend" + i).click( function(e){
	    only_links_by_color(this.attributes.bgcolor.value);
	    $("#tabs").tabs("option", "active", 0);

	    //hide_links_by_color(this.attributes.bgcolor.value);
	});
	$("#legend" + i).css( "background-color", colors[i] );
	color_on[colors[i]]=false;
    }
    
}

function gap_popup( div, link){
    const button = document.createElement("button");
    let etype = parms.event;
    button.innerHTML = "Top " + etype + "s";
    button.onclick = function(event) {
	let idiv;
	let etag = 'event ' + parms.event + parms.start + parms.period; // mark with tag to reuse data
	if ( this[etag]){ // cycle through top, all, hide
	    idiv = this[etag];
	    if ( this.innerText.substr(0,4) == 'Hide'){
		idiv.style.display = "none";
		this.innerText='Top';
	    } else {
		idiv.style.display = "block";
		if ( this.innerText.substr(0,3) == 'All'){
		    idiv.innerHTML=gap_list( link.from, link.to, idiv['hits'+parms.event] );
		    this.innerText='Hide';
		} else { // top
		    idiv.innerHTML=gap_list( link.from, link.to, idiv['hits'+parms.event], 10, 'num_desc');
		    this.innerText='All';
		}
	    }
	    this.innerText += ' ' + etype + 's'; 
	    sorttable.makeSortable( div.getElementsByClassName('sortable')[0] );
	    mymap._popup.update();
	} else {
	    idiv = document.createElement("div");
	    idiv.classList.add("sprettopp");
	    //idiv.classList.add("popupList");
	    button.classList.add("knapp");
	    div.appendChild(idiv);
	    this[etag]=idiv; // store reference
	    get_peer_data( link.from, link.to, idiv);
	    this.innerText='All ' + etype +'s';
	}
    }
    div.appendChild(button);
}


function link_popup(link){
    // Prepare HTML content for popup windows to appera when clicking on links
      
    var dato = $("#datepicker").val();
    var html = make_tooltip_v2(link.from + ' to ' + link.to, link);

    var to_adr=link.to; // aggregations don't have *_adr.
    if (link.to_adr)
	to_adr=link.to_adr;
    else if ( name_to_ip[link.to] )
	to_adr = name_to_ip[link.to];
    
//    var url = 'tracetree.html?topo=/' + parms.net + '/mp/' + link.from + '/' +  dato
//	+ '/trace/' + to_adr + '1.json' + '&to=' + link.to;
//    if (! jQuery.isEmptyObject(conffile[parms.net].event_type[parms.event].popup.see_routes)) {
//	// Add traceroute type prefix
//	url += "&prefix=" + conffile[parms.net].event_type[parms.event].popup.see_routes;
//    }
    var url = '/pstracetree/ls.html?mahost=localhost:443&verify_SSL=0&from=' + name_to_ip[link.from] + '&to=' + name_to_ip[link.to] +'&time-start=' +  dato;
    html +='\nSee ';
    html += '\n<button class=knapp onclick="window.open(\'' + url +'\');" title="See the routes graph and stats in this period">Routes'  + '</button>' + "\n";

    const div = document.createElement("div");
    div.classList.add("sprettom");
    div.innerHTML = html;

    gap_popup( div, link);

    url = 'curve-chart.html?net=' + parms.net + '&index=' + parms.net + '_jitter&from=' + link.from + '&to=' + link.to + '&event=jitter&property=h_ddelay&start=' + start + '&end=' + end + "&title=From " + link.from + " to " + link.to ;
    html += '<br>Plot <button class=knapp onclick="window.open(\'' + url +'\');"Curve over queues in this period">Queues</button>' + "\n";

    url='curve-chart.html?net=' + parms.net + '&index=' + event_index[parms.event] + '&from=' + link.from + '&to=' + link.to + '&event=' + parms.event + '&property=' + parms.property + '&start=' + start + '&end=' + end + '&title="From ' + link.from + ' to ' + link.to + ' for ' + parms.property + '"';
    html += '\n<button class=knapp><a title="Detailed report for report" target="_blank" href="' + url + '">' + prop_desc[parms.property] + '</a></button>' + "\n";

    let tail=document.createElement("div");
    tail.innerHTML = html;
    div.appendChild(tail);


    // if( parms.debug) console.log(knapp);
    // html += knapp;

    // html += '<p>' + gap_list(link.from, link.to);
    // html += ' <button class=knapp onclick=console.log(window.parent.name);console.log(window.name);window.parent.gap_list("' + link.from + '","' + link.to + '");' + '>Gap list</button>';

    /*
    html += '\n<p>Focus on: ';
    var abs=[link.from,link.to].join();
    // html += '<button class=knapp id="' + abs + '-from">' + link.from + '</button>';
    // html += '<button class=knapp id="' + abs + '-to">' + link.to   + '</button>';
    html += '<button class=knapp><a href=' + fix_url( document.location.href, "node", link.from ) + '>' + link.from + '</a></button>';
    html += ', <button class=knapp><a href=' + fix_url( document.location.href, "node", link.to ) + '>' + link.to + '</a></button>';
    */
    // html+='</body>';
    return div;
}

  function make_tooltip_v2(title, link){
      // Create summary table (based on config file) intended for top part of popup windows
      if (! jQuery.isEmptyObject(conffile)) {
	  var nrows=0;
	  var tip="<table width=100%><caption><b>" + title + '</b></caption>';
	  if ( selected_date_is_today_or_future() ) {
	      // Only digested summary of none-summary properties is available.
	      for (const sum_var in conffile[parms.net].event_type[parms.event].field) {
		  if ( typeof link[sum_var] != 'undefined' ) {
		      var prop_value = Math.round((link[sum_var] + Number.EPSILON) * 100) / 100;  // Round off to (max) 2 decimals
		      tip+= '<tr><td>' + prop_desc[sum_var] + '<td align=right>' + prop_value; 
		      nrows++;
		  }
	      }
	  } else {
	      for (const sum_var of conffile[parms.net].event_type[parms.event].popup.summary) {
		  //ok var sum_var = conffile[parms.net].event_type[parms.event].popup.summary[s];
		  if ( typeof link[sum_var] != 'undefined' ) {
		      var prop_value = Math.round((link[sum_var] + Number.EPSILON) * 100) / 100;  // Round off to (max) 2 decimals
		      tip+= '<tr><td>' + prop_desc[sum_var] + '<td align=right>' + prop_value; 
		      nrows++;
		  }
	      }
	  }
	  if ( nrows > 0 ){
	      tip+="</table>";
	  } else {
	      tip="<b>" + title + "</b>";
	  }
	  return tip;
	      
      } else {
	  // Return default (legacy) summary content 
	  return make_tooltip(title, link)
      }
  }
  
function make_tooltip(title, link){
    var nrows=0;
    var tip="<table width=100%><caption><b>" + title + '</b></caption>';
    if ( link.big_time){
	tip+= '<tr><td>Sum downtime(s)<td align=right>' + ( link.big_time + link.small_time ).toFixed(1) 
    	    + '<tr><td>Sum gaps(#)<td align=right>' + ( parseInt( link.small_gaps) + parseInt( link.big_gaps) );
    }
    for ( var prop of prop_names){
	if ( prop in link ){
	    var desc=prop_desc[prop] != null ? prop_desc[prop] : "no description";
	    // var val=  ! isNaN(link[prop]) ? link[prop].toFixed(1) : 'no data';
	    var val = link[prop];

	    if ( isNaN(link[prop]) ){
		 ; // som text value
	    } else {
		let pname = prop;
		// if ( prop_sum.indexOf(prop) >= 0 && link[prop + "_sum"] )
		//    pname=prop + "_sum";
		try {val = parseFloat( link[pname] ).toFixed(1) ; }
		catch(e) {
		    console.log('Invalid value of "' + title + '" prop:' + pname + ' val:' + link[pname] );
		}
		nrows++;
	    }
	    tip+= "<tr><td>" + desc +  '<td align=right>' + val + "\n";

	    if ( prop === "down_ppm" && typeof link[prop] == 'number' ){
		tip+= "<tr><td>" + "Unavail (sec/day)" +  '<td align=right>' +
		    ( link[prop] * 86400 / 10**6 ).toFixed(1) + "\n";
	    }
	} else {
	    console.log('Invalid property ' + prop + ' of ' + title );
	}
    }
    if ( nrows > 0 ){
	tip+="</table>";
    } else {
	tip="<b>" + title + "</b>";
    }
    return tip;
}

function link_tooltip( title, link, prop){
    if ( prop in link){
	var val=link[prop];
	var tip='<b>' + title + '</b>' + "<p>" + prop_desc[prop] + ": " ;
	if ( typeof(val) !== "string" ){
	    tip += val.toFixed(1);
	    if ( prop === "down_ppm" && typeof link[prop] == 'number' ){
		tip+= " ( " + ( val * 86400 / 10**6 ).toFixed(0) + " sec/day )";
	    }
	}
    } else {
	tip += "undef";
    }	
    return tip  ;
}


function gap_list( from, to, hits, lines, sort_type){
    var etype, html;
    var n=0; //  line number

    // sort descending on tloss
    if ( sort_type){
	// let sort_col = conffile[parms.net].event_type[parms.event].popup.table[0];
	let sort_col = conffile[parms.net].event_type[parms.event].default_field;
	hits.sort( function(a,b){
	    if ( sort_type === 'num_desc')
		return b._source[sort_col] - a._source[sort_col];
	    else // num_asc
		return a._source[sort_col] - a._source[sort_col];
	} );
    }

    for ( var hit of hits){
	var gap = hit._source;
	if ( ! etype) { // take first record as defining
	    etype = gap.event_type;
	    var amount_head = etype === "gap" ? "Queue(ms)" : "Cause";
	    html="<table class=sortable><thead><td>Day Time<td>Lost(s)<td>" + amount_head + "</thead>";
	    if (! jQuery.isEmptyObject(prop_desc)) {
		// Config from file available. Build table header row.
		html="<table class=sortable><thead title=\"Click to sort on column\"><th>Day Time";
		for (const col in conffile[parms.net].event_type[etype].popup.table) {
		    // Prepare colum heading with popup title text.
		    var title_text = "";
		    if (typeof prop_long_desc[conffile[parms.net].event_type[etype].popup.table[col]] != "undefined") {
			title_text = prop_long_desc[conffile[parms.net].event_type[etype].popup.table[col]];
		    }
		    html += "<th  title='" + title_text + "'>" + prop_desc[conffile[parms.net].event_type[etype].popup.table[col]];
		}
		html += "</thead>";
	    }
	}
	if ( gap.from === from && gap.to === to ){
	    var d = new Date( Number(gap.timestamp * 1000) );
	    var tid = zero_fill( d.getDate() ) + " " + zero_fill( d.getHours() ) + ":" + zero_fill( d.getMinutes() ); // ddhh

	    var syslog_url = 'https://iou2.uninett.no/es-syslog-lookup/es-syslog-lookup.cgi?syslogwindow=3600&epoch=1&redirect=1'
		+ '&timestamp=' + gap.timestamp 
		+ '&from=' + gap.from_adr + '&to=' + gap.to_adr + '&ip=1';
	    var telemetry_url = 'https://telemetri.uninett.no/telemetri-lookup/telemetri-lookup.cgi?telemetrywindow=60'
                  + '&redirect=1&timestamp=' + gap.timestamp
		  + '&from=' + gap.from_adr + '&to=' + gap.to_adr + '&ip=1';
	    var telemetry_href = tid;
	    var sec;
	    if ( etype === "gap"){
		sec = ( gap.tloss / 1000 ).toFixed(1);
	    } else if ( etype === "routeerr" )
		sec = ( gap.duration ).toFixed(1);
	    var syslog_href= sec;
	    var tail="";
	    if ( $("#network").val() === "uninett" ){
	        syslog_href = '<a title="See router logs" href="' + syslog_url + '" target=_blank>' + "Log" + '</a>';
	        telemetry_href = '<a title="See telemetry data" href="' + telemetry_url + '" target=_blank>' + "Mon" + '</a>';
		tail =  "<td><button class=knapp>" + syslog_href + "</button>"
		    + "<td><button class=knapp>" + telemetry_href + "</button>";
	    }
	    var amount;
	    if ( etype === "gap"){
		amount = gap.h_ddelay;
		if ( typeof amount == "number") amount = amount.toFixed(1) ;
	    } else if ( etype === "routeerr" ){
		//amount = typeof gap.icmp_errors === "undefined" ? "" : JSON.stringify( gap.icmp_errors );
		amount = gap.cause + " " + gap.last_reply_from; 
	    }

	    if (! jQuery.isEmptyObject(event_desc)){
		// Config from file available. Add table row.
		html += "<tr><td>" + tid;
		for (const col in conffile[parms.net].event_type[etype].popup.table) {
		    if (typeof gap[conffile[parms.net].event_type[etype].popup.table[col]] != "undefined" ) {
			var value_tooltip_field = conffile[parms.net].event_type[etype].field[ conffile[parms.net].event_type[etype].popup.table[col] ].mouseover;
			var value_tooltip = "";
			if (typeof value_tooltip_field != "undefined" ) {
			    // Get value of other field for mouse-over tooltip in current field.
			    value_tooltip = gap[ value_tooltip_field ];
			}
			html += "<td align=right title='" + value_tooltip + "' >" + gap[conffile[parms.net].event_type[etype].popup.table[col]];
		    } else {
			html += "<td align=right>-";
		    }
		}
		html += "<td>" + tail + "\n";
	    } else {
		//html += "<tr><td>" + syslog_href + "<td>" + telemetry_href + "<td>" + gap.h_ddelay.toFixed(1) + "<td>" + "\n";
		html += "<tr><td>" + tid +  "<td align=right>" + sec + "<td align=right>" + amount + "<td>" + tail + "\n";
	    }
	    if ( lines &&  n >= lines) break;
	    n++;
	}
    }
    html += "</table>";
    if (n>0)
	return(html);
    else
	return("No events.");
    /* not reached :
    $("#dialog").html(html);
    $("#dialog").dialog("open");
    */

}
// summarize gap and jitter records into gapsum format
  function digest_es_data(etype, hits){
      var stat=[]; // numeric stats
      var msg=[];  // text lists
    var digest=[];

    for (var i=0; i < hits.length; i++){
	var event = hits[i]._source;
	if ( event.event_type === etype){
	    var ab = event.from + "," + event.to;
	    
	    if ( ! (ab in stat) ){ // first record for event
		stat[ab]=[];
		stat[ab].from = event.from;
		stat[ab].to = event.to;
		for ( const prop of prop_names_list[etype]){
		    stat[ab][prop]=new stats();
		}
		msg[ab]=[];
		msg[ab].from = event.from;
		msg[ab].to = event.to;
		for ( const prop of prop_names_list[etype]){
		    msg[ab][prop]=[];
		}
	    }
	    // accumulate values
	    for ( const prop of prop_names_list[etype] ){
		let value=event[prop];
		if ( typeof(value) === "undefined" )
		    value="";
		else if ( typeof value === "object" )
		    value = JSON.stringify(value);
		if ( typeof value === "string"){
		    if ( msg[ab][prop].indexOf( value) < 0 )
			msg[ab][prop].push(value);
		} else {
		    stat[ab][prop].add( value );
		}
	    }
	}
    }
    // make stats
    for ( const ab in stat ){
	var rec={ from: stat[ab].from, to: stat[ab].to};
	for ( const prop of prop_names_list[etype] ){
	    if ( stat[ab][prop].n > 0 ){
//		if ( prop_sum.indexOf(prop) >= 0 )
		//		    rec[prop]=stat[ab][prop].sum;
		if ( prop in prop_aggr ) {
		    // Variable (property) has aggregation method specified
		    switch (prop_aggr[prop]) {
		    case "sum":
			rec[prop]=stat[ab][prop].sum
			break;
		    case "avg":
			rec[prop]=stat[ab][prop].average()
		    case "max":
			rec[prop]=stat[ab][prop].max();
			break;
		    case "min":
			rec[prop]=stat[ab][prop].min();
			break;
		    default:
			console.log("Unsupported aggregation method " + prop_aggr[prop] + ". Applying average.");
			rec[prop]=stat[ab][prop].average()
		    }
		} else {
		    console.log("Aggregation method unspecified. Applying average.");
		    rec[prop]=stat[ab][prop].average()
		}
		rec[prop]=Math.round((rec[prop] + Number.EPSILON) * 100) / 100;  // Round off to (max) 2 decimals
		rec[prop + "_max"] = stat[ab][prop].max();
		rec[prop + "_sum"] = stat[ab][prop].sum; 
	    } else {
		rec[prop] = msg[ab][prop].join();
	    }
	}
	if ( stat[ab].tloss ){
	    rec.down_ppm = ( stat[ab].tloss.sum * 1000000 / 1000 / period_length );
	}
	
	digest.push( {_source: rec} );
    }
    return digest;
}

function count_aggregates(aggs){
    var n = 0;
    var from_buckets=aggs.from.buckets;
    for (var i=0; i < from_buckets.length; i++){
    	n += from_buckets[i].doc_count;
    }
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

	    for ( const prop in to_buckets[j] ){ // go through names
		if ( typeof( to_buckets[j][prop] ) === 'object' ) { // stats record
		    rec[prop]= to_buckets[j][prop]['values'][stats_type];
		    //rec[prop + "_max"]=to_buckets[j][prop].max;
		}
	    }
	    digest.push( {_source: rec} );
	}	
    }
    return digest;
}


/* function to draw links from stats data */


function draw_links(hits, prop){
    // remove_links(links);
    get_thresholds(hits, prop);
    update_legend(prop_desc[prop],threshes);
    hits.sort(sort_hits); // sort by from, to
    var new_ends=[];

    for (var i=0; i < hits.length; i++){
	var link=hits[i];
	var abs=[link._source.from, link._source.to];
	var ab=link._source.from + "," + link._source.to;
	new_ends[ab]=1;

	// if ( ! ( parms.node && ! (abs.indexOf( parms.node) >= 0) ) ){ // only with node
	if ( focus_node === "" || abs.indexOf(focus_node) >= 0 ){
	    var color=get_color( link._source[prop], threshes);

	    if ( ! linkByName[ab]){ // draw line
		var tooltip= link_tooltip( link._source.from + " to " + link._source.to , link._source, prop );

		var l=draw_link(abs, color, tooltip, link_popup(link._source) );
		if (l){
		    links.push(l);
		    linkByName[ab]=l;
		    ends.push(abs);
		    l.on("mouseover", function(e){
			if (! mouseover) {
                            mouseover = true;  // Flag required since mouseover is retriggered as long as the mouse hovers over a link
 			    color_store[e.target.leaflet_id]=e.target.options.color;
			    e.target.bringToFront();
			    taint_link(e.target,"blue");
			}
		    });
		    l.on("mouseout", function(e){
			taint_link(e.target, color_store[e.target.leaflet_id]);
			mouseover=false;
		    });
		}
	    } /* else { // no need to redraw
		taint_link(linkByName[ab], color);
	    } */
	} else {
	    // console.log('### draw_link: excluded ' + ab);
	    n_excluded++;
	    remove_link(ab);		
	}
    }
    // remove  stale links 
    for (var i=0; i < ends.length; i++){
	if ( ! new_ends[ ends[i]] ) {
	    remove_link(ends[i]);
	}
    }
    // refocus map 
    /* if (mymap){
	var group = new L.featureGroup(links);
	mymap.fitBounds(group.getBounds());
    } // else alert("undefined map");
    */
    
    taint_links(hits, prop);
}

function get_topology(source = "archive"){
    // Fetch topology data from relevant source
    // and initiate drawing of topology
    
    let start = new Date($("#datepicker").val() + " 00:00:00").getTime()/1000;
    let start_iso = new Date($("#datepicker").val() + " 00:00:00").toISOString();
    let end= new Date($("#datepicker").val() + " 23:59:59").getTime()/1000;
    let end_iso = new Date($("#datepicker").val() + " 23:59:59").toISOString();
    var network=parms.net;

    switch (source) {
	
    case "sqlite-db":
	// Ask for topology-info from (legacy) sqllite db 
	var url="microdep-config.cgi?secret=\"" + conffile[parms.net].database_secret + "\"&variant=mp-" + network + "&start=" + start + "&end=" + end;
	$.getJSON( url,
		   function(topology){
		       draw_topology( topology );
		       get_connections();
		       // draw_topology( duplex_topology( topology) ); 
		   }).fail( function( jqxhr, textStatus, error ) {
		       var err = textStatus + ", " + error;
		       console.log( "Request" + url + " Failed: " + err );
		   });
	break;
	
    case "archive": 
	// Fetch all unique from-to peers (flows) for time period from Opensearch archive
	var url = conffile[parms.net].archive + "/" + conffile[parms.net].event_type.topology.index + "/_search";
	var query = JSON.stringify ({ "query": { "range": { "@date": { "gte": start_iso,  "lt": end_iso  } } },
		      "size": 0,
		      "aggs": { "peer": { "terms": { "field": "from_to.keyword", "size" : 1000000  } } }
				    });
	$.post( {url: url, data: query, contentType: "application/json", dataType: "json", success: 
		   function(result){
		       var topology = [];
		       if (! result.aggregations.peer.buckets.length) {
			   console.log("No topology data returned from archive for time period " + start + " to " + end + ". Trying sqlite db ...");
			   // No topology data returned. Try sqlite-db instead.
			   get_topology("sqlite-db");
		       } else {
			   for (var p=0; p < result.aggregations.peer.buckets.length; p++) {
			       topology.push(result.aggregations.peer.buckets[p].key.split("_"));
			   }
			   draw_topology( topology );
			   get_connections();
			   // draw_topology( duplex_topology( topology) );
		       }
		   }, fail: function( jqxhr, textStatus, error ) {
		       var err = textStatus + ", " + error;
		       console.log( "Request" + url + " Failed: " + err );
		   } } );

	break;
    }
	
}

// done by api
function duplex_topology(topo){
    var dup=[];
    for ( var link of topo ){
	dup.push( [ link[1], link[0] ] );
    }
    return topo.concat(dup);
}

var mouseover=false; 

function draw_topology(topo){
    if (topo.length == 0) {
	// Empty topology. Remove all links.
	remove_links(links);
    }
    var new_ends=[];

    for (var i=0; i < topo.length; i++){
        var abs=topo[i];
	var ab= abs[0] + "," + abs[1];
	// new_ends.push(ab);
	new_ends[ab]=1;

	if ( ! linkByName[ab]){ // draw line

	    var l=draw_link(abs, empty_color, ab, ab );
	    if (l){
		links.push(l);
		linkByName[ab]=l;
		ends.push(abs);
		l.on("mouseover", function(e){
		    if (! mouseover) {
			mouseover = true;  // Flag required since mouseover is retriggered as long as the mouse hovers over a link
			color_store[e.target.leaflet_id]=e.target.options.color;
			e.target.bringToFront();
			taint_link(e.target,"blue");
		    }
		});
		l.on("mouseout", function(e){
		    taint_link(e.target, color_store[e.target.leaflet_id]);
		    mouseover=false;
		});
	    }
	}  else { // no need to redraw
	    // console.log("link already there : " + ab);
	    taint_link(linkByName[ab], empty_color);
	} 
    }

     // remove  stale links 
    for (var i=0; i < ends.length; i++){
	if ( ! new_ends[ ends[i]] ) {
	    remove_link(ends[i]);
	}
    }
    
    ends=new_ends;
    links_on=true;
    
    // refocus map 
    /* if (mymap){
	var group = new L.featureGroup(links);
	mymap.fitBounds(group.getBounds());
    } // else alert("undefined map");
    */
    
    //taint_links(hits, prop);
}

function taint_topology( topo, prop){
    get_thresholds(topo, prop);
    update_legend(prop_desc[prop],threshes);

    for (var i=0; i < topo.length; i++){
	var link=topo[i];
	var ab=[link._source.from, link._source.to];
	if ( linkByName[ab] ){
	    var color=get_color( link._source[prop], threshes);
	    taint_link( linkByName[ab], color );

	    var popup=link_popup(link._source);
	    var tooltip= link_tooltip( link._source.from + " to " + link._source.to , link._source, prop );
	    annotate_link( ab.join(), linkByName[ab], tooltip, popup );
	}
    }

}

function taint_links( hits, prop){
    var done=[];

    if ( hits.length > 0){
        get_thresholds(hits, prop);
	update_legend(prop_desc[prop],threshes);

	for (var i=0; i < hits.length; i++){
	    var link=hits[i];
	    var ab=[link._source.from, link._source.to];
	    // if ( link._source.from_adr === "185.71.209.4" ) ab[0]="runar-mp";
	    // if ( link._source.to_adr === "185.71.209.4" ) ab[1]="runar-mp";
	    var abs = ab.join();

	    done[abs]=1;
	    if ( linkByName[abs] ){
		var color=get_color( link._source[prop], threshes);
		taint_link( linkByName[abs], color );
//		dash_link(linkByName[abs], false); // Remove dashed-mode link if set
		
		var popup=link_popup(link._source);
		var tooltip= link_tooltip( link._source.from + " to " + link._source.to , link._source, prop );
		annotate_link( abs, linkByName[abs], tooltip, popup );
	    } else {
		console.log("Property " + prop + " reported on unexpected link " + abs + ". Adopting and presenting it anyway.");
	        // Draw missing link 
		var color=get_color( link._source[prop], threshes);
		var tooltip= link_tooltip( link._source.from + " to " + link._source.to , link._source, prop );
		    
		var l=draw_link(abs.split(","), color, tooltip, link_popup(link._source) );

		if (l){
		    //		    dash_link(l);        // Turn out to be complicated to toggle correctly !
		    linkByName[abs]=l;
		    links.push(l);
		    ends.push(abs);
		    l.on("mouseover", function(e){
			if (! mouseover) {
			    mouseover = true;
			    color_store[e.target.leaflet_id]=e.target.options.color;
			    e.target.bringToFront();
			    taint_link(e.target,"blue");
			}
		    });
		    l.on("mouseout", function(e){
			taint_link(e.target, color_store[e.target.leaflet_id]);
			mouseover = false;
		    });
		}
	    }
	}
    }

    for ( var abs in ends ){ 
	if ( ! done[abs]){ // links without data
	    if ( linkByName[abs] ){
		var ft = abs.split(",");
		taint_link( linkByName[abs], empty_color );
		annotate_link( abs, linkByName[abs], abs + ': no data', link_popup( {"from":ft[0], "to":ft[1]} ) );
	    }
	}
    }
    refresh_links_by_color();
    /* filter links */
    if ( $("#search_input").val() !== "" )
	focus_links( $("#search_input").val(), 'noflip' ); 
}

function taint_link( link, color ){
    if (link){
	link.setStyle( {"color": color} );
    }
}

function dash_link( link, dash=true){
    // Make a link dashed 
    if (link){
	if (dash) {
	    link.setStyle( { "dashArray": "10 10" });
	} else {
	    link.setStyle( { "dashArray": "" });
	} 
    }
}
  
function annotate_link(abs,link, tooltip, popup){
    if (link){
	link.bindTooltip( tooltip, {"sticky":true} );
	link.bindPopup( popup );
    }
    $("#" + abs + '-from' ).on('click', "button.knapp" , function( e){
	focus_links(e.id, 'flip');
    });
    $("#" + abs + '-to' ).on('click', "button.knapp" , function( e){
	focus_links(e.id, 'flip');
    });
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
	if ( distance < 5000000) { // 500 mil
	    mp1 = latlon1.midpointTo(latlon2);
	} else {
	    mp1 = new LatLon ( latlon1.lat + (latlon2.lat - latlon1.lat) / 2,
			       latlon1.lon + (latlon2.lon - latlon1.lon) / 2 );
	}
        let bearing = mp1.initialBearingTo(latlon2);
        if ( typeof bearing === "undefined" || isNaN(bearing) ) {
	    console.log( "No bearing for ends " + ends + " : latlon1: "+latlon1,", latlon2: ",latlon2);
            return(0);
        }

	let sign=1;
	if (! duplines[line_name] ) {
	    duplines[line_name]=0;
	} else {
	    if (duplines[line_name] % 2 ){
		sign=1;
	    }
	}

	let bearing_offset = sign * ( 5 * ( 1+ ++duplines[line_name]) + ( 5 * Math.random())*10 );
	if ( middle_point[inverse_line]){
	    cp1 = middle_point[inverse_line];
	    utslag = line_utslag[inverse_line];
	} else {
	    utslag= ( Math.random() - 0.5 )/ 10 ;
	    if ( distance < 5000000 ){
		cp1 = latlon1.destinationPoint((distance/2), bearing + bearing_offset);
	    } else {
		cp1 =new LatLon( mp1.lat + (latlon2.lat - latlon1.lat) * utslag,
				 mp1.lon + (latlon2.lon - latlon1.lon) * utslag );
	    }
	    if (parms.debug){
		var m=L.circle([cp1.lat,cp1.lon], {weight:6, radius:100, color:"blue"})
		    .addTo(mymap).bindTooltip('cp1 '+line_name);
	    }
	}
	middle_point[line_name]=cp1;
	line_utslag[line_name]=utslag;
	
	var mid = cp1.midpointTo(latlon2);
	var dist2=(0+(cp1.distanceTo(latlon2)));

	if ( line_bearing[inverse_line]){
	    bear2 = 360 - line_bearing[inverse_line] % 360;
	} else {
	    bear2 = bearing;
	    // bear2 = cp1.initialBearingTo(latlon2);
	}
	line_bearing[line_name]=bear2;
	
	if ( distance < 50000000 ){
	    cp2 = cp1.destinationPoint((dist2/2), bearing + bearing_offset);
	} else {
	    cp2 =new LatLon( mp1.lat + (latlon2.lat - mp1.lat) * utslag,
				 mp1.lon + (latlon2.lon - mp1.lon) * utslag );

	}


	if (parms.debug){
	    console.log(ends + [[cp2.lat, cp2.lon], [latlon2.lat, latlon2.lon]] + ' dist: ' + distance);
	    var m=L.circle([cp2.lat,cp2.lon], {weight:6, radius:100, color:"red"}).addTo(mymap).bindTooltip('cp2 '+line_name);
	    var m=L.circle([mp1.lat,mp1.lon], {weight:6, radius:100, color:"violet"}).addTo(mymap).bindTooltip('mp1 '+line_name);
	}
	var line;
	if (parms.curve === 'line' )
	    line =L.polyline( [mid, latlon2], {color: color, weight:6, renderer: myRenderer});
	else
	    line = L.curve(['M', [cp1.lat, cp1.lon], 'Q', [cp2.lat, cp2.lon], [latlon2.lat, latlon2.lon] ],
			   { color: color, fill: false, weight:6 /*, renderer: myRenderer */ });
	if (line)
	    line.addTo(mymap);
	else
	    console.log('Line draw failed ' + line_name);
	
	line.bindTooltip(tooltip, {"sticky":true});
	line.bindPopup(popup,{ maxHeight: "800", maxWidth:"800", keepInView: true, autoClose: true      });
    } else {
	console.log("no coords for ends" + ends.length + ' ends ' + ends + ' coords ' + latlon1 + ' - ' + latlon2);
    }
    return(line);
}

function get_node_query(tofrom, start, end) {
    // Produce a JSON string for querying node info from Opensearch
    return JSON.stringify( { "query": { "range": { "@date": { "gte": start, "lt": end } } }, "size": 0, "aggs": { "nodes": { "terms": { "field": tofrom + ".keyword", "size" : 10000  }, "aggs": { "ip": { "terms": { "field": tofrom + "_adr.keyword"}}, "city": { "terms": { "field": tofrom + "_geo.city_name.keyword"}}, "lat": { "avg":  { "field": tofrom + "_geo.latitude" } },  "lon": { "avg":  { "field": tofrom + "_geo.longitude" } } } } } } );
}
function load_coords(network, service, goal){
    // Load global coordinate for nodes in topology

    if ( service === "topoevents" ) {
	// Extract and load coordinates from topology-events fetched from archive db (Opensearch)
	var start_iso = new Date($("#datepicker").val() + " 00:00:00").toISOString();
	var end_iso = new Date($("#datepicker").val() + " 23:59:59").toISOString();
	// Query for both source (from) nodes and destination (to) nodes
	var query_index = JSON.stringify( { "index": conffile[parms.net].event_type.topology.index }); 
	var query_fromnodes = get_node_query( "from", start_iso, end_iso);
	var query_tonodes = get_node_query( "to", start_iso, end_iso);
	var query = query_index + '\n' + query_fromnodes + '\n' + query_index + '\n' + query_tonodes + '\n';
	var url = conffile[parms.net].archive + "/_msearch";

	$.post( {url: url, data: query, contentType: "application/json", dataType: "json", success: 
		   function(result){
		       for (var r = 0; r < result.responses.length; r++) {
			   for (var n=0; n < result.responses[r].aggregations.nodes.buckets.length; n++) {
			       // Add node info to points structure
			       var p={};
			       p.id = result.responses[r].aggregations.nodes.buckets[n].key;
			       if (typeof result.responses[r].aggregations.nodes.buckets[n].city.buckets[0] != "undefined" ) {
				   p.name = result.responses[r].aggregations.nodes.buckets[n].city.buckets[0].key;  // Grab first city in list (if any)
			       } else {
				   p.name = p.id;
			       }
			       p.lat = result.responses[r].aggregations.nodes.buckets[n].lat.value ?? "0.0" ;  
			       p.lon = result.responses[r].aggregations.nodes.buckets[n].lon.value ?? "0.0" ;
			       reg_ip_adr(p.id, result.responses[r].aggregations.nodes.buckets[n].ip.buckets[0].key );  // Register first ip in list (and forget the rest, if any)
			       let point_already_loaded = points.find(o => o.id === p.id);
			       if (! point_already_loaded) {
				   points.push( p);
			       } else {
				   console.log( "Duplicate node info for node " + p.id );
			       }
			   }
		       }
		       if ( ! result.responses.length ) {
			   console.log("No node data returned from archive for time period " + start_iso + " to " + end_iso + ".");
		       }
		       loads++;
		       if (loads >= goal) {
			   // All other calls to load_coords() have completed.
			   loads=0;
			   show_map(network);
			   get_topology();
		       }
		   }, fail:  function( jqxhr, textStatus, error ) {
		       var err = textStatus + ", " + error;
		       console.log( "Request" + url + " Failed: " + err );
		       loads++;
		   } } );
	return;
    } 

    if ( service === "db" ) {
	// Load coordinates from config db
	start = new Date($("#datepicker").val() + " 00:00:00").getTime()/1000;
	end= new Date($("#datepicker").val() + " 23:59:59").getTime()/1000;
	var network=parms.net;
	var url="microdep-config.cgi?mode=nodes&secret=virre-virre-vapp&variant=mp-" + network + "&start=" + start + "&end=" + end;
	$.getJSON( url,
		   function(nodes){
		       for ( var n=0; n < nodes.length; n++) {
			   // Add node info to points structure
			   var p={};
			   p.id = nodes[n][0];
			   p.name = nodes[n][1];
			   p.lat = nodes[n][2];
			   p.lon = nodes[n][3];
			   reg_ip_adr(p.name, nodes[n][4]);
			   let point_already_loaded = points.find(o => o.id === p.id);
			   if (! point_already_loaded) {
			       points.push( p);
			   } else {
			       console.log( "Duplicate node info for node " + p.id );
			   }
		       }
		       loads++;
		       if (loads >= goal) { // i.e. wait until data loaded
			   loads=0;
			   show_map(network);
			   get_topology();
		       }  
		   }).fail( function( jqxhr, textStatus, error ) {
		       var err = textStatus + ", " + error;
		       console.log( "Request" + url + " Failed: " + err );
		       loads++;
		   });
	return;
    } 

    //$.getJSON("https://kind.uninett.no/api/ansible_inventory.json?tjenester="+service,
    var url= "./" + network + "/" + network + "-" + service + "-geo.json";
    $.getJSON( url,
	function(tjenester){
	    if ( "_meta" in tjenester ){
		$.each(tjenester._meta.hostvars, function(id, host){
		    if( host.utm){
		      var utm=host.utm.split(" ");
		      var utm_o = L.utm( { x:utm[2], y:utm[1], zone: utm[0], band:"N" } );
		      var latlon = utm_o.latLng();

		      var ytid=id; 
		      if ( id.indexOf("ytelse") >= 0){ // kutt uninett.no pga db
			  ytid = id.substr(0, id.indexOf(".uninett.no") );
		      }
			points.push( {id:ytid, name:host.nettinstallasjon, lat:latlon.lat, lon:latlon.lng });
		    }
		  });
	    } else { // assume array of points
//		points = points.concat(tjenester);
		for (var t=0; t<tjenester.length; t++) {
		    let point_already_loaded = points.find(o => o.id === tjenester[t].id);
		    if (! point_already_loaded) {
			// Add new point (node / vertex)
			points.push( tjenester[t]);
		    } else {
			console.log( "Duplicate node info for node " + t.id );
		    }
		}
	    }
	    loads++;
	    if (loads >= goal) { // i.e. wait until data loaded
		loads=0;
		show_map(network);
		get_topology();
	    }  

	}).fail( function( jqxhr, textStatus, error ) {
	    var err = textStatus + ", " + error;
	    console.log( "Request" + url + " Failed: " + err );
	    loads++;
	});

}


function show_network(network){
    points=[];
    if ( network in points_cache){
	points=points_cache[network];
	show_map(network);
    } else {
	// Exctract node coordinates from topology events
	load_coords(network, "topoevents", 5);
	// Load node coordinates from config db
	load_coords(network, "db", 5);
	// Load node coordinates from json files
	load_coords(network, "base", 5);
	load_coords(network, "extra", 5);
	load_coords(network, "cnaas", 5);
	// NOTE: Last arg (int) must equal no of consequtive calls to 'load_coords'
    }
}

			 
function get_coords(end){
    var coords, i;

    for (i=0; i < points.length; i++){
	var p=points[i];
	if ( p.id === end ){
	    coords=new LatLon(p.lat,p.lon);
	    return coords;
	}
    }
    // if not found . make fake location
    var p={id:end, name:end, lat:no_coords.lat, lon:no_coords.lon};
    points.push( p);
    make_markers( $("#network").val(), [p], false);
    return no_coords;  // find fake location
}

function sort_missing(a ,b){
    var aa=a.split(" ");
    var bb=b.split(" ");
    if ( aa[0] === bb[0]){
	return aa[1].localeCompare( bb[1] );
    } else {
	return aa[0].localeCompare( bb[0] );	
    }
}

function check_ends(){
    var html= '<h2>Missing opposite end of links</h2>';
    html += '<table><tr><th>From<th>To';
    var ab=[], i;
    var nok=0, nmiss=0, missing=[];

    for (i=0;i<ends.length;i++){
	a=ends[i][0] + ' ' + ends[i][1];
	ab[a]=true;
    }
    for (i=0;i<ends.length;i++){
	var b=ends[i][1] + ' ' + ends[i][0];
	if (ab[b]){
	    nok++;
	} else {
	    // console.log( "Missing link : " + b);
	    missing.push(b);
	    nmiss++;
	}
    }
    missing.sort(sort_missing);
    for (i=0; i< missing.length; i++){
	var ft=missing[i].split(" ");
	html+='<tr><td>' +ft[0] + '<td>'+ ft[1];

    }
    // console.log("Ok " + nok + " Missing " + nmiss );
    html+='</table>';
    html+='<p>' + "Ok " + nok + " Missing " + nmiss;
    $("#missing").html(html);
    $("#missing").dialog("open");
    // alert(html);

}

  function sort_diff(a , b){
    //  return
    var aa=a.split(" ");
    var bb=b.split(" ");
    if ( aa[0] === bb[0]){
	return aa[1].localeCompare( bb[1] );
    } else {
	return aa[0].localeCompare( bb[0] );	
    }
}

  
  function check_asymmetry(report, div_id){
      var ab=[], down=[], diff=[], pair=[], i;
      var nok=0, nmiss=0, missing=[];

      for (i=0;i< summary.length;i++){
	  var entry=summary[i]._source;
	  var a=entry.from + " " + entry.to;
	  down[a]= entry[ $("#prop_select").val() ];
	  ab[a]=true;
      }
      for (i=0;i<summary.length;i++){
	  var entry=summary[i]._source;
	  var a=entry.from + " " + entry.to;
	  var b=entry.to + " " + entry.from;

	  if ( ! ( b in pair ) ){
	      var delta=0;
	      if ( typeof(down[b]) === "number" && typeof(down[a]) === "number" )
		  delta= down[b] - down[a];
	      diff.push( {id: a, val: Math.abs( delta ) } );
	  }
	  pair[a] = b;
	  pair[b] = a;
	  
	  if (ab[b]){
	      nok++;
	  } else {
	      // console.log( "Missing link : " + b);
	      missing.push(b);
	      nmiss++;
	  }
      }

      let html='';

      if ( report === 'missing' ){
	  html= '<h3>Missing opposite end of links for ' +  title_state() + '</h3>';
	  html += '<table title="Missing oposite end">';
	  // html+='<caption>Missing oposite end ' + title_state() + '</caption>';
	  html += '<tr><th>From<th>To';
	  missing.sort(sort_missing);
	  for (i=0; i< missing.length; i++){
	      var ft=missing[i].split(" ");
	      html+='<tr><td>' +ft[0] + '<td>'+ ft[1];

	  }
	  // console.log("Ok " + nok + " Missing " + nmiss );
	  html+='</table>';
	  html+='<p>' + "Ok " + nok + " Missing " + nmiss;

	  html += "<h3>Asymmetry in " + prop_desc[ $("#prop_select").val() ] + "</h3>";
      } else {
	  
	  // html += '<input type="text" id="' + div_id + '_input" onkeyup="filter_table(\'' + div_id + '\')" placeholder="Search for names..">';
	  html += '<table id=' + div_id + '_table border=1 class=sortable ><thead title="Click to sort on column"><tr><th>From<th>To<th>from-to<th>to-from<th> Diff</thead>';
	  html+='<caption>Asymmetry in ' + $("#prop_select").val() + ' for ' + title_state() + '</caption>';
	  
	  diff.sort( function(a,b){
	      if ( typeof(a.val) === "number" && typeof(b.val) === "number" )
		  return b.val - a.val;
	      return 0;
	  });
	  for (i=0; i< diff.length; i++){
	      let a = diff[i].id;
	      let ft=a.split(" ");
	      let aval= down[a] ? down[a].toFixed(1) : down[a];
	      let bval= down[pair[a]] ? down[pair[a]].toFixed(1) : down[pair[a]];
	      let diffval = diff[i].val  ? diff[i].val.toFixed(1) : 0 ;
	      html+='<tr><td>' +ft[0] + '<td>'+ ft[1] +
		  '<td align=right>' + aval + '<td align=right>' + bval + '<td align=right>' + diffval;

	  }
	  html+='</table>';
      }
      return(html);
      // $("#missing").html(html);
      // $("#missing").dialog("open");
      // alert(html);

}

function report_summary(div_id){
    //let html='<input type="text" id="' + div_id + '_input" onkeyup="filter_table(\'' + div_id + '\')" placeholder="Search for names..">';
    let html='';
    html+='<table border=1 id=' + div_id + '_table class=sortable>\n';
    html+='<caption>Summary ' + title_state() + '</caption>';
    var header=true;
    var sel_prop= $("#prop_select").val();

    for (let i=0;i< summary.length;i++){
	var entry=summary[i]._source;
	var a=entry.from + " " + entry.to;

	if (header){
	    html += '<thead title="Click to sort"><th>from<th>to';
	    for ( const prop of prop_names){
//		html+='<th align=right>'+prop;
		html+='<th align=right title="' +prop_aggr[prop] + ' values - click to sort">'+prop_desc[prop];
		    + " - " +prop_aggr[prop];
	    }
	    html+='</thead><tbody>';
	    header=false;
	}
	html+='<tr><td>' + entry['from'] + '<td>' + entry['to'];
	for ( const prop of prop_names){
	    let val= entry[prop];
	    if ( typeof val === 'number' && ! val.isInteger){
		if ( val < 100 )
		    val = val.toFixed(1);
		else
		    val = val.toFixed(0);
	    }
	    html+='<td align=right>' + val;
	}
    }
    html+='</tbody></table>';
    return(html);
}


function change_date(delta){
    var p= $("#datepicker").datepicker("getDate"); // .getMilliseconds() + 86400*1000*delta;
    //$("#datepicker").datepicker('setDate', $("#datepicker").datepicker("getDate").getDate() + delta );
    var increment=$("#period").val(); // hours
    var hour=0;
    if (  increment === "now" || increment < 24 ){ // hour navigation
	increment = 1;
	var period_input=$("#period_input").val();
	hour=parse_hhmm(period_input);
	p.setHours(p.getHours() + hour + increment * delta);
    } else {
	var days = Math.round(increment / 24);
	p.setDate( p.getDate() + days * delta );
    }

    $("#period_input").val(hhmm(p));
    $("#datepicker").datepicker('setDate', p);
    //$("#draw").click();
    update_url();
    show_network(parms.net);
    //get_topology();
    get_connections();
    update_url();
 
    // var curd = $("#datepicker").datepicker('GetDate');
    // $("#datepicker").datepicker('SetDate', curd+delta)
    
}


function reg_ip_adr(name, adr){
    if ( name && adr ){
	if ( ! ip_to_name[adr] )
		ip_to_name[adr] = name;
	if ( ! name_to_ip[name] )
		name_to_ip[name] = adr;
    }	
}

function harvest_ip_name(summary){
    for (var link_obj of summary){
	var link=link_obj._source;
	reg_ip_adr( link.from, link.from_adr);
	reg_ip_adr( link.to, link.to_adr);
    }
}

function load_name_to_address(){
    var network=$("#network").val();
    if ( ! name_loaded[network] ){
	
	var config_url='microdep-config.cgi';
	var url= config_url + "?secret=virre-virre-vapp&variant=mp-" + network + "&file=mp-address.txt";
	$.get( url, function( lines ){ 
	    for ( var line of lines.split(/\n/) ){
		var l=line.split(/\s+/);
		if ( ! name_to_ip[ l[0] ] )
		    name_to_ip[ l[0] ] = l[1];
	    }
	    name_loaded[network]=true;
	}).fail( function( jqxhr, textStatus, error ) {
	    var err = textStatus + ", " + error;
	    console.log( "Request" + url + " Failed: " + err );
	});
    }

}


// log query data for debug

function log_summary(summary){

    for (let i=0; i<summary.length; i++){
	console.log(  summary[i]._source.from + "-" + summary[i]._source.to );
    }
}


// fill html table with parameters

function present_table( parameters, div, data){
}


// get peer data
function get_peer_data(from, to, div){
    var data=[];
    // adjust time from UTC to experiment timezone
    let tz_start = adjust_to_timezone(start);
    let tz_end = adjust_to_timezone(end);

    var url="elastic-get-date-type.pl?index=" + event_index[parms.event] + "&event_type=" + parms.event
	+ "&start=" + tz_start + "&end=" + tz_end
	+ "&from=" + from + "&to=" + to;

    $.getJSON( url,
               function(resp){
                   if (resp.hits && resp.hits.total.value > 0){
                       // present_table( parameters, div, resp.hits.hits);
                       let html=gap_list( from, to, resp.hits.hits, 10, 'num_desc');
                       div.innerHTML = html;
                       div['hits'+parms.event] =  resp.hits.hits;
                       sorttable.makeSortable( div.getElementsByClassName('sortable')[0] );
                       mymap._popup.update();
                   } else {
                       $("#error").html(hhmmss(new Date()) + " : No " + parms.event + " data for " + $("#datepicker").val() + " " + $("#period_input").val() + ";;");
                   }

	       })
	.fail( function(e, textStatus, error ) {
            //remove_links(links);
            console.log("failed to get data from server :" + textStatus + ", " + error);
        });
}

// get measurement data
  var links_on = false;
  const index_extension={};

function get_connections(){
    //links=[];
    var index=parms.net;
    var etype= $("#event_type").val();
    var sum_etype="";
    var sum_index="";
    if ( ! jQuery.isEmptyObject(event_index)) {
	// Apply ES indexnames from config file
	index = event_index[parms.event];
	if ( parms.event === 'jitter')
	    sum_etype = event_index['gap']; // i.e. 
	else
	    sum_etype = event_sum_type[parms.event];
    } else if ( etype === "gap" || etype === "gapsum" ) {
	sum_etype = "gapsum";
    } else if ( etype === "routeerr" || etype === "routesum" ) {
	index = index + "_" + "routemon";
	sum_etype = "routesum";
    } else {
	index = index + "_" + etype;
    }
    
    var hour=0;
    var period=$("#period").val();
    var now=new Date();

    if ( refresh_active){
	$("#datepicker").datepicker('setDate', now);
	if ( period < 24 ){
	    var startd= new Date(now - 3600*1000);
	    $("#period_input").val( hhmm(startd ) );
	}
    }
    start = $("#datepicker").val();
    var dstart=new Date(start);
    var msstart=dstart.getTime();
    var tz= dstart.getTimezoneOffset() / 60;
    let tloss;
    if ( period < 24 ){
	var period_input= $("#period_input").val();
	hour=parse_hhmm( period_input ) + tz;
	period=1;
	dstart= new Date( msstart + hour * 3600*1000 );
	start = dstart.toISOString();
	end = new Date(dstart.getTime() + 3600*1000).toISOString();
	tloss=0;
    } else {
	var msperiod=period * 3600*1000;
	var msend= msstart + msperiod;
	if ( (msend - now) > (msperiod/2) ){
	    if ( period > 24 ){
		dstart=new Date(msstart);
		var cd = dstart.getDate() - dstart.getDay();
		var sow = new Date(dstart.setDate(cd + 1));
		msstart=sow.getTime();
		$("#datepicker").datepicker('setDate', new Date(msstart));
	    } 
	}
	
	if ( etype === "gapsum" )
	    msend += 5 * 60 * 1000; // add 5 min to get yesterdays summary records past midnight
	
	start= new Date(msstart).toISOString();	
	end= new Date(msend).toISOString();

	if ( period < 2*24 ){ // uke
	    tloss=1000; // ms
	} else if ( period <= 7*24 ){ // uke
	    tloss=5000; // ms
	} else {
	    tloss=60000;
	}
    }	  
    
    // Clear current dataset (details and summary)
    last_hits=[];
    summary=[];

    // get all detail if today
    var now = new Date();
    
    if ( etype === 'jitter' || start.substr(0,10) === now.toISOString().substr(0,10) ){ // read todays details
    var url="elastic-get-date-type.pl?index=" + index + "&event_type=" + etype
	+ "&start=" + start + "&end=" + end ;
    if ( tloss > 0 && etype === "gap" )
	url += "&tloss=" + tloss;

    if (parms.debug) console.log(url);

     $.getJSON( url,
	       function(resp){
		  if (resp.hits && resp.hits.total.value > 0){
		      var nrecs=resp.hits.total.value.toString();
		      
		      if ( etype === "gapsum" || etype === "routesum" ){
			  summary=resp.hits.hits;
		      } else if ( resp.aggregations){
			  aggregates=resp.aggregations;
			  summary=digest_aggregates(aggregates, $("#stats_type").val());
			  nrecs = count_aggregates( aggregates );
		      } else { // gap records
			  if (! sum_etype || start.substr(0,10) === now.toISOString().substr(0,10)) {
			      // No event type for summaries given or it's today's date
			      summary=digest_es_data(etype, resp.hits.hits);
			  }
			  last_hits=resp.hits.hits;
		      }
		      harvest_ip_name(summary);
		      
		      var msg = hhmmss(new Date()) + " Got " + nrecs + " " + etype + " records for "  + $("#datepicker").val() + " " + $("#period_input").val()  + " ;;";
		      $("#status").html( msg );

		      if (! jQuery.isEmptyObject(conffile) && conffile[parms.net].event_type[parms.event].asn_source ) {
			  // Extract and add relevant as-numbers to each connection
			  for (const h in last_hits) {
			      var ab = last_hits[h]._source.from + ',' + last_hits[h]._source.to;
			      if (linkByName[ab] && last_hits[h]._source.routechange_asn ) {
				  linkByName[ab].asn_search += last_hits[h]._source[conffile[parms.net].event_type[parms.event].asn_source] + " ";
			      }
			  }
		      }
		      // Refresh all links 
		      if ( ! parms.connections)
			  taint_links(summary, $("#prop_select").val() );
		      else
			  draw_links(summary, $("#prop_select").val() );
		  } else {
		      taint_links([], "empty");
		      $("#error").html(hhmmss(new Date()) + " : No " + $("#event_type").val() + " data for " + $("#datepicker").val() + " " + $("#period_input").val() + ";;");
		  }


	      })
	.fail( function(e, textStatus, error ) {
	    //remove_links(links);
	    console.log("### Failed to get data from server :" + textStatus + ", " + error + " url: " + url);
	});

    } else if ( sum_etype) { // get the summary records
    // if ( sum_etype && start.substr(0,10) != now.toISOString().substr(0,10)) {
	// Event type for summary info is set and it's not todays date...

	if ( etype === 'jitter'){
	    index = parms.net; // conffile in error
	    sum_etype = 'gapsum';
	}
	// Prepare to fetch summary info
	var sum_url="elastic-get-date-type.pl?index=" + index + "&event_type=" + sum_etype
	    + "&start=" + start + "&end=" + end;

	if (parms.debug) console.log(sum_url);

	$.getJSON( sum_url,
		   function(resp){
		       if (resp.hits && resp.hits.total.value > 0){
			   var nrecs=resp.hits.total.value.toString();
			   summary=resp.hits.hits;
			   harvest_ip_name(summary);
			   
			   var msg = hhmmss(new Date()) + " Got " + nrecs + " " + sum_etype + " records for "  + $("#datepicker").val() + " " + $("#period_input").val()  + " ;;";
			   $("#status").html( msg );
			   
			   // Refresh all links  
			   if ( ! parms.connections)
			       taint_links(summary, $("#prop_select").val() );
			   else
			       draw_links(summary, $("#prop_select").val() );
		       } else {
			   $("#error").html(hhmmss(new Date()) + " : No " + sum_etype + " data for " + $("#datepicker").val() + " " + $("#period_input").val() + ";;");
		       }
		       
		   })
	    .fail( function(e, textStatus, error ) {
		//remove_links(links);
		console.log("failed to get data from server :" + textStatus + ", " + error);
	    });
    }
    
    if (parms.report) {
	// Prepare specified report (next to the map)
	$("#check").val(parms.report).trigger('change');
	delete parms.report;  // ... but only first time when page is loaded
    }

    $("#tabs").tabs("option", "active", 0);

};

function pad(d){
    return ("0"+d).slice(-2) ;
}
function hhmmss(d){
    return( pad( d.getHours() ) + ":" + pad( d.getMinutes()) + ":" + pad( d.getSeconds() ) );
}

  function title_state(){
      let state = $("#network").val() + ', ' + conffile[parms.net].event_type[$("#event_type").val()].title
	  + ' from ' + $("#datepicker").val() + ' for ' + $("#period").val() + ' hours';
      return state;
  }

  function init_map(){
      if ( parms.net){
	  $("#network").val(parms.net);
      } else {
	  parms.net =  $("#network").val();
      }
      // Update properties according to selected measurement network variant
      update_props();	

      make_palette( parms.palette);

      var busy_no=0;	
      $.ajaxSetup({
	  beforeSend:function(){
              // show image here
              $("#busy").show();
	      busy_no++;
	  },
	  complete:function(){
              // hide image here
	      busy_no--;
              if ( busy_no <= 0)
		  $("#busy").hide();
	  }
      });
      $("#busy").height( $("#network").height() );

      $("#tabs").tabs();
      
      // draw inital network
      /* just just use trigger
       show_network(parms.net);
       get_connections();
       links_on=true;
      */

      // establish date picker
      $( "#datepicker" ).datepicker({dateFormat: "yy-mm-dd", "defaultDate": -1, "firstDay": 1, "maxDate": 0 });

      var dato;
      if ( parms.date)
	  dato=parms.date;
      else
	  dato="-1d";
      $("#datepicker").datepicker('setDate', dato)
	  .on("change", function() {
	      $("#next").prop('dsabled', selected_hour_is_future() ); // Make next-button available if relevant
	      //ok update_props();
	      update_url();
	      show_network(parms.net);
	      //get_topology();
	      get_connections();
	  });

      //$("#period").select2();	
      $("#period").change( function(){
	  get_connections();
	  update_url();
	  $("#period_input").val('00:00');
      });
      
      $("#period_input").change( function(){
	  $("#period").val(1); // hour
	  update_url();
	  get_connections();
      });

      /* does not work 
       $("#period_input").on('mousewheel', function(e, delta){
       console.log( "delta " + delta);
       });
      */
      //$("#period_input").hide();
      
      // buttons to navigate days
      $("#prev").click( function(){
	  change_date(-1);
	  //ok update_props();
	  $("#next").prop('disabled', selected_hour_is_future() ); // Enable next-button if relevant
      } );
      $("#next").click( function(){
	  change_date(+1);
	  //ok update_props();
	  $("#next").prop('disabled', selected_hour_is_future() ); // Disable next-button if relevant
      } );
      
      $("#live").click( function(){
	  if ( refresh_active){
	      clearInterval();
	      refresh_active=false;
	      $(this).css("background-color", active_color);
	  } else {
	      refresh_active=true;
	      $("#datepicker").datepicker('setDate', new Date());
	      get_connections();
	      
	      active_color=$(this).css("background-color");
	      $(this).css("background-color", refresh_color);
	      
	      setInterval( function(){
		  get_connections();
	      }, refresh_period );
	  }
      } );
      $("#search_input").keyup( function(){
	  var str =  $("#search_input").val();
	  focus_links( str, 'flip' );
      } );

      // mechanism to flip network drawing
      $("#draw").click(  function () {
	  if ( links_on ){
	      remove_links(links);
	      links_on=false;
	  } else {
	      links_on=true;
	      focus_node="";
	      prop_names = prop_names_list[ $("#event_type").val() ];
	      make_prop_select("prop_select", prop_names, prop_desc, prop_long_desc );
	      get_connections();
	      // document.location.href =
	      removeParam( 'node');
	  }
      });

      // network change
      $("#network").change( async function(){
	  parms.net= $("#network").val();
	  update_props();
	  remove_links(links);
	  load_name_to_address();
	  show_network(parms.net);
	  // await new Promise(r => setTimeout(r, 5000)); // Sleep 5 sec for loading of node-data to complete. WARNING! THIS DESPERATELY NEEDS REDESIGN.
	  // get_topology();
	  update_url();
	  $("#tabs").tabs("option", "active", 0);
      });
      
      // event_type parameter change
      $("#event_type").change( function(){
	  parms.event = $("#event_type").val()    
	  update_props();
	  //remove_links();
	  get_connections();
	  update_url();
	  $("#tabs").tabs("option", "active", 0);
      });

      // select parameter change
      $("#prop_select").change( function(){
	  // remove_links(links);
	  // links=[];
	  //draw_links(summary, $("#prop_select").val() );

	  taint_links(summary, $("#prop_select").val() );
	  update_url();
	  parms.property = $("#prop_select").val();
	  $("#tabs").tabs("option", "active", 0);
      });

      // select parameter change
      fill_select( "stats_type", stats_types );
      $("#stats_type").change( function(){
	  summary=digest_aggregates(aggregates, $("#stats_type").val());
	  taint_links(summary, $("#prop_select").val() );
	  update_url();
	  $("#tabs").tabs("option", "active", 0);
      });
      

      // draw network at startup if focus on node    
      if ( parms.node){
	  focus_node=parms.node;
	  get_connections();
	  // draw_links(summary, $("#prop_select").val() );
	  links_on=true;
      }

      //$("#check").click( function(){check_asymmetry()} );
      $("#check").change( function(){
	  var title = $("#check").val();
	  let num_tabs = $("main#tabs ul li").length ;
	  let tab_id = 'tab' + num_tabs;
	  switch(title ){
	  case 'missing':
	      add_tab( 'div', title, num_tabs, check_asymmetry(title, tab_id) );
	      break;
	  case 'asymmetry':
	      add_tab( 'div', title, num_tabs, check_asymmetry(title, tab_id) );
	      break;
	  case 'summary':
	      add_tab( 'div', title, num_tabs, report_summary(tab_id) );
	      break;
	  case 'heatmap':
	      let template_url='curve-chart.html?net=' + parms.net + '&index=' + event_index[parms.event] + '&from={0}&to={1}&event=' + parms.event + '&property=h_ddelay&start=' + start + '&end=' + end + "&title=\"From {2} to {3}\"";
	      add_tab( 'div', title, num_tabs, 'This will be graph soon');
	      heatmap(tab_id, summary, $("#prop_select").val(), get_color, threshes, title_state(),template_url );
	      break;
	  case 'curve':
	      add_tab( 'div', title, num_tabs, 'This will be graph soon');
	      curve(tab_id, last_hits, $("#prop_select").val(), title_state() );
	      break;
	  }
	  $("#check").val('choose');
    	  $("#tabs").tabs("option", "active", num_tabs);

      });

      // read coordinates
      document.getElementById("mapid").addEventListener("contextmenu", function (event) {
	  // Prevent the browser's context menu from appearing
	  event.preventDefault();
	  
	  // Add marker
	  // L.marker([lat, lng], ....).addTo(map);
	  alert(lat.toFixed(5) + ', ' + lng.toFixed(5));
	  
	  return false; // To disable default popup.
      }); 

      $( "#missing" ).dialog({ autoOpen: false,  minWidth: 800 });

      // catch focus on
      $("#mapid").on('click', "a.trigger", function(e){
	  var node=e.target.id;
	  focus_links( node, 'flip' )
      });
      

      $("#network").trigger("change");  // draw the map
  }
  
$(document).ready ( function(){

    get_parms( );

    get_config( parms.conffile, init_map );


});
