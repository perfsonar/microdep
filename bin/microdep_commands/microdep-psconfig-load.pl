#!/usr/bin/perl
#
# Reads and interprets a perfSONAR 5 psconfig file, and uploads any address and
# topology changes to a Microdep configuration database. 
# 
# Changelog
#   2023-08-09 Otto J Wittner: Created, based on microdep-conifg-load

use strict;
use DBI;
use Getopt::Long;
use JSON;
use Data::Dumper qw(Dumper);
use LWP::Simple;

my $debug=0;

my $database="/var/lib/microdep/mp-dragonlab/etc/microdep.db";
my $driver   = "SQLite";
my $userid = "";
my $password = "";

my $start_time;
my $debug;
my $opt_h;
my $opt_c;
my $opt_v;
my $opt_vv;
my $opt_uid="microdep";

my $usage="$0 [-h] [-v] [-vv] [--debug] [--db db-file] [-u username] [--start-time epoch] psconfig-file
    -h                    Help message
    --db filename         Filename of database to apply. Default is " . $database . ".
    -u username           Username to apply for probenodes. Default is " . $opt_uid . ".
    --start-time seconds  Unix epoch timestamp for when topology is to be activated. Default is now.
    -c                    Delete and reinitiate DB.
    -v                    Be verbose.
    -vv                   More vebose.
    --debug               Too much info.
";

GetOptions( 'h' => \$opt_h, 'help' => \$opt_h, 'c' => \$opt_c, 'u=s' =>\$opt_uid, 'uid=s' =>\$opt_uid, 'db=s' => \$database,
	    'start-time=i' => \$start_time, 'debug=s' => \$debug, 'v' => \$opt_v, 'vv' => \$opt_vv, )
    or die $usage;

print $usage and exit if ($opt_h);       # Show help message

my $psconfigfile = shift or print $usage and exit;  # Get input file

# Remove database
unlink($database) if ($opt_c);

# Connect to Microdep config database
my $dsn = "DBI:$driver:dbname=$database";
my $dbh = DBI->connect($dsn, $userid, $password, { RaiseError => 1 })
    or die $DBI::errstr;
my %result=();

if ($opt_c) {
    # Create tables
    $dbh->do("CREATE TABLE members(id integer primary key autoincrement, datetime,name, user, dns, ip, rude_port, crude_port, ssh_port, status, timestamp, latitude, longitude, city);");
    $dbh->do("CREATE TABLE peers(id integer primary key autoincrement, from_name, to_name, start integer, end integer, type, timestamp);");
}

# Prepare mapping (%mix) of field name to column no in DB
my @members=split ( /[, ]+/, "id, datetime,name, user, dns, ip, rude_port, crude_port, ssh_port, status, timestamp, latitude, longitude, city");
my %mix=(); # hash of members fields indexes
my $ix=0;
foreach my $field (@members ){ #
    $mix{$field} = $ix;
    $ix++;
}

# Read psconfig json-file
my $psconfigfile_str;
{
    local $/;
    open my $fh, '<', $psconfigfile or die "Error: Can't open $psconfigfile: $!";
    $psconfigfile_str = <$fh>;
}
# Decode json
my $psconfig = decode_json $psconfigfile_str;

#print Dumper($psconfig); exit;

# #   A d d / u p d a t e   m e m b e r   n o d e s   ( v e r t e x ) 

my $now=`date '+%FT%T'`;   #ISO date-time
chomp($now);
my $now_epoch = time;

my $count_inserts=0;
my $count_updates=0;

my $lslookuphost_str = get("http://ps-west.es.net/lookup/activehosts.json");
my $lslookuphost = decode_json $lslookuphost_str;
print "lslookup hosts:\n", Dumper($lslookuphost) if $debug;

