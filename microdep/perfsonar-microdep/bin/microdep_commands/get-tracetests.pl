#!/usr/bin/perl -w
#
# Request all traceroute tests from a measurement archive applying Open search API
# Returns a json document with Open search results
# Usage :  get-tracetests.pl?param1=value1&param2=value2...
#          net=<network>          Measurement network whose archive to query, as named in mapconfig.yml (default the default network)
#          start=<iso datetime>   Start time of range (default today 00:00 local timezone)
#          end=<iso datetime>     End time of range (default today 23:59 local timezone)
#          from=<hostname>        Source host to apply (if not given a list of host peers is returned)
#          to=<hostname>          Destination host to apply (if not given a list of host peers is returned)
#          debug=<0-3>            Debug level (default 0). Writes the query to the web server's error log
#          help                   Print help text     
#
# The archive is always the one mapconfig.yml gives the network: the script
# takes no archive address from the request.
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
          net=<network>          Measurement network whose archive to query, as named in mapconfig.yml (default the default network)
          start=<iso datetime>   Start time of range (default today 00:00 local timezone)
          end=<iso datetime>     End time of range (default today 23:59 local timezone)
          from=<hostname>        Source host to apply (if not given a list of host peers is returned)
          to=<hostname>          Destination host to apply (if not given a list of host peers is returned)
          help                   Print help text";			 
    print $cgi->header( -type => 'application/json', -charset => 'utf-8');
    print encode_json($msg), "\n";
    exit(0);
}    

# Fetch config data (and remove html header)
my $config = decode_json(`/usr/lib/perfsonar/bin/microdep_commands/get-mapconfig.cgi | tail -n +2`);

# Prepare parameters for search query
# The archive is the one mapconfig.yml gives the measurement network. An address
# taken from the request would let anyone make this host send requests wherever
# they like, and hand the answer back as if it came from this site.
my $networks = $config->{'config'} || {};
my $net = $cgi->param('net');
if (! defined $net || $net eq '') {
    # No network given: the one marked as the default
    ($net) = grep { ref $networks->{$_} eq 'HASH' && ($networks->{$_}->{'default_network'} || '') =~ /^(1|true|yes)$/i } sort keys %$networks;
}
fail('400 Bad Request', 'Unknown measurement network') unless (defined $net && ref $networks->{$net} eq 'HASH');
my $mahost = $networks->{$net}->{'archive'} || 'https://localhost/opensearch';

# Start and end go into the query as they are, so only a well-formed ISO time
# (or epoch seconds, converted here) is accepted.
my $iso_time = qr/\A\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?\z/;
my $iso_start = $cgi->param("start") || strftime("%Y-%m-%dT00:00:00%z", localtime);  # ISO formatted beginning of today in current timezone
if ( $iso_start =~ /\A\d{1,11}\z/ ) {
    # Not ISO but likely epoch time. Convert.
    $iso_start = strftime("%Y-%m-%dT00:00:00%z", localtime($iso_start));
}
my $iso_end = $cgi->param("end") || strftime("%Y-%m-%dT23:59:59%z", localtime);    # ISO formatted end of today in current timezone
if ( $iso_end =~ /\A\d{1,11}\z/ ) {
    # Not ISO but likely epoch time. Convert.
    $iso_end = strftime("%Y-%m-%dT00:00:00%z", localtime($iso_end));
}
fail('400 Bad Request', 'Invalid start or end time') unless ($iso_start =~ $iso_time && $iso_end =~ $iso_time);
my $from = $cgi->param("from");
my $to = $cgi->param("to");

# Optional IP-version filter. The map passes the selected network's version so a
# Net-6 traceroute view does not fall back to the v4 traces (issue #127). Only
# 4 and 6 are accepted; anything else (including an empty value, meaning "all
# versions") leaves the results unfiltered.
my $ip_version = $cgi->param("ip_version");
my $ipv_filter = '';
if (defined $ip_version && $ip_version =~ /^([46])$/) {
    $ipv_filter = ', { "term": { "test.spec.ip-version": ' . $1 . ' } }';
}

# Optional trimming for callers that only need the path. The traceroute viewer
# reads the timestamp, the test spec and the parsed hops; the rest of a
# pscheduler document (raw output, meta, schedule) is more than half its size,
# which matters once one request carries every peer of a host.
my $source_filter = '';
$source_filter = '"_source": [ "@timestamp", "test.spec", "result.json", "result.succeeded" ], ' if ($cgi->param('slim'));
# Optional result cap. OpenSearch refuses more than 10000 hits in one page.
my $size = 8640;
if (defined $cgi->param('size') && $cgi->param('size') =~ /^(\d+)$/) {
    $size = $1 > 10000 ? 10000 : $1;
}

