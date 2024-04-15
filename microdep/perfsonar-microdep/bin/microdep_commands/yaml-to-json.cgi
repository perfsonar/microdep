#!/usr/bin/perl
#
# Return JSON object of YAML file specified
#
# yaml-to-json.cgi?file=<config-file.yml>
#
#  Author: Otto J Wittner
#  Email: otto.wittner@uninett.no
#  Date: 2021-12-09
#
#  Copyright: Uninett AS
#

use strict;
use warnings;
use Getopt::Long;   # Commandline argument parser
#use Time::Piece;    # Date and time string parsing
#use DateTime;
#use DateTime::Format::ISO8601;
#use Search::Elasticsearch;
use Data::Dumper;
use CGI;
use URI;
use JSON;
use YAML::XS;

# Filter duplicate from arrays
sub uniq {
    my %seen;
    grep !$seen{$_}++, @_;
}


use constant {
    MODE_CLI => 'cli',
    MODE_CGI => 'cgi',
};

# #   M A I N   T H R E A D   # # 

# Create default timestamp as current time in current time zone but yesterday
my %params = (
    help => 0,                       # Flag for help text
    inputfile => "mapconfig.yml",            # Name of in put YAML-file
    verbose => 0,                    # Flag for more output
    mode => MODE_CLI                 # Script input/ouput mode (default commandline mode)
    );

my %output = ( msg => "", config => "");  # Output hash.

my $restq = CGI->new;        # Rest/CGI query object.

# Message to user
#   params: message-string, exit-flag
sub msg {
    my $msg = shift @_;
    my $end = shift @_;

    if ($params{'mode'} eq MODE_CGI ) {
	# Output json respons
	$output{'msg'} = $msg;
	print $restq->header( -type => 'application/json');
	print encode_json \%output, "\n" if ($end);
    } else {
	print $msg, "\n";
	print "\n", Dumper($output{"config"}), "\n";
    }

    exit 0 if ($end);
}


my @scriptname = split /\//, $0;
if ($scriptname[-1] =~ /.*\.cgi/) {
    # Default to CGI-mode since script has cgi extention
    foreach my $key (keys %params) {
	#Parse params as GET input parameters
	$params{$key} = $restq->param($key) if defined($restq->param($key));
    }
    $params{'mode'} = MODE_CGI; # Force cgi mode
} else {
    # Parse commandline
    GetOptions (
	"verbose" => \$params{'verbose'},    # flag
	"help"  => \$params{'help'})         # flag for help message
	or die("Error in command line arguments\n");
    
    my $num_args = $#ARGV + 1;
    if ( $params{'help'} || $params{'mode'} eq MODE_CLI && $num_args lt 1 ) {
	# Show usage info
	print "Usage: $scriptname[-1] [-h] input-YAML-file 
   -h -help                  This help message.
   -v -verbose               Show more info in addition to url
";
    
	exit 1;
    }

    if ($params{'mode'} eq MODE_CGI) {
	if ( $num_args ge 1) {
	    # Extracts params from first argument assuming HTTP GET key/value format
	    my $uri = URI->new("http://dummy.no/?" . $ARGV[0]);
	    my %query = $uri->query_form;
	    foreach my $key (keys %params) {
		#Parse params as GET input parameters
		$params{$key} = $query{$key} if defined($query{$key});
	    }
	    $params{'mode'} = MODE_CGI; # Ensure cgi mode is still set
	} else {
	    msg ('Error: Invalid no of arguments.', 1);
	}
    } else {
	# Store mandatory arguments
	$params{'inputfile'} = $ARGV[0];
    }
}

#print Dumper(%params); 

if (my $yaml_hash = YAML::LoadFile($params{"inputfile"})) {
    $output{"config"}= $yaml_hash;
    msg ("YAML successfully loaded", 1 );
} else {
    msg ("Error: Unable to load YAML-file" . $params{"inputfile"}, 1);
}

