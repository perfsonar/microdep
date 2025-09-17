#!/usr/bin/perl 
#
# Read json from stdin and print selected fields (on to level) in table format
#
use JSON;
use Data::Dumper;

$SIG{HUP} = \&sig_handler;
$SIG{INT} = \&sig_handler;
sub sig_handler{
    # Ignore
}

if(! @ARGV) {
    print "Usage: $0 [-l] [ field-to-show [ field-to-show ...]] < stdin-input\n
-l   list all valid fieldnames\n";
    exit;
}

%seenfield;   # Hash to help make list of unique fields

while(<STDIN>) {
    $j=decode_json($_);
    if ($ARGV[0] eq "-l") {
	# List all field names found instead
	@field = keys %{ $j };
	foreach (@field)  {
	    if ($seenfield{$_}) {
		next;
	    } elsif ($_) {
		$seenfield{$_} = 1;
	    }
	}
	
    } else {
	foreach (@ARGV) {
	    if (ref($j->{$_}) eq "HASH" || ref($j->{$_}) eq "ARRAY") {
		# Hash or array. Print as json.
		print encode_json($j->{$_}) ," ";
	    } elsif ( /(\S+)\s+-\s+(\S+)/ ) {
		# Substraction. Do the maths.
		print $j->{$1} - $j->{$2} ," ";
	    } else {
		# Just print.
		print $j->{$_} ," ";
	    }
	}
    print "\n";
    }
}

if ($ARGV[0] eq "-l") {
    # Output list of uniq fields seen
    print join("\n", sort keys %seenfield), "\n";
 
}
