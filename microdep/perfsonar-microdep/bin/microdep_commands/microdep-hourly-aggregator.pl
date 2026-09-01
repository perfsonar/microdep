#!/usr/bin/perl
#
# Hourly gap-summary aggregator (microdep-hourly-aggregator.pl)
#
# Reads raw `gap` events from opensearch for the previous full hour,
# aggregates them per (from, to, ip_version), and emits gapsum_h
# records — one per peer-pair per hour — through the same logstash
# JSON sink that qstream-gap-ana writes to. Logstash picks these up
# via the gap-ana*.json glob, geo-enriches them, and routes them to
# the same opensearch index as the raw gap events. The frontend
# sparkline can then query event_type=gapsum_h for ~24 buckets/day
# of `down_ppm` (etc.) instead of the single daily gapsum record
# qstream-gap-ana emits at service-restart time.
#
# This is a deliberately non-invasive companion to qstream-gap-ana:
# we do NOT modify the live daemon's accumulation/emit logic, so the
# existing daily gapsum keeps flowing untouched. We just compute a
# parallel hourly aggregate from the raw gap events that are ALREADY
# being indexed.
#
# Cron / systemd timer should run this once per hour, a few seconds
# past the top of the hour, processing the previous full hour. Default
# behaviour: --offset=1 (the hour that just ended), --window=3600.
#

use strict;
use warnings;
use YAML;
use JSON;
use POSIX qw(strftime);
use Getopt::Long;

# ----- options -----
my $opt_index    = 'microdep_gap_ana';
my $opt_outdir   = '/var/lib/logstash/microdep';
my $opt_outfile  = 'gap-ana-hourly.json';
my $opt_window   = 3600;     # seconds in one summary bucket
my $opt_offset   = 1;        # how many windows ago to process (1 = previous full hour)
my $opt_backfill = 1;        # how many windows total to emit (>=1 lets cron catch up after outages)
my $opt_dryrun   = 0;
my $opt_verbose  = 0;
my $opt_esurl    = '';       # explicit override; otherwise pulled from microdep-config.yml
GetOptions(
    'index=s'    => \$opt_index,
    'outdir=s'   => \$opt_outdir,
    'outfile=s'  => \$opt_outfile,
    'window=i'   => \$opt_window,
    'offset=i'   => \$opt_offset,
    'backfill=i' => \$opt_backfill,
    'dryrun!'    => \$opt_dryrun,
    'verbose!'   => \$opt_verbose,
    'esurl=s'    => \$opt_esurl,
) or die "bad options\n";

my $config_path = "/etc/perfsonar/microdep/microdep-config.yml";
my $esurl = $opt_esurl;
if ( ! $esurl ) {
    my $cfg = -r $config_path ? YAML::LoadFile($config_path) : {};
    $esurl = $cfg->{opensearch_url} || 'http://localhost:9200';
    # NB: we use the same URL the rest of the microdep stack uses
    # (typically https://localhost/opensearch — an apache reverse-proxy
    # rule that forwards to opensearch without requiring auth, mirroring
    # what elastic-get-date-type.pl relies on). curl's --insecure flag
    # tolerates the self-signed cert.
}
print STDERR "microdep-hourly-aggregator: opensearch URL = $esurl\n" if $opt_verbose;

# ----- output sink -----
my $outpath = "$opt_outdir/$opt_outfile";
my $out;
if ( $opt_dryrun ) {
    $out = \*STDOUT;
} else {
    if ( ! -d $opt_outdir ) {
        die "Output directory $opt_outdir does not exist\n";
    }
    open($out, ">>", $outpath) or die "Cannot open $outpath for append: $!\n";
}

# ----- iterate windows (oldest → newest so logstash sees them in order) -----
my $now = time();
my $base = $now - ($now % $opt_window);   # top of current hour
my $total_emitted = 0;

for ( my $w = $opt_backfill - 1; $w >= 0; $w-- ) {
    my $bucket_offset = $opt_offset + $w;
    my $bucket_start  = $base - ($bucket_offset * $opt_window);
    my $bucket_end    = $bucket_start + $opt_window;
    $total_emitted += process_bucket($bucket_start, $bucket_end, $out);
}

