#! /usr/bin/perl
#
#  Find time corrolated JSON events from multiple source streams
#
#  Parses JSON sources with Opensearch (Elastic search) compatible entries and search for entries
#  with similar timestamp. Generate a JSON output with matched entries.
#
#  Author: Otto J Wittner
#  Email: otto.wittner@sikt.no
#  Date: 2022-04-26
#
#  Change log:
#    2026-09-11 Adaption to perfsonar microdep started (otto.wittner@sikt.no)
#

use strict;
use warnings;
use Getopt::Long qw(:config no_ignore_case);   # Commandline argument parser, case sensitive
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
use Digest::MD5 qw(md5);

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
my $opt_corr_event_name;     # Name for discovered correlation event
my @opt_matchfield;         # Name of field that needs to match for corrolation
my @opt_timefield;          # Name of field with time info to look for
my @opt_eventfield;         # Name of field with event name to look for
my @opt_eventmatch;         # List of events required to correlate for report to be output
my @opt_peermatch;          # List of peers (from,to) relevant for corrolation window
my $opt_window_size;        # Max time difference accepted for event corrolation
my $opt_inputbuffersize;    # No of events to keep in sorted input buffer
my $opt_pidfile;;           # Name of process id file
my $opt_url;                # Url to ES compatible source
my $opt_cachesize;          # Max num of docs/records to keep in cache 
my $opt_daterange;          # ISO date range to filter on (local time zone if no zone is given).
my $opt_follow;             # True if first input file is to be followed
my $opt_roundrobin;         # True if cyclic read from sources is selected.
my $opt_strict_eventorder;  # True if strict order of matching events is required.
my $opt_strict_eventset;    # True if strict set of matching events is required, i.e. only events in @opt_eventmatch.
my $opt_sleepinterval;      # Timeperiod for re-reading file when followed.
my $opt_ana_delay;          # Timeperiod to delay analysis (e.g. to wait for incoming events from batch-oriented owamp).
my $opt_config_file;        # Path to config file
my $opt_verbose;            # Verbose flag

my @inputfile;              # Filehandles for input files. 
my @inputfile_raw;          # Filehandles for input files. 
my @inputfile_ts;           # Latest timestamp read from sources
my $tz_local = localtime()->strftime("%z");  # Local timezone;
substr($tz_local,3,0) = ":";                 # Insert ":" in timezone
my $start_iso = '';         # ISO start time.
my $end_iso = '';           # ISO end time.
my $start_time = 0;         # Epoch start time.
my $end_time = 0;           # Epoch end time.
my $tryagain = 1;           # Flag to enable "tail -f" follow-behavior