if ( exists $psconfig->{'addresses'} ) {
    # Add name-address tuples to DB if not already present
    foreach my $name (keys %{ $psconfig->{'addresses'} }) {
	
	my $ip = $psconfig->{'addresses'}->{$name}->{'address'};
	my $uid = $opt_uid;
	my $dns = $name;
	my $port = 10001;
	my $crude_port = 10001;
	my $ssh_port = 22;
	my $status ="on";

	# Fetch geo coordinates
	my $lslookup_str = get( $lslookuphost->{'hosts'}[0]{'locator'} . "/?host-name=" . $ip);
	my $lslookup = decode_json $lslookup_str;
	my $latitude = $$lslookup[0]{'location-latitude'}[0] || "0.0";
	my $longitude = $$lslookup[0]{'location-longitude'}[0] || "0.0";
        my $city =$$lslookup[0]{'location-city'}[0] || "Unknown" ;
	    
	# Check if name/address is present
	my @rec = do_select_last('SELECT * FROM members where name = "' . $name . '" and status = "on" order by timestamp;' );
    
	if ( $#rec < 0 ||                 # Name/address is missing or ...
	     ( $status eq "on" &&
	       ( $uid ne $rec[$mix{user}] || # User id has changed or ...
		 $dns ne $rec[$mix{dns}] ||  # DNS name has changed or ...
		 $ip ne $rec[$mix{ip}]   ||  # IP address has changed or ...
		 $port ne $rec[$mix{rude_port}] || # Port has changed or ...
		 ( $crude_port && $crude_port ne $rec[$mix{crude_port}] ) || # curde port has changed or ...
		 ( $ssh_port && $ssh_port ne $rec[$mix{ssh_port}] ) ) ) ) { # ssh port has changed
	    # Insert new entry in DB
	    my $insert= sprintf( "insert into members values ( NULL,'%s', '%s','%s', '%s', '%s', %s, %s, %s, '%s', %d, %s, %s, '%s' );",
				 $now, $name, $uid, $dns, $ip, $port, $crude_port, $ssh_port, $status, $now_epoch, $latitude, $longitude, $city );
	    print STDERR $insert if $debug;
	    if ($dbh->do($insert)){
		$count_inserts++;
		print "Added: $now, $name, $uid, $dns, $ip, $port, $crude_port, $ssh_port, $status, $now_epoch, $latitude, $longitude, $city\n" if ($opt_vv);
		if ( $#rec > 0 ){ # mark as old
		    my $update= sprintf( "UPDATE members SET status = 'old' WHERE id = '%s';", $rec[0] );
		    if ( ! $dbh->do($update)){
			print "ERROR:\t" . $DBI::errstr . " : " . $update . "\n";
		    } else {
			$count_updates++;
		    }
		}
	    } else {
		print "ERROR:\t" . $DBI::errstr . $_ . "\n";
	    }
	} 
    }
}
# Report
print "New nodes added: " . $count_inserts . " Nodes depreciated: " . $count_updates . "\n" if ($opt_v || $opt_vv);


# #   A d d / u p d a t e   f l o w s / p e e r s   ( e d g e s ) 

my $midnight=`date --date "tomorrow 00:00:00" +%s`;
chomp($midnight);
my $last_midnight=`date --date "today 00:00:00" +%s`;
chomp($last_midnight);
my $eternity=`date --date "2099-12-31 23:59:59" +%s`;
chomp($eternity);

$start_time = $midnight if ! $start_time;
#$start_time = $last_midnight if ! $start_time;
#$start_time = $now_epoch if ! $start_time;

# Init "class variables" for sub-routines
my %peers=();
my $npeers=0;
my $nnew=0;
my $nold=0;