close($out) unless $opt_dryrun;
print STDERR "microdep-hourly-aggregator: emitted $total_emitted gapsum_h records\n" if $opt_verbose;
exit 0;

# =====================================================================

sub process_bucket {
    my ($bucket_start, $bucket_end, $out) = @_;

    my $start_iso = strftime("%Y-%m-%dT%H:%M:%S", gmtime($bucket_start)) . '.000Z';
    my $end_iso   = strftime("%Y-%m-%dT%H:%M:%S", gmtime($bucket_end))   . '.000Z';
    my $date_str  = strftime("%Y-%m-%d",          gmtime($bucket_start));

    print STDERR "microdep-hourly-aggregator: window $start_iso → $end_iso\n" if $opt_verbose;

    # Aggregate by (from, to, ip_version). Each leaf carries the per-bucket
    # stats we need to compose a gapsum_h record. The from_adr/to_adr terms
    # are size:1 because (from, to) → IP is a stable mapping for the
    # bucket; we just want the value, not a distribution.
    my $query = sprintf( q{
{
  "size": 0,
  "query": {
    "bool": {
      "must": [
        { "match_phrase": { "event_type": "gap" } },
        { "range": { "@timestamp": {
            "gte": "%s",
            "lt":  "%s"
        }}}
      ]
    }
  },
  "aggs": {
    "from": {
      "terms": { "field": "from.keyword", "size": 10000 },
      "aggs": {
        "to": {
          "terms": { "field": "to.keyword", "size": 10000 },
          "aggs": {
            "ip_version": {
              "terms": { "field": "ip_version", "size": 2 },
              "aggs": {
                "tloss_sum": { "sum":         { "field": "tloss" } },
                "tloss_max": { "max":         { "field": "tloss" } },
                "gap_count": { "value_count": { "field": "tloss" } },
                "h_min_d":   { "avg":         { "field": "h_min_d" } },
                "h_jit":     { "avg":         { "field": "h_jit" } },
                "h_ddelay":  { "avg":         { "field": "h_ddelay" } },
                "from_adr":  { "terms": { "field": "from_adr.keyword", "size": 1 } },
                "to_adr":    { "terms": { "field": "to_adr.keyword",   "size": 1 } }
              }
            }
          }
        }
      }
    }
  }
}
}, $start_iso, $end_iso );

    my $url = "$esurl/$opt_index/_search";
    # -k tolerates self-signed certs on https endpoints; harmless on http.
    # The query is heredoc'd into stdin to avoid quoting hell on the cmdline.
    my $resp = run_curl($url, $query);
    my $data = eval { decode_json($resp) };
    if ( $@ || ! $data ) {
        warn "Failed to decode opensearch response: $@\nResponse was: $resp\n";
        return 0;
    }
    if ( $data->{error} ) {
        warn "Opensearch error: " . encode_json($data->{error}) . "\n";
        return 0;
    }
    if ( ! $data->{aggregations} ) {
        warn "No aggregations in response: " . encode_json($data) . "\n";
        return 0;
    }

    my $emitted = 0;
    my $duration_ms = $opt_window * 1000;
    for my $fb ( @{ $data->{aggregations}{from}{buckets} } ) {
        my $from = $fb->{key};
        for my $tb ( @{ $fb->{to}{buckets} } ) {
            my $to = $tb->{key};
            for my $ipvb ( @{ $tb->{ip_version}{buckets} } ) {
                my $ipv       = $ipvb->{key};
                my $tloss_sum = num($ipvb->{tloss_sum}{value});       # ms accumulated
                my $tloss_max = num($ipvb->{tloss_max}{value});
                my $gap_count = num($ipvb->{gap_count}{value});
                my $h_min_d   = num($ipvb->{h_min_d}{value});
                my $h_jit     = num($ipvb->{h_jit}{value});
                my $h_ddelay  = num($ipvb->{h_ddelay}{value});
                my $from_adr  = $ipvb->{from_adr}{buckets}[0] ? $ipvb->{from_adr}{buckets}[0]{key} : undef;
                my $to_adr    = $ipvb->{to_adr}{buckets}[0]   ? $ipvb->{to_adr}{buckets}[0]{key}   : undef;

                # down_ppm == part-per-million of the bucket's wallclock spent in a gap.
                # Matches the formula qstream-gap-ana uses for the daily gapsum.
                my $down_ppm = $duration_ms > 0
                    ? sprintf("%.3f", 1_000_000 * $tloss_sum / $duration_ms) * 1.0
                    : 0;

                my $rec = {
                    event_type   => "gapsum_h",
                    from         => $from,
                    to           => $to,
                    from_to      => "${from}_${to}",
                    (defined $from_adr ? (from_adr => $from_adr) : ()),
                    (defined $to_adr   ? (to_adr   => $to_adr)   : ()),
                    ip_version   => $ipv + 0,
                    down_ppm     => $down_ppm,
                    gap_count    => $gap_count,
                    tloss_sum    => $tloss_sum,
                    tloss_max    => $tloss_max,
                    h_min_d      => $h_min_d,
                    h_jit        => $h_jit,
                    h_ddelay     => $h_ddelay,
                    lasted_sec   => $opt_window,
                    window_sec   => $opt_window,
                    timestamp    => $bucket_start + 0,
                    '@timestamp' => $start_iso,
                    '@date'      => $date_str,
                };

                print $out encode_json($rec), "\n";
                $emitted++;
            }
        }
    }

    print STDERR "microdep-hourly-aggregator: bucket $start_iso emitted $emitted records\n" if $opt_verbose;
    return $emitted;
}

