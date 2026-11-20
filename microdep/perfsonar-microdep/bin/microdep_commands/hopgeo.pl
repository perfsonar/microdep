#!/usr/bin/perl -w
#
# hopgeo.pl — batched IP-geolocation lookup for traceroute hops.
#
# Used by microdep-map's "Real locations" mode: the frontend collects every
# unknown hop IP from the visible traceroutes and sends them in one request
# rather than firing one CGI invocation per hop.
#
# Geolocation source: the local GeoLite2-City MMDB shipped with perfSONAR,
# read via MaxMind::DB::Reader. No external service is contacted — the team
# standardised on GeoLite2 and explicitly wants to avoid third-party lookup
# APIs, so this only reads the bundled database.
#
# Usage:  /microdep/hopgeo.pl?ips=8.8.8.8,1.1.1.1,...
#         /microdep/hopgeo.pl?ips=8.8.8.8            (single)
#
# Returns: a JSON object keyed by IP. Each value is either
#   { "lat": <num>, "lon": <num>, "city": <str?>, "country_code": <str?>,
#     "src": "geolite2" }
# when the address resolves, or null when no record exists / the IP is
# private / the lookup fails. (`src` is informational; the frontend ignores it.)
#
# Notes:
# - Only IPv4 dotted-quad and IPv6 hex/colon characters are accepted; anything
#   else is dropped silently (the caller sees a missing key and falls back to
#   "unknown").
# - Private (RFC1918, ULA, link-local, loopback, CGN) ranges are short-
#   circuited to null without a lookup — no public DB has data for them.
# - Hard cap of 500 IPs per request so a broken caller can't run away.
#
use strict;
use warnings;
use CGI ();
use JSON qw(encode_json);

# Candidate locations for GeoLite2-City.mmdb, most-specific first. The
# perfSONAR geolite2 (enrichdbs) package installs under /usr/share/perfsonar
# or /etc/perfsonar; the system geoipupdate path (/var/lib/GeoIP) is the
# common fallback and is where test hosts usually have it. First readable
# file wins.
my @DB_CANDIDATES = (
    '/usr/share/perfsonar/microdep/GeoLite2/GeoLite2-City.mmdb',
    '/etc/perfsonar/microdep/GeoLite2/GeoLite2-City.mmdb',
    '/var/lib/GeoIP/GeoLite2-City.mmdb',
    '/usr/share/GeoIP/GeoLite2-City.mmdb',
);
my $MAX_IPS = 500;

my $cgi = CGI->new();
print $cgi->header(-type => 'application/json', -charset => 'utf-8');

my $ips_param = $cgi->param('ips');
unless (defined $ips_param && length $ips_param) {
    print encode_json({ error => 'missing ips parameter' });
    exit 0;
}

# Split + sanitise.
my @raw = split /,/, $ips_param;
my (%seen, @ips);
for my $r (@raw) {
    $r =~ s/^\s+|\s+$//g;
    next unless length $r;
    next if $seen{$r}++;
    next unless $r =~ /^[0-9a-fA-F\.\:]+$/;
    push @ips, $r;
    last if @ips >= $MAX_IPS;
}

# Open the first readable GeoLite2 database.
my ($db_path) = grep { -r $_ } @DB_CANDIDATES;
my $reader;
if ($db_path) {
    eval {
        require MaxMind::DB::Reader;
        $reader = MaxMind::DB::Reader->new(file => $db_path);
        1;
    };
}
unless ($reader) {
    print encode_json({
        error => 'GeoLite2-City database not available (tried: '
               . join(', ', @DB_CANDIDATES) . ')'
    });
    exit 0;
}

my %result;
for my $ip (@ips) {
    if (is_private_ip($ip)) { $result{$ip} = undef; next; }
    $result{$ip} = geolite_lookup($ip);
}

print encode_json(\%result);
exit 0;

# ---------------------------------------------------------------------------
# Look up a single address in the GeoLite2-City MMDB. MaxMind::DB::Reader is a
# format-level reader, so the record schema (location.latitude/longitude,
# city.names.en, country.iso_code) is exactly the GeoLite2-City layout.
sub geolite_lookup {
    my ($ip) = @_;
    return undef unless $reader;
    my $rec;
    eval { $rec = $reader->record_for_address($ip); 1 } or return undef;
    return undef unless $rec && $rec->{location};
    my $loc = $rec->{location};
    return undef unless defined $loc->{latitude} && defined $loc->{longitude};
    my $entry = {
        lat => $loc->{latitude}  + 0,
        lon => $loc->{longitude} + 0,
        src => 'geolite2',
    };
    $entry->{city}         = $rec->{city}{names}{en}   if $rec->{city}    && $rec->{city}{names};
    $entry->{country_code} = $rec->{country}{iso_code} if $rec->{country} && $rec->{country}{iso_code};
    return $entry;
}

# ---------------------------------------------------------------------------
# Knock out RFC1918, RFC4193, link-local, loopback, CGN. Returns true for
# "private / no public geo possible". Cheap regex rather than a full Net::IP
# parse since this runs per-hop.
sub is_private_ip {
    my ($ip) = @_;
    # IPv4
    if ($ip =~ /^(\d+)\.(\d+)\.(\d+)\.\d+$/) {
        my ($a, $b) = ($1, $2);
        return 1 if $a == 10;
        return 1 if $a == 127;
        return 1 if $a == 169 && $b == 254;               # link-local
        return 1 if $a == 172 && $b >= 16 && $b <= 31;
        return 1 if $a == 192 && $b == 168;
        return 1 if $a == 100 && $b >= 64 && $b <= 127;    # CGN
        return 0;
    }
    # IPv6
    return 1 if $ip =~ /^::1$/;                 # loopback
    return 1 if $ip =~ /^fe80:/i;               # link-local
    return 1 if $ip =~ /^f[cd][0-9a-f]{2}:/i;   # ULA
    return 0;
}
