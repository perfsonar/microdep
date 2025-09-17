#!/usr/bin/perl
#
# Query Elastic search db for microdep events 
#
# Changelog:
# - Created by Olav Kvittem
# - 2024-04-17 Otto J Wittner: Added credentials from config file

use CGI;
#use CGI qw/:standard -debug/;
#use WWW::Curl::Easy
#use JSON;
use YAML;

# Fetch config file
$config = YAML::LoadFile("/etc/perfsonar/microdep/microdep-config.yml");

my $esurl='http://admin:no+nz+br@localhost:9200';
$esurl = $config->{opensearch_url} if $config->{opensearch_url};
    
my $q = CGI->new;
my $yesterday= `date --date yesterday "+%Y-%m-%d"`;
chomp($yesterday);
my $start= parm('start') || $yesterday;
my $type= parm('event_type') || "gapsum";
my $end = parm('end') || $start;
my $from = parm('from');
my $to = parm('to');
my $min_delay = parm('min_delay');
my ($stats_type, $stats_field ) = split( ",", parm('stats') );

my $path_addr=parm('path_addr'); # list of ips 
my $date_field='@date';
$date_field = '@timestamp' if $path_addr;

my $ip_list; # make an array for ES
    

my $debug = 0; # off by default
if ( $q->param("debug")){
    $debug = parm("debug");
}
# my 
my $index= parm('index') || "dragonlab";
if ( $debug > 0 ){
    print $q->header('text/html');
} else {
    print $q->header('application/json');
}


# my $curl = WWW::Curl::Easy->new;
# $curl->setopt(CURLOPT_HEADER,1);