# Coerce numeric value, defaulting to 0 for null. We force numeric context
# (`+ 0`) so encode_json emits numbers, not strings.
sub num {
    my $v = shift;
    return 0 unless defined $v;
    return $v + 0;
}

# Post a JSON body to the given URL, return the response body. Captures
# curl's stderr too so we can see TLS / connect errors in --verbose mode
# (without it the silent failure mode is "empty response, malformed JSON
# decode error" — useless for debugging). The response body and the
# http status code are written to separate tempfiles so we don't have
# to invent an in-band separator (curl's -w doesn't expand \xNN escapes,
# only printf-style ones, so trying to split on RS at the boundary leaks
# the literal "\x1e" into the body).
sub run_curl {
    my ($url, $body) = @_;
    my $tmp_in   = "/tmp/microdep-hourly-aggregator-$$.in.json";
    my $tmp_out  = "/tmp/microdep-hourly-aggregator-$$.out.json";
    my $tmp_err  = "/tmp/microdep-hourly-aggregator-$$.err";
    open(my $fh, ">", $tmp_in) or die "tmpfile: $!";
    print $fh $body;
    close $fh;
    # -sS silent except for errors; -k tolerate self-signed; -o writes
    # body to a file; -w '%{http_code}' returns *just* the status code
    # on stdout, free of the body.
    my $cmd = qq{curl -sS -k -X POST -H "Content-Type: application/json" }
            . qq{-w '%{http_code}' -o $tmp_out "$url" --data-binary \@$tmp_in 2>$tmp_err};
    print STDERR "microdep-hourly-aggregator: $cmd\n" if $opt_verbose;
    my $http_code = `$cmd`;
    my $exit = $? >> 8;
    chomp($http_code) if defined $http_code;
    my $stderr = slurp($tmp_err);
    my $body_resp = slurp($tmp_out);
    unlink $tmp_in; unlink $tmp_out; unlink $tmp_err;
    if ( $exit != 0 || $http_code !~ /^2/ ) {
        warn "microdep-hourly-aggregator: curl failed (exit=$exit http=$http_code): $stderr\n";
    }
    print STDERR "microdep-hourly-aggregator: http=$http_code, body length=" . length($body_resp) . "\n" if $opt_verbose;
    return $body_resp;
}

sub slurp {
    my $path = shift;
    return '' unless -r $path;
    open(my $fh, "<", $path) or return '';
    local $/; my $c = <$fh>; close $fh;
    return defined $c ? $c : '';
}
