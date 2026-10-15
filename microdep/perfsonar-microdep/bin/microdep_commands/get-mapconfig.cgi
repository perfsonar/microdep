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
    if (! /^[^.].*\.yml\z/ ) {
	# Skip none-yaml-files: the name has to end in .yml, and hidden files are left out.
	# (A name that merely held ".yml" was taken as well, so what a package upgrade or an
	# editor leaves behind was loaded too: net.yml.rpmsave, net.yml.dpkg-old, net.yml~, .net.yml.swp)
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
# The address of the archive is for the scripts of this host that fetch the data:
# they ask with MICRODEP_MAPCONFIG=full in their environment (which a request
# cannot set). A browser has no use for it, and it may hold a user name and a
# password, so it is left out of every other answer.
if ( ( $ENV{'MICRODEP_MAPCONFIG'} // '' ) ne 'full' ) {
    delete $output{'config'}{$_}{'archive'} foreach keys %{ $output{'config'} };
}
# Output all message and config as json structure
msg_output();



