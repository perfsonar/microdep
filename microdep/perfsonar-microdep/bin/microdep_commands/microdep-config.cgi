#!/usr/bin/perl
#use CGI::Debug;
#
# Deliver topology data available in Sqlite3 database
#
#use v5.10;
use strict;
use DBI;
use Socket;
use JSON;
use YAML;

use CGI;
#use CGI::Carp 'fatalsToBrowser';

#my $vpn_host = "10.0.0.1"; # if traffic is rerouted

my $q = CGI->new;

my $debug=parm('debug');
if ( $debug > 0 ){
    print $q->header('text/html');
}
my $r_ip= parm("ip");  $r_ip =  $q->remote_addr() if !$r_ip;
my $local_ip =  parm("local_ip") || "unknown";
#my $r_host= parm("node_name");  # no no: $r_host = $q->remote_host() if !$r_host;
#my $variant=parm('variant');
my $net=parm('net');
my $file=parm('file');

#printf "remote_host: %s\n",  $q->remote_host();
#printf " $r_ip $r_host $variant %s %s\n", $q->remote_addr(), $q->remote_host() if $debug;

my $basedir="/var/lib/microdep";
my $conf;      # Settings from config file

# Read config file (if exists)
#my $conffile="/etc/perfsonar/microdep/microdep-config.yml";

# Fetch config data (and remove html header)
$config = decode_json(`/usr/lib/perfsonar/bin/microdep_commands/get-mapconfig.cgi | tail -n +2`);
    
my $esurl=  $config->{'config'}->{parm('net')}->{'archive'} || 'http://localhost:9200';
#if (parm('conffile')) {
#    $conffile=parm('conffile');
#}
if (-e $conffile) {
    $conf = YAML::LoadFile($conffile);
    $basedir = $conf->{basedir} if $conf->{basedir};
}

my $config_dir="$basedir/$variant";
#my $mp_list="$config_dir/etc/mp-address.txt";
my $database="$config_dir/etc/microdep.db";

# Override with settings from config-file (if any)
$config_dir=$conf->{config_dir} if $conf && $conf->{config_dir};
#$mp_list=$conf->{mp_list} if $conf && $conf->{mp_list};
$database=$conf->{database} if $conf && $conf->{database};

#print "<p>$config_dir $mp_list\n" if $debug;

#if ( ! $r_host && ! $file){
#    $r_host = guess_node_name($r_ip);
#}

my $dbh;
my @names=();
my @ips=();
my $found=0;
my %result=();

sub connect_db{
    # connect to the database
    my $driver   = "SQLite";
    my $dsn = "DBI:$driver:dbname=$database";
    my $userid = "";
    my $password = "";
    $dbh = DBI->connect($dsn, $userid, $password, { RaiseError => 1 })
	or die $DBI::errstr;
    return 1;
}


if ( parm('start')){ # list active peers
    my $start=parm('start');
    my $end=parm('end');
    my $mode=parm('mode') || "links";
    if ( !$end ){
	$end=time;
    }

    if (! -e $database) {
	# No database found.
	if ( $debug > 1 ){
	    print "Error: No database found at " . $database . "\n";
	    exit(1);
	} else {
	    # Return empty json structure.
	    print $q->header( -type=>'application/json'	);
	    print "{}\n";
	    exit(0);
	}
    }
	    
    connect_db();
    my $query_str = 'SELECT from_name, to_name FROM peers WHERE start < ' . $end . ' AND end > ' . $start . ' ORDER BY from_name, to_name LIMIT 10000;' ;
    if ($mode eq "nodes") {
	# Fetch nodes (vertices) info 
	$query_str = 'SELECT name, city, latitude, longitude, ip FROM members WHERE timestamp < ' . $end . ' AND timestamp > ' . $start . ' ORDER BY name LIMIT 10000;' ;
    }
    my @pairs = do_select( $query_str );
    print $q->header( -type=>'application/json'	);

    for ( my $i=0; $i <= $#pairs; $i++){
	printf "mode: %s pair: %s - %s \n<br>", $mode, $pairs[$i][0], $pairs[$i][1] if $debug;
    }
    print encode_json \@pairs;
    exit (0);
    
} else {
    # Return empty json structure.
    print $q->header( -type=>'application/json'	);
    print "{}\n";
    exit(0);
}

exit(0);

# weed out special shell chars
sub parm{ 
    my $p=shift;
    my $v=$q->param($p);
    $v=~s/[^\w_\.-]/_/g if $v;
    return $v;
}

sub table_exist{
    my $table=shift;
    my @svar=do_select( 'SELECT count(*) FROM sqlite_master WHERE name="' . $table . '";' );
    print "table exist : $table : " . @svar ."\n" if $debug;
    return $svar[0][0];
}

sub do_select{
    my $statement=shift;
    my @svar;
    print STDERR $statement if $debug >0;
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
    my $new_ip=shift;
    my $row=shift; # name

    my $datetime=`date +%FT%T`;
    my $epoch=time;
    chomp($datetime);

    $row->[0]=undef;
    $row->[1]=$datetime;
    $row->[5]=$new_ip;
    $row->[10]=$epoch;

    my $insert= sprintf( "INSERT INTO members VALUES ( NULL,'%s', '%s','%s', '%s', '%s', %s, %s, %s, '%s', %d );", @$row );
    print "$insert\n" if $debug > 0; 
    if ($dbh->do($insert)){
	my $update= sprintf( "UPDATE members SET status = 'old' WHERE id = '%s';", $row->[0] );
	if ($dbh->do($update)){
	    return 1;
	} else {
	    print "ERROR:\t" . $DBI::errstr . " : " . $update . "\n";
	}
    } else {
	print "ERROR:\t" . $DBI::errstr . " : " . $insert . "\n";
    }
    return 0;
}


