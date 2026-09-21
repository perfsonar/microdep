#! /usr/bin/perl
#
#  Find time corrolated JSON events from multiple source streams
#
#  Parses JSON sources with Elastic search compatible entries and search for entries
#  with similar timestamp. Generate a JSON output with matched entries.
#
#  Input  JSON documents assumed to have at least
#    { "@timestamp"  : "<UTC ISO timestamp>,
#      "@date"       : "<UTC ISO timestamp>,
#      "from"        : "<src hostname>",
#      "to"          : "<dst hostname>",
#      "from_addr"   : "<src ip address>",
#      "to_addr"     : "<dst ip address>",
#      ...
#    }
#
#  Author: OttoJ Wittner
#  Email: otto.wittner@sikt.no
#  Date: 2022-04-26
#
#  Change log:
#    2026-09-11 Adaption to perfsonar microdep started (otto.wittner@sikt.no)
#

use strict;
use warnings;
use Getopt::Long;   # Commandline argument parser
use Time::Piece;    # Date and time string parsing
use JSON;
use Math::Complex;
use Socket;
use IO::Uncompress::Gunzip qw(gunzip $GunzipError) ;
#use PerlIO::gzip;
use Data::Dumper;
use IO::Handle;
#use Search::Elasticsearch;
use LWP::UserAgent;
use IO::Socket::SSL;
use DateTime::Format::ISO8601;


# States for state machine parsing traceroute logs
use constant {
    NONE => 0,
    TIMESTAMP_FOUND => 1,
    HEADERLINE_FOUND => 2,
    HOPLINE_FOUND => 3
};

# Global variables
my $opt_help;
my $opt_gunzip;
my @opt_matchfield;         # Name of field that needs to match for corrolation
my @opt_timefield;          # Name of field with time info to look for
my @opt_eventmatch;         # List of events required to correlate for report to be output
my @opt_peermatch;          # List of peers (from,to) relevant for corrolation window
my $opt_window_size;        # Max time difference accepted for event corrolation
my $opt_inputbuffersize;    # No of events to keep in sorted input buffer
my $opt_pidfile;;           # Name of process id file
my $opt_url;                # Url to ES compatible source
my $opt_daterange;          # ISO date range to filter on (local time zone if no zone is given).
my $opt_follow;             # True if first input file is to be followed
my $opt_roundrobin;         # True if cyclic read from sources is selected.
my $opt_strict_eventorder;  # True if strict order of matching events is required.
my $opt_sleepinterval;      # Timeperiod for re-reading file when followed.
my $opt_config_file;        # Path to config file
my $opt_verbose;            # Verbose flag

my @inputfile;              # Filehandles for input files. 
my @inputfile_raw;          # Filehandles for input files. 
my @inputfile_ts;           # Latest timestamp read from sources
my $tz_local = localtime()->strftime("%z");  # Local timezone;
substr($tz_local,3,0) = ":";                 # Insert ":" in timezone
my $start_iso = '';         # ISO start time.
my $end_iso = '';           # ISO end time.
my $start_time = -1;        # Epoch start time.
my $end_time = -1;          # Epoch end time.
my $tryagain = 1;           # Flag to enable "tail -f" follow-behavior

my $es;   # Elastich search object

my $corr_event_name = 'correlation';    # Default name for discovered correlation event
my %corr_events_window;   # A hash table of correlations windows, on for each unique set of match-field values
my %corrsum_event;           # Hash table for accumulating summary info
my @tot_uniq_events;      

my $config={};           # Config loaded from file

sub load_config {
    # Parse config file and set option values.
    my $config_file = shift;
    
    use YAML;
    $config = YAML::LoadFile($config_file);
    # Prepare list of supported options ( Copied from GetOptions!)
    my %supported_options = (
	"timefield=s" => \@opt_timefield,       # Array of names of time-fields. One for each given JSON input file. 
	"follow" => \$opt_follow,               # follow source 
	"roundrobin" => \$opt_roundrobin,       # Apply round robin read of input sources.
	"gunzip"  => \$opt_gunzip,              # flag enabling gunzip of input 
	"matchfield=s" => \@opt_matchfield,     # Name of field that needs to match for events to be corrolated. Option may be repeated.
	"eventmatch=s" => \@opt_eventmatch,     # Name of event required in correlation. Option may be repeated.
	"peer=s" => \@opt_peermatch,            # "<from>,<to>" peer relevant for corrocation. Option may be repeated. Default is all peers.
	"strict"  => \$opt_strict_eventorder,   # flag enabling strict order of matching events
	"windowsize=i" => \$opt_window_size,    # Max acceptable time difference for event corrolation
	"buffersize=i" => \$opt_inputbuffersize,    # Max acceptable time difference for event corrolation
	"interval=i" => \$opt_sleepinterval,    # Sleep interval between polls for new content
	"pidfile=s"  => \$opt_pidfile,          # string for process id file
	"url=s"  => \$opt_url,                  # Url string to Elastic Search compatible source (including credentials)
	"date=s"  => \$opt_daterange,           # Filter on ISO date range (local time zone if none is given)
	"conf=s"  => \$opt_config_file,         # Path to YAML config file.
	"verbose"  => \$opt_verbose,            # Flag for outputting more info
	"help"  => \$opt_help                   # Flag for help message
	); 
    foreach my $opt (keys %{$config}) {
	# Set option based on value from config file
	if (exists $supported_options{$opt}) {
	    if ( ! ${$supported_options{$opt}} ) {
		# A boolean option not yet set. Apply value from config file.
		${$supported_options{$opt}} = ( $config->{$opt} eq 'true' );
	    }
	} elsif (exists $supported_options{$opt . '=s'}) {
	    if (! ${$supported_options{$opt . '=s'}} ) {
		# A key-value option not yet set. Apply value from config file.
		${$supported_options{$opt . '=s'}} = $config->{$opt};
	    }
	} else {
	    # Unsupported config option
	    warn "Unsupported option '$opt' in config file '$config_file'. Ignoring."
	}
    }
}


