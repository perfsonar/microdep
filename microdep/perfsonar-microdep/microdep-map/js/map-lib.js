/* library to support microde-dep-map.html, microdep-chart.html
 */

export var colors=[];
export var threshes=[];  // color thresholds for current property

export function make_palette( palette){
    if ( palette === "auto"){
	  colors=generate_colors(10, [0.8,0.2,0.2]); // 5 colors in red with 50% green and blue
    } else if ( palette === "traffic2" ) {
	colors=[ "#80e982", "#80a982", "#e2e404", "#e2a404", "#d98182", "#a98182"]; // GGYYRR
    } else {
	colors=[ "#80d982", "#e2e404", "#d98182"]; // GYR
	// colors=["#FFCCCC","#FFE5CC","#FFFFCC","#E5FFCC","#CCFFCC","#CCE5FF","#E5CCFF"];
    }
}


export function generate_colors(n, rgb){
    var colors=[], i, c;
    var delta=250/n/2;
    for (i=0; i<n; i++){
	var col='#';
	var cols=[];
	for (c=0; c < rgb.length; c++){
	    // colors[i][c] = rgb[c] * i * delta;
	    var val= 100 + Math.floor( rgb[c] * (n-i-1) * delta );
	    col += ('00' + val.toString(16).toUpperCase() ).slice(-2);
	    cols[c]=val;
	}
	colors[i]=col;
	//colors[i]=rgb( cols[0], cols[1], cols[2] );
    }
    // colors.reverse();
    return colors;
}

export function get_color_ppm( val, max){
    var n=colors.length;
    var log=0;
    if ( val >= 10){
	log=Math.log10(val);
    }
    var logmax=0;
    if ( max >= 10){
	logmax=Math.log10(max);
    }
    
    var ix = n * log / logmax;
    return colors[Math.floor(ix)];
}

export function get_color( val, threshes){
    var n=colors.length;
    var reversed = threshes[0] > threshes[1];
    var ix=0;
    var threshold;
    for ( threshold of threshes){
	if ( reversed && val >= threshold ||
	     !reversed && val < threshold)
	    break;
	ix++;
    }
    if ( ix >= n ) ix = n - 1;
    return colors[ix];

}


export function get_thresholds( hits, prop){
    var thresh=[];
    if ( thresholds[prop]){
	thresh=thresholds[prop];
    } else {
	// ends=[];
	var vals=[];

	$.each(hits, function(i, link){
	    if ( typeof(link._source[prop]) === "number" ){
		vals.push( link._source[prop] );
	    }
	});

	if ( vals.length > 0 ){
	    var max = Math.max( ...vals);
	    var min = Math.min( ...vals);

	    var interval=max-min;
	    var logint=0;
	    var length= colors.length;
	    if ( interval > 100 && min > 0 && max / min > 100 ){ // go logarithmic
		logint = Math.log10(interval);
		var incr = logint / length;
		for (i=1; i< length; i++){
		    thresh.push( round_number( min + 10 ** (incr * i)) );
		}
	    } else { // linear scale
		var incr = (max - min) / length;
		var i;
		for (i=1; i< length; i++){
		    thresh.push( round_number( min + (incr * i) ) );
		}
	    }
	}
    }
    if ( reversed[prop] ) thresh.reverse();
    // update_legend(prop_desc[prop],thresh);
    threshes=thresh; // global
}


export function  make_prop_select(id, names, desc, long_desc = {}){

    var selectList=document.getElementById(id);
    if ( selectList){
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
	}));
    } else {
	console.log( "make_prop_select skips nonexisting select: " + id);
    }
}
/*
  function  make_prop_select(id, names, default_name){
  var selectList=document.getElementById(id);
  selectList.options.length = 0; // remove previous
  
  for (var i = 0; i < names.length; i++) {
  var option = document.createElement("option");
  option.value = names[i];
  if ( names[i] === default_name )
  option.selected = "selected";
  var text=prop_desc[names[i]];
  if ( ! text ) text = names[i];
  option.text = text;
  selectList.appendChild(option);
  }
  }
*/

export function sort_hits(a ,b){
    if ( a._source.from === b._sorce.from){
	return a._source.to.localeCompare( b._source.to );
    } else {
	return a._source.from.localeCompare( b._source.from );
    }
}