my $search_cache = {};           # Ref to hash of cached docs from search. (To limit num of search requests to archives.)

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
	"Eventfield=s" => \@opt_eventfield,     # Array of names of event-fields. One for each given JSON input file. 
	"follow" => \$opt_follow,               # follow source 
	"roundrobin" => \$opt_roundrobin,       # Apply round robin read of input sources.
	"gunzip"  => \$opt_gunzip,              # flag enabling gunzip of input 
	"name=s"  => \$opt_corr_event_name,     # Event type name for output correlation events. 
	"matchfield=s" => \@opt_matchfield,     # Name of field that needs to match for events to be corrolated. Option may be repeated.
	"eventmatch=s" => \@opt_eventmatch,     # Name of event required in correlation. Option may be repeated.
	"peer=s" => \@opt_peermatch,            # "<from>,<to>" peer relevant for corrocation. Option may be repeated. Default is all peers.
	"strictorder"  => \$opt_strict_eventorder, # Flag enabling strict order of matching events
	"Strictset"  => \$opt_strict_eventset,  # Flag enabling strict set of matching events, i.e. only events given by -e.
	"windowsize=i" => \$opt_window_size,    # Max acceptable time difference for event corrolation
	"buffersize=i" => \$opt_inputbuffersize,    # Max acceptable time difference for event corrolation
	"interval=i" => \$opt_sleepinterval,    # Sleep interval between polls for new content
	"ana_delay=i" => \$opt_ana_delay,       # Timeperiod i seconds to postpone analysis (to wait for incoming events.)
	"pidfile=s"  => \$opt_pidfile,          # string for process id file
	"url=s"  => \$opt_url,                  # Url string to Elastic Search compatible source (including credentials)
	"cache=s"  => \$opt_cachesize,          # Max num of docs/records to keep in cache
	"date=s"  => \$opt_daterange,           # Filter on ISO date range (local time zone if none is given)
	"conf=s"  => \$opt_config_file,         # Path to YAML config file.
	"verbose+"  => \$opt_verbose,           # Flag for outputting more info. May be repeated.
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
	} elsif (exists $supported_options{$opt . '=i'}) {
	    if (! ${$supported_options{$opt . '=i'}} ) {
		# A key-value option not yet set. Apply value from config file.
		${$supported_options{$opt . '=i'}} = $config->{$opt};
	    }
	} elsif (exists $supported_options{$opt . '+'}) {
	    if (! ${$supported_options{$opt . '+'}} ) {
		# A key-value option not yet set. Apply value from config file.
		${$supported_options{$opt . '+'}} = $config->{$opt};
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

    # Add some final data to summary events
    foreach my $key (keys %corrsum_event) {
	my $end_ts = time();  # Apply current time as end time if none is given.
	my @s_inputfile_ts = sort(@inputfile_ts);
	$end_ts = (@s_inputfile_ts > 0 ? $s_inputfile_ts[-1] : $end_ts); # Update to oldest timestamp seen in input sources
	$end_ts = ($end_time > 0 ? $end_time : $end_ts);                # Update to user specified end time
	$corrsum_event{$key}{"timestamp"} = $end_ts;
	$corrsum_event{$key}{"datetime"} = localtime($end_ts)->strftime("%Y-%m-%dT%H:%M:%S") . $tz_local;
	$corrsum_event{$key}{'@date'} = $corrsum_event{$key}{"datetime"};
	$corrsum_event{$key}{'corr_count_uniq'} = @{ $corrsum_event{$key}{"tot_uniq_events"} };
	$corrsum_event{$key}{'uniq_events'} = join(",", @{ $corrsum_event{$key}{"tot_uniq_events"} });
	delete($corrsum_event{$key}{'tot_uniq_events'});  # Not required for output
	# Output record
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
	# Stop follow-file behavior and close trigger restart of parsing file
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
    # Select index of next source (file or ES index) to read from
    my $exclude = shift;  # Exclude indices in list

    if ($opt_roundrobin || ! @inputfile_ts) {
	my $next_idx;
	for (my $i = 1; $i <= @inputfile; $i++) {
	    # Apply cyclic selection of sources.
	    $next_idx = ($next_file_to_read + $i ) % @inputfile;
	    # Return if not excluded
	    return $next_idx if ( ! grep( /^$next_idx$/, @{$exclude}));
	}
	# No next source available
	die "Error: No next source available.\n"
    }
    
    my $oldest_ts = 0;
    my $oldest_idx = -1;
    for my $i (0 .. $#inputfile_ts) {
	next if ( grep( /^$i$/, @{$exclude})); 	# Skip if excluded
	if (! $oldest_ts || $inputfile_ts[$i] < $oldest_ts) {
	    # Select source which has the  oldest timestamp among all sources
	    $oldest_ts = $inputfile_ts[$i];
	    $oldest_idx = $i;
	}
    }
    die "Error: No next source available.\n" if ($oldest_idx == -1);

    return $oldest_idx;
}

sub get_next_event{
    # Remove and replace oldest event in queue

    my $old_event = $eventq[0];  # Store head of queue
    
    my $line="";
    my @at_eof;
    my $new_event;
    my $new_event_docid;
 GET_NEXT_EVENT__INPUT_SRC_LOOP:   
    while (@at_eof < @inputfile) {
	# Select file/source to read
	$next_file_to_read = get_next_source_to_read(\@at_eof);
	my $fh = $inputfile[$next_file_to_read];
	if ( $opt_url) {
	    my $doc = get_next_from_search($fh);
	    if (!$doc) {
		# At end of index (EOF). Try next file/source.
		push @at_eof, $fh;
		next;
	    } else {
		# New doc ready
		$new_event = $doc->{'_source'};
		$new_event_docid = $doc->{'_id'};
	    }
	} else {
	    if ( ! defined($line = <$fh>) ) {
		# End of file. Try next file/source.
		push @at_eof, $fh;
		next;
	    } else {
		# Line read from file. Parse.
		$new_event = decode_json $line;
		$new_event_docid = md5($line);  # Create a uniq document id
	    }
	}
	if( $new_event ) {
	    foreach my $in_q (@eventq) {
		# Check if event is already in queue
		if ( $in_q->{'me_docid'} eq $new_event_docid ) {
		    # New event is already in queue. Skip.
		    $new_event = undef; next GET_NEXT_EVENT__INPUT_SRC_LOOP;  # (Label required to jump to outer loop.)
		}
	    }

	    # Add a field common for all analysed records/docs   
	    $new_event->{'me_matchall'} = 'match_all';      

	    # Get timefield name and type
	    my $timefield = ( $#opt_timefield == $#inputfile ? $opt_timefield[$next_file_to_read] : $opt_timefield[0] );
	    my ($tf_name, $tf_type) = split(":", $timefield);
	    
	    # Check that doc/record has required fields 
	    foreach my $mf (@opt_matchfield) {
		if ( ! exists $new_event->{$mf} ) {
		    # Missing match field. Skip.
		    $new_event = undef; next GET_NEXT_EVENT__INPUT_SRC_LOOP;  # (Label required to jump to outer loop.)
		}
	    }
	    # Check if doc/record has timefield with value within relevant time range
	    if ( ! exists $new_event->{$tf_name} ) {
		#  Missing time field. Skip.
		print STDERR "Warning: Missing timefield. Skipping input record/doc.\n" if ($opt_verbose);
		$new_event = undef; next;
	    }
	    my $tf_epoch;
	    if ( $tf_type eq "iso" ) {
		# Convert iso to epoch to handle timezones
		$new_event->{$tf_name} =~ s/(.*T\d\d:\d\d:\d\d\.\d\d)\d+(\+\d\d)(\d\d)/$1$2:$3/;  # Keep only two decimals for seconds and add ":" in timezone (parse_datetime() is picky...)
		$tf_epoch = DateTime::Format::ISO8601->parse_datetime($new_event->{$tf_name})->epoch();
		if ( ! ( $tf_epoch >= $start_time && ( ! $end_time || $tf_epoch <= $end_time ) ) ) {
		    #  Incorrect iso time field. Skip.
		    print STDERR "Warning: Iso timefield " . $new_event->{$tf_name} . " out of range. Skipping record/doc.\n" if ($opt_verbose);
		    $new_event = undef; next;
		}
	    } elsif ( $tf_type eq "epoch" ) {
		$tf_epoch = $new_event->{$tf_name};
		if ( ! ( $tf_epoch >= $start_time && ( ! $end_time || $tf_epoch <= $end_time ) ) ) {
		    #  Incorrect epoch time field. Skip.
		    print STDERR "Warning: Epoch timefield " . $new_event->{$tf_name} . " out of range. Skipping record/doc.\n" if ($opt_verbose);
		    $new_event = undef; next;
		}
	    } else {
		#  Invalid time field type.
		die "Error: Invalid timefield type '" . $tf_type. "'.\n";
	    }

	    # Store epoch timestamp for event
	    $new_event->{'me_timestamp'} = $tf_epoch;
	    
	    # Add some more admin data to event
	    $new_event->{'me_source'} = $ARGV[$next_file_to_read];
	    $new_event->{'me_srcidx'} = $next_file_to_read;
	    $new_event->{'me_docid'} = $new_event_docid;
	    $new_event->{'me_eventfield'} = ( $#opt_eventfield == $#inputfile ? $opt_eventfield[$next_file_to_read] : $opt_eventfield[0] ); 
	    $inputfile_ts[$next_file_to_read] = $new_event->{'me_timestamp'};  # Latest read timestamp for source
	    my $event_added_in_slot = -1;
	    for my $e (0 .. $#eventq) {
		my $e_rev = $#eventq - $e; 
		if ($new_event->{'me_timestamp'} >= $eventq[$e_rev]{'me_timestamp'}) {
		    # Insert new event into queue
		    splice(@eventq, $e_rev, 0, $new_event);
		    $event_added_in_slot = $e_rev;
		    last;
		}
	    }
	    if ($event_added_in_slot == -1) {
		# Add new event to head of queue
		unshift @eventq, $new_event;
		if ( @eventq > $opt_inputbuffersize * 0.9 ) {
		    # Buffer is 90% full but new events are still added to head of queue
		    print STDERR scalar @eventq, " Warning: Severly unordered input events. Try increasing input buffer size with -b.\n" if ($opt_verbose);
		}
	    }
	    
	    if (@eventq > $opt_inputbuffersize) {
		# Events are processed slower than they are arriving. Longer queue probably required. 
		print STDERR "Warning: Input buffer is full. Event is dropped before analysis. Try increasing buffer size with -b and/or reduce analysis delay with -a.\n";
		print STDERR "Lost input event: src ". $eventq[0]{'me_source'} . " timestamp " . $eventq[0]{'timestamp'} . " peer ". $eventq[0]{'from'} . "," . $eventq[0]{'to'}  .  "\n" if ($opt_verbose);
		# Event input queue to long. Remove head of queue (slot 0). 
		shift @eventq;
	    }

	    # Prepare summary event if relevant
	    my $matchfieldvalues = get_matchfield_value_str($eventq[-1]);
	    if ($matchfieldvalues && ! exists $corrsum_event{ $matchfieldvalues }) {
		# Init summary structure
		init_corrsum_event($matchfieldvalues);
	    }

	    # Done adding a new event
	    last;
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
    my $found_count = 0;
    if (@opt_eventmatch > 0) {
	# Iterate over match-events-window
	foreach (@{ $window}) {
	    # Count events in window which match events specified by user
	    foreach my $e (@opt_eventmatch) {
		$found_count++ if ($e eq $_->{$_->{'me_eventfield'}});
	    }
	    if (! $opt_strict_eventorder) {
		# Check if specified events appear at least once in window
		for my $i (0 .. $#not_found_event) {
		    if ($_->{$_->{'me_eventfield'}} eq $not_found_event[$i]) {
			# Event found. Remove.
			splice @not_found_event, $i, 1;
			last;
		    }
		}
	    } else {
		# Look for events in given order
		if ( @not_found_event > 0 && $_->{$_->{'me_eventfield'}} eq $not_found_event[0]) {
		    # Event found. Remove.
		    shift @not_found_event;
		}
	    }
	}
    }
    if ($opt_strict_eventset) {
	# Return true if all but only events specified (in @opt_eventmatch) where found in window
	return (@not_found_event == 0 && $found_count == @{$window});
    } else {
	# Return true if all events where found in window
	return (@not_found_event == 0);
    }
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

sub init_search {
    # Initiate search to Openseach/Elastic search for relevant entries at given date for an index
    my $index = shift;       # Search index name
    my $tfield = shift;      # Timefield name:type
    my $start_time = shift;  # Epoch start time
    my $end_time = shift;    # Epoch end time
    my $start_iso = shift;   # Iso start time
    my $end_iso = shift;     # Iso end time
    
    # Apply epoch time as default
    my $search_start = $start_time; 
    my $search_end = $end_time;
    
    # Prepare time fields for search
    my ($tfield_name, $tfield_type) = split(":",$tfield);
    if ($tfield_type eq "iso") {
	# Swap to iso time stamps 
	$search_start = $start_iso; 
	$search_end = ( $end_iso ne "" ? $end_iso : "now");
    } elsif ($tfield_type ne "epoch") {
	die "Error: Invalid time field type for '" . $tfield ."'.";
    }

    die "Error: Index '" . $index . "' appears twice. " if (exists($search_cache->{$index}) );

    $search_cache->{$index} = { 'query_time' => 0, 'tfield_name' => $tfield_name, 'tfield_type' => $tfield_type,
				    'start_time' => $search_start, 'range_start' => 'gte',
				    'end_time' => $search_end, 'range_end' => 'lte',
				    'hits' => [] };
    
    fill_search_cache($index);
    
    return $index;
}

sub fill_search_cache {
    # Fill search cache for index
    my $index = shift;
    
    if (! exists($search_cache->{$index}) ) {
        die "Error: No cache for index " . $index . ".";
    }
    
    if ($search_cache->{$index}->{'query_time'} + $opt_sleepinterval > time() ) {
	# To short time since last query.
	return scalar @{$search_cache->{$index}->{'hits'}};  # Return num of docs / records in cache
    }
    
    my $num_in_cache = scalar @{$search_cache->{$index}->{'hits'}};
    my $num_to_load = $opt_cachesize - $num_in_cache;
    if ($num_to_load > 0 ) {
	# Query for more docs / records
	
	my $start_time = $search_cache->{$index}->{'start_time'};
	my $range_start = $search_cache->{$index}->{'range_start'};
	my $end_time = $search_cache->{$index}->{'end_time'};
	if (!$end_time) {
	    if( $search_cache->{$index}{'tfield_type'} eq 'iso' ) {
		$end_time = 'now';         # Apply 'now' when unspecifield iso end time
	    } else {
		$end_time = time();   # Apply current epoch time when unspecifield epoch end time
	    }
	}
	if( $search_cache->{$index}{'tfield_type'} eq 'iso' ) {
	    # Date strings need quotes... 
	    $start_time = '"' . $start_time . '"';
	    $end_time = '"' . $end_time . '"';
	}
	# Prepare filter for search. Add range first.
	my $filter_clause =  ' { "range": { "' . $search_cache->{$index}->{'tfield_name'} . '": { "' . $range_start. '": ' . $start_time . ', "lte": ' . $end_time . '}}}';
	my $should_clause = '';
	# Add from-to peer matching (if any)
	foreach my $peer (@opt_peermatch) {
	    my ($from, $to) = split (',', $peer);
	    $should_clause .= "," if ( $should_clause ne "");  # Add comma between peer match filters
	    $should_clause .=  '{ "bool": { "must": [ { "term": { "from": "' . $from . '" }}, { "term": { "to": "' . $to . '"}}]}}';
	}
	if ( $should_clause ne "") {
	    $filter_clause .= ', { "bool": { "should": [ ' . $should_clause . ' ] }}';
	}
	
	# Prepare final json query to post 
	my $query_data = '{ "query": { "bool": { "filter": [ ' . $filter_clause . ' ]}}, "sort": [ {"' . $search_cache->{$index}->{'tfield_name'} . '": "asc"} ], "size": ' . $num_to_load . ' }';
	print STDERR "QUERY DATA: $query_data\n" if ($opt_verbose > 1);
	my $query_req = LWP::UserAgent->new;
	$query_req->ssl_opts( verify_hostname => 0, SSL_verify_mode => IO::Socket::SSL::SSL_VERIFY_NONE);  # Accept any SSl cert
	# Init search with size equal to max cache
	my $search_resp = $query_req->post($opt_url . '/' . $index . '/_search', 'Content-Type' => 'application/json', Content => $query_data );
	if (defined $search_resp) {
	    print STDERR "Search respons for ", $index, ":\n", Dumper($search_resp) if ($opt_verbose > 2);
	    my $search_result = decode_json $search_resp->{'_content'};
	    if (%{$search_result} && $search_result->{'hits'}) {
		if ( $search_result->{'hits'}->{'total'}{'value'} > 0 && $search_result->{'hits'}->{'hits'}) {
		    # Valid search. Add results to cache.
		    push @{$search_cache->{$index}->{'hits'}}, @{$search_result->{'hits'}->{'hits'}};

		    # Update start time for future cache fill requests. Fill cache with docs from time window $opt_ana_delay seconds past in time. 
		    my $epoch_new_start_time = ( $search_cache->{$index}{'tfield_type'} eq 'iso' ? DateTime::Format::ISO8601->parse_datetime($search_cache->{$index}->{'start_time'})->epoch() : $search_cache->{$index}->{'start_time'} );
		    $epoch_new_start_time = ( $epoch_new_start_time > time() - $opt_ana_delay ?  $epoch_new_start_time : time() - $opt_ana_delay );
		    if( $search_cache->{$index}{'tfield_type'} eq 'iso' ) {
			$search_cache->{$index}->{'start_time'} = localtime($epoch_new_start_time)->strftime("%Y-%m-%dT%H:%M:%S") . $tz_local ;
		    } else {
			$search_cache->{$index}->{'start_time'} = $epoch_new_start_time;
		    }			
		    
		    #$search_cache->{$index}->{'start_time'} = $search_cache->{$index}->{'hits'}[-1]->{'_source'}->{$search_cache->{$index}{'tfield_name'}};
		    #$search_cache->{$index}->{'range_start'} =  "gt" ;  # (... to avoid duplicates.)

		    # Update query time
		    $search_cache->{$index}->{'query_time'} =  time() ; 
		    
		    # Return num of docs / records in cache
		    return scalar @{$search_cache->{$index}->{'hits'}}; 
		} else {
		    # Valid search but no docs found.
		    return 0;
		}
	    }
	}

	# Search init failed.
	print STDERR "Error: Search in index ", $index, " on ", $opt_url, " failed.\n";
	return 0
    }
    # Cache already full
    print STDERR "Warning: Search cache already full for index " . $index . "\n" if ($opt_verbose);
    return scalar @{$search_cache->{$index}->{'hits'}};  # Return num of docs / records in cache
}


sub get_next_from_search {
    # Return next document from search initiated by init_search

    my $index = shift;
    $index ne '' || return '';   # Exit on blank index

    if (! exists($search_cache->{$index})) {
	print STDERR "Error: Search for '" . $index . "' not initialized.\n";
	return 0;
    }
    if( ! @{$search_cache->{$index}->{'hits'}} ) {
	# No docs in cache. Attempt to fetch some. 
	fill_search_cache($index);
    }
    if( @{$search_cache->{$index}->{'hits'}} > 0) {
	# Cache for index has entries.
	return shift @{$search_cache->{$index}->{'hits'}};
    }
    # No docs found.
    return 0;
}

my $md5_last_corr_report = "";    # Hash digest of JSON output for last report output

sub report_correlation {
    # Generate and output report on events in entry of @corr_events_window 
    my $matchfieldvalues = shift;
    
    my $t_local = localtime($corr_events_window{ $matchfieldvalues }[0]{'me_timestamp'});

    # Prepare basics event structure
    my %report_event = (
	'event_type' => $opt_corr_event_name,
	'timestamp' => $corr_events_window{ $matchfieldvalues }[0]{'me_timestamp'},
	'duration' => $corr_events_window{ $matchfieldvalues }[-1]{'me_timestamp'} - $corr_events_window{ $matchfieldvalues }[0]{'me_timestamp'},
	'corr_count' => scalar @{ $corr_events_window{ $matchfieldvalues } },
	'@date' => $t_local->strftime("%Y-%m-%dT%H:%M:%S%z"),  # ISO date with local timezone
	'datetime' => $t_local->strftime("%Y-%m-%dT%H:%M:%S%z"),  # ISO date with local timezone
	);
    my %report_basic_keys = map { $_ => 1 } keys %report_event;   # Create hash with "only" basic keys.

    my $events_correlating = "";
    my @uniq_event_types = ();
    my @uniq_source_files = ();
    # Browse through all events in window and copy data into new correlation event
    for my $w (0 .. $#{ $corr_events_window{ $matchfieldvalues } } ) {
	if ( exists $corr_events_window{ $matchfieldvalues }[$w]{$corr_events_window{ $matchfieldvalues }[$w]{'me_eventfield'}} ) {
	    # Register event types
	    my $event_type = $corr_events_window{ $matchfieldvalues }[$w]{$corr_events_window{ $matchfieldvalues }[$w]{'me_eventfield'}};
	    $events_correlating .= $event_type . ", ";
	    push @uniq_event_types, $event_type if (! is_element_of($event_type, @uniq_event_types));

	    foreach my $key (keys %{$corr_events_window{ $matchfieldvalues }[$w]}) {
		if ( exists $report_basic_keys{$key} ) {
		    # A basic field / key. Skip.
		    next;
		} elsif ($w == 0) {
		    # First event.  Prepare empty array.
		    $report_event{$key} = [];
		} elsif (! exists $report_event{$key} ) {
		    # First event with this key.  Add padded array with empty entries for already added events without the key
		    my @padding = map { undef } 1..$w;
		    $report_event{$key} = \@padding;  
		}
		# Add event to report
		push @{$report_event{$key}} , $corr_events_window{ $matchfieldvalues }[$w]{$key};
	    }
	    foreach my $key (keys %report_event) {
		if (! exists $report_basic_keys{$key} && ! exists $corr_events_window{ $matchfieldvalues }[$w]{$key} ) {
		    # Add padding for "missing" key (key existent in earlier added events only) for current event
		    push @{$report_event{$key}} , undef;
		}
	    }
		    
	    # Register unique sourcefiles
	    my $sourcefile = $corr_events_window{ $matchfieldvalues }[$w]{'me_source'};
	    push @uniq_source_files, $sourcefile if (! is_element_of($sourcefile, @uniq_source_files));
	} else {
	    print STDERR "Warning: Correlating event does not contain expected field 'event_type'. Skipping.\n";
	}
    }
    # Add list of events found to correlate
    if ($events_correlating) {
	chop $events_correlating;
	chop $events_correlating;
    }
    $report_event{'events_corr'} = $events_correlating;
    $report_event{'corr_count_uniq'} = @uniq_event_types;
    $report_event{'corr_count_src'} = @uniq_source_files;
    # Clean up admin fields
    delete $report_event{'me_timestamp'};
    delete $report_event{'me_timestamp'};
    delete $report_event{'me_source'};
    delete $report_event{'me_srcidx'};
    delete $report_event{'me_matchall'};
    
    # Output
    my $js = JSON->new();
    $js->canonical(1);  # Ensure sorted JSON structure
    my $report_event_json = $js->utf8->encode(\%report_event);
    my $md5_corr_report = md5($report_event_json);   # Generate MD5 checksum for report
    if ($md5_last_corr_report ne  $md5_corr_report) {
	# New checksum => new report ready. Output.
	$md5_last_corr_report = $md5_corr_report;
	print $report_event_json, "\n";
    }
    
    # Update summary info
    if (! $corrsum_event{ $matchfieldvalues }{"timestamp_start"} ||
	$corrsum_event{ $matchfieldvalues }{"timestamp_start"} > $corr_events_window{ $matchfieldvalues }[0]{'me_timestamp'} ) {
	$corrsum_event{ $matchfieldvalues }{"timestamp_start"} = $corr_events_window{ $matchfieldvalues }[0]{'me_timestamp'};
    }
    if (! $corrsum_event{ $matchfieldvalues }{"timestamp_end"} ||
	$corrsum_event{ $matchfieldvalues }{"timestamp_end"} < $corr_events_window{ $matchfieldvalues }[-1]{'me_timestamp'} ) {
	$corrsum_event{ $matchfieldvalues }{"timestamp_end"} = $corr_events_window{ $matchfieldvalues }[-1]{'me_timestamp'};
    }
    $corrsum_event{ $matchfieldvalues }{"count"}++;
    $corrsum_event{ $matchfieldvalues }{"corr_count"} += $report_event{'corr_count'};
    # Update collection of unique event types
    foreach (@uniq_event_types) {
	push @{ $corrsum_event{ $matchfieldvalues }{"tot_uniq_events"} }, $_ if (! is_element_of($_, @{ $corrsum_event{ $matchfieldvalues }{"tot_uniq_events"} } ));
    }
    $corrsum_event{ $matchfieldvalues }{'sum_duration'} += $report_event{'duration'};
    foreach (@{$report_event{'tloss'}}) {
	if ($_) {
	    $corrsum_event{ $matchfieldvalues }{'sum_tloss'} += $_; 
	    $corrsum_event{ $matchfieldvalues }{'max_tloss'} = $_ if ( ! exists $corrsum_event{ $matchfieldvalues }{'max_tloss'} ||
								       $_ > $corrsum_event{ $matchfieldvalues }{'max_tloss'});
	}
    }
    $corrsum_event{ $matchfieldvalues }{'avg_duration'} = $corrsum_event{ $matchfieldvalues }{'sum_duration'} / $corrsum_event{ $matchfieldvalues }{"corr_count"};
    $corrsum_event{ $matchfieldvalues }{'corr_count_src'} = @uniq_source_files if ( $corrsum_event{ $matchfieldvalues }{'corr_count_src'} < @uniq_source_files);
}


# #   M A I N   T H R E A D   # # 

GetOptions (
    "timefield=s" => \@opt_timefield,       # Array of names of time-fields. One for each given JSON input file. 
    "Eventfield=s" => \@opt_eventfield,     # Array of names of event-fields. One for each given JSON input file. 
    "follow" => \$opt_follow,               # follow source 
    "roundrobin" => \$opt_roundrobin,       # Apply round robin read of input sources.
    "gunzip"  => \$opt_gunzip,              # flag enabling gunzip of input 
    "name=s"  => \$opt_corr_event_name,     # Event type name for output correlation events. 
    "matchfield=s" => \@opt_matchfield,     # Name of field that needs to match for events to be corrolated. Option may be repeated.
    "eventmatch=s" => \@opt_eventmatch,     # Name of event required in correlation. Option may be repeated.
    "peer=s" => \@opt_peermatch,            # "<from>,<to>" peer relevant for corrocation. Option may be repeated. Default is all peers.
    "strictorder"  => \$opt_strict_eventorder, # Flag enabling strict order of matching events
    "Strictset"  => \$opt_strict_eventset,  # Flag enabling strict set of matching events, i.e. only events given by -e.
    "windowsize=i" => \$opt_window_size,    # Max acceptable time difference for event corrolation
    "buffersize=i" => \$opt_inputbuffersize,    # Max acceptable time difference for event corrolation
    "interval=i" => \$opt_sleepinterval,    # Sleep interval between polls for new content
    "ana_delay=i" => \$opt_ana_delay,       # Timeperiod i seconds to postpone analysis (to wait for incoming events.)
    "pidfile=s"  => \$opt_pidfile,          # string for process id file
    "url=s"  => \$opt_url,                  # Url string to Elastic Search compatible source (including credentials)
    "cache=s"  => \$opt_cachesize,          # Max num of docs/records to keep in cache
    "date=s"  => \$opt_daterange,           # Filter on ISO date range (local time zone if none is given)
    "conf=s"  => \$opt_config_file,         # Path to YAML config file.
    "verbose+"  => \$opt_verbose,           # Flag for outputting more info. May be repeated.
    "help"  => \$opt_help                   # Flag for help message
    ) or die("Error in command line arguments\n");

if ( $opt_help || $#ARGV eq -1 ) {
    # Show usage info
    my @scriptname = split /\//, $0;
    print "Usage:  $scriptname[-1] [ options ] JSON-log-file [JSON-log-file ...]
   -h              This help message.
   --conf filename Load config file. Note: Commandline option override values in configfile.
   -g              Enable gunzip of input.
   -n event-name   Name of event type for correlation events.
   -m fieldname    Name of field that needs to match for events to be corrolated. Option may be repeated. 
   -e eventname    Name of event required in correlation. Option may be repeated.
   --peer from,to  Peer of node names (comman separated) relevant for corrolation. Option may be repeated.
                   Default is all peers. 
   -o              Strict order of events given by -e is required. 
   -s              Only set of events given by -e is to be in correlation window. 
   -t fieldname[:iso|epoch]   Name of timefield and timefield type (colon separated). Type is either 'iso'
                   or 'epoch'. Default is 'timestamp:epoch'. Option may be repeated according to no of input files.
   -E fieldname    Name of event field to apply. Default is 'event_type'. Option may be repeated according to no of input files.
   -w seconds      Width of time window (in seconds) to be interpreted as corrolated events.
   -b integer      No of events to read and sort in input buffer. Default is no of files specified.
   -f              Follow input source. End date in -d option is ignored.
   -r              Apply round robin read of input sources. Default is to read from source of oldes event in queue.
   -u url          Url to elastic search compatible input source (including credentials).
                   Index names are then expected rather than JSON filenames.
   --cache integer Max num of docs/records to keep in cache.
   -d date-range   Filter on ISO date range (local time zone if none is given). A single date sets start date only.
                   Two dates separated by '/' sets a range. Default is <today>T00:00:00/<today>T23:59:59. 
   -i seconds      Sleep interval between polls for new content when -f is set. (Default 1 sec.)
   -a seconds      Timeperiod i seconds to postpone analysis (to wait for incoming events.)
   --pid filename  Filename of process-id file.
   -v              Be verbose. Repeat to increase amount on info.
   \n";

    exit 1; 
}

# Load options form config file (if any)
if ($opt_config_file && -e $opt_config_file ) {
    load_config( $opt_config_file );
}
# Set defaults for some options (if not already set).
$opt_gunzip ||= 0;
$opt_corr_event_name ||= 'correlation';                     # Default name for discovered correlation event
@opt_matchfield = ('me_matchall') if (!@opt_matchfield);    # Name of field that needs to match for corrolation
@opt_eventfield = ('event_type') if (!@opt_eventfield);     # Name of event field to look for
@opt_timefield = ('timestamp:epoch') if (!@opt_timefield);  # Name of field with time info to look for
#@opt_timefield = ('@date:iso') if (!@opt_timefield);  # Name of field with time info to look for
#@opt_timefield = ('@timestamp:iso') if (!@opt_timefield);  # Name of field with time info to look for
$opt_window_size ||= 60;       # Max time difference in seconds accepted for event corrolation
$opt_inputbuffersize ||= 1;    # No of events to keep in sorted input buffer
$opt_pidfile ||= '';           # Name of process id file
$opt_url ||= '';               # Url to ES compatible source
$opt_cachesize ||= 100;        # Max num of doec / records kept in cache
$opt_daterange ||= '';         # ISO date range to filter on (local time zone if no zone is given).
$opt_follow ||= 0;             # True if first input file is to be followed
$opt_roundrobin ||= 0;         # True if cyclic read from sources is selected.
$opt_strict_eventorder ||= 0;  # True if strict order of matching events is required.
$opt_strict_eventset ||= 0;    # True if strict set of matching events is required, i.e. only events in @opt_eventmatch.
$opt_sleepinterval ||= 5;      # Timeperiod for re-reading file when followed.
$opt_ana_delay ||= 0;          # Timeperiod to delay analysis (e.g. to wait for incoming events from batch-oriented owamp).
$opt_verbose ||= 0;            # Verbosity level

# Check for invalid option combinations
$opt_strict_eventset && @opt_eventmatch < 2 && die "Error: Invalid option combination. Strict event set matching (-S) requires at least two event types (-e).";

# Prepare iso date range
if ($opt_daterange eq '') {
    if ($opt_follow) {
	# Sources are followed. Set range with current time as start date and no end date
	$opt_daterange = localtime()->strftime("%Y-%m-%dT%H:%M:%S") . $tz_local ;
    } else {
	# Accept all datetime values
	$opt_daterange = localtime(0)->strftime("%Y-%m-%dT%H:%M:%S") . $tz_local ;
    }
}
( $start_iso, $end_iso) = split("/", $opt_daterange);

if ( $start_iso =~ /^\d{4}-[01]\d-[0-3]\d$/ ) {
    # Date only. Add time and local timezone.
    $start_iso .= "T00:00:00" . $tz_local;
}
if (! ( $start_iso =~ /Z|[+\-]\d{2}:?\d{2}$/) ) {
    # Timezone missing. Add local.
    $start_iso .= $tz_local;
}
# Prepare epoch timestamps for range (and evaluate iso dates)
$start_time = DateTime::Format::ISO8601->parse_datetime($start_iso)->epoch();  # (Parser dies on format error.)
$end_iso = ($opt_follow ? '' : $end_iso);   # Clear end time to follow input source 
if ($end_iso) {
    if ( $end_iso =~ /^\d{4}-[01]\d-[0-3]\d$/ ) {
	# Date only. Add time and timezone from start iso.
	$end_iso .= "T23:59:59" . substr($start_iso, -6);
    }
    if (! ( $end_iso =~ /Z|[+\-]\d{2}:?\d{2}$/) ) {
	# Timezone missing. Add same as for start iso.
	$end_iso .= substr($start_iso, -6);
    }
    $end_time = DateTime::Format::ISO8601->parse_datetime($end_iso)->epoch();   # (Parser dies on format error.)
} 
if ( $opt_pidfile ne "" && open(my $pid_fh, ">", $opt_pidfile) ) {
    # Put current pid in file
    print $pid_fh "$$\n";
    close $pid_fh;
}

STARTPARSING:

# Ensure all output is fully flushed.
STDOUT->autoflush(1); 

my $argc=0;
foreach (@ARGV) {
    if ($opt_url) {
	# Find time field for es index
	my $tfield = ( $#opt_timefield == $#ARGV ? $opt_timefield[$argc] : $opt_timefield[0] );
	# Init search for index
	push @inputfile, init_search($_, $tfield, $start_time, $end_time, $start_iso, $end_iso);
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

    # Pull event from input queue, update correlation windows and check for correlations.
    my $prev_input_queue_size = 0;
    while (get_next_event()) {

	while ($prev_input_queue_size < @eventq && @eventq < $opt_inputbuffersize ) {
	    # Input queue is filling up but is still a bit short. Attempt to fill more events into it before starting analysis.
	    # (Filling the input queue helps with getting events sorted.)
	    $prev_input_queue_size = @eventq;
	    get_next_event();
	}		

	my $matchfieldvalues = get_matchfield_value_str($eventq[0]);
	if (! $matchfieldvalues ) {
	    # No values for matchfields in head of event queue, i.e. nothing to do.
	    print STDERR "Warning: No matchfields in record/doc. Skipping." if ($opt_verbose);
	    shift @eventq;
	    next;
	}
	if (! exists $corr_events_window{ $matchfieldvalues }) {
	    # Prepare analysis window/queue for matchfield value set
	    $corr_events_window{ $matchfieldvalues } = ();
	}
	if ($eventq[0]{'me_timestamp'} + $opt_ana_delay < time() ) {
	    # Head of event queue is "mature" enough for analysis
	    # Move head of input queue to tail of analysis window/queue
	    push @{ $corr_events_window{ $matchfieldvalues } }, $eventq[0];
	    shift @eventq;
	    
	    # Clear out too old events from correlation window/queue
	    while ( @{ $corr_events_window{ $matchfieldvalues }} > 1 ) {
		if ($corr_events_window{ $matchfieldvalues }[-1]{'me_timestamp'} - $corr_events_window{ $matchfieldvalues }[0]{'me_timestamp'} > $opt_window_size) {
		    # To long (time wise) window/queue. Remove head.
		    shift @{ $corr_events_window{ $matchfieldvalues }} 
		} else {
		    # Head in window/queu is still relevant (as well as rest of window)
		    last;
		}
	    }

	    # Check if even more input events are relevant for correlation
	    while (@eventq && $eventq[0]{'me_timestamp'} - $corr_events_window{ $matchfieldvalues }[0]{'me_timestamp'}  <= $opt_window_size ) { 
		# (New) head of input event queue fits into correcation window.
		# Move head of input queue to tail of analysis window/queue
		push @{ $corr_events_window{ $matchfieldvalues } }, $eventq[0];
		shift @eventq;
		get_next_event();
	    }
	    
	    # Check status of correlation window
	    if (@{ $corr_events_window{ $matchfieldvalues }} > 1 && all_expected_events_present($corr_events_window{ $matchfieldvalues }) ) {
		# More than one event correlate in time. Report.
		report_correlation( $matchfieldvalues );
	    }
	} else {
	    # Sleep to let input queue "mature"
	    sleep($opt_sleepinterval);
	}
    }
    # Do a final check for correlating events (in case the very last collection of input events all correlate.)
    foreach my $matchfieldvalues (keys %corr_events_window) {
	if (@{ $corr_events_window{ $matchfieldvalues }} > 1 && all_expected_events_present($corr_events_window{ $matchfieldvalues }) ) {
	    # More than one event correlate. Report.
	    report_correlation( $matchfieldvalues );
	}
    }
    
    if ($opt_follow) {
	# Sleep and retry reading at end of file
	sleep($opt_sleepinterval);
	if ($opt_url) {
	    # Continue searching
	    next;
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