sub init_corrsum_event {
    # Clear accumumlated summary info
    my $matchfieldvalues = shift;
    $corrsum_event{ $matchfieldvalues } = {
	"event_type" => "corrsum",  
	"timestamp" => 0,  
	"timestamp_start" => 0,  
	"timestamp_end" => 0,  
	"count" => 0,                   # No of correlations events
	"corr_count" => 0,              # Sum of all events in all correlations 
	"corr_count_uniq" => 0,         # Total no of unique event types involved in correlations
	"corr_count_src" => 0,          # Max no of sourcefiles seen for a correlation
	"uniq_events" => "",            # List of unique event types involved in correlations
	"sum_duration" => 0,            # Tot Sum of windows size / duration of correlations				
	"sum_tloss" => 0,               # Total of values for tloss field (gaps)
	"max_tloss" => 0,               # Max value for tloss field (gaps)
	"avg_duration" => 0,            # Average windows size / duration of correlations
	"tot_uniq_events" => [],        # List of unique correlating events seen in total
	} ;
    
    # Add matchfields with values
    my @mf_value = split(" ", $matchfieldvalues);
    scalar @mf_value == scalar @opt_matchfield || die "Error: Missmatch in num of match fields and match field values.";
    for my $i (0...$#mf_value) { 
	$corrsum_event{ $matchfieldvalues }{$opt_matchfield[$i]} = $mf_value[$i];
    }
}

# Clean up before exit
sub clean_up {

    # Output summary events
    foreach my $key (keys %corrsum_event) {
	# Prepare timestamp for specified date with local timesone
#	my $iso_time = $date . "T23:59:59.999" . $tz_local;  # ISO date with local timezone
#	$corrsum_event{$key}{"timestamp"} = DateTime::Format::ISO8601->parse_datetime($iso_time)->epoch(); 
	#	$corrsum_event{$key}{"datetime"} = $iso_time;
	
	my $end_ts = ($end_time >= 0 ? $end_time : localtime());  # Apply current time as end time if none is given.
	$corrsum_event{$key}{"timestamp"} = $end_ts;
	$corrsum_event{$key}{"datetime"} = localtime($end_ts)->strftime("%Y-%m-%dT%H:%M:%S") . $tz_local;
	$corrsum_event{$key}{'@date'} = $corrsum_event{$key}{"datetime"};
	$corrsum_event{$key}{'corr_count_uniq'} = @{ $corrsum_event{$key}{"tot_uniq_events"} };
	$corrsum_event{$key}{'uniq_events'} = join(",", @{ $corrsum_event{$key}{"tot_uniq_events"} });
	delete($corrsum_event{$key}{'tot_uniq_events'});  # Not required for output
	# Output record
#	print STDERR Dumper($corrsum_event{$key});
	print encode_json($corrsum_event{$key}), "\n";
    }
    undef %corrsum_event;

    if (!$opt_url) {
	# Close all files
	foreach (@inputfile) {
	    close ($_);
	}
    }
    # Release pidfile
    if ( $opt_pidfile ne "") {
	unlink $opt_pidfile;
    }
}

# Handel SIGHUP signal for e.g. newsyslog or logrotate
$SIG{HUP} = \&sighup_handler;
$SIG{INT} = \&sigint_handler;
sub sighup_handler{
    if ($opt_follow) {
	# Stop follow-file behavior and trigger restart of parsing file
	$tryagain = 0;
	if (!$opt_url) {
	    foreach (@inputfile) {
		close ($_);
	    }
	}
    }	
}

sub sigint_handler{
    # Clean up and die

    clean_up();
    #close(STDOUT);
    
    die ();
}    

my @eventq;               # Input events
my $next_file_to_read=0;  # Index of next file to read from

my $min_timestamp=0;    # For debugging
    

