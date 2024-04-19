#!/usr/bin/perl
#
# Return JSON object of YAML mapconf file
#
#
#  Author: Otto J Wittner
#  Email: otto.wittner@uninett.no
#  Date: 2024-04-19
#
#  Copyright: Sikt
#

use strict;
use warnings;
use Data::Dumper;
use CGI;
use URI;
use JSON;
use YAML;

# #   M A I N   T H R E A D   # # 

my $configfile="/etc/perfsonar/microdep/mapconfig.yml";
#my $configfile="../../etc/mapconfig.yml";

my %output = ( msg => "", config => "");  # Output hash.

my $restq = CGI->new;        # Rest/CGI query object.

sub msg {
    my $msg = shift @_;

    # Output json respons
    $output{'msg'} = $msg;
    print $restq->header( -type => 'application/json');
    print encode_json \%output, "\n";
}

my $yaml_hash = YAML::LoadFile($configfile);
$output{"config"}= $yaml_hash;
msg ("YAML successfully loaded" );


