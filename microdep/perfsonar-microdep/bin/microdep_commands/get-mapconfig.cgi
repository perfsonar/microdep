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
use Storable qw(dclone);
use Hash::Merge::Simple qw/ merge /;
    
# #   M A I N   T H R E A D   # # 

my $configfile="/etc/perfsonar/microdep/mapconfig.yml";
my $configdir="/etc/perfsonar/microdep/mapconfig.d";
#my $configfile="../../etc/mapconfig2.yml";
#my $configdir="../../etc/mapconfig.d";

my %output = ( msg => "", config => {});  # Output hash.

my $restq = CGI->new;        # Rest/CGI query object.

sub msg {
    my $msg = shift @_;

    # Add message to output console-string
    $output{'msg'} .= $msg . "\n";
}

sub msg_output {
    # Output json respons
    print $restq->header( -type => 'application/json');
    print encode_json \%output, "\n";
}

# Fetch default config values for a measurement network
my $default_yaml_hash = YAML::LoadFile($configfile);
#$output{"config"}= $yaml_hash;
msg ("Default YAML config successfully loaded" );
#print Dumper($default_yaml_hash);

# Fetch configs for specific networks
opendir my $dir, $configdir or msg("Cannot open config directory: $!") and exit;
my @files = readdir $dir;
closedir $dir;
foreach (@files) {
    if (! /\S*\.yml/ ) {
	# Skip none-yaml-files
	next;
    }
    my $net_yaml_hash = YAML::LoadFile($configdir . "/" . $_);
    msg("YAML config from " . $_ . " successfully loaded.\n");
    foreach my $net (keys %{$net_yaml_hash}) {
	msg("Config for network " . $net . " found, merging with defaults.");
	# Add default config to network
#	print Dumper($net_yaml_hash->{$net});
	$output{"config"}{$net} = dclone($default_yaml_hash);
	# Add/overwrite specific conf data
	my $merged = merge $output{"config"}{$net}, $net_yaml_hash->{$net};
	$output{"config"}{$net} = $merged;
    }
}
# Output all message and config as json structure
msg_output();