if ( exists $psconfig->{'tasks'}->{'microdep-delay-and-loss'}->{'group'} ) {
    # Interpret measurement topology configured for Microdep
    my $pstopology = $psconfig->{'groups'}->{$psconfig->{'tasks'}->{'microdep-delay-and-loss'}->{'group'}};
#    print Dumper $pstopology;
    if ( $pstopology->{'type'} = 'disjoint' ) {
	# Apply a topology with duplex connections between each A-adress and all B-addresses
	foreach my $name_a (@{ $pstopology->{'a-addresses'} }) {
	    foreach my $name_b (@{ $pstopology->{'b-addresses'} }) {
		insert_peers( $name_a->{'name'}, $name_b->{'name'} );
		insert_peers( $name_b->{'name'}, $name_a->{'name'} );
	    }
	}
    }

    # terminate active peers not in current config
    my @older = do_select_all('SELECT * FROM peers WHERE start < ' . $start_time . ' and end > ' . $start_time . ' LIMIT 10000;' );
    
    foreach my $row( @older ){ # 
	my ( $id, $from, $to, $start, $end, $type)= @$row;
	if ( ! $peers{$from, $to} ){ # end peer
	    update_record( $start_time, $row );
	}
    }

    printf "There are $npeers peers, of which $nnew are new and $nold marked ended\n" if ($opt_v || $opt_vv); 
    if ($opt_vv) {
	# Show topology
        print "Current and future topology:\n";
	my @current = do_select_all('SELECT * FROM peers WHERE end >= ' . $now_epoch . ';' );
	foreach my $p (@current) {
	    print "\t", ${$p}[1], " -> ", ${$p}[2], "\n";
	}
    }
    
}
    
sub do_select_last{
    my $statement=shift;
    my @svar;
    print STDERR $statement . "\n" if $debug;
    my $sth = $dbh->prepare($statement);
    if ( ! $sth ){
	$result{status}="ERROR";
	$result{'code'} = $dbh->errstr;
#    } elsif( ! $sth->execute($userid, $password) ){
    } elsif( ! $sth->execute() ){
	$result{status}="ERROR";
	$result{'code'} = $sth->errstr;
    } else { # result ok
	$result{status} = "OK";
	@{$result{spor}} = ();
	while(my @row = $sth->fetchrow_array()) {
	    @svar=@row; # keep the last one
	}
    }
    return @svar;
}

sub insert_peers{
    $npeers++;
    my ($from, $to) = @_;
    $peers{ $from, $to }=1;
    my $q= 'SELECT * FROM peers'
	. ' WHERE from_name = "' . $from . '" and to_name = "' . $to . '" and end > ' . $midnight 
	. ' ORDER BY start;';
    # print STDERR $q."\n" if $debug;
    my @peers = do_select_all($q );
    if ( $#peers < 0){ # new connection
	my $insert= sprintf( "INSERT INTO peers VALUES ( NULL, '%s', '%s', '%s', '%s', '%s', '%s' );",
			     $from, $to, $start_time, $eternity, "standard", $now_epoch);
	print STDERR $insert if $debug;
	if ($dbh->do($insert)){
	    print "OK:\t" . $_ . "\n" if $debug;
	    $nnew++;
	} else {
	    print "ERROR:\t" . $DBI::errstr . $_ . "\n";
	}
    }
}

sub do_select_all{
    my $statement=shift;
    my @svar=();
    print STDERR "$statement\n" if $debug;
    my $sth = $dbh->prepare($statement);
    if ( ! $sth ){
	$result{status}="ERROR";
	$result{'code'} = $dbh->errstr;
#    } elsif( ! $sth->execute($userid, $password) ){
    } elsif( ! $sth->execute() ){
	$result{status}="ERROR";
	$result{'code'} = $sth->errstr;
    } else { # result ok
	$result{status} = "OK";
	@{$result{spor}} = ();
	while(my @row = $sth->fetchrow_array()) {
	    push(@svar, \@row);
	}
    }
    return @svar;
}

sub update_record{  # mark old record and add new record with new address
    my $end=shift;
    my $row=shift;

    my $update= sprintf( "UPDATE peers SET end = '%s', timestamp = '%s' WHERE id = '%s';", $end, $now_epoch, $row->[0] );
    print STDERR "$update\n" if $debug;
    if ($dbh->do($update)){
	$nold++;
	return 1;
    } else {
	print "ERROR:\t" . $DBI::errstr . " : " . $update . "\n";
    }
    return 0;
}