sub get_next_source_to_read{
    # Select next source (file or ES index) to read from

    if ($opt_roundrobin) {
	    # Apply cyclic selection of sources to read from
	    return ($next_file_to_read + 1 ) % @inputfile;
    }
    
    my $oldest_ts = 0;
    my $oldest_idx = 0;
    for my $i (0 .. $#inputfile_ts) {
	if (! $oldest_ts || $inputfile_ts[$i] < $oldest_ts) {
	    # Select source which has the  oldest timestamp among all sources
	    $oldest_ts = $inputfile_ts[$i];
	    $oldest_idx = $i;
	}
    }
    return $oldest_idx;

}

sub get_next_event{
    # Remove and replace oldest event in queue

    my $fill_q = shift;
    my $old_event = $eventq[0];
    
    if (! $fill_q) {
	# Remove head of queue
	shift @eventq;
    }

    # Select file/source to read
    $next_file_to_read = get_next_source_to_read();
    my $fh = $inputfile[$next_file_to_read];

    my $line="";
    my $no_at_eof=0;
    my $new_event;
    while ($no_at_eof < @inputfile) {
	if ( $opt_url) {
	    my $doc;
	    eval {
		# Run in eval to mask out exceptions and avoid noise when no results are available
		#$doc = $fh->next;
		$doc = get_next_from_search($fh);
	    };
	    if ($doc) {
		# New doc ready
		$new_event = $doc->{'_source'};
		last;
	    }
	} else {
	    if ( defined($line = <$fh>) ) {
		# Line read from file. Parse.
		$new_event = decode_json $line;
		last;
	    }
	}
	# File / index at EOF. Try next.
	$no_at_eof++;
	# Apply cyclic selection of sources to read from
	$next_file_to_read = ($next_file_to_read + 1 ) % @inputfile;
	$fh = $inputfile[$next_file_to_read];
    }	
    if( $new_event ) {
	# Add some admin data to event
	my $me_timefield = ( $#opt_timefield == $#inputfile ? $opt_timefield[$next_file_to_read] : $opt_timefield[0] );
	my ($me_tfname, $me_tftype) = split(":",$me_timefield);    # Separate field name and type
	$new_event->{'me_timefield'} = $me_tfname;
	$new_event->{'me_timefield_type'} = $me_tftype;
	$new_event->{'me_source'} = $ARGV[$next_file_to_read];
	$new_event->{'me_srcidx'} = $next_file_to_read;
	$inputfile_ts[$next_file_to_read] = $new_event->{$new_event->{'me_timefield'}};  # Latest read timestamp for source
	my $event_added = 0;
	for my $e (0 .. $#eventq) {
	    if ($new_event->{$new_event->{'me_timefield'}} < $eventq[$e]{$eventq[$e]{'me_timefield'}}) {
		# Insert new event into queue
		splice(@eventq, $e, 0, $new_event);
		$event_added = 1;
		last;
	    }
	}
	if (! $event_added) {
	    # Add new event at end of queue
	    push @eventq, $new_event;
	}
	
	#DEBUG
	if (! $fill_q  && $new_event->{'timestamp'} < $old_event->{'timestamp'}) {
	    print STDERR "Warning: New event is older than last analysed event. Increase buffer with -b.  Source: ". $new_event->{'me_source'} . " Timestamp: " . $new_event->{'timestamp'} . " Peer: ". $new_event->{'from'} . "," . $new_event->{'to'}  .  "\n";
	} else {
#	    print STDERR "OK\n";
	}	    
    }
    
    # Return no of events in queue
    return @eventq; 
}

sub get_matchfield_value_str{
    # Return space separated value list of given match fields
    my $input_hash = shift;
    my $return_str = "";
    if (keys %{$input_hash} > 0) {
	# None-empty input hash. Proceed to build value string.
	foreach (@opt_matchfield) {
	    if ( exists $input_hash->{$_} ) {
		$return_str .= $input_hash->{$_} . " ";
	    } else {
		print STDERR "Warning: Missing hash key '" . $_ . "' in input hash to get_matchfield_value_str().\n"
	    }
	}
    }
    return $return_str;
}

sub is_element_of {
    # Test if first argument is member of second (list) argument
    my $item = shift;
    return 1 if grep { $item eq $_ }@_;
}

sub all_expected_events_present {
    # Test if all required events are present in given window
    my $window = shift;
    my @not_found_event = @opt_eventmatch;
    if (@opt_eventmatch > 0) {
	foreach (@{ $window}) {
	    if (! $opt_strict_eventorder) {
		for my $i (0 .. $#not_found_event) {
		    if ($_->{'event_type'} eq $not_found_event[$i]) {
			# Event found. Remove.
			splice @not_found_event, $i, 1;
			last;
		    }
		}
	    } else {
		# Look for events in given order
		if ( @not_found_event > 0 && $_->{'event_type'} eq $not_found_event[0]) {
		    # Event found. Remove.
		    shift @not_found_event;
		}
	    }
	}
    }
    # Return true if all events where found in window
    return (@not_found_event == 0);
}

sub relevant_peer {
    # Check if peer of nodes are relevant (from relevant flow)
    # Input params: from (str) , to (str) 
    my $from = shift;
    my $to = shift; 
    if ($#opt_peermatch) {
	# Required peers are specified. Perform check.
	my %peermatchhash = map { $_ => 1 } @opt_peermatch;
	if(! exists($peermatchhash{$from . "," . $to })) {
	    # Not found, i.e. irrelevant peer.
	    return 0;
	}
    }
    # Relevant peer (or all peers are relevant).
    return 1;
}

my %search_cache;    # Cached line from scrolled search. Required since initiating scrolled search also return min one document/record.

sub init_search {
    # Initiate scrolled search for relevant entries at given date for an index
    my $index = shift;
    my $tfield = shift;
    my $search_start = shift;
    my $search_end = shift;

    my $scroll_id = '';    # Return value
    
    # Prepare time fields for search
    $search_start = $start_time; 
    $search_end = ( $search_end >= 0 ? $search_end : 'now' );

    my ($tfield_name, $tfield_type) = split(":",$tfield);
    if ($tfield_type eq "iso") {
	# Swap to iso time stamps with quotes
	$search_start = '"' . $start_iso . '"'; 
	$search_end = ( $end_iso ne "" ? '"' . $end_iso . '"' : '"now"');
    } elsif ($tfield_type ne "epoch") {
	die "Error: Invalid time field type for '" . $tfield ."'.";
    }
    # Prepare filter for search. Add range first.
    my $filter_clause =  ' { "range": { "' . $tfield_name . '": { "gte": ' . $search_start . ', "lte": ' . $search_end . '}}}';
    my $should_clause = '';
    # Add from-to peer matching (if any)
    foreach my $peer (@opt_peermatch) {
	my ($from, $to) = split (',', $peer);
	$should_clause .= "," if ( $should_clause ne "");  # Add comman between peer match filters
        $should_clause .=  '{ "bool": { "must": [ { "term": { "from": "' . $from . '" }}, { "term": { "to": "' . $to . '"}}]}}';
    }
    if ( $should_clause ne "") {
	$filter_clause .= ', { "bool": { "should": [ ' . $should_clause . ' ] }}';
    }
    
    # Prepare final json query to post 
    my $query_data = '{ "query": { "bool": { "filter": [ ' . $filter_clause . ' ]}}, "sort": [ {"' . $tfield_name . '": "asc"} ], "size": 1 }';
    my $query_req = LWP::UserAgent->new;
    $query_req->ssl_opts( verify_hostname => 0, SSL_verify_mode => IO::Socket::SSL::SSL_VERIFY_NONE);  # Accept any SSl cert
    # Init scroll search with context life time similar to opt_sleepinterval
    my $search_resp = $query_req->post($opt_url . '/' . $index . '/_search?scroll=' . $opt_sleepinterval. 's', 'Content-Type' => 'application/json', Content => $query_data );
    if (defined $search_resp) {
	print "Search respons for ", $index, ":\n", Dumper($search_resp) if ($opt_verbose);
	my $search_result = decode_json $search_resp->{'_content'};
	if (%{$search_result}) {
	    if ($search_result->{'_scroll_id'}) {
		# Valid scroll search
		$scroll_id = $search_result->{'_scroll_id'};
		if ($search_result->{'hits'}->{'total'}{'value'} > 0) {
		    # Valid search results
		    if ($search_result->{'hits'}->{'hits'}[0]->{'_source'}) {
			$search_cache{$scroll_id} = $search_result->{'hits'}->{'hits'}[0];
			return $scroll_id;
		    }
		}
	    }
	}
    }

    # Scroll search init failed.
    print "Error: Initialisation of scroll search for index ", $index, " on ", $opt_url, " failed.\n";
    return ''
}

sub get_next_from_search {
    # Return next document from scrolled search initiated by init_search

    my $scroll_id = shift;
    $scroll_id ne '' || return '';   # Exit on blank scroll id

    if (exists($search_cache{$scroll_id}) ) {
	# Doc/record in cache. Return doc.
	my $doc_to_return = $search_cache{$scroll_id};
	delete $search_cache{$scroll_id};
	return $doc_to_return;
    }
    # Fetch next doc
   
    # Prepare json query for scroll search with context life time similar to opt_sleepinterval
    my $query_data = '{ "scroll_id": "' . $scroll_id . '", "scroll": "' . $opt_sleepinterval . 's" }';
    my $query_req = LWP::UserAgent->new;
    $query_req->ssl_opts( verify_hostname => 0, SSL_verify_mode => IO::Socket::SSL::SSL_VERIFY_NONE);  # Accept any SSl cert
    my $search_resp = $query_req->post($opt_url . '/_search/scroll', 'Content-Type' => 'application/json', Content => $query_data );
    if (defined $search_resp) {
	print "Search respons:\n", Dumper($search_resp) if ($opt_verbose);
	my $search_result = decode_json $search_resp->{'_content'};
	if (%{$search_result} && $search_result->{'hits'}->{'total'}{'value'} > 0 && $search_result->{'hits'}->{'hits'}[0]->{'_source'}) {
	    # Valid results. Return.
	    return $search_result->{'hits'}->{'hits'}[0];
	}
	# No results. Attempt to clean up scroll.
	my $delete_resp = $query_req->delete($opt_url . '/_search/scroll/' .  $scroll_id );
	if (defined $delete_resp) {
	    print "Delete respons:\n", Dumper($delete_resp) if ($opt_verbose);
	    my $delete_result = decode_json $delete_resp->{'_content'};
	    if (%{$delete_result} && $delete_result->{'status'} eq 'success') {
		# Return empty.
		return '';
	    }
	}
	print "Warning: Cleaning up scroll search for " . $scroll_id, " on ", $opt_url, " failed.\n" if ($opt_verbose);
	return '';
    }
    # Something went wrong
    print "Warning: Fetching scroll search results for scroll_id", $scroll_id, " on ", $opt_url, " failed.\n" if ($opt_verbose);
    return '';
}

# #   M A I N   T H R E A D   # # 

GetOptions (
    "timefield=s" => \@opt_timefield,       # Array of names of time-fields. One for each given JSON input file. 
    "follow" => \$opt_follow,               # follow source 
    "roundrobin" => \$opt_roundrobin,       # Apply round robin read of input sources.
    "gunzip"  => \$opt_gunzip,              # flag enabling gunzip of input 
    "matchfield=s" => \@opt_matchfield,     # Name of field that needs to match for events to be corrolated. Option may be repeated.
    "eventmatch=s" => \@opt_eventmatch,     # Name of event required in correlation. Option may be repeated.
    "peer=s" => \@opt_peermatch,            # "<from>,<to>" peer relevant for corrocation. Option may be repeated. Default is all peers.
    "strict"  => \$opt_strict_eventorder,   # flag enabling strict order of matching events
    "windowsize=i" => \$opt_window_size,    # Max acceptable time difference for event corrolation
    "buffersize=i" => \$opt_inputbuffersize,    # Max acceptable time difference for event corrolation
    "interval=i" => \$opt_sleepinterval,    # Sleep interval between polls for new content
    "pidfile=s"  => \$opt_pidfile,          # string for process id file
    "url=s"  => \$opt_url,                  # Url string to Elastic Search compatible source (including credentials)
    "date=s"  => \$opt_daterange,           # Filter on ISO date range (local time zone if none is given)
    "conf=s"  => \$opt_config_file,         # Path to YAML config file.
    "verbose"  => \$opt_verbose,            # Flag for outputting more info
    "help"  => \$opt_help                   # Flag for help message
    ) or die("Error in command line arguments\n");

if ( $opt_help || $#ARGV eq -1 ) {
    # Show usage info
    my @scriptname = split /\//, $0;
    print "Usage: $scriptname[-1] [ options ] JSON-log-file [JSON-log-file ...]
   -h             This help message.
   -c filename    Load config file. Note: Commandline option override values in configfile.
   -g             Enable gunzip of input.
   -m fieldname   Name of field that needs to match for events to be corrolated. Option may be repeated.
   -e eventname   Name of event required in correlation. Option may be repeated.
   --peer from,to Peer of node names (comman separated) relevant for corrolation. Option may be repeated.
                  Default is all peers. 
   -s             Strict order of events given by -e is required. 
   -t fieldname[:iso|epoch]   Name of timefield and timefield type (colon separated). Type is either 'iso'
                  or 'epoch'. Default is 'epoch'. Option may be repeated according to no of input files.
   -w seconds     Width of time window (in seconds) to be interpreted as corrolated events.
   -b integer     No of events to read and sort in input buffer. Default is no of files specified.
   -f             Follow input source. End date in -d option is ignored.
   -r             Apply round robin read of input sources. Default is to read from source of oldes event in queue.
   -u url         Url to elastic search compatible input source (including credentials).
                  Index names are then expected rather than JSON filenames.
   -d date-range  Filter on ISO date range (local time zone if none is given). A single date sets start date only.
                  Two dates separated by '/' sets a range. Default is <today>T00:00:00/<today>T23:59:59. 
   -i integer     Sleep interval between polls for new content when -f is set. (Default 1 sec.)
   -p filename    Filename of process-id file.
   -v             Be verbose.
   \n";

    exit 1; 
}

# Load options form config file (if any)
if ($opt_config_file && -e $opt_config_file ) {
    load_config( $opt_config_file );
}
# Set defaults for some options (if not already set).
$opt_gunzip ||= 0;
@opt_matchfield = ("to","from") if (!@opt_matchfield);      # Name of field that needs to match for corrolation
@opt_timefield = ("timestamp:epoch") if (!@opt_timefield);  # Name of field with time info to look for
$opt_window_size ||= 60;       # Max time difference accepted for event corrolation
$opt_inputbuffersize ||= 0;    # No of events to keep in sorted input buffer
$opt_pidfile ||= '';           # Name of process id file
$opt_url ||= '';               # Url to ES compatible source
$opt_daterange ||= '';         # ISO date range to filter on (local time zone if no zone is given).
$opt_follow ||= 0;             # True if first input file is to be followed
$opt_roundrobin ||= 0;         # True if cyclic read from sources is selected.
$opt_strict_eventorder ||= 0;  # True if strict order of matching events is required.
$opt_sleepinterval ||= 5;      # Timeperiod for re-reading file when followed.

# Prepare iso date range
if ($opt_daterange eq '') {
    $opt_daterange = localtime()->strftime("%Y-%m-%dT00:00:00") . $tz_local . '/' . localtime()->strftime("%Y-%m-%dT23:59:59") . $tz_local;
}
( $start_iso, $end_iso) = split("/", $opt_daterange);

# Prepare epoch timestamps for range (and evaluate iso dates)
$start_time = DateTime::Format::ISO8601->parse_datetime($start_iso)->epoch() || die "Error: Invalid start date in range.";
if ($end_iso ne '') {
    $end_time = DateTime::Format::ISO8601->parse_datetime($end_iso)->epoch() || die "Error: Invalid end date in range.";
}
if ( $opt_pidfile ne "" && open(my $pid_fh, ">", $opt_pidfile) ) {
    # Put current pid in file
    print $pid_fh "$$\n";
    close $pid_fh;
}


STARTPARSING:

# Ensure all output is fully flushed.
STDOUT->autoflush(1); 

#if($opt_url) {
#    # Connect to ES
#    $es = Search::Elasticsearch->new(
#	nodes => $opt_url,
#	cnx_pool => 'Sniff',
#	log_to => 'Stderr'
#	);
#    print Dumper($es) if ($opt_verbose);
#}

my $argc=0;
foreach (@ARGV) {
    if ($opt_url) {
	# Find time field for es index
	my $tfield = ( $#opt_timefield == $#ARGV ? $opt_timefield[$argc] : $opt_timefield[0] );
	# Init search for index
	push @inputfile, init_search($_, $tfield, $start_time, $end_time);
    } else {
	# Open each file given on commandline
	if ( $opt_gunzip ) {
	    # Open with decompression
	    open (my $fh_raw, "$_ ") or die ("Error: Could not open file '$_'");
	    push @inputfile_raw, $fh_raw;
	    my $fh = IO::Uncompress::Gunzip->new( $fh_raw, {"MultiStream" => 1} ) or die ("Error: Could not prepare gunzip for file '$_' ($GunzipError)"); 
	    push @inputfile, $fh;
	} else {
	    open (my $fh, $_) or die ("Error: Could not open file '$_'");
	    push @inputfile, $fh;
	}
    }
    $argc++;
}

my $curpos;

while ($tryagain) {   
    
    # Read from each input file to initiate event queue
    my $i=0;
    foreach (@inputfile) {

	if ($opt_url) {
	    #print Dumper $_; exit;
	    #if (my $doc = $_->next) {
	    if (my $doc = get_next_from_search($_)) {
		# Doc from search in index ready. Push to internal queue.
		#print Dumper $doc->{'_source'}; exit;
		push @eventq, $doc->{'_source'};
	    } else {
		# Try next index
		$i++;
		next;
	    }
	} elsif ( defined( my $line = <$_> )) {
	    # Line from file ready. Decode and push to internal queue.
	    push @eventq, decode_json $line;
	} else {
	    # Try next file 
	    $i++;
	    next;
	}
	if (! exists $eventq[-1]{'me_timefield'} &&
	    ! exists $eventq[-1]{'me_source'} &&
	    ! exists $eventq[-1]{'me_srcidx'} or
	    die ("Error: Admin field conflict") ) {
	    # Add some admin data to event
	    $eventq[-1]{'me_timefield'} = ( $#opt_timefield == $#inputfile ? $opt_timefield[$i] : $opt_timefield[0] );
	    $eventq[-1]{'me_source'} = $ARGV[$i];
	    $eventq[-1]{'me_srcidx'} = $i;
	    # Prepare for collection of summary info 
	    init_corrsum_event( get_matchfield_value_str($eventq[-1]));   
	}
	$inputfile_ts[$i] = $eventq[-1]{$eventq[-1]{'me_timefield'}};  # Latest read timestamp for source
	$i++;
    }
    
    # Sort event queue by time field (boble sort)
    my $done=0;
    while (! $done) {
	# Loop until no elements are swapped.
	$done=1;
	for my $e (0..$#eventq-1) {
	    if ($eventq[$e]{$eventq[$e]{'me_timefield'}} > $eventq[$e+1]{$eventq[$e+1]{'me_timefield'}}) {
		# Swap elements
		@eventq[$e,$e+1]=@eventq[$e+1,$e];
		# Loop again
		$done = 0;
	    }
	}
    }

    # Update correlation window
    my $more_events=1;
    my $prev_more_events=0;
    while ($more_events) {

	if ($opt_inputbuffersize > @inputfile && @eventq < $opt_inputbuffersize && $more_events > $prev_more_events) {
	    # Read one more event to fill up input buffer
	    $prev_more_events=$more_events;
	    $more_events = get_next_event(1);
	    # Prepare summary event if relevant
	    my $matchfieldvalues = get_matchfield_value_str($eventq[-1]);
	    if ($matchfieldvalues && ! exists $corrsum_event{ $matchfieldvalues }) {
		# Init summary structure
		init_corrsum_event($matchfieldvalues);
	    }
	    next;
	}
	
#	if (! ($eventq[0]{'from'} eq "trondheim-mp" && $eventq[0]{'to'} eq "saopaulo-mp") ) {
#	    # Debug
#	    $more_events = get_next_event();
#	    next;
#	}

	
	my $matchfieldvalues = get_matchfield_value_str($eventq[0]);
	if (! $matchfieldvalues ) {
	    # No values for matchfields in head of event queue, i.e. nothing to do.
	    $more_events = 0;
	    next;
	}
	if (! exists $corr_events_window{ $matchfieldvalues }) {
	    # Add first element in window for matchfield value set
	    $corr_events_window{ $matchfieldvalues } = ();
	    push @{ $corr_events_window{ $matchfieldvalues } }, $eventq[0];
	    $more_events = get_next_event();
	    # Prepare for collection of summary info
	    if (! exists $corrsum_event{ $matchfieldvalues }) {
		init_corrsum_event( $matchfieldvalues);
	    }
	} else {
	    #Check if last events in window are sorted in time
	    die "Error: Usorted buffer. Increase buffersize with -b." if (@eventq > 1 &&  $eventq[-1]{$eventq[-1]{'me_timefield'}} < $eventq[-2]{$eventq[-2]{'me_timefield'}});
	    
	    if ( ( $eventq[0]{$eventq[0]{'me_timefield'}} - $corr_events_window{ $matchfieldvalues }[0]{$corr_events_window{ $matchfieldvalues }[0]{'me_timefield'}} ) < $opt_window_size) {
		# Event correlates with events in window. Move to window buffer.
		push @{ $corr_events_window{ $matchfieldvalues } }, $eventq[0];
		$more_events = get_next_event();
	    } else {
		# Event is outside correlation window.
		if (@{ $corr_events_window{ $matchfieldvalues }} > 1 && all_expected_events_present($corr_events_window{ $matchfieldvalues }) ) {
		    # More than one event correlate. Report.
		    my $t_local = localtime($corr_events_window{ $matchfieldvalues }[0]{$corr_events_window{ $matchfieldvalues }[0]{'me_timefield'}});
		    
		    my %corr_event = (
			'event_type' => $corr_event_name,
			'timestamp' => $corr_events_window{ $matchfieldvalues }[0]{$corr_events_window{ $matchfieldvalues }[0]{'me_timefield'}},
			'duration' => $corr_events_window{ $matchfieldvalues }[-1]{$corr_events_window{ $matchfieldvalues }[-1]{'me_timefield'}} - $corr_events_window{ $matchfieldvalues }[0]{$corr_events_window{ $matchfieldvalues }[0]{'me_timefield'}},
			'corr_count' => scalar @{ $corr_events_window{ $matchfieldvalues } },
			'@date' => $t_local->strftime("%Y-%m-%dT%H:%M:%S%z"),  # ISO date with local timezone
			'datetime' => $t_local->strftime("%Y-%m-%dT%H:%M:%S%z"),  # ISO date with local timezone
			);
		    
		    my $events_correlating = "";
		    my @uniq_event_types = ();
		    my @uniq_source_files = ();
		    # Browse through all events in window and copy data into new correlation event
		    for my $w (0 .. $#{ $corr_events_window{ $matchfieldvalues } } ) {
			if ( exists $corr_events_window{ $matchfieldvalues }[$w]{'event_type'} ) {
			    # Register event types
			    my $event_type = $corr_events_window{ $matchfieldvalues }[$w]{'event_type'};
			    $events_correlating .= $event_type . ", ";
			    push @uniq_event_types, $event_type if (! is_element_of($event_type, @uniq_event_types));
			    foreach my $key (keys %{$corr_events_window{ $matchfieldvalues }[$w]}) {
				if (! exists $corr_event{$key} ) {
				    # Copy event details (but don't overwriting anyting)
				    $corr_event{$key} = $corr_events_window{ $matchfieldvalues }[$w]{$key};
				}
			    }
			    # Register unique sourcefiles
			    my $sourcefile = $corr_events_window{ $matchfieldvalues }[$w]{'me_source'};
			    push @uniq_source_files, $sourcefile if (! is_element_of($sourcefile, @uniq_source_files));
			} else {
			    print "Warning: Corrolating event does not contain expected field 'event_type'. Skipping.\n";
			}
		    }
		    # Add list of events found to correlate
		    if ($events_correlating) {
			chop $events_correlating;
			chop $events_correlating;
		    }
		    $corr_event{'events_corr'} = $events_correlating;
		    $corr_event{'corr_count_uniq'} = @uniq_event_types;
		    $corr_event{'corr_count_src'} = @uniq_source_files;
		    
		    
		    # Output
		    print encode_json(\%corr_event), "\n";
		    
		    # Update summary info
		    #if (! exists $corrsum_event{ $matchfieldvalues }) {
			# Init summary structure 
			#init_corrsum_event($matchfieldvalues);
		    #}
		    $corrsum_event{ $matchfieldvalues }{"timestamp_start"}=$corr_events_window{ $matchfieldvalues }[0]{$corr_events_window{ $matchfieldvalues }[0]{'me_timefield'}};
		    $corrsum_event{ $matchfieldvalues }{"timestamp_end"}=$corr_events_window{ $matchfieldvalues }[-1]{$corr_events_window{ $matchfieldvalues }[-1]{'me_timefield'}};
		    #$corrsum_event{ $matchfieldvalues }{"timestamp"}=$corrsum_event{ $matchfieldvalues }{"timestamp_end"};
		    $corrsum_event{ $matchfieldvalues }{"count"}++;
		    $corrsum_event{ $matchfieldvalues }{"corr_count"} += $corr_event{'corr_count'};
		    # Update collection of unique event types
		    foreach (@uniq_event_types) {
			push @{ $corrsum_event{ $matchfieldvalues }{"tot_uniq_events"} }, $_ if (! is_element_of($_, @{ $corrsum_event{ $matchfieldvalues }{"tot_uniq_events"} } ));
		    }
		    $corrsum_event{ $matchfieldvalues }{'sum_duration'} += $corr_event{'duration'};
		    $corrsum_event{ $matchfieldvalues }{'sum_tloss'} += $corr_event{'tloss'} if ( exists $corr_event{'tloss'} );
		    $corrsum_event{ $matchfieldvalues }{'max_tloss'} = $corr_event{'tloss'} if ( exists $corr_event{'tloss'} && $corr_event{'tloss'} > $corrsum_event{ $matchfieldvalues }{'max_tloss'});
		    $corrsum_event{ $matchfieldvalues }{'avg_duration'} = $corrsum_event{ $matchfieldvalues }{'sum_duration'} / $corrsum_event{ $matchfieldvalues }{"corr_count"};
		    $corrsum_event{ $matchfieldvalues }{'corr_count_src'} = @uniq_source_files if ( $corrsum_event{ $matchfieldvalues }{'corr_count_src'} < @uniq_source_files);
		}
		# Add new event 
		push @{ $corr_events_window{ $matchfieldvalues }}, $eventq[0];
		$more_events = get_next_event();
		# Clear out too old events from window
		my $newest_timestamp = $corr_events_window{ $matchfieldvalues }[-1]{$corr_events_window{ $matchfieldvalues }[-1]{'me_timefield'}};
		my $oldest_timestamp = $corr_events_window{ $matchfieldvalues }[0]{$corr_events_window{ $matchfieldvalues }[0]{'me_timefield'}};
		while ( $oldest_timestamp < $newest_timestamp ) { 
		    last if ($newest_timestamp - $oldest_timestamp < $opt_window_size);  # End loop
		    shift @{ $corr_events_window{ $matchfieldvalues }}; # Remove from head of queue
		    $oldest_timestamp = $corr_events_window{ $matchfieldvalues }[0]{$corr_events_window{ $matchfieldvalues }[0]{'me_timefield'}};
		}
	    }
	}
    }

    if ($opt_follow) {
	# Sleep and retry reading at end of file
	sleep($opt_sleepinterval);
	if ($opt_url) {
	    # Reinitiate search in each index
	    my $argc=0;
	    foreach (@ARGV) {
		my $start_ts = $inputfile_ts[$argc];
		# Initiate (scrolled) search for new entries in index (from last read till now)
		my $tfield = ( $#opt_timefield == $#ARGV ? $opt_timefield[$argc] : $opt_timefield[0] );
		$inputfile[$argc] = init_search($_, $tfield,  $inputfile_ts[$argc], -1);
		$argc++;
	    }
	} else {
	    # Clear EOF condition for files given on commandline to reenable reading
	    if ( $opt_gunzip ) {
		foreach (@inputfile_raw) {
		    seek($_, 0, 1);  # Clear EOF condition on raw/compressed stream tigger new read attempt.
		    $_->nextStream();
		}
	    } else {
		foreach (@inputfile) {
		    seek($_, 0, 1);  # Clear EOF condition to tigger new read attempt. (Ref. https://learn.perl.org/faq/perlfaq5.html#How-do-I-do-a-tail--f-in-perl)
		}
	    }
	}

    } else {
	# Not following file, hence don't try again to read from it.
	$tryagain = 0;
    }
}

if ($opt_follow) {
    # File closed probably due to a SIGHUP. Restart parsing again... 
    $tryagain = 1;
    goto STARTPARSING;
}

# Clean up
clean_up();