my $query_head = '
   "query": {
      "bool":{
        "must":[
          { "range": {
             "' . $date_field . '":{
              "gte": "' . $start . '",
               "time_zone":"Europe/Oslo"
           }
	  } },
          { "range": {
             "' . $date_field . '":{
               "lte": "' . $end . '",
              "time_zone":"Europe/Oslo"
           }
	  } },
          { "match_phrase": {"event_type":"' . $type . '"}}
';
my $query_tail='
   }
}
';
my $query_jit = '
   "query": {
      "bool":{
        "must":[
          { "range": {
              "' . $date_field . '":{
              "gte": "' . $start . '",
              "time_zone":"Europe/Oslo"
            }
	  } },
          { "range": {
              "' . $date_field . '":{
              "lte": "' . $end . '",
              "time_zone":"Europe/Oslo"
            }
	  } },
          { "match": {"event_type":"' . $type . '"}},
          { "range": { 
            "h_ddelay":{
              "gte": 1,
	      "boost":2.0
            }
          } }
        ]
      }
   }
';

my $query2 = '
   "query": {
    "bool": {
      "must": [
          { "match": {"' . $date_field . '":"' . $start . '"}},
          { "match": {"event_type":"' . $type . '"}}
      ]
    }
  }
';


my $aggr='
  "aggs": {
     "from": { "terms": {"field": "from.keyword", "size": 100 },
        "aggs": {
          "to": { "terms": {"field": "to.keyword", "size": 100 },
            "aggs": {
              "h_ddelay":  { "stats": { "field": "h_ddelay" } },
              "h_jit": { "stats": { "field": "h_jit" } },
              "h_slope_10":  { "stats": { "field": "h_slope_10" } },
              "h_min_d":  { "stats": { "field": "h_min_d" } }
            }
          }
        }
      }
   }
';
my $perc='
  "aggs": {
     "from": { "terms": {"field": "from.keyword", "size": 100 },
        "aggs": {
          "to": { "terms": {"field": "to.keyword", "size": 100 },
            "aggs": {
              "h_ddelay":  { "percentiles": { "field": "h_ddelay" } },
              "h_jit": { "percentiles": { "field": "h_jit" } },
              "h_slope_10":  { "percentiles": { "field": "h_slope_10" } },
              "h_min_d":  { "percentiles": { "field": "h_min_d" } }
            }
          }
        }
      }
   }
';


my $min_aggr='
  "aggs": {
     "from": { "terms": {"field": "from.keyword", "size": 100 },
        "aggs": {
          "to": { "terms": {"field": "to.keyword", "size": 100 },
            "aggs": {
              "min_delay":  { "avg": { "field": "h_min_d" } }
            }
          }
        }
      }
   }
';


my $stats_aggr='
  "aggs": {
     "from": { "terms": {"field": "from.keyword", "size": 100 },
        "aggs": {
          "to": { "terms": {"field": "to.keyword", "size": 100 },
            "aggs": {
              "stats":  { "' . $stats_type . '": { "field": "' . $stats_field . '" } }
            }
          }
        }
      }
   }
';

my $search;

if ( $from ){
    $query_head .= '          , { "match_phrase": {"from.keyword":"' . $from . '"}}
    ';
}
if ( $to ){
    $query_head .= '          , { "match_phrase": {"to.keyword":"' . $to . '"}}
    ';
}


if ( $from ) {
    # $query_head .= '], "minimum_should_match" : 4';
} else {
    # $query_head .= '] ';
}

$query_head .= '] ';

if ( $min_delay ){
    $query_head .= ', "must_not": { "range": { "h_min_d": { '
						    . '"gte": ' . -10
						    . ', "lte": ' . $min_delay 
						    . ' } } }';
    # $query_head .= ', { "range": { "h_min_d": { "lte": ' . -3 . ' } } }';
    # $query_head .= ', { "range": { "h_min_d": { "gte": ' . $min_delay . ' } } }';
}



$sort_time = '"sort" : [ { "datetime": { "order" : "asc" } } ]';

if ( $path_addr){
    $query_head .= ',    "filter": {
        "bool": { "should": [
';
    my @ips = split( ",", $path_addr);
    my $match="";
    printf "path_addr : $path_addr : %d\n", $#ips if $debug > 0;

    foreach $i ( 0 .. $#ips){
	$match .= ', ' if $i > 0;
	$match .= '{ "match": { "path_addr": "' . $ips[$i] . '" } }';
    }

    $query_head .= $match . ' ], "minimum_should_match": 1 }
        }
';
}

if ( $stats_type){
    $search =  '{ "size":10000, ' . $query_head . $query_tail . ", " . $stats_aggr . '}';    
} elsif ( $min_delay ){
    my $limit='{ "range": { "h_min_d": { "gte": ' . $min_delay . ' } } }';

    $search =  '{ "size":0, ' . $query_head . $query_tail . ", " . $min_aggr . '}';
} elsif ( $type eq "jitter" && ! $from ){ # no aggregation if pair
    # $search =  '{ "size":0, ' . $query_jit . ", " . $aggr . '}';
    $search =  '{ "size":0, ' . $query_head . $query_tail . ", " . $perc . '}';
} elsif ( $from ){
    $search =  '{ "size":10000, ' . $query_head . $query_tail . ', ' . $sort_time . '}';
} else {
    $search =  '{ "size":10000, ' . $query_head . $query_tail . '}';
}

print $search."\n" if $debug > 0;

#my $url='http://admin:no+nz+br@localhost:9200/' . $index . '/_search?';
my $url=$esurl . '/' . $index . '/_search?';

# $curl->setopt(CURLOPT_URL, $url);
# my $response_body;
# $curl->setopt(CURLOPT_WRITEDATA,\$response_body);

# my $retcode = $curl->perform;
# if ($retcode == 0) {
#    print("Transfer went ok\n");
#    my $response_code = $curl->getinfo(CURLINFO_HTTP_CODE);
    # judge result and next action based on $response_code
#    print("Received response: $response_body\n");
#} else {
    # Error code, type of error, error message
#    print("An error happened: $retcode ".$curl->strerror($retcode)." ".$curl->errbuf."\n");
#}

my $cmd='curl -X POST --insecure -H "Content-Type: application/json" "' . $url . '"  -d \'' . $search . '\' 2>/dev/null';
print "<p>$cmd\n" if $debug > 0;
print `$cmd`;


# weed out special shell chars
sub parm{ 
    my $p=shift;
    my $v=$q->param($p);
    $v=~s/[^\w_\-\:\.,]/_/g if $v;
    return $v;
}