export function max( max, val){
    if ( typeof(max) === 'undefined' )
	return val;
    else
	return Math.max(max, val);
}

export function round_number(num){
    var digits=Math.floor(Math.log10(num));
    var round=Math.round( num / 10**digits) * 10**digits;
    return round;
}

export function zero_fill(n){
    return( "0" + n ).slice(-2);
}


export function sort_diff(a , b){
    //  return
    var aa=a.split(" ");
    var bb=b.split(" ");
    if ( aa[0] === bb[0]){
	return aa[1].localeCompare( bb[1] );
    } else {
	return aa[0].localeCompare( bb[0] );	
    }
}



export function add_tab(type, title, num_tabs, html){

    let divid='tab' + num_tabs;

    let new_tab=$("main#tabs ul").append(
        "<li><a href='#" + divid + "' title='" + title + "'>#" + num_tabs + ' ' + title + "</a>"
	    + '<span class="ui-icon ui-icon-close" role="presentation">Remove Tab</span>'
	    +"</li>"
    );
    $("main#tabs").append(
        "<" + type + " class=graph id='" + divid + "'>#" + num_tabs + "</" + type + ">"
    );
    $("#"+divid).html(html);
    $("main#tabs").tabs("refresh");
    $('main#tabs').tabs({ active: num_tabs-1});

    // activate sorting if sortable tables within
    let collection= document.getElementById(divid).getElementsByClassName("sortable");
    if ( collection.length > 0 ) // walk through all, but just one expected
	Object.values( collection).forEach( function(table){
	    sorttable.makeSortable( table ) } );

    // close icon: removing the tab on click
    new_tab.delegate( "span.ui-icon-close", "click", function() {
	var panelId = $( this ).closest( "li" ).remove().attr( "aria-controls" );
	$( "#" + panelId ).remove();
	tabs.tabs( "refresh" );
    });


}

