// prepare charts
import { parms, conffile, 
	 get_parms, get_config, update_props, add_tab, update_url,
	 colors, make_palette,
	 prop_desc, prop_names, prop_names_list, make_prop_select,
	 periods, get_period, period_units, anhour, aday, aweek,
	 selected_date_is_today_or_future, adjust_to_timezone }
from "./map-lib.js" ;
import {chart_curve, chart} from "./graph.js";

var current_tab_id;
var current_title;

// variables to be in configfile
var empty_color="LightGray";
var prop_sum = ['tloss', 'anomaly_count'];


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
  }
*/
export function scroll_change(type, delta){
    let start = new Date(parms.start).valueOf();
    let end = new Date( parms.end).valueOf();
    let period = end - start;
    var new_start, new_end, new_period;

    if ( type === "delta"){	  
	new_start = start + period * delta;
	new_end = new_start + period;
    } else if (type === "period"){
	let unit = period_units.indexOf(delta);
	let per = periods[unit];
	if ( per >= aweek ){
	    const start_date = new Date(start);
	    new_start = start_date.setDate( start_date.getDate() - start_date.getDay()).valueOf(); // first DOW
	    new_end = new_start + per;
	} else {
	    new_start = start;
	    new_end = new_start + per;
	}
    }
    let num_tabs = $("main#tabs ul li").length ;
    let tab_id = 'tab' + num_tabs;
    parms.start=new Date(new_start).toISOString();
    parms.end=new Date( new_end).toISOString();
    make_curve( tab_id, current_title, parms.start, parms.end);
}

function make_curve(tab_id, property, start, end){
    // $("#range").html( start.substring(0,19) );
    // $("#range").html( parms.title );
    $("#datepicker").datepicker('setDate', parms.start.substring(0,10) );

    var xunit= get_period(parms.start, parms.end);
    $("#period").val(xunit);

    var url="elastic-get-date-type.pl?index=" + parms.index + "&event_type=" + parms.event
	+ "&start=" + adjust_to_timezone(start) + "&end=" + adjust_to_timezone(end)
	+ "&from=" + parms.from + "&to=" + parms.to;

    let title = parms.title.length !== 0 ? parms.title : "From " + parms.from + " to " + parms.to;
    if (parms.debug) console.log(url);

    $.getJSON( url,
	       function(resp){

		   if (resp.hits && resp.hits.total.value > 0){
		       var nrecs=resp.hits.total.value.toString();
		       add_tab( "canvas", prop_desc[property], $("main#tabs ul li").length , '');

		       chart_curve( tab_id, resp.hits.hits, property, title, xunit);			     
		   } else {
		       $("#error").html(hhmmss(new Date()) + " : No " + parms.event
					+ " data for " + parms.start + " "
					+ parms.end + ";;");
		   }
	       })
	.fail( function(e, textStatus, error ) {
	    console.log("failed to get data from server :" + textStatus + ", " + error);
	});
    $("#tabs").tabs("option", "active", 0);

};

function pad(d){
    return ("0"+d).slice(-2) ;
}
function hhmmss(d){
    return( pad( d.getHours() ) + ":" + pad( d.getMinutes()) + ":" + pad( d.getSeconds() ) );
}

function title_state(){
    let state = $("#network").val() + ', ' + $("#event_type").val()
	+ ' from ' + $("#datepicker").val() + ' for ' + $("#period").val() + ' hours';
    return state;
}



// initialization
function init_module(){
    $("#tabs").tabs();
    let title = 'title' in  parms ? parms.title : "From " + parms.from + " to " + parms.to;
    $("#tittel").html(title);

    // prop_names = conffile.prop_names_list[ parms.event ];
    //prop_names = prop_names_list[ parms.event ];
    update_props();
    make_prop_select("check", prop_names, prop_desc );
    $("#check").val(parms.property);

    make_palette(parms.palette);

    make_prop_select("period", period_units, "day");
    $("#period").change( function(){
	scroll_change( "period", $("#period").val() );
	update_url('period', $("#period").val() );
	// $("#period_input").val('00:00');
    });

    $( "#datepicker" ).datepicker({dateFormat: "yy-mm-dd", "defaultDate": -1, "firstDay": 1, "maxDate": 0 });

    var dato;
    if ( parms.start)
	dato=parms.start;
    else
	dato="-1d";
    $("#datepicker").datepicker('setDate', dato.substring(0,10));
    
    $("#datepicker").on("change", function() {
	$("#next").prop('disabled', selected_date_is_today_or_future() ); // Make next-button available if relevant
	parms.start=$("#datepicker").val();
	parms.end=$("#datepicker").val() + periods[ period_units.indexOf( $("#period").val() )];
	scroll_change("period", $("#period").val() );
    });
    // $("#prev").click = function(){ scroll_change("delta",-1) };
    //$("#next").click = function(){ scroll_change("delta",+1) };
    document.getElementById("prev").onclick=function(){ scroll_change("delta",-1) };
    document.getElementById("next").onclick=function(){ scroll_change("delta",+1) };
    document.getElementById("reset_zoom").onclick=function(){ chart.resetZoom() };
    
    $.ajaxSetup({
	beforeSend:function(){
	    // show image here
	    $("#busy").show();
	},
	complete:function(){
	    // hide image here
	    $("#busy").hide();
	}
    });

    $("#tabs").tabs();

    $("#check").change( function(){
	let prop=$("#check").val();
	current_title = prop ? prop : parms.property;
	let num_tabs = $("main#tabs ul li").length ;
	current_tab_id = 'tab' + num_tabs;

	make_curve( current_tab_id, current_title, parms.start, parms.end);

	$("#check").val('choose');
	$("#tabs").tabs("option", "active", num_tabs);

    });
    if ( parms.property)
	$("#check").val(parms.property);
    $("#check").trigger("change");
}

$(document).ready ( function(){

    get_parms( );

    get_config( parms.conffile, init_module );

});