# Prepare query
my $query='';
if (! $from || ! $to ) {
    # Search for all peers with trace test results available
    $query = '{ "query": { "bool": { "filter": [ { "term": { "test.type.keyword": "trace" } }, 
                                                 { "range": { "@timestamp": { "gte": "' . $iso_start . '", "lt": "' . $iso_end . '" } } }' . $ipv_filter . ' ] } },
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
    # Candidates are limited to hostname/IP characters to keep the
    # interpolated JSON well-formed, and a host with none left is refused.
    my @from_list = grep { /\A[0-9A-Za-z_.:-]+\z/ } map { my $x=$_; $x =~ s/^\s+|\s+$//g; $x } split(/,/, $from);
    my @to_list   = grep { /\A[0-9A-Za-z_.:-]+\z/ } map { my $x=$_; $x =~ s/^\s+|\s+$//g; $x } split(/,/, $to);
    fail('400 Bad Request', 'Invalid from or to host') unless (@from_list && @to_list);
    if (@from_list > 1 || @to_list > 1) {
        my $fl = join(',', map { '"' . $_ . '"' } @from_list);
        my $tl = join(',', map { '"' . $_ . '"' } @to_list);
        $query = '{ "query": { "bool": { "filter": [ { "term": { "test.type.keyword": "trace" } },
                       { "range": { "@timestamp": { "gte": "' . $iso_start . '", "lt": "' . $iso_end . '" } } }' . $ipv_filter . ',
                       { "bool": { "minimum_should_match": 1, "should": [
                           { "bool": { "must": [ { "terms": { "test.spec.source.keyword": [' . $fl . '] } }, { "terms": { "test.spec.dest.keyword": [' . $tl . '] } } ] } },
                           { "bool": { "must": [ { "terms": { "test.spec.source.keyword": [' . $tl . '] } }, { "terms": { "test.spec.dest.keyword": [' . $fl . '] } } ] } }
                         ] } }
                     ] } }, ' . $source_filter . '"size": ' . $size . ' }';
    } else {
        $query = '{ "query": { "bool": { "filter": [ { "term": { "test.type.keyword": "trace" } },
                                                     { "term": { "test.spec.source.keyword": "' . $from_list[0] . '" } },
                                                     { "term": { "test.spec.dest.keyword": "' . $to_list[0] . '" } },
                                                     { "range": { "@timestamp": { "gte": "' . $iso_start . '", "lt": "' . $iso_end . '" } } }' . $ipv_filter . '
                                                   ] } }, ' . $source_filter . '"size": ' . $size . ' }';
    }
}

# To the error log: anything printed here would land ahead of the HTTP header
print STDERR $query,"\n" if ($cgi->param('debug'));

# Run query
# The archive's certificate is not checked, as elastic-get-date-type.pl does not
# check it either: the usual archive is https://localhost/opensearch, and the
# certificate there is issued for the host's name, not for localhost.
my $http_session = HTTP::Tiny->new( 'verify_SSL' => 0 );
#my $response = $http_session->post( $mahost . '/opensearch/pscheduler/_search', 'Content-Type' => 'application/json', Content => $query );
my $request_options = { 'headers' => { 'Content-Type' => 'application/json' }, 'content' => $query };
#my $response = $http_session->request( 'POST', $mahost . '/opensearch/pscheduler/_search', $request_options );
my $response = $http_session->request( 'POST', $mahost . '/pscheduler/_search', $request_options );
# Return (output) respons
# Always as JSON, whatever content type the archive answered with, so the
# browser never treats the answer as a page. A failed request is a 502, so the
# map reports it instead of drawing an empty result.
my $content = $response->{content};
# HTTP::Tiny describes a failure to reach the archive (connection, TLS) in plain text
$content = encode_json({ error => { reason => $content } }) if ($response->{status} == 599);
print $cgi->header( -type => 'application/json', -charset => 'utf-8',
                    -status => ($response->{success} ? '200 OK' : '502 Bad Gateway'),
                    -x_content_type_options => 'nosniff' );
print $content;
exit(0);

# Refuse the request with a JSON error, without echoing anything from it
sub fail {
    my ($status, $reason) = @_;
    print $cgi->header( -type => 'application/json', -charset => 'utf-8', -status => $status,
                        -x_content_type_options => 'nosniff' );
    print encode_json({ error => { reason => $reason } }), "\n";
    exit(0);
}

