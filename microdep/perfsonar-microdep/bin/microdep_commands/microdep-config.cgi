#!/usr/bin/perl
#use CGI::Debug;
#
# deliver config-files for microdep to asking host based on ip address
#
#use v5.10;
use strict;
use DBI;
use Socket;
use JSON;
use YAML;

use CGI;
#use CGI::Carp 'fatalsToBrowser';

my $q = CGI->new;

my $debug=parm('debug');
if ( $debug > 0 ){
    print $q->header('text/html');
}
my $r_ip= parm("ip");  $r_ip =  $q->remote_addr() if !$r_ip;
my $r_host= parm("name");  $r_host = $q->remote_host() if !$r_host;
my $variant=parm('variant');
my $file=parm('file');

printf " $r_ip $r_host $variant %s %s\n", $q->remote_addr(), $q->remote_host() if $debug;

my $basedir="/var/lib/microdep";
my $conf;      # Settings from config file

# Read config file (if exists)
my $conffile="/etc/perfsonar/microdep/microdep-config.yml";
if (parm('conffile')) {
    $conffile=parm('conffile');
}
if (-e $conffile) {
    $conf = YAML::LoadFile($conffile);
    $basedir = $conf->{basedir} if $conf->{basedir};
}

my $config_dir="$basedir/$variant";
my $mp_list="$config_dir/etc/mp-address.txt";
my $database="$config_dir/etc/microdep.db";

# Override with settings from config-file (if any)
$config_dir=$conf->{config_dir} if $conf && $conf->{config_dir};
$mp_list=$conf->{mp_list} if $conf && $conf->{mp_list};
$database=$conf->{database} if $conf && $conf->{database};

print "<p>$config_dir $mp_list\n" if $debug;

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

    connect_db();
    my $query_str = 'SELECT from_name, to_name FROM peers WHERE start < ' . $end . ' AND end > ' . $start . ' ORDER BY from_name, to_name LIMIT 10000;' ;
    if ($mode eq "nodes") {
	# Fetch nodes (vertices) info 
	$query_str = 'SELECT name, city, latitude, longitude FROM members WHERE timestamp < ' . $end . ' AND timestamp > ' . $start . ' ORDER BY name LIMIT 10000;' ;
    }
    my @pairs = do_select( $query_str );
    print $q->header( -type=>'application/json'	);

    for ( my $i=0; $i <= $#pairs; $i++){
	printf "mode: %s pair: %s - %s \n<br>", $mode, $pairs[$i][0], $pairs[$i][1] if $debug;
    }
    print encode_json \@pairs;
    exit (0);
    
} else { # serve config files

    if ( -f $database && connect_db() && table_exist('members')){

	my @name_by_ip = do_select( 'SELECT name FROM members where ip = "' . $r_ip . '" and status = "on" order by timestamp;' );
	print "name_by_ip: ", encode_json \@name_by_ip if $debug;
	for (my $i=0; $i<= $#name_by_ip; $i++){
	    my @row=$name_by_ip[$i];
	    push(@ips, $name_by_ip[$i][0]); 
	}

	my @name_by_name= do_select('SELECT name FROM members where name = "' . $r_host . '" and status = "on" order by timestamp;' );
	print "name_by_name: ", encode_json \@name_by_name if $debug;
	for (my $i=0; $i<= $#name_by_name; $i++){
	    push(@names, $name_by_name[$i][0]); 
	}

	
	if ( $debug ) {
	    printf "ips : " . join(",", @ips) . "\n";
	    printf "names : " . join(",", @names) . "\n";
	}

	if ( $#ips < 0){ # IP not found
	    if ( $#names >= 0){ # and we will add address for name if already existing
		my $rec=$names[$#names];
		my $pfx=length($r_ip) / 2;
		# if ( substr( $r_ip, 0, $pfx) eq substr( $rec->[7], 0, $pfx) ){ # only update if half prefix is same
		    if ( update_record( $r_ip, $rec ) ){ # take last record
			my @n=($r_host);
			push(@ips, \@n);
		    }
		# }
	    }
	}
    } elsif ( -f $mp_list ) { # check for flat file list
	if ( $r_host eq "" || $r_host =~ /^\d+/ ){ # try inverse dns
	    print "rhost $r_host r_ip $r_ip\n" if $debug;
	    my $iaddr=inet_aton($r_ip);
	    $r_host=gethostbyaddr($iaddr, AF_INET);
	    # $r_host=`host $r_host | perl -ne 'if (/pointer ([\w\d_\.-]+)/ ) {print $1; last}'`;
	    $r_host=~ s/\.$//;
	    $r_host = $r_ip if $r_host eq "";
	    print "rhost $r_host\n" if $debug;
	}
	my @lines=`grep "$r_ip" $mp_list`; # find by name first
	if ( $#lines < 0 ){ # try by address
	    @lines=`grep "$r_host" $mp_list`;
	}
	foreach my $line( @lines){
	    chomp($line);
	    my ($name, $adr)=split(/\s+/, $line);
	    print "name $name\n" if $debug;
	    # my $ip=`host $name | perl -ne 'if (/has address ([\d\.]+)/ ) {print $1; last}'`;
	    #my $i=gethostbyname($name);
	    #my $ip= inet_ntoa( $i );
	    push(@ips, $name);
	}
    }


    if (  $#ips >= 0 || parm('secret') eq 'virre-virre-vapp'){ # ready to serve 
	if ( $file ){

	    my $basename=`basename $file`;
	    chomp($basename);

	    if ( $debug > 0 ){printf "path $config_dir/etc/$basename\n";}
	    
	    if (-f "$config_dir/etc/$basename" ){
		my $file_content=`cat "$config_dir/etc/$basename"`;
		print $q->header(
		    -type=>'text/plain',         
		    -attachment=> "$basename",
		    -Content_Length=> length( $file_content)
		    );
		
		print $file_content;
		
	    } else {
		print $q->header(-type => 'text/plain' );
		print "### File not found $file\n";
		print STDERR "### File not found for $file host $r_host ip $r_ip file $file\n";

	    }
	    $found=1;
	} else { # found client in list - send config_files
	    $r_host=$ips[$#ips];  # use last entry
	    my $client_dir="$config_dir/mp/$r_host";
	    print "client_dir $client_dir\n" if $debug;

	    chdir $client_dir;
	    my $files="rude.cfg trace.cfg parms.cfg";
	    if ( -f "upgrade_software"){
		$files.= " upgrade_software";
	    }
	    my $client_config = `tar cf - $files `;

	    print $q->header(
		-type=>'application/octet-stream',         
		-attachment=> "microdep-conf.tar",
		-Content_Length=> length( $client_config)
		);
	    print $client_config;
	    $found=1;
	}
    }

    if ( $found < 1 ){
	print $q->header(
	    -type=>'text/plain' );
	print "### No match found for host $r_host ip $r_ip file $file\n";
	print STDERR "### No match found for host $r_host ip $r_ip file $file\n";
    }
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
    my $row=shift;

    my $datetime=`date +%FT%T`;
    my $epoch=time;
    chomp($datetime);

    $row->[0]=undef;
    $row->[1]=$datetime;
    $row->[5]=$new_ip;
    $row->[10]=$epoch;

    my $insert= sprintf( "INSERT INTO members VALUES ( NULL,'%s', '%s','%s', '%s', '%s', %s, %s, %s, '%s', %d );", @$row );
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