// compute decimal hour
export function dec_hour( date ){
    return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

export function hhmm(date){
    return date.getHours() + ":" + ("0" + date.getMinutes()).slice(-2);
}


export function selected_date_is_today_or_future() {
    // True is currently selected date is todays date or in the future
    var now = new Date();
    return $("#datepicker").val() >= now.toISOString().substr(0,10) ;
}

export function selected_hour_is_future(){
    var now = new Date();
    let is_future=true;
    if ( $("#datepicker").val() <= now.toISOString().substr(0,10) ){
	if ( $("#datepicker").val() === now.toISOString().substr(0,10) ){
	    if ( $("#period").val() < 24 ){
		is_future = parse_hhmm( now.toISOString().substr(11,5))
		    <= ( parse_hhmm( $("#period_input").val())  + now.getTimezoneOffset() / 60 + 1 );
	    }
	} else
	    is_future=false;
    }
    return is_future;
}

export function parse_hhmm(hhmm){
    var hms = hhmm.split(":");
    var hour = 0;
    const inhour = [1,60,3600];
    for ( var i in hms)
	if ( ! isNaN( hms[i] ) )
	    hour += hms[i] / inhour[i];
    return hour;
}
export const asecond = 1000; // ms
export const aminute = 60 * asecond ;
export const anhour = 60 * aminute;
export const aday = 24 * anhour;
export const aweek = 7 * aday;
export const amonth = 4 * aweek;
export const periods=[asecond, aminute, anhour, aday, aweek, amonth];
export const period_units=['second', 'minute', 'hour', 'day', 'week', 'month'];


export function get_period( start, end){
    let s1 = new Date(start).valueOf();
    let e1 = new Date( end).valueOf();
    let period = e1 - s1;
    var xunit='hour';

    for (const i in periods){
	if ( period <= periods[i] ){
	    xunit=period_units[i];
	    break;
	}		  
    }
    return xunit;
}

// in a module update the global readonly parms
export function get_parms() {
    console.log('location: ' + location);
    // var new_parms= {};
    var    tmp = [];
    location.search
        .substr(1)
        .split("&")
        .forEach(function (item) {
	    tmp = item.split("=");
	    parms[tmp[0]] = decodeURIComponent( tmp[1] );
        });
    // return new_parms;
}

String.prototype.format = function (...params) {
    var s = this,
        i = params.length;
    
    while (i--) {
        s = s.replace(new RegExp('\\{' + i + '\\}', 'gm'), params[i]);
    }
    return s;
};



// add parameter to url
// *** ignore parameters after this..

export function fix_url( url, parm, value){
    var ny;

    var ix=url.indexOf("?");
    if ( url.indexOf("?") < 0 ){
	url+="?";
    }

    var ix=url.indexOf(parm+"=");
    if ( ix >= 0){
	ny=url.substr(0,ix);
    } else {
	ny=url;
    }
    if ( ny.slice(-1) !== '&' ) ny += '&';
    return ny + parm + "=" + value;
}

export function update_url(parameter, value){
    var url=document.location.href;
    var urlparts= url.split('?');
    var urlBase=urlparts.shift(); 
    var pars=[];

    var net = $("network").val() ? $("network").val() : parms.net;
    var etype= $("#event_type").val() ? $("#event_type").val() : parms.event;
    pars=["net=" + net,
	  "event=" + etype,
	  "property=" + $("#prop_select").val(),
	  "date=" + $("#datepicker").val(),
	  "period=" + $("#period").val() ];
    if  ( etype === "jitter" && $("#stats_type").val() )
	pars.push( "stats=" + $("#stats_type").val() );
    if (parms.conffile) pars.push( "conffile=" + parms.conffile);   // Add configfile to url if relevant
    if (parms.report) pars.push( "report=" + parms.report);         // Add report to url if relevant
    if ( parameter )
	pars.push( parameter + "=" + value );
    url = urlBase+'?'+pars.join('&');
    window.history.pushState('',document.title,url); // added this line to push the new url directly to url bar .

    if ( stats_on[ $("#event_type").val() ] )
	$("#stats_type").show();
    else
	$("#stats_type").hide();


}

export function removeParam(parameter){
    var url=document.location.href;
    var urlparts= url.split('?');

    if (urlparts.length>=2)
    {
	var urlBase=urlparts.shift(); 
	var queryString=urlparts.join("?"); 

	var prefix = encodeURIComponent(parameter)+'=';
	var pars = queryString.split(/[&;]/g);
	for (var i= pars.length; i-->0;)               
	    if (pars[i].lastIndexOf(prefix, 0)!==-1)   
		pars.splice(i, 1);
	url = urlBase+'?'+pars.join('&');
	window.history.pushState('',document.title,url); // added this line to push the new url directly to url bar .

    }
    return url;
}



//--------------------------------------------------------------------------------

export var parms={};
export var conffile=[];   //Config file loaded initially
export var thresholds={
    h_delay:[10,50],
    h_min_d:[10,50],
    h_ddelay:[5,50],
    h_jit:[2,20],
    down_ppm:[100,1000],
    h_slope_10:[0.1,0.2]
};


export var net_names=[];
export var net_descr={};
export var net_long_descr={};

export var reversed={};
export var prop_long_desc={};
export var prop_sum = ['tloss', 'anomaly_count'];
export var prop_aggr = { tloss: 'sum', anomaly_count: 'sum' };

export var event_names;
export var event_index = {}; 
export var event_sum_type = {}; 

export var event_desc={ gapsum: "Gap summary", gap: "Gaps", jitter: "Queues", routesum: "Route summary", routeerr: "Route errors"};
export var event_long_desc={};

export var stats_on={ jitter:true}; // show stats_type field

export var prop_names;
export var prop_names_list = {
    gapsum: "down_ppm h_ddelay h_jit h_min_d big_gaps big_time small_gaps small_time".split(" "),
    gap: "down_ppm tloss h_ddelay h_jit h_min_d h_slope_10".split(" "),
    jitter: "h_ddelay h_jit h_min_d h_slope_10".split(" "),
    routesum: "routes_failed routes_reached probes_stopped_at_last_hop probes_with_none_dst_last_hop routes_analysed routes_reached min_length max_length".split(" "),
    routeerr: "anomaly_count duration last_hop last_reply_from icmp_errors".split(" ")
};
export var prop_desc= { down_ppm:"Unavailability (PPM)",  h_ddelay:"Queue(ms)", h_jit:"Jitter(ms)",
			h_min_d:"Min delay(ms)", h_delay:"Avg delay(ms)",
			tloss:"Time lost(ms)", h_slope_10:"Slope",
			big_gaps:"Big gaps(#)", big_time:"Big gap time(s)", small_gaps:"Small gaps(#)", small_time:"Small gap time(s)"
		      };

// assign names as description temporarily
for ( const record of 'routesum routeerr'.split(" ") ){
    for ( const prop of prop_names_list[record] ){
	if ( ! prop_desc[prop] ) prop_desc[prop] = prop; 
    }
}


export function get_config( conffilename, call_back){
    // OJW 2021-12-09 BEGIN CONFIG FILE LOAD
    // Fetch config info and initialize page
    // var conffilename = parms.conffile;
    if (! conffilename) conffilename = 'mapconfig.yml'
    $.getJSON( "yaml-to-json.cgi?inputfile=" + conffilename, function(read_conffile) {
	if (Object.keys(read_conffile).length > 0) {
	    console.log("Config file " + conffilename + " non-empty: " + read_conffile.msg);
	    conffile = read_conffile.config;
	    // Fetch measurment network/variant details from config
	    for (const n in conffile) {
		net_names.push(n);
		net_descr[n]=conffile[n].title;
		net_long_descr[n]=conffile[n].descr;
	    }
	    // Update select-boks for networks/variants
	    make_prop_select("network", net_names, net_descr, net_long_descr);
	    call_back();
	}

	// OJW 2021-12-09 CONTINUES AT END OF "document ready"

	//OJW 2021-12-09 CONTINUED CONFIG FILE LOAD
        })
    .fail( function(e, textStatus, error ) {
	// Config not avaiable
        console.log("Failed to get conf.json :" + textStatus + ", " + error);
    });
    
    //OJW 2021-12-09 END CONFIG FILE LOAD
}
export function update_props() {
    // Repopulate property structures based on given measuerment network variant and config file
    // Also re-init event type and variable select-lists
    
    if (! jQuery.isEmptyObject(conffile)) {
	// Config file data is available. Update lists.
	prop_names_list ={}; 
	prop_desc ={};
	prop_long_desc ={};
	event_names = [];
	event_desc={};
	event_long_desc={};
	event_index={};
	event_sum_type={};
	for (const e in conffile[parms.net].event_type) {
	    if (conffile[parms.net].event_type[e].enable == "false" ||
		( conffile[parms.net].event_type[e].historic_only == "true" && selected_date_is_today_or_future()) ) {
		// Skip disabeld events or events marked as historic only if current date is today date
		continue;
	    }
	    prop_names_list[e]=[];
	    event_names.push(e);
	    if (! jQuery.isEmptyObject(conffile[parms.net].event_type[e].descr) ) {
		// Get long descriptions too
		event_long_desc[e] = conffile[parms.net].event_type[e].descr;
	    }
	    event_desc[e] = conffile[parms.net].event_type[e].title
	    event_index[e] = conffile[parms.net].event_type[e].index
	    for (const f in conffile[parms.net].event_type[e].field) {
		// Add properties/variables
		prop_names_list[e].push(f);
		var unit = conffile[parms.net].event_type[e].field[f].unit
		var title = conffile[parms.net].event_type[e].field[f].title
		prop_desc[f] = title +  ( unit ? " (" + unit + ")" : "") ;
		prop_aggr[f] = conffile[parms.net].event_type[e].field[f].aggr;
		if (! jQuery.isEmptyObject(conffile[parms.net].event_type[e].field[f].descr) ) {
		    // Get long descriptions too
		    prop_long_desc[f] = conffile[parms.net].event_type[e].field[f].descr;
		}
	    }
	    // Store event type and properties for summary info
	    event_sum_type[e] = conffile[parms.net].event_type[e].summary_event_type;
	    if( typeof prop_names_list[event_sum_type[e]] == 'undefined')
		// New property/variable.
		prop_names_list[event_sum_type[e]]=[];
	    for (const f in conffile[parms.net].event_type[e].summary_field) {
		// Add  properties/variables
		if( prop_names_list[event_sum_type[e]].indexOf(f) == -1) {
		    // Field not yet added. Add.
		    prop_names_list[event_sum_type[e]].push(f);
		    var unit = conffile[parms.net].event_type[e].summary_field[f].unit
		    var title = conffile[parms.net].event_type[e].summary_field[f].title
		    var descr = title +  ( unit ? " (" + unit + ")" : "") ; 
		    prop_desc[f] = descr;
		    if (! jQuery.isEmptyObject(conffile[parms.net].event_type[e].summary_field[f].descr) ) {
			// Get long descriptions too
			prop_long_desc[f] = conffile[parms.net].event_type[e].summary_field[f].descr;
		    }
		    prop_aggr[f] = conffile[parms.net].event_type[e].summary_field[f].aggr;
		    if (! jQuery.isEmptyObject(conffile[parms.net].event_type[e].summary_field[f].threshold_low) && ! jQuery.isEmptyObject(conffile[parms.net].event_type[e].summary_field[f].threshold_high ) ) {
			// Add/update thresholds values for property/variable.
			thresholds[f] = [ Number(conffile[parms.net].event_type[e].summary_field[f].threshold_low), Number(conffile[parms.net].event_type[e].summary_field[f].threshold_high) ];
		    }
		    if ( conffile[parms.net].event_type[e].summary_field[f].scale === 'reversed')
			reversed[f]=true;
		}
	    }
	}
    }
    
    // Init select list for measurement types / datasets / event types
    //event_names = Object.keys(prop_names_list);
    make_prop_select("event_type", event_names, event_desc, event_long_desc );
    // Select event type
    if (parms.event && (event_names.indexOf(parms.event) > -1)) {
	// Reapply already selected 
	$("#event_type").val(parms.event);
    } else {
	if ( "default_event_type_live" in conffile[parms.net] && selected_date_is_today_or_future() ) {
	    // Apply default event type for "live" (todays date) events
	    $("#event_type").val(conffile[parms.net].default_event_type_live);
	} else if ( "default_event_type" in conffile[parms.net] ) {
	    // Apply default event type for events
	    $("#event_type").val(conffile[parms.net].default_event_type);
	} 
	parms.event = $("#event_type").val()
    }

    // Init measurement variable select list
    if (selected_date_is_today_or_future()) {
	// No summary event is available. Use "none-summary" properties.
	prop_names = prop_names_list[ parms.event];
	for (var n = prop_names.length-1; n >= 0; n--)
	    if (typeof conffile[parms.net].event_type[parms.event].field[prop_names[n]] == "undefined" ||
		conffile[parms.net].event_type[parms.event].field[prop_names[n]].type != "number" )
		// Remove unsupported or none-numeric properties
		prop_names.splice(n,1);
	make_prop_select("prop_select", prop_names, prop_desc, prop_long_desc );
	// Select measurement variable
	if (parms.property && (prop_names.indexOf(parms.property) > -1) ) {
	    // Reapply already selected 
	    $("#prop_select").val(parms.property);
	} else  if ( "default_field" in conffile[parms.net].event_type[parms.event] ) {
	    // Apply default measurement variable/property if available
	    $("#prop_select").val(conffile[parms.net].event_type[parms.event].default_field);
	}
    } else {
	prop_names = prop_names_list[ event_sum_type[parms.event] ];
	for (var n = prop_names.length-1; n >= 0; n--)
	    if (typeof conffile[parms.net].event_type[parms.event].summary_field[prop_names[n]] == "undefined" ||
		conffile[parms.net].event_type[parms.event].summary_field[prop_names[n]].type != "number" )
		// Remove unsupported or none-numeric properties
		prop_names.splice(n,1);
	make_prop_select("prop_select", prop_names, prop_desc, prop_long_desc );
	// Select measurement variable
	if (parms.property && (prop_names.indexOf(parms.property) > -1) ) {
	    // Reapply already selected 
	    $("#prop_select").val(parms.property);
	} else if ( "default_summary_field" in conffile[parms.net].event_type[parms.event] ) {
	    // Apply default measurement variable/property if available
	    $("#prop_select").val(conffile[parms.net].event_type[parms.event].default_summary_field);
	    parms.property = $("#prop_select").val();
	} 
    }
    
    
    // Update period 
    //ok if (parms.period) $("#period").val(parms.period);
}
