#!/usr/bin/perl -w
#
# Request all traceroute tests from a measurement archive applying Open search API
# Returns a json document with Open search results
# Usage :  get-tracetests.pl?param1=value1&param2=value2...
#          mahost=<url>           Hostname of measurement archive to query (default from mapconfig.yml or https://localhost:9200)
#          start=<iso datetime>   Start time of range (default today 00:00 local timezone)
#          end=<iso datetime>     End time of range (default today 23:59 local timezone)
#          from=<hostname>        Source host to apply (if not given a list of host peers is returned)
#          to=<hostname>          Destination host to apply (if not given a list of host peers is returned)
#          verify_SSL=[0|1]       Flag to disable certificate checking (default 1)
#          debug=<0-3>            Debug level (default 0)
#          help                   Print help text     
#
# Author: Otto J Wittner <otto.wittner@sikt.no>
#

use strict;
use CGI qw/:standard -debug/;
use CGI::Carp qw(fatalsToBrowser);
use Config::General;
use Log::Log4perl qw(get_logger :easy :levels);
use Net::IP;
use Params::Validate;
use Data::Dumper;
use JSON qw( encode_json decode_json);
use HTTP::Tiny;
use POSIX qw(strftime);

# use perfSONAR_PS::Utils::GeoLookup qw(geoIPLookup);

my $cgi = CGI->new();

#if (defined $cgi->param( "help" )) {
if (param( "help" )) {
    # Return help message
    my $msg->{usage}="get-tracetests.pl?param1=value1&param2=value2...
          mahost=<url>           Hostname of measurement archive to query (default https://localhost)
          start=<iso datetime>   Start time of range (default today 00:00 local timezone)
          end=<iso datetime>     End time of range (default today 23:59 local timezone)
          from=<hostname>        Source host to apply (if not given a list of host peers is returned)
          to=<hostname>          Destination host to apply (if not given a list of host peers is returned)
          verify_SSL=[0|1]       Flag to disable certificate checking (default 0)
          help                   Print help text";			 
    print $cgi->header( -type => 'application/json', -charset => 'utf-8');
    print encode_json($msg), "\n";
    exit(0);
}    

# Fetch config data (and remove html header)
my $config = decode_json(`/usr/lib/perfsonar/bin/microdep_commands/get-mapconfig.cgi | tail -n +2`);

# Prepare parameters for search query
my $mahost=  $cgi->param( "mahost" ) || $config->{'config'}->{$cgi->param('net')}->{'archive'} || 'http://localhost:9200';
my $iso_start = $cgi->param("start") || strftime("%Y-%m-%dT00:00:00%z", localtime);  # ISO formatted beginning of today in current timezone
if ( ! ($iso_start =~ /\D/) ) {
    # Not ISO but likely epoch time. Convert.
    $iso_start = strftime("%Y-%m-%dT00:00:00%z", localtime($cgi->param("start")));
}
my $iso_end = $cgi->param("end") || strftime("%Y-%m-%dT23:59:59%z", localtime);    # ISO formatted end of today in current timezone
if ( ! ($iso_end =~ /\D/) ) {
    # Not ISO but likely epoch time. Convert.
    $iso_end = strftime("%Y-%m-%dT00:00:00%z", localtime($cgi->param("end")));
}
my $from = $cgi->param("from");
my $to = $cgi->param("to");
my $verify_SSL= 1;
$verify_SSL = $cgi->param("verify_SSL") if (defined $cgi->param("verify_SSL"));

# Prepare query
my $query='';
if (! $from || ! $to ) {
    # Search for all peers with trace test results available
    $query = '{ "query": { "bool": { "filter": [ { "term": { "test.type.keyword": "trace" } }, 
                                                 { "range": { "@timestamp": { "gte": "' . $iso_start . '", "lt": "' . $iso_end . '" } } } ] } },
		"size": 0,
  	        "aggs": { "peers": { "multi_terms": { "terms": [ { "field": "test.spec.source.keyword"}, 
                                                                { "field": "test.spec.dest.keyword"} ],
                                                     "size" : 1000000  },
                                    "aggs": { "timestamp": { "max": { "field": "@timestamp" } } }

                                   } } }'; # size = <large-number> to ensure all peers found are returned
} else {
    # Search for trace test results (traceroutes) in a time range between the
    # given hosts. `from`/`to` may be COMMA-SEPARATED candidate lists (e.g.
    # "hostname,IP"): the microdep map identifies a node by its topology name,
    # while pscheduler records test.spec.source/dest as an IP on one side and a
    # hostname on the other. When a list is supplied we match ANY candidate and
    # accept EITHER direction (traces frequently exist only one way), so the
    # Real-locations view still resolves a path. A single value each keeps the
    # original exact, directional behaviour (used by ls-tab / tracetree).
    # Candidates are sanitised to hostname/IP characters to keep the
    # interpolated JSON well-formed.
    my @from_list = grep { /^[0-9A-Za-z._:-]+$/ } map { my $x=$_; $x =~ s/^\s+|\s+$//g; $x } split(/,/, $from);
    my @to_list   = grep { /^[0-9A-Za-z._:-]+$/ } map { my $x=$_; $x =~ s/^\s+|\s+$//g; $x } split(/,/, $to);
    @from_list = ($from) unless @from_list;   # fall back to raw if sanitiser emptied it
    @to_list   = ($to)   unless @to_list;
    if (@from_list > 1 || @to_list > 1) {
        my $fl = join(',', map { '"' . $_ . '"' } @from_list);
        my $tl = join(',', map { '"' . $_ . '"' } @to_list);
        $query = '{ "query": { "bool": { "filter": [ { "term": { "test.type.keyword": "trace" } },
                       { "range": { "@timestamp": { "gte": "' . $iso_start . '", "lt": "' . $iso_end . '" } } },
                       { "bool": { "minimum_should_match": 1, "should": [
                           { "bool": { "must": [ { "terms": { "test.spec.source.keyword": [' . $fl . '] } }, { "terms": { "test.spec.dest.keyword": [' . $tl . '] } } ] } },
                           { "bool": { "must": [ { "terms": { "test.spec.source.keyword": [' . $tl . '] } }, { "terms": { "test.spec.dest.keyword": [' . $fl . '] } } ] } }
                         ] } }
                     ] } }, "size": 8640 }';
    } else {
        $query = '{ "query": { "bool": { "filter": [ { "term": { "test.type.keyword": "trace" } },
                                                     { "term": { "test.spec.source.keyword": "' . $from . '" } },
                                                     { "term": { "test.spec.dest.keyword": "' . $to . '" } },
                                                     { "range": { "@timestamp": { "gte": "' . $iso_start . '", "lt": "' . $iso_end . '" } } }
                                                   ] } }, "size": 8640 }';
    }
}

print $query,"\n" if ($cgi->param('debug'));

# Run query
my $http_session = HTTP::Tiny->new( 'verify_SSL' =>  $verify_SSL );
#my $response = $http_session->post( $mahost . '/opensearch/pscheduler/_search', 'Content-Type' => 'application/json', Content => $query );
my $request_options = { 'headers' => { 'Content-Type' => 'application/json' }, 'content' => $query };
#my $response = $http_session->request( 'POST', $mahost . '/opensearch/pscheduler/_search', $request_options );
my $response = $http_session->request( 'POST', $mahost . '/pscheduler/_search', $request_options );
# Return (output) respons
print  $cgi->header( -type => $response->{headers}{'content-type'},  -charset => 'utf-8');
print $response->{content};
exit(0);

