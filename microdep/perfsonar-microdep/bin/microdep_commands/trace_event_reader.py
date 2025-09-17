#!/usr/bin/python3
#
# A traceroute analyser which parse raw output form traceroute, search for misc anomalities
# and reports. The analyser attempts to "learn" want is normal. Divertion for normal state
# triggers reports. Anomalities handels are:
#  - Stopped routes, i.e. routes that never reach the intended destination.  
#  - Significant route changes, i.e. a sudden major change in set of hosts along a route
#
# NOTE:    The code is based on a code based produced during a summer internship, hence the
#          references to "summer job code" in the comments.
#
# WARNING: The code is not especially well structured. At total re-design and implementation
#          is probably advisable at some point...
#
# Author: Aleksandra Jekic - 2021-07-01
# Copyright: Uninett AS 
# Changelog
#   2023-02-14: Integration with perSONAR initiated.
#   2021-08-02: Misc updates by OAK and OJW, ref git.

from pprint import pprint
import pdb

import argparse
import subprocess
import MySQLdb
import MySQLdb.cursors
#import psycopg2        # Postgresql
import statistics
import time, math
import json as json
import os, sys, random
import signal
import cProfile
import pytz
from tzlocal import get_localzone
from datetime import datetime
#import isodate
import threading
from difflib import SequenceMatcher
from collections import Counter
import math
import geoip2.database
import socket
#import pika
from urllib.parse import urlparse, parse_qsl
import urllib.request
from io import StringIO
import hashlib
from operator import itemgetter

#Tweaks for comparing final status of traceroute

f_reduction = 0.5 #From 0 to 1. If set to 0, alarm is reset every time a normal occurence is seen.
f_swapping = 30 #Amount of traceroutes a state has to have been in the lead to be declared the normal state
f_swapping_min = 5 #The minimum amount of traceroutes a state has to have been in the lead lately to be or keep being declared the normal state
f_majority = 30 #How many more traceroutes than second place a state has to have to be declared the normal state.
f_freshness = 0.12 #From 0 to 1. If set to 1, traceroutes used to determine normality are never outdated.
f_max_state_counter = 1000 # Maximum value for state counters (i.e. a kind of window size). Counters are all to be decreased if one reach this value.
#f_wsensitivity = 3 #Amount of traceroutes in an anomalous report before printing a warning.
#f_csensitivity = 2 #Amount of traceroutes in an anomalous report before printing a summary.
f_csensitivity = 0.9 #Amount of traceroutes in an anomalous report before printing a summary.

#Tweaks for comparing the length of traceroutes

l_swapping = 30 #Amount of times a hop length must be seen to be declared the normal length
l_majority = 30 #How many more traceroutes than second place a state has to have to be declared the normal state.
l_sensitivity = 5 #Determines how many abnormal lengths need to be seen to trigger a report.
l_reduction = 0.12 #How much to decrease the anomaly when a normal traceroute is seen.
l_freshness = 0.7 #How much to subtract the anomaly with time.
l_difference = 1 #Minimum difference in hop length that system is sensitive to.

#Tweaks for comparing RTT

rtt_threshold = 300 #Minimum amount of RTTs needed until we think there is a point in checking for outliers.
rtt_tukeyfactor = 3.5 #A factor of 1.5 makes it register slight anomalies, 3 makes it register only high anomalies.
rtt_minimum = 5 #Minimum unusual RTTs in a traceroute hop needed to increase the anomaly quotient on the given route.
rtt_freshness = 0.2 #How much we decrement the anomaly quotient each time to make sure the value is based on recent traceroutes.
rtt_reduction = 0.7 #How much we multiply the anomaly quotient when we see a normal state again.
rtt_sensitivity = 7 #The total anomaly quotient required to consider this feature as being in an anomalous state.

#Tweaks for comparing routes

r_freshness = 0.12 #From 0 to 1. If set to 1, count of route variance occurences are never outdated.
r_partialreq = 0.6 #Minimum ratio to consider a route variance partially matched.
r_partialmatch = 1 #If partialmatch is set to 1, then the exact matching ratio is added to the anomaly counter.
r_majority = 30 #How many more traceroutes than second place a state has to have to be declared the normal state.
r_swapping = 30 #Amount of traceroutes a route variance has to have been in the lead to be declared the normal state
r_comboaccel = 1.1 #The rate at which the points awarded for anomalous hops in a row grows.
r_minimum = 4 #Minimum anomaly count for all hops in a traceroute to consider whole traceroute anomalous.
r_reduction = 0.7 #From 0 to 1. If set to 0, alarm is reset every time a normal occurence is seen.

# Cross Entropy parameters
CE_DELTA_LIMIT = 3.0          # Level of change in ce-level for a hop to consider a route change to have happened.
HOPDIST_INIT_WINDOW = 2500    # Min no of probes seen for a hop to consider its host distribution to be representativ

# Set default paramenter values
param = {
    'file':'',                # Path to traceroutes source
    'date': '',               # Date to consider when searching for files to analyse
    'live': 0,                # Flag for live analysis
    'all': 0,                 # Flag to enable processing of older-than-latest traceroutes
    'tcp': 0,                 # Flag to enable processing tcptraceroute files
    'pssrc': '',              # Url to perfsonar data source, e.g. amqp://<user:passwd@localhost>/<vhost>/queue=<traceroute>
    'path': '/var/lib/microdep/mp-dragonlab/data',             # Path to apply when searching based on date               
    'reportpath': '/var/lib/microdep/mp-dragonlab/report/mp',  # Path to apply for output files when searching based on date               
    'reportpostpath': 'trace-ana',                             # Finale path level to add below reportpath,  source host and date               
    'output':'',                 # Output filename.
    'oneoutput':'',              # Output filename for single file output.
    'samepath': 0,                 # Flag to enable placement of outputfile in same folder as input file 
    'namemap': '/var/lib/microdep/mp-dragonlab/etc/mp-address.txt',    # File path to name-to-ip mapping db
    'geodb': '/usr/share/GeoIP/GeoLite2-ASN.mmdb',                     # File path to ip-to-ASN mapping db
    'dbtype': 'mysql',            # Database type. 'mysql' and 'postgresql' supported.
    'dbname': 'routingmonitor',   # Name of database for anomality parameters
    'dbuser': 'traceroute',       # User name for db access
    'dbpasswd': 'NeeLeoth9e',     # Password for db access
    'dbhost': 'localhost',        # Host name for db access
    'dbclear': 0,                # Clear db before running
    'help': False,                # Help text flag
    'verbose': 0,                 # Verbosity level for message output
    'profiler': 0,                # Output performance profile per file
    'maxprocs': 1,                # Max no of parallel processes in batch mode
    'topoevents': 0,              # Flag to enable detection and output of topology events
    'topointerval': 3600,         # Min no of seconds between topology events
    'pslookup': 'http://ps-west.es.net/lookup/activehosts.json',  # Source of perfSONAR Lookup Service hosts
    'pslookupwait': 3600,         # Min no of seconds to wait between refreshing info fetched from pslookup-service
    'ipv6': 0                     # Flag enabling ipv6 address parsing
}

# State constants
STATE_SUCCESS = 1
STATE_FAILED = 2
STATE_PARTIAL = 3
state_str = [ "dummy","success", "failed", "partialfail" ]


# Make sure SIGTERM also triggers exception handeling
def sigterm_handler(_signo, _stack_frame):
    # Raises SystemExit(0) on SIGTERM
    sys.exit(0)

signal.signal(signal.SIGTERM, sigterm_handler)
signal.signal(signal.SIGHUP, sigterm_handler)


class Tracesummary:
    """ Manage summary structure
    """

    def __init__(self):
        self.clear()

        
    def clear(self):
        # Clear summary structures

        self.summary = {}                       # Dictionary of summaries. One summary per host pair  
        self.summary_template = {
            't_first': 0,                       # Timestamp of first traceroute added to summary
            't_last': 0,                        # Timestamp of last traceroute added to summary
            'routes_analysed' : 0,              # No of traceroutes analysed
            'routes_reached': 0,                # No of routes that reach target destination
            'parse_errors': 0,                  # No of parsing attempts failed
            'min_length': 0,                    # Min length of successfull route
            'min_length_count' : 0,             # No of traceroutes of minimum length observed
            'max_length': 0,                    # Max length of successfull route
            'max_length_count' : 0,             # No of traceroutes of maximum length observed
            'probes_to_dst' : 0,                # No of probes reaching destination
            'probes_with_none_dst_last_hop': 0, # No of last hop probe packets with none destination ip
            'routes_failed' : 0,                # No of routes never reaching destination
            'probes_stopped_at_last_hop' : 0,    # No of probe packets not reaching destination
            'probes_with_errormsg': 0,          # No of routes returning error messages ("!*")
            'udp_routes': 0,                    # No of udp based traceroutes analysed 
            'tcp_routes': 0,                    # No of tcp based traceroutes analysed 
            'tcp_routes_to_open': 0,            # No of tcp based traceroutes reaching an open port
            'tcp_routes_to_closed': 0,          # No of tcp based traceroutes reaching a closed port
            'empty_routes': 0,                  # No of routes with no probes
            'unique_hosts': 0,                  # No of unique hosts/routers along paths observed
            'unique_hosts_per_hop': '',         # List of no of unique hosts per hop 
            'route_changes': 0,                 # No of significant route changes
            'max_hop_ce_delta': 0,              # Max change in anomaly level observed for singel hop
            'max_route_ce_delta': 0,            # Max change in anomaly level observed for route
            'max_ttl': 0,                       # Max measurable route lenght, i.e. -m value for traceroute
            'route_type': 'udp',                # Trace route type summarized  
            'ps_testid': '',                    # perfSONAR testid
            'none_dst_ip_at_max_ttl': 0,        # No of failed routes with a none destionation ip in last hop
            'unique_hosts_list': []              # List of host-ip-sets per hop
        }
        self.parse_errors = 0                  # Traceroute parse errors
        self.current_pair= ""
        self.last_topology_event=0             # Timestamp when last topology event was output
        
    def set_current_pair(self, src_dst, timestamp=0, thread=0):
        # Set current relevant src dst pair
        self.current_pair= src_dst
        self.enable_pair(self.current_pair)
        first_appearance = (self.summary[self.current_pair]['t_first'] == 0)
        
        if timestamp < self.summary[self.current_pair]['t_first'] or first_appearance:
            # Newest traceroute so far
            self.summary[self.current_pair]['t_first'] = timestamp
        if timestamp >= self.summary[self.current_pair]['t_last']:
            # Oldest traceroute so far
            self.summary[self.current_pair]['t_last'] = timestamp
        if timestamp == 0 and first_appearance:
            # Timestamp missing.
            # Apply current time.
            self.summary[self.current_pair]['t_first'] = time.time()
            self.summary[self.current_pair]['t_last'] = time.time()
            
        if param["topoevents"] and first_appearance:
            # Output topology event
            p_list = [
                self.current_pair,
                self.summary[self.current_pair]["t_first"],
                self.summary[self.current_pair]["t_last"]
            ]
            # Output topology event for src dest pair
            printAlert( thread, self.summary[self.current_pair]['route_type'], p_list, self.summary[self.current_pair]["t_last"], "topology")
            self.last_topology_event = time.time()

        if param["topoevents"] and time.time() - self.last_topology_event > float(param['topointerval']):
            # Output complete topology
            self.print_topology()
            self.last_topology_event = time.time()
                
        
    def enable_pair(self, src_dst):
        # Make sure src-dst pair exists in summary table
        if not src_dst in self.summary.keys():
            self.summary[src_dst] = self.summary_template.copy()
        
    def count(self, counter):
        if not self.current_pair:
            return
        # Increase a counter
        self.summary[self.current_pair][counter] += 1

    def parse_error(self):
        if not self.current_pair:
            # Increase general parse error counter
            self.parse_errors += 1
        else:
            # Increase parse error counter for pair/flow
            self.count("parse_errors")
            

    def count_unique_hosts(self, hop, hosts):
        if not self.current_pair:
            return
        # Update list of unique hosts/routers per hop
        if len(self.summary[self.current_pair]['unique_hosts_list']) < hop+1:
            #Expand list to match hop count
            self.summary[self.current_pair]['unique_hosts_list'] += [set()] * (hop + 1 - len(self.summary[self.current_pair]['unique_hosts_list']))
        # Add new hosts for hop to host-set
        self.summary[self.current_pair]['unique_hosts_list'][hop] =  self.summary[self.current_pair]['unique_hosts_list'][hop].union(set(hosts))
        # Update summary variables
        self.summary[self.current_pair]['unique_hosts_per_hop'] = self.get_unique_hosts()
        all_hosts = set.union(*self.summary[self.current_pair]['unique_hosts_list']) # The union of all per-hop host sets
        if "*" in all_hosts:
            all_hosts.remove("*")    # Clean out none-response "host"
        self.summary[self.current_pair]['unique_hosts'] = len(all_hosts) 
        
            
    def set_length(self, length):
        if not self.current_pair:
            return
        # Update max and min length if relevant
        if self.summary[self.current_pair]['max_length'] <= length:
            self.summary[self.current_pair]['max_length'] = length
            self.summary[self.current_pair]['max_length_count'] += 1
        if self.summary[self.current_pair]['min_length'] == 0 or self.summary[self.current_pair]['min_length'] >= length:
            self.summary[self.current_pair]['min_length'] = length
            self.summary[self.current_pair]['min_length_count'] += 1

    def set_routetype(self, routetype):
        if not self.current_pair:
            return
        # Update traceroute type
        self.summary[self.current_pair]['route_type'] = routetype

    def set_pstestid(self, ps_testid):
        # Update ps_testid (which enable directe access to test results via esmond API)
        self.summary[self.current_pair]['ps_testid'] = ps_testid

    def get_max_length(self):
        if not self.current_pair:
            return 0
        return self.summary[self.current_pair]['max_length']

    def get_unique_hosts(self):
        if not self.current_pair:
            return ""
        # Return string listing no of unique hosts seen per hop
        return_str =""
        for hop in self.summary[self.current_pair]['unique_hosts_list']:
            if "*" in hop:
                return_str += str(len(hop)-1) + " "
            else:
                return_str += str(len(hop)) + " "
        return return_str

    def set_max(self, key, value):
        if not self.current_pair:
            return
        # Update max variable
        if value > self.summary[self.current_pair][key]:
            self.summary[self.current_pair][key] = value
    
    def get_all(self):
        if not self.current_pair:
            return {}
        # Return summary dictionary       
        ret_dict =  self.summary[self.current_pair].copy()
        # Remove lists of hosts since this causes trouble when serializing dictionary
        ret_dict.pop("unique_hosts_list")
        return ret_dict

    
    def print_all_pairs(self, thread=0):
        # Output summary for all src-dst pairs
        backup_current_pair = self.current_pair
        for pair in self.summary.keys():
            p_list = [
                pair,
                self.summary[pair]["t_first"],
                self.summary[pair]["t_last"]
            ]
            # Output summary for src dest pair
            self.set_current_pair(pair, self.summary[pair]["t_last"])
            printAlert( thread, self.summary[pair]['route_type'], p_list, self.summary[pair]["t_last"], "summary")
        # Restore current pair    
        self.current_pair = backup_current_pair

    def print_topology(self, thread=0):
        # Output topology discovery event for all src-dst pairs
        for pair in self.summary.keys():
            p_list = [
                pair,
                self.summary[pair]["t_first"],
                self.summary[pair]["t_last"]
            ]
            # Output topology event for src dest pair
            printAlert( thread, self.summary[pair]['route_type'], p_list, self.summary[pair]["t_last"], "topology")
        
tracesummary = Tracesummary()  # Summary info for collection of traceroute runs

asn_lookup = None              # For mapping IPs to ASNs

# Parse commandline arguments

def parse_cmd(param):
    """ Parse commandline argumets
    """

    # Parse arguments from commandline
    cmdparser = argparse.ArgumentParser(description="Analyses traceroute output and reports detected anomalities.")
    # Configure parser
    cmdparser.add_argument('file',  nargs="*", default=param['file'], help='Path to traceroute file')
    cmdparser.add_argument('--date', '-d', default=param['date'], help='ISO-date for traceroute file search')
    cmdparser.add_argument('--live', '-l', action='count', default=param['live'], help='Run live analysis on todays date')
    cmdparser.add_argument('--all', '-a', action='count', default=param['all'], help='Process all traceoutes, also older than last processed (according to db)')
    cmdparser.add_argument('--tcp', '-T', action='count', default=param['tcp'], help='Look for tcptraceroute files.')
    cmdparser.add_argument('--pssrc', default=param['pssrc'], help='URL to perfsonar data source.')
    cmdparser.add_argument('--path', '-p', default=param['path'], help='Base path to apply when searching based on date')
    cmdparser.add_argument('--reportpath', '-r', default=param['reportpath'], help='Base path to apply when storing output for date based input.')
    cmdparser.add_argument('--reportpostpath', '-R', default=param['reportpostpath'], help='Finale path level to add below reportpath, source host and date.')
    cmdparser.add_argument('--output', '-o', default=param['output'], help='Filename for output. Default is timestamp+"R"+hash')
    cmdparser.add_argument('--oneoutput', '-O', default=param['oneoutput'], help='All output to single file.')
    cmdparser.add_argument('--samepath', '-s', action='count', default=param['samepath'], help='Place output file in same path as input file')
    cmdparser.add_argument('--namemap', '-n', default=param['namemap'], help='Name and path for name-to-ip mapping-file.')
    cmdparser.add_argument('--geodb', '-g', default=param['geodb'], help='Name and path for ip-to-asn mapping-database (MaxMind).')
    cmdparser.add_argument('--dbtype', default=param['dbtype'], help='Database type. \'mysql\' and \'postgresql\' supported.')
    cmdparser.add_argument('--dbname', default=param['dbname'], help='Name of anomality parameter DB')
    cmdparser.add_argument('--dbuser', default=param['dbuser'], help='User name for db access')
    cmdparser.add_argument('--dbpasswd', default=param['dbpasswd'], help='Password for db access')
    cmdparser.add_argument('--dbhost', default=param['dbhost'], help='Host name for db access')
    cmdparser.add_argument('--dbclear', '-c', action='count', default=param['dbclear'], help='Clear database before running.')
    cmdparser.add_argument('--verbose', '-v', action='count', default=param['verbose'], help='Verbose output to stderr. Apply multiple to increase level.')
    cmdparser.add_argument('--profiler', '-P', action='count', default=param['profiler'], help='Run performance profiling per file.')
    cmdparser.add_argument('--maxprocs', '-m', default=param['maxprocs'], help='Max no of processes in batch mode.')
    cmdparser.add_argument('--topoevents', '-t', action='count', default=param['topoevents'], help='Detect and output events when topology changes are detected.')
    cmdparser.add_argument('--topointerval', default=param['topointerval'], help='Min no of seconds between topology events.')
    cmdparser.add_argument('--pslookup', default=param['pslookup'], help='Source of perfSONAR Lookup Service hosts.')
    cmdparser.add_argument('--pslookupwait', default=param['pslookupwait'], help='Min interval between attempts to fetch info from ps-lookup service.')
    cmdparser.add_argument('--ipv6', '-6', action='count', default=param['ipv6'], help='Enable parsing of ipv6 addresses.')

    # Run parser
    args = cmdparser.parse_args()
    # Extract parameters
    for p in args.__dict__:
        if (p in param):
            # Update parameter
            param[p] = args.__dict__[p]

    if param['live'] > 0 or len(param['file']) > 0 or param['date'] or param['pssrc']:
        # Minimim params given, continue
        return param
    else:
        print('Error: Missing commandline option. --file, --date, --live or --pssrc required.')
        cmdparser.print_help()
        sys.exit()

def connect_db(param):
    """ Connect to anomality parameter DB
    """

    if param["dbtype"] == "mysql":
        connection = MySQLdb.connect(
            host=param['dbhost'],
            user=param['dbuser'],
            passwd=param['dbpasswd'],
            db=param['dbname'],
        )
        list_cursor = connection.cursor()
        # Adjust some timeout values
        list_cursor.execute('SET GLOBAL connect_timeout=28800')
        list_cursor.execute('SET GLOBAL interactive_timeout=86400')
        list_cursor.execute('SET GLOBAL wait_timeout=86400')
    elif param["dbtype"] == "postgresql":
        connection = psycopg2.connect(
            host=param['dbhost'],
            user=param['dbuser'],
            password=param['dbpasswd'],
            dbname=param['dbname']
            )
        list_cursor = connection.cursor()
    else:
        print ("Error: Unknown database type '" + param["dbtype"] +"'.")
        sys.exit()
    return list_cursor

def fetch_one_dict(cursor):
    """ Fetch single MySql result into dictionary
    """
    data = cursor.fetchone()
    if data == None:
        return None
    desc = cursor.description

    dict = {}

    for (name, value) in zip(desc, data):
        dict[name[0]] = value

    return dict

def print_psycopg2_exception(err):
    """ handles and parses psycopg2 exceptions
    """
    # get details about the exception
    err_type, err_obj, traceback = sys.exc_info()

    # get the line number when exception occured
    line_num = traceback.tb_lineno

    # print the connect() error
    print ("\npsycopg2 ERROR:", err, "on line number:", line_num)
    print ("psycopg2 traceback:", traceback, "-- type:", err_type)

    # psycopg2 extensions.Diagnostics object attribute
    print ("\nextensions.Diagnostics:", err.diag)

    # print the pgcode and pgerror exceptions
    print ("pgerror:", err.pgerror)
    print ("pgcode:", err.pgcode, "\n")


def prepare_db(cursor, param):
    """ Prepare tables in database if not already set up
    """
    if param['dbclear'] > 0:
        # Drop all tables before recreating
        try:
            if param['dbtype'] == 'postgresql':
                cursor.execute("DROP TABLE IF EXISTS routes")
                cursor.execute("DROP TABLE IF EXISTS jumps")
                cursor.execute("DROP TABLE IF EXISTS length")
                cursor.execute("DROP TABLE IF EXISTS rtt")
            else:
                cursor.execute("DROP TABLE routes")
                cursor.execute("DROP TABLE jumps")
                cursor.execute("DROP TABLE length")
                cursor.execute("DROP TABLE rtt")
        except:
            pass

    try:
        if param['dbtype'] == 'postgresql':
            cursor.execute("CREATE TABLE routes (unique_pair VARCHAR(200), success INTEGER, failed INTEGER, partialfail INTEGER, anomaly TEXT, normal INTEGER, count TEXT, report TEXT, bookmark INTEGER)")
        else:
            cursor.execute("CREATE TABLE routes (unique_pair VARCHAR(200), success INT, failed INT, partialfail INT, anomaly MEDIUMTEXT, normal INT, count MEDIUMTEXT, report LONGTEXT, bookmark INT)")
        cursor.execute("CREATE UNIQUE INDEX idx_key1 ON routes (unique_pair)")
        cursor.execute(('COMMIT'));
    except Exception as err:
        if param['verbose'] > 1: 
            print("Warning: Failed to create table 'routes'")
            if param['dbtype'] == 'postgresql':
                print_psycopg2_exception(err)
                # exit()
            pass


    # Alter legacy tables to conform with current table format
    try:
        if param['dbtype'] == 'postgresql':
            pass
        else:
            cursor.execute("ALTER TABLE routes MODIFY report LONGTEXT")
        cursor.execute(('COMMIT'));
    except Exception as err:
        pass

    try:
        if param['dbtype'] == 'postgresql':
            cursor.execute("CREATE TABLE jumps (unique_pair VARCHAR(200), hop INTEGER, destinations TEXT, frequencies TEXT, count INTEGER, normal TEXT, memory TEXT, anomaly TEXT, trcrt INTEGER, betweens INTEGER, cross_entropy REAL, timestamp INTEGER)")
        else:
            cursor.execute("CREATE TABLE jumps (unique_pair VARCHAR(200), hop INT, destinations MEDIUMTEXT, frequencies MEDIUMTEXT, count INT, normal MEDIUMTEXT, memory MEDIUMTEXT, anomaly TEXT, trcrt INT, betweens INT, cross_entropy FLOAT(10), timestamp INT)")
        cursor.execute("CREATE UNIQUE INDEX idx_key2 ON jumps (unique_pair, hop)")
        cursor.execute(('COMMIT'));
    except:
        if param['verbose'] > 1: 
            print("Warning: Failed to create table 'jumps'")
            if param['dbtype'] == 'postgresql':
                print_psycopg2_exception(err)
                # exit()
                pass
"""
    try:
        cursor.execute("CREATE TABLE length (unique_pair VARCHAR(200), lengths MEDIUMTEXT, frequencies MEDIUMTEXT, anomalies MEDIUMTEXT, normal INT, count MEDIUMTEXT, anomaly MEDIUMTEXT)")
        cursor.execute("CREATE UNIQUE INDEX idx_key4 ON length (unique_pair)")
    except:
        print("Warning: Failed to create table 'lenght'")
        pass

    try:
        cursor.execute("CREATE TABLE rtt (unique_pair VARCHAR(200), hop INT, timestamps MEDIUMTEXT, anomaly MEDIUMTEXT)")
        cursor.execute("CREATE UNIQUE INDEX idx_key3 ON rtt (unique_pair, hop)")
    except:
        print("Warning: Failed to create table 'rtt'")
        pass
"""
def close_db(cursor):
    """ Close db
    """
    cursor.close()

class Resolver:
    """ Translate between ip address and node names
    """
    def __init__(self, mapfile):
        """Read resolver db file
           Format per line assumed is "<node-name> <ip>"
        """
        
        if param["verbose"] > 2:
            print("Initiating resolver cache...")
            
        # Resolver DBs
        self.ip = {}
        self.name = {}

        # Geopos info
        self.geopos = {}
        self.pslookuphost = {}
        
        try:
            file = open(mapfile, "r")
            
            psconfig_data={}
            try:
                # Attempt to load file as if if has PSconfig JSON structure
                psconfig_data = json.load(file);
                if 'addresses' in psconfig_data:
                    # Addresses found. Init map.
                    for name in psconfig_data['addresses']:
                        ip = self.validate_ip(psconfig_data['addresses'][name]['address']);
                        # Add mappings 
                        self.ip[name] = ip
                        self.name[ip] = name
            except:
                pass

            if not 'addresses' in psconfig_data:
                # Reread file assuming host-file like format ("<name> <ip>")
                file.seek(0)
                Lines = file.readlines()
                for line in Lines:
                    (name,ip) = line.split()
                    ip = self.validate_ip(ip);
                    # Add mappings 
                    self.ip[name] = ip
                    self.name[ip] = name

                    if param["verbose"] > 1:
                        if len(ip) == 0 or len(name) == 0:
                            print("Warning: No entries found in resolution file " + mapfile)
        except:
            print("Warning: Could not open resolution file " + mapfile)
                            
        if param["verbose"] > 3:
            print("Initial resolver cache:")
            pprint(self.ip)
            pprint(self.name)

    def validate_ip(self, ip):
        """ Check if ip address is valid. If not, attempt to resolve it.
        """
        try:
            # Check if the ip is valid
            socket.inet_aton(ip)
        except socket.error:
            # Invalid ip. Maybe a domain name? Attempt lookup.
            try:
                maybe_name = ip
                ip = socket.gethostbyname(maybe_name)   #NOTE: Needs to be replaced by socket.getaddrinfo() to support ipv6
            except socket.error:
                # Give up and leave foney ip as is
                if param['verbose'] > 2:
                    print("Warning: Invalid ip address '%s' applied." % (ip))
                pass
            
        self.refresh_geopos(ip)

        return ip

    def refresh_geopos(self, ip):
        """ Attempt to fetch geopos-info from perfsonar's lookupservice.
            Lookup frequency is trottled.
        """
        if ip not in self.geopos.keys():
            # Init dict entry compatible with Geolite2 (Maxmine)
            self.geopos[ip] = {
                'latitude': 0.0,
                'longitude': 0.0,
                'location': { 'lat': 0.0, 'lon': 0.0 },
                'city_name': 'Unknown',
                'postal_code': 'Unknown',
                'region_name': 'Unknown',
                'country_code2': 'Unknown',
                'country_code3': 'Unknown',
		'geo_src': 'pslookup',
                'ip': "",
                'refresh': time.time() - 1 
                }
            
        if param['pslookup'] and self.geopos[ip]['refresh'] < time.time():
            # Attempt to fetch geopos info from perfSONAR's Lookup Service
            if not self.pslookuphost:
                try:
                    # Fetch list of lookup service hosts
                    pslookuphost_str = urllib.request.urlopen(param['pslookup']).read()
                    self.pslookuphost = json.loads(pslookuphost_str)
                except urllib.error.URLError:
                    pass

            for pshost in self.pslookuphost['hosts']:
                try:
                    # Lookup host name (via pslookup api at port 8090)
                    pslookup_str = urllib.request.urlopen(pshost['locator'] + "/?host-name=" + ip).read()
                    if param['verbose'] > 3:
                        print("pslookup-data:")
                        print(pslookup_str)
                    pslookup = json.loads(pslookup_str)
                    if pslookup:
                        # Position available. Store applying Geolite2 (Maxmine) tags / keys
                        self.store_geopos(ip, pslookup[0])
                        break
                    else:
                        # Search for host name among interface addresses (applying opensearch api at port 80)
                        opensearch_api = pshost['locator'].replace(":8090","").replace("records","_search")
                        iso_now = datetime.fromtimestamp(time.time(), pytz.timezone(str(get_localzone()))).isoformat()    # ISO formatted current time with timezone
                        query_data = { 'query': { 'bool': { 'filter': [ { 'term': { 'interface-addresses': ip } }, { 'range': { 'expires' : { 'gt' : iso_now  } } } ] } }, 'size': 1 }
                        query_req = urllib.request.Request(opensearch_api, data=bytes(json.dumps(query_data), encoding='utf-8') )
                        query_req.add_header('Content-Type', 'application/json')
                        pslookup_str = urllib.request.urlopen(query_req).read()
                        if param['verbose'] > 3:
                            print("pslookup-data:")
                            print(pslookup_str)
                        pslookup = json.loads(pslookup_str)
                        if pslookup and pslookup['hits'] and pslookup['hits']['total']['value'] > 0 and pslookup['hits']['hits'][0]['_source']['uri']:
                            # Apply uri to find parent host for interface
                            query_data = { 'query': { 'bool': { 'filter': [ { 'term': { 'host-net-interfaces': pslookup['hits']['hits'][0]['_source']['uri'] } } ] } }, 'size': 1 }
                            query_req = urllib.request.Request(opensearch_api, data=bytes(json.dumps(query_data), encoding='utf-8') )
                            query_req.add_header('Content-Type', 'application/json')
                            pslookup_str = urllib.request.urlopen(query_req).read()
                            if param['verbose'] > 3:
                                print("pslookup-data:")
                                print(pslookup_str)
                            pslookup = json.loads(pslookup_str)
                            if pslookup and pslookup['hits'] and pslookup['hits']['total']['value'] > 0:
                                # Parent host found. Store position if available
                                self.store_geopos(ip, pslookup['hits']['hits'][0]['_source'])
                                break

                except urllib.error.URLError:
                    pass

            # Set refresh interval for geopos info.
            self.geopos[ip]['refresh'] = time.time() + float(param['pslookupwait'])

    def store_geopos(self, ip, posdata):
        """ Store geopos data from pslookup structure
        """
        # Store applying Geolite2 (Maxmine) tags / keys
        if 'location-latitude' in posdata: self.geopos[ip]['latitude'] = float(posdata['location-latitude'][0]) 
        if 'location-longitude' in posdata: self.geopos[ip]['longitude'] = float(posdata['location-longitude'][0])
        self.geopos[ip]['location'] = { 'lat': self.geopos[ip]['latitude'], 'lon': self.geopos[ip]['longitude'] }
        if 'location-city' in posdata: self.geopos[ip]['city_name'] = posdata['location-city'][0]
        if 'location-code' in posdata: self.geopos[ip]['postal_code'] = posdata['location-code'][0]
        if 'location-state' in posdata: self.geopos[ip]['region_name'] = posdata['location-state'][0]
        if 'location-country' in posdata: self.geopos[ip]['country_code2'] = posdata['location-country'][0]
        self.geopos[ip]['country_code3'] = self.geopos[ip]['country_code2']
        self.geopos[ip]['ip'] = ip 
        if param['verbose'] > 3:
            print("Added geopos:")
            pprint(self.geopos[ip])
            
            
    def get_geopos(self, ip):
        """ Return dictionary with geopos-info 
        """
        if ip in self.geopos and self.geopos[ip]["ip"]:
            return self.geopos[ip]
        else:
            # No gepos available
            return {}
            
    def get_name(self, ip, validate=True):
        """ Translates from ip to name
        """
        if ip in self.name.keys():
            return self.name[ip]
        else:
            if validate:
                ip = self.validate_ip(ip)
            try:
                name, alias, addresslist = socket.gethostbyaddr(ip)
                # Add mapping
                self.name[ip] = name
                return name
            except:
                if param["verbose"] > 2:
                    print("Warning: Cannot resolve ip " + ip + ". Returning " + ip + " as name.")
                # Add "emergency" mapping
#                self.name[ip] = ip
                return ip

    def get_ip(self, name):
        """ Translates from name to ip
        """
        if name in self.ip.keys():
            return self.ip[name]
        else:
            try:
                ip = socket.gethostbyname(name)   #NOTE: Needs to be replaced by socket.getaddrinfo() to support ipv6
                # Add mapping
                self.ip[name] = ip
                return ip
            except:
                if param["verbose"] > 2:
                    print("Warning: Cannot resolve name " + name + ". Returning " + name + " as ip.")
                # Add "emergency" mapping
#                self.ip[name] = name
                return name
            
    def add(self, name, ip=''):
        """ Add name-ip entry
        """
        if not ip:
            if name in self.ip.keys():
                ip = self.ip[name]
            else:
                # Missing ip for name. Attempt lookup.
                try:
                    # lookup name
                    ip = socket.gethostbyname(name)
                except:
                    # Maybe name is really an ip...
                    if not name in self.name.keys():
                        try:
                            # try reverse lookup
                            maybe_ip = name
                            name, alias, addresslist = socket.gethostbyaddr(maybe_ip)
                            ip = maybe_ip
                        except:
                            pass
        if ip:
            # Add mapping
            self.ip[name] = ip
            self.name[ip] = name
        else:
            if param["verbose"] > 2:
                print("Warning: Cannot resolve name " + name + ". No mapping added.")
        
def classifyOutage(errors):
    """ Finds the most common error if a traceroute returns multiple errors
    """
    
    cause = "Unknown"
    arr = {}

    #Counts each error type

    for y in errors:
        if str(y) in arr:
            arr[str(y)] += 1
        else:
            arr[str(y)] = 1

    #Makes sure there are not more than
    #one "most common" error message

    if len(arr) == 1:
        key = next(iter(arr))
    else:
        key = max(arr, key=arr.get)
        count = 0
        for x in y:
            if x == arr[key]:
                count += 1
        if count > 1:
            return "Various causes"

    #Returns the correct description

    if key == "!H":
        cause = "Host unreachable"
    elif key == "!N":
        cause = "Network unreachable"
    elif key == "!P":
        cause = "Protocol unreachable"
    elif key == "!S":
        cause = "Source Route Failed"
    elif key == "!F":
        cause = "Fragmentation needed"
    elif key == "!X":
        cause = "Administratively prohibited"
    elif key == "!V":
        cause = "Host Precedence Violation"
    elif key == "!C":
        cause = "Precedence Cutoff in Effect"
    elif key == "!6":
        return "IPv6: Route to destination rejected"
    elif key == "!10":
        return "IPv4: Administratively prohibited"
    elif key == "!5":
        return "IPv6: Source address not allowed"
    elif key == "!9":
        return "IPv4: Destination network administratively prohibited"
    else:
        cause = key

    return cause

    
#Writes out the JSON report

def createJSON(alert):

    # Prepare filename

    # Generate default unique filename
    filename = alert["timestamp"] + "R" + str(random.randint(100, 999)) + str(random.randint(100, 999))

    if param['output']:
        # Prepare postfix
        postfix = str(alert["thread"])
        if "to_adr" in alert:
            postfix = postfix + "-" + alert["to_adr"]
        elif param["verbose"] > 2:
            print ("Warning: No destination in alert structure.")
            
        if param['output'].find(".") != -1:
            # Add postfix before dot
            filename = param['output'].replace(".",  "-" + postfix + ".")
        else:
            # Add postfix at end
            filename = param['output'] + "-" + str(alert["thread"])
    elif param['oneoutput']:
        # Output all to single (given) file
        filename = param['oneoutput']

    # Add path to filename      

    if filename.find("/") != -1 and param["verbose"] > 2:
        print ("Warning: Output filename contains path. Adjust '-r' and 's' to avoid additional output path to be added.")
    
    if param['samepath'] > 0:
        # Place outputfile in same folder as inputfile
        path = input_dir[alert["thread"]] + "/" + filename
    else:
        # Place outputfile in report folder
        os.makedirs(report_dir[alert["thread"]], exist_ok=True)  # Create folders if required
        path = report_dir[alert["thread"]] + "/" + filename
    
    with open(path, "a") as outfile:
        if param['verbose'] > 2:
            print(json.dumps(alert) + "\n")
        outfile.write(json.dumps(alert) + "\n")
        outfile.close()
        

#Translates from encoding of end states

def translateState(code):

    if code == STATE_SUCCESS:
        return "Success"
    elif code == STATE_FAILED:
        return "Failed"
    elif code == STATE_PARTIAL:
        return "Partially failed"

#Writes out the length anomaly alerts

def printLengthAlert(unique_pair, normal, cursor, anomaly, time):

    cursor.execute(("SELECT * FROM routes WHERE unique_pair =%s"), (unique_pair,))
    n = cursor.fetchall()

    alert = {

        "pair_id": n[0][0].replace("/", "_to_"),
        "src": resolver.get_name(n[0][0].split("/")[0]),
        "dst": resolver.get_name(n[0][0].split("/")[1]),
        "timestamp": str(time),
        "anomaly_type": "length change",
        "normal_length": normal,
        "abnormal_lengths": list(set(anomaly)),
        "duration": str(len(anomaly)) + " traceroutes"

    }
    
    createJSON(alert)

#Writes out the RTT alerts

def printRTTalert(unique_pair, cursor, average, abnormal, time):

    cursor.execute(("SELECT * FROM routes WHERE unique_pair =%s"), (unique_pair,))
    n = cursor.fetchall()

    alert = {

        "pair_id": n[0][0].replace("/", "_to_"),
        "src": resolver.get_name(n[0][0].split("/")[0]),
        "dst": resolver.get_name(n[0][0].split("/")[1]),
        "timestamp": str(time),
        "anomaly_type": "atypical RTT",
        "expected_RTT_avg_per_hop": average,
        "abnormal_RTT_avg_per_hop": abnormal

    }

    createJSON(alert)

#Finds differences between two routes
#No longer in use I believe

def compareRoutes(normalRoute, abnormalRoute):
    
    dict = {}

    for x in normalRoute:
        if normalRoute[x] != abnormalRoute[x]:
            dict[x] = abnormalRoute[x]
    
    return dict

#Prints route change alerts

def printRouteAlert(threadid, tr_type, unique_pair, normalRoute, n, abnormalroute, time, mode, anomaly_count=0, normals_betweens=0, ce_delta=[]):

    global tracesummary
    
    tz_utc = pytz.timezone('GMT')
    tz_local = pytz.timezone(str(get_localzone()))

    if tr_type == "udp":
        # UDP is considered default, i.e. no prefix applied
        tr_type = ""

    # "Polish" ce delta list and summaries ce data
    ce_delta_rounded=[]
    ce_delta_max=0
    ce_delta_total=0
    no_hops_over_ce_limit=0
    asn_of_hops_before_over_ce_limit=set()   # A set of ASN number for routechange responsible routers
    as_of_hops_before_over_ce_limit=set()   # A set of AS names for routechange responsible routers
    ip_of_hops_before_over_ce_limit=set()   # A set of ip addresses for routechange responsible routers
    name_of_hops_before_over_ce_limit=set()   # A set of host names for routechange responsible routers
    hop_no = 0
    for ce in ce_delta:
        if ce == -0.0:
            ce_delta_rounded.append(0.0)
        else:
            ce_delta_rounded.append(round(ce,3))
        ce_delta_total += ce
        if ce > ce_delta_max:
            ce_delta_max = ce
        if ce > CE_DELTA_LIMIT:
            no_hops_over_ce_limit += 1
            if hop_no > 0 and ce_delta[hop_no - 1] < CE_DELTA_LIMIT:
                # Add ASN number of router one hop before anomality, i.e. the router responsible for routechange
                normalRoute_obj = json.loads(normalRoute)
                if isinstance(normalRoute_obj[hop_no - 1], list):
                    for ip in normalRoute_obj[hop_no - 1]:
                        ip_of_hops_before_over_ce_limit.add(ip)
                        #try:
                        #    name, alias, addresslist = socket.gethostbyaddr(ip)
                        #    name_of_hops_before_over_ce_limit.add(name)
                        #except:
                        #    name_of_hops_before_over_ce_limit.add("unknown")
                        name_of_hops_before_over_ce_limit.add(resolver.get_name(ip))
                        try:
                            lookup_res = asn_lookup.asn(ip)
                            asn_of_hops_before_over_ce_limit.add(str(lookup_res.autonomous_system_number))
                            as_of_hops_before_over_ce_limit.add(lookup_res.autonomous_system_organization)
                        except:
                            # No AS info found
                            asn_of_hops_before_over_ce_limit.add('0')
                            as_of_hops_before_over_ce_limit.add('unknown')
                            
                else:
                    ip_of_hops_before_over_ce_limit.add(normalRoute_obj[hop_no-1])
                    #try:
                    #    name, alias, addresslist = socket.gethostbyaddr(normalRoute_obj[hop_no-1])
                    #    name_of_hops_before_over_ce_limit.add(name)
                    #except:
                    #    name_of_hops_before_over_ce_limit.add("unknown")
                    name_of_hops_before_over_ce_limit.add(resolver.get_name(normalRoute_obj[hop_no-1]))
                    try:
                        lookup_res = asn_lookup.asn(normalRoute_obj[hop_no-1])
                        asn_of_hops_before_over_ce_limit.add(str(lookup_res.autonomous_system_number))
                        as_of_hops_before_over_ce_limit.add(lookup_res.autonomous_system_organization)
                    except:
                        asn_of_hops_before_over_ce_limit.add('0')
                        as_of_hops_before_over_ce_limit.add('Unknown')
        hop_no += 1
            
    alert = {
        "pair_id": n[0].replace("/", "_to_"),
        "from_adr": resolver.get_ip(n[0].split("/")[0]),
        "to_adr": resolver.get_ip(n[0].split("/")[1]),
        "from": resolver.get_name(n[0].split("/")[0]),
        "to": resolver.get_name(n[0].split("/")[1]),
        "@date": datetime.fromtimestamp(time, tz_utc).isoformat(),
        "datetime": datetime.fromtimestamp(time, tz_local).isoformat(),
        "timestamp": str(time),
        "timestamp_ms": str(time * 1000),
        "timestamp_zone": 'GMT',
        "anomaly_class": "new route",
        "thread": threadid,              # Id of running thread
        "event_type": tr_type + "routechange",
        "new_normal": normalRoute,
        "prev_normal": abnormalroute,
        "anomaly_count": anomaly_count,
        "normals_between": normals_betweens,
        "ce_delta_max": round(ce_delta_max,3),
        "ce_delta_total": round(ce_delta_total,3),
        "no_hops_over_ce_limit": no_hops_over_ce_limit,
        "routechange_asn": ", ".join(asn_of_hops_before_over_ce_limit),
        "routechange_as": ", ".join(as_of_hops_before_over_ce_limit),
        "routechange_ip": ", ".join(ip_of_hops_before_over_ce_limit),
        "routechange_name": ", ".join(name_of_hops_before_over_ce_limit),
        "ce_delta": json.dumps(ce_delta_rounded)
    }

    if anomaly_count == 0 :
        # Attempt to indicate count of anomalities
        alert["anomaly_count"] = no_hops_over_ce_limit
    
    if mode == "warning":
        alert["event_type"]= tr_type + "routewarn"

    if mode == "known_route":
        alert["anomaly_class"]="known route"

    alert.update(tracesummary.get_all())  # Add all summary variables to alert dictionary

    createJSON(alert)


#Checks if a series of traceroutes are mostly "stopped route"

def majority(states):

    amounts = Counter(states)

    total = 0
    for x in amounts:
        total += amounts[x]

    if amounts["Failed"]/total > 0.6:
        return True
    elif amounts[2]/total > 0.6:
        return True
    else:
        return False

#Counts the amounts of each state seen and returns a list with the sums

def count(obs):

    tmp = obs[0]
    count = 0
#    counter = []
    counter = {}

    for x in range(len(obs)):
        if tmp == obs[x]:
            count += 1
        else:
            #counter.append(str(tmp) + ": " + str(count))
            counter[str(tmp)] = count
            tmp = obs[x]
            count = 1
    
    #counter.append(str(tmp) + ": " + str(count))
    counter[str(tmp)] = count

    return counter

#Prints the end state alerts

def printAlert(threadid, tr_type, n, time, mode, normal=None, new=None):

    global tracesummary
    
    #Basic alert information

    if tr_type == "udp":
        # UDP is considered default, i.e. no prefix applied
        tr_type = ""
    
    tz_utc = pytz.timezone('GMT')
    tz_local = pytz.timezone(str(get_localzone()))
    
    alert = {
        "pair_id": n[0].replace("/", "_to_"),
        "from_adr": resolver.get_ip(n[0].split("/")[0]),
        "to_adr": resolver.get_ip(n[0].split("/")[1]),
        "from": resolver.get_name(n[0].split("/")[0]),
        "to": resolver.get_name(n[0].split("/")[1]),
       # "@timestamp": datetime.fromtimestamp(time, tz_utc).isoformat(),
        "@date": datetime.fromtimestamp(time, tz_utc).isoformat(),
        "datetime": datetime.fromtimestamp(time, tz_local).isoformat(),
        "timestamp": str(time),
        "timestamp_ms": str(time * 1000),
        "timestamp_zone": 'GMT',
        "anomaly_class": "end state",
        "thread": threadid              # Id of running thread
    }

    if mode == "changed":

        #alert["anomaly_state"] = "new normal"
        alert["event_type"] = tr_type + "routenorm"
        alert["original_normal"] = translateState(normal)
        alert["new_normal"] = translateState(new)

        createJSON(alert)
        return
 
    if mode == "summary":

        #alert["anomaly_state"] = "summary"
        alert["event_type"] = tr_type + "routesum"
        alert["start_time"] = n[1]
        alert["duration"] = int(n[2]) - int(n[1])

        alert.update(tracesummary.get_all())  # Add all summary variables to alert dictionary

        createJSON(alert)
        return
        
    if mode == "topology":
        # Output topology-discovery event
        
        #alert["anomaly_state"] = "topology"
        alert["event_type"] = "topology"
        alert["test_type"] = tr_type + "trace"
        alert["start_time"] = n[1]
        alert["duration"] = int(n[2]) - int(n[1])

        # Add geopos-info if available
        for pfx in [ "from", "to"]:
            geopos = resolver.get_geopos(alert[pfx + "_adr"])
            if geopos:
                alert[pfx + "_geo"]=geopos
            
        createJSON(alert)
        return
        
    #For a warning or complete-state we need more information
    data = json.loads(n[7])

    obs = []
    for x in data["observed"]:
        obs.append(translateState(x))

    #Tries to determine main cause
    if n[5] != STATE_FAILED and set(obs) == {"Failed"}:
        cause = "Stopped route"
    elif n[5] != STATE_FAILED and majority(obs):
        cause = "Stopped route (mostly)"
    else:
        cause = "Unknown"

    #if cause != "Unknown":
    # Add and enrich last ip seen in trace
    alert["last_reply_from"] = data["lastip"]
#    try:
#        name, alias, addresslist = socket.gethostbyaddr(data["lastip"])
#        alert["last_reply_name"] = name
#    except:
#        alert["last_reply_name"] = "unknown"
    alert["last_reply_name"] = resolver.get_name(data["lastip"])
    try:
        lookup_res = asn_lookup.asn(data["lastip"])
        alert["last_reply_asn"] = lookup_res.autonomous_system_number
        alert["last_reply_as"] = lookup_res.autonomous_system_organization
    except:
        # Lookup failed.
        alert["last_reply_asn"] = 0
        alert["last_reply_as"] = "unknown"
        
    alert["start_time"] = data["start"]
    alert["anomaly_class"] = "end state"
    alert["event_type"] = tr_type + "routewarn"
    alert["normal_end_state"] = translateState(n[5])
    alert["normals_between"] = data["ncount"]
    alert["observed_end_states"] = count(obs)
    alert["cause"] = cause
    alert["anomaly_count"] = data["count"]
    alert["last_hop"] = data["lasthop"]
    alert.update(tracesummary.get_all())  # Add all summary variables to alert dictionary

    errs = data["errors"]

    if len(errs) > 0:
        alert["icmp_errors"] = count(errs)
        alert["icmp_ips"] = data["errorsip"]
        #if "last_reply_from" in alert:
        #    del alert["last_reply_from"]
        #m = Counter(obs)
        #if m["Failed"] < len(errs):
        alert["cause"] = classifyOutage(errs)

    #For completed we need even more

    if mode == "completed":

        alert["event_type"] = tr_type + "routeerr"
        alert["duration"] = time - data["start"]
        # Apply start time for event as time of registration
      #  alert["@timestamp"] =  datetime.fromtimestamp(data["start"], tz_utc).isoformat(),
        alert["@date"] =  datetime.fromtimestamp(data["start"], tz_utc).isoformat(),
        alert["datetime"] = datetime.fromtimestamp(data["start"], tz_local).isoformat(),

    createJSON(alert)

#Compares traceroute hops in detail
#Used by the old version of routeCompare()

def compare(current, normal):

    #print("now", current, "normal", normal)

    current = list(sorted(set(current)))
    normal = list(sorted(set(normal)))
    points = 0

    if current == normal:
        return points
    else:

        if len(current) > len(normal):
            #Find what is different
            diff =  [x for x in current if x not in normal]

            #print(current, normal, diff)

            for x in diff:
                if x == "*":
                    points += 0.2
                elif len(x.split(".")) == 4:

                    #Checks if address is in the same network
                    #Following https://link.springer.com/chapter/10.1007/978-3-319-04918-2_7
                    for y in normal:
                        same = False
                        if len(y.split(".")) == 4:
                            if x.split(".")[-2] == y.split(".")[-2]:
                                same = True

                    if same:
                        points += 0.2
                    else:
                        points += 0.7
                    
                elif x.startswith("!"):
                    #Error codes which are better
                    #covered by the errorCheck function

                    points += 0.3

        elif len(current) < len(normal):
            #Find what is different
            diff =  [x for x in normal if x not in current]

            #print(current, normal, diff)

            for x in diff:
                if x == "*":
                    points += 0.1
                elif len(x.split(".")) == 4:

                    #Checks if address is in the same network
                    #Following https://link.springer.com/chapter/10.1007/978-3-319-04918-2_7
                    for y in current:
                        same = False
                        if len(y.split(".")) == 4:
                            if x.split(".")[-2] == y.split(".")[-2]:
                                same = True

                    if same:
                        points += 0.1
                    else:
                        points += 0.2
                    
                elif x.startswith("!"):
                    #Error codes which are better
                    #covered by the errorCheck function

                    points += 0.3

    
        return points


#Alternative, new attempt at comparing routes

def RouteCompare(traceroute, unique_pair, time, analysis_state_jumps, analysis_state_routes):

    global tracesummary

    threadid = traceroute["thread"]
    tr_type = traceroute["type"]
    normalroute = {}
    newroute = {}
    firstTime = False
    normalChanged = False
    fullscore = 0
    highscore = 0
    anomroute = {}
    total_ce = 0          # Total cross entropy or all hops
    prev_total_ce = 0     # Total cross entropy or all hops in previously analysed route
    ce_delta = []         # Delta cross entropy per hop (relative to previous traceroute analysed) 
    all_dest_dists_initialized = False   # Flag to postpone anomality calculations until destination distributions for all hops are initialised properly
    
    # Debug
    #print(datetime.fromtimestamp(time).isoformat(), time, unique_pair)

    
    #Goes through each hop in the current traceroute we're looking at
    for hop in traceroute["result"]:

        # Debug
        #print(" Hop", hop)
    
        # We first check if we already have entries for this unique pair on this hop
        
        if not analysis_state_jumps[hop]["frequencies"]:
            # There are no entries. Make one.

            # Destinations store how often we see IPs and No Reply
            dests = Counter(traceroute["result"][hop])     # Make distribution of destinations (as a dictionary), i.e. each unique probe response as key and no of them as values.
            total = len(traceroute["result"][hop])         # No of probes sent for hop 

            analysis_state_jumps[hop]["destinations"] = json.dumps(dests)
            analysis_state_jumps[hop]["frequencies"] = total
            
            tracesummary.count_unique_hosts(hop, dests.keys())    # Accummulate summary info

        else:
            # Fetch and update stored state

            dests = json.loads(analysis_state_jumps[hop]["destinations"])
            total = int(analysis_state_jumps[hop]["frequencies"])
            count = int(analysis_state_jumps[hop]["count"])

            newdests = Counter(traceroute["result"][hop])
            newtotal = len(traceroute["result"][hop])

            # Update distribution of destinations
            for y in newdests:
                if y in dests:
                    dests[y] = dests[y] + newdests[y]
                else:
                    dests[y] = newdests[y]

            # Update total of probes sent
            total += newtotal
           
            analysis_state_jumps[hop]["destinations"] = json.dumps(dests)
            analysis_state_jumps[hop]["frequencies"] = total
            analysis_state_jumps[hop]["count"] += 1
            
            tracesummary.count_unique_hosts(hop, newdests.keys())    # Accummulate summary info
            
            # Maybe do some pruning here.... 
            #if len(dests) > 2000:
            #    print("Warning: Large no of unique hosts in hop " + str(hop) + " of path " + unique_pair + ": " + str(len(dests)) )

            # END OF UPDATING STATISTICS.

            #if total > 2500:
            # Total no of probes has reached "window" limit for this hop
            
            if all_dest_dists_initialized or min([int(x['frequencies']) for x in analysis_state_jumps]) > HOPDIST_INIT_WINDOW:
                # Total no of probes has reached "window" limit for all hops
                all_dest_dists_initialized = True
                
                ###  Cross entropy based anomality detection ### 
                
                # Apply cross entropy between new P(x) and learned historical desitnation-distribution Q(x) for current hop by applying:
                # H(T,q) = - Sum_i=1_to_N 1/N log q(x_i) 
                # where N is size of dataset X = {x_1, x_2, ... x_N} drawn from P(x), and P(x) is assumed unknown

                # Prepare Q distribution, but remove none-response "*", and other noise-entry
                q = dests.copy()
                q_total = total
                if "*" in q.keys():
                    q_total -= q["*"]
                    del q["*"]
                if "[open]" in q.keys():
                    q_total -= q["[open]"]
                    del q["[open]"]
                if "[closed]" in q.keys():
                    q_total -= q["[closed]"]
                    del q["[closed]"]
                for x in q.keys():
                    q[x] = float(q[x]/q_total)
                #print("   dests",dests, total)
                #print("   q", q )

                X = list(newdests.keys())
                # Clean out noise entries
                if "*" in X:
                    X.remove("*")    
                if "[open]" in X:
                    X.remove("[open]")    
                if "[closed]" in X:
                    X.remove("[closed]")    
                N = len(X)
                H = 0
                for x in X:
                    H +=  math.log( q[x])
                if N > 0:
                    H =  - float(H/N)
                else:
                    H = 0
                #print("   CE", H)

                # Accumulate entropy
                if analysis_state_jumps[hop]["cross_entropy"] == 0:
                    ce_delta.append(H)
                else:
                    ce_delta.append(abs(analysis_state_jumps[hop]["cross_entropy"] - H))
                total_ce += H      
                prev_total_ce += analysis_state_jumps[hop]["cross_entropy"]      
                analysis_state_jumps[hop]["cross_entropy"] = H

                tracesummary.set_max('max_hop_ce_delta', ce_delta[-1])
                
                # END OF UPDATING NORMALITY


    total_ce_delta = prev_total_ce - total_ce
    tracesummary.set_max('max_route_ce_delta', total_ce_delta)
    # Dump CE stuff
    #print("  Total CE :", total_ce)
    #print("  Avg CE per hop:", total_ce/len(traceroute["result"]))
    #print("  Total delta CE:", total_ce_delta )
    #print("  Avg delta CE per hop:", abs(prev_total_ce - total_ce)/len(traceroute["result"]) )
    #print("  Delta CE per hop:", ce_delta)
    routehosts = []
    for hop in traceroute["result"]:
        # Extrace set of unique hosts a given hop
        hophosts=set(traceroute["result"][hop])
        if len(hophosts) == 1:
            # Append to path as string
            routehosts.append(list(hophosts)[0])
        else:
            # Remove noise
            hophosts.discard("*")
            hophosts.discard("[open]")
            hophosts.discard("[closed]")
            if len(hophosts) == 1:
                # Append to path as string
                routehosts.append(list(hophosts)[0])
            else:
                # Append to path as list
                routehosts.append(list(hophosts))
    if ce_delta and max(ce_delta) > CE_DELTA_LIMIT:      
        # Route change detected
        tracesummary.count('route_changes')
        if total_ce_delta > 0:
            # Change to new route detected. Report.
            n = tuple(analysis_state_routes.values())   # Convert to tuple for "backward compatibility" with summerjob-code
            printRouteAlert(threadid, tr_type, unique_pair, json.dumps(routehosts), n, analysis_state_jumps[hop]["memory"], time, "new_route", 0, 0, ce_delta)
        else:
            # Change back to known route detected. Report.
            n = tuple(analysis_state_routes.values())   # Convert to tuple for "backward compatibility" with summerjob-code
            printRouteAlert(threadid, tr_type, unique_pair, json.dumps(routehosts), n, analysis_state_jumps[hop]["memory"], time, "known_route", 0, 0, ce_delta)
    else:
        # Store current route
        analysis_state_jumps[hop]["memory"]=json.dumps(routehosts)
        

def findLastIp(traceroute, dest):
    """ Finds the last seen IP (and its hop) in a traceroute
    """
    # Scan traceroute from last hop and backwards
    for i in range(len(traceroute)-1, -1, -1):
        # Scan from last probe and backwards
        for j in range(len(traceroute[i])-1,-1,-1):
            if len(traceroute[i][j].split(".")) == 4:
                return traceroute[i][j], i+1
                
    # No ips found (all "*" or errormsgs)
    return "None", 0
        
#Initializes memory for an end state anomaly

def initialize(time, state, lastip, errors, errorsIP, most_common_state, lasthop):

    data = {}
    data["count"] = 1 #traceroute count
    data["ncount"] = 0 #normals between
    data["errors"] = [] #errors seen
    data["errorsip"] = [] #ip for errors
    data["start"] = time
    data["observed"] = [] #states seen
    data["observed"].append(state)
    data["hypcount"] = 0 #Used to update data after non-anomalous traceroutes
    data["lastip"] = lastip #Last reply from
    data["status"] = "Normal"
    data["lasthop"] = lasthop
    if len(errors) > 0:
        data["status"] = "Errors"
        for z in errors:
            data["errors"].append(z)
        data["errorsip"] = errorsIP
    elif most_common_state != STATE_FAILED and state == STATE_FAILED:
        data["status"] = "Stopped"

    return data


def fix_tuple(t):
    """ DEBUG-TOOL: Fix a few types in tuple returned by "select * from routes"
    """
    vx = list(t)
    vx[4] = float(vx[4])
    vx[6] = float(vx[6])
    if vx[7] == '0':
        vx[7] = 0
    return tuple(vx)


def errorCheck(traceroute, unique_pair, time, analysis_state):
    """ Compares the final result, i.e. last hop, of the traceroute with registered normal state    
    NEW VERSION
    """
    global tracesummary

    # Counts the different types of final ICMP replies in the current traceroute

    trace_res = traceroute["result"]
    destination = traceroute["dst"]
    threadid = traceroute["thread"]
    tr_type = traceroute["type"]

    last = trace_res[len(trace_res)-1]   # Grab last line in raw traceroute
    noreply = 0
    reached = 0
    errors = []
    errorsIP = []
    other = 0
    lastip, lasthop = findLastIp(trace_res, destination)  # Extract last seen ip address and its hop position
    ipseen = None

    # Examine last line
    for probe in last:    
        if str(probe).strip() == "*":                # Count "*"s i.e "No replies"
            noreply += 1
            tracesummary.count('probes_stopped_at_last_hop')
        elif str(probe).strip() == str(destination): # Count successes , i.e packages reaching their destination
            reached += 1
            ipseen = str(probe).strip()
            lastip = destination                     # Set dst-ip as last-ip since this is the one making traceroute terminate  
            tracesummary.count('probes_to_dst')
        elif len(str(probe).strip().split(".")) == 4: # Count stopped routes at none-desitantion addresses (ipv4)
            other += 1
            ipseen = str(probe).strip()
            tracesummary.count('probes_with_none_dst_last_hop')
        elif str(probe).strip().startswith("!"):      # Any error messages
            errors.append(str(probe).strip())
            errorsIP.append(ipseen)
            tracesummary.count('probes_with_errormsg')
        else:
            if param["verbose"] > 3:
                print("Warning: For " + unique_pair + ", unrecognized probe result: '" + probe + "'")

    errorsIP = set(errorsIP)  # Convert list to a set (and back again) to remove duplicates
    if len(errorsIP) == 1:
        errorsIP = list(errorsIP)[0]
    else:
        errorsIP = list(errorsIP)

    # Depending on the count above, the final state is classified and stored as
    # either successful, partially failed or completely failed.

    if reached == 0:
        # Destination never reached
        tracesummary.count('routes_failed')
        analysis_state["failed"] += 1
        state = STATE_FAILED
        if lasthop == traceroute["maxhops"]:
            # Max ttl is probably to low. Report.
            tracesummary.count('none_dst_ip_at_max_ttl')
    else:
        analysis_state["success"] += 1
        state = STATE_SUCCESS
        tracesummary.set_length(lasthop)
        tracesummary.count('routes_reached')
    
    # Now we get our accumulated data about traceroute completions from the database
    n = tuple(analysis_state.values())   # Convert to tuple for "backward compatibility" with summerjob-code
        
    # Find most common and second-most common status for this route
    if analysis_state["success"] > analysis_state["failed"]:
         most_common_state = STATE_SUCCESS
         most_common_state_counter = analysis_state["success"] 
         scnd_most_common_state = STATE_FAILED
         scnd_most_common_state_counter = analysis_state["failed"] 
    else:
         most_common_state = STATE_FAILED
         most_common_state_counter = analysis_state["failed"] 
         scnd_most_common_state = STATE_SUCCESS
         scnd_most_common_state_counter = analysis_state["success"] 

         
    if analysis_state['normal'] != most_common_state and (most_common_state_counter - scnd_most_common_state_counter) > f_majority:
        # Most common state has changed and is significantly more common than other state. Update registered normal state.
        analysis_state["normal"] = most_common_state
        analysis_state["report"] = 0
        analysis_state["anomaly"] = 0
        printAlert(threadid, tr_type, n, time, "changed", int(analysis_state['normal']), int(most_common_state))
    
    #Now if the state of the last traceroute does not match the defined normal
    #And if the state has been defined normal for a long enough time
    #And if the normal state has a significant majority on the 2nd most common state
    #We note that there has been anomalous behavior

    if (state != most_common_state or (len(errors) > 0 and most_common_state == STATE_FAILED)) \
       and ((most_common_state_counter - scnd_most_common_state_counter) > f_majority):
        # We have an anomalous state while normality has been stable over time (until now)
       
        if float(analysis_state["anomaly"]) == 0:
            # First time anomality, record state
            data = initialize(time, state, lastip, errors, errorsIP, most_common_state, lasthop)
            analysis_state["anomaly"] = 1
            analysis_state["report"] = json.dumps(data)
            if data["status"] != "Normal":
                # Output warning on abnormal status
                v = tuple(analysis_state.values())   # Convert to tuple for "backward compatibility" with summerjob-code
                printAlert(threadid, tr_type, v, time, "warning")

        else:
            # We have an anomalous state from before
            data = json.loads(analysis_state['report'])
            data["count"] = int(data["count"]) + 1
            data["count"] += data["hypcount"]
            data["observed"].append(state)
            data["ncount"] += data["hypcount"]
            data["hypcount"] = 0

            if data["status"] == "Normal":
                if len(errors) > 0:
                    # New variant of anomality (ICMP errors). Reset anomality state.
                    data = initialize(time, state, lastip, errors, errorsIP, most_common_state, lasthop)
                    analysis_state["anomaly"] = 1
                    analysis_state["report"] = json.dumps(data)
                    v = tuple(analysis_state.values())   # Convert to tuple for "backward compatibility" with summerjob-code
                    printAlert( threadid, tr_type, v, time, "warning")
                elif most_common_state != STATE_FAILED and state == STATE_FAILED:
                    # New variant of anomality (stopped route). Reset anomality state.
                    data = initialize(time, state, lastip, errors, errorsIP, most_common_state, lasthop)
                    analysis_state["anomaly"] = 1
                    analysis_state["report"] = json.dumps(data)
                    v = tuple(analysis_state.values())   # Convert to tuple for "backward compatibility" with summerjob-code
                    printAlert( threadid, tr_type, v, time, "warning")
                else:
                    # Same anomality, Update counter
                    analysis_state["anomaly"] = float(analysis_state["anomaly"]) + 1
                    analysis_state["report"] = json.dumps(data)
            elif data["status"] == "Errors":
                if len(errors) == 0 and most_common_state != STATE_FAILED and state == STATE_FAILED:
                    if (data["count"] - data["ncount"]) > f_csensitivity:
                        printAlert(threadid, tr_type, n, time, "completed")
                    data = initialize(time, state, lastip, errors, errorsIP, most_common_state, lasthop)
                    analysis_state["anomaly"] = 1
                    analysis_state["report"] = json.dumps(data)
                    v = tuple(analysis_state.values())   # Convert to tuple for "backward compatibility" with summerjob-code
                    printAlert( threadid, tr_type, v, time, "warning")
                elif data["errorsip"] != errorsIP and len(errors) > 0:
                    if (data["count"] - data["ncount"]) > f_csensitivity:
                        printAlert(threadid, tr_type, n, time, "completed")
                    data = initialize(time, state, lastip, errors, errorsIP, most_common_state, lasthop)
                    analysis_state["anomaly"] = 1
                    analysis_state["report"] = json.dumps(data)
                    v = tuple(analysis_state.values())   # Convert to tuple for "backward compatibility" with summerjob-code
                    printAlert( threadid, tr_type, v, time, "warning")
                elif len(errors) > 0:
                    for z in errors:
                        data["errors"].append(z)
                    data["errorsip"] = errorsIP
                    analysis_state["anomaly"] = float(analysis_state["anomaly"]) + 1
                    analysis_state["report"] = json.dumps(data)
            elif data["status"] == "Stopped":
                if len(errors) > 0:
                    if (data["count"] - data["ncount"]) > f_csensitivity:
                        printAlert(threadid, tr_type, n, time, "completed")
                    data = initialize(time, state, lastip, errors, errorsIP, most_common_state, lasthop)
                    analysis_state["anomaly"] = 1
                    analysis_state["report"] = json.dumps(data)
                    v = tuple(analysis_state.values())   # Convert to tuple for "backward compatibility" with summerjob-code
                    printAlert( threadid, tr_type, v, time, "warning")
                elif data["lastip"] != lastip and most_common_state != STATE_FAILED and state == STATE_FAILED:
                    if (data["count"] - data["ncount"]) > f_csensitivity:
                        printAlert(threadid, tr_type, n, time, "completed")
                    data = initialize(time, state, lastip, errors, errorsIP, most_common_state, lasthop)
                    analysis_state["anomaly"] = 1
                    analysis_state["report"] = json.dumps(data)
                    v = tuple(analysis_state.values())   # Convert to tuple for "backward compatibility" with summerjob-code
                    printAlert( threadid, tr_type, v, time, "warning")
                elif most_common_state != STATE_FAILED and state == STATE_FAILED:
                    analysis_state["anomaly"] = float(analysis_state["anomaly"]) + 1
                    analysis_state["report"] = json.dumps(data)

    elif float(analysis_state["anomaly"]) > 0:
        
        #If we do not have anomalous behavior, we reduce the anomaly quotient a bit
        analysis_state["anomaly"] = float(analysis_state["anomaly"]) * f_reduction

        #If anomaly < 1, consider printing and delete timestamp and error message
        if analysis_state["anomaly"] < 1:
            data = json.loads(analysis_state['report'])
            if data["status"] != "Normal" and (data["count"] - data["ncount"]) > f_csensitivity:
                printAlert(threadid, tr_type, n, time, "completed")
            analysis_state["anomaly"] = 0
            #analysis_state["report"] = json.dumps(data)
        elif analysis_state["anomaly"] > 1:
            data = json.loads(analysis_state['report'])
            data["hypcount"] = int(data["hypcount"]) + 1
            analysis_state["report"] = json.dumps(data)

    if analysis_state["success"] > f_max_state_counter or analysis_state["failed"] > f_max_state_counter:
        # Reduce all state counters if one has reach window limit
        analysis_state["success"] = int(analysis_state["success"]) - 1
        analysis_state["failed"] = int(analysis_state["failed"]) - 1


def lengthCompare(traceroute, cursor, unique_pair, time):
    #Compares the amount of hops in each traceroute

    cursor.execute("SELECT count(*) FROM length WHERE unique_pair = %s", (unique_pair,))

    entrycount = cursor.fetchone()[0]
        
    #If there are no entries, we have to make one
    if entrycount == 0:

        #Destinations store the various routes we've seen
        lengths = []
        lengths.append(len(traceroute["result"]))

        #Frequencies store the amount of times we've seen each variation
        frequencies = {}
        frequencies["0"] = 1

        #Now we know our current traceroute's variation is in index 0
        state = 0

        #We update the database with our new unique pair/hop entry
        cursor.execute(('INSERT INTO length (unique_pair, lengths, frequencies, anomalies, normal, count, anomaly) values (%s, %s, %s, %s, %s, %s, %s)'), (unique_pair, json.dumps(lengths), json.dumps(frequencies), json.dumps([-1]), 0, 1, 0))

    else:
            
        #First we get our route variations that we've seen
        cursor.execute(("SELECT lengths FROM length WHERE unique_pair = %s"), (unique_pair,))
        lengths = json.loads(cursor.fetchone()[0])

        #Then we get the frequency of each variation
        cursor.execute(("SELECT frequencies FROM length WHERE unique_pair = %s"), (unique_pair,))
        freq = json.loads(cursor.fetchone()[0])

        #We slightly decrement all frequencies by r_freshness so our evaluations are not based on old data too much
        for z in freq:
            freq[z] = (freq[z] - r_freshness)

        #Prune route variances if there are many to avoid overfilling the database

        if len(lengths) > 1000:
            newfreq = {}
            newlengths = []
            for z in freq:
                median = statistics.median(freq)
            for z in freq:
                if freq[str(z)] >= median:
                    newfreq[len(newfreq)] = freq[str(z)]
                    newlengths.append(lengths[int(z)])
            freq = newfreq
            newlengths = newlengths


        #Now we go through every length we have saved
        #And see if we have a match with the current traceroute

        count = 0
        found = False

        for y in lengths:

            #If a match is found, we update its frequency and save the index of the current state
            if y == len(traceroute["result"]) and not found:

                #Update count

                freq[str(count)] = freq[str(count)] + 1
                cursor.execute(('UPDATE length SET frequencies = %s WHERE unique_pair = %s'), (json.dumps(freq), unique_pair))
                state = count
                found = True

            count = count + 1

        #If no partial match is found, we add a new variance to our database
        if not found:

            freq[str(len(freq))] = 1
            lengths.append(len(traceroute["result"]))
            state = len(freq)-1
                
            cursor.execute(('UPDATE length SET lengths = %s, frequencies = %s WHERE unique_pair = %s'), (json.dumps(lengths), json.dumps(freq), unique_pair))


    #Now we want to consider the hop for anomalies
    #We first get data about this hop from our database

    cursor.execute(("SELECT lengths, frequencies, normal, count, anomalies, anomaly FROM length WHERE unique_pair = %s"), (unique_pair,))
    k = cursor.fetchone()
    lengths = json.loads(k[0])
    freqs = json.loads(k[1])
    anomalies = json.loads(k[4])
    anomaly = float(k[5])

    if str(anomalies) == "1":
        print(k)

    #Now we find the most common route variances on this hop

    largest = 0
    nlargest = 0

    for y in freqs:
        if freqs[y] > largest:
            nlargest = largest
            largest = freqs[y]
            lpos = y


    #We check if this was the same most common route variance as before we updated and do the necessary updates

    normal = k[2]

    if int(lpos) != int(normal):
        cursor.execute(('UPDATE length SET normal = %s, count = %s, anomalies = %s, anomaly = 0 WHERE unique_pair = %s'), (lpos, 1, json.dumps([-1]), unique_pair))
        anomalies = [-1]
        anomaly = 0
    else:
        cursor.execute(('UPDATE length SET count = count + 1 WHERE unique_pair = %s'), (unique_pair,))

    
    #If our state is not this most common route
    #And it has a significant enough majority
    #And it's been the majority for long enough
    #We print an alert about the length

    stability = k[3]

    if int(state) != int(lpos) and ((largest - nlargest) > l_majority) and int(stability) > l_swapping:
        
        if float(anomalies[0]) == -1:
            anomalies = [lengths[int(state)]]
            anomaly = 1
        elif abs(int(lengths[int(state)]) - lengths[int(lpos)]) >= l_difference:
            anomalies.append(lengths[int(state)])
            
            if anomaly > l_freshness:
                anomaly = anomaly - l_freshness
            else:
                anomaly = 0.1

        cursor.execute(('UPDATE length SET anomalies = %s, anomaly = %s WHERE unique_pair = %s'), (json.dumps(anomalies), anomaly, unique_pair))

    else:

        anomaly = float(anomaly) * l_reduction

        cursor.execute(('UPDATE length SET anomaly = %s WHERE unique_pair = %s'), (anomaly, unique_pair))

    #print(anomaly, len(anomalies), largest-nlargest, int(stability))

    if anomaly > 0 and anomaly < 0.3 and len(anomalies) > l_sensitivity:
        printLengthAlert(unique_pair, lengths[int(lpos)], cursor, anomalies, time)
        cursor.execute(('UPDATE length SET anomalies = %s, anomaly = 0 WHERE unique_pair = %s'), (json.dumps([-1]), unique_pair))


#Creates the quartiles used to check if an RTT is anomalous 
#despite reference points not being evenly distributed

def findTukeyQuartiles(allRTT):
    
    allRTT = sorted(allRTT)

    ql = math.floor(len(allRTT)/3)

    q1 = 0
    q3 = 0

    for a in range(0, ql-1):
        q1 += float(allRTT[a])
        q3 += float(allRTT[a+(2*ql)])

    if (ql % 3) > 0:
        q3 += float(allRTT[len(allRTT)-1])

    q1 = q1/ql
    q3 = q3/(len(allRTT)-2*ql)

    return q3, q1


#Compares the RTT of each hop to what we believe to be normal using a Tukey-based method

def rttCompare(traceroute, cursor, unique_pair, time):

    #Variable where we measure anomalies across several hops

    anomaly = 0
    average = []
    abnormal = []
    totalanom = 0

    #We go through the collected list of RTTs for each hop in the new traceroute

    for c in traceroute["rtt"]:


        #Before proceeding, we check if we have any information for this hop on this route stored

        cursor.execute("SELECT count(*) FROM rtt WHERE unique_pair = %s AND hop = %s", (unique_pair, c))
        amount = cursor.fetchone()[0]
        

        #If we do not, we store our first list of RTTs

        if amount == 0:
            
            cursor.execute(('INSERT INTO rtt (unique_pair, hop, timestamps, anomaly) values (%s, %s, %s, %s)'), (unique_pair, c, json.dumps(traceroute["rtt"][c]), 0))


        #If we do, we need to consider if our new RTTs are normal and update the information we have
        
        else:

            cursor.execute("SELECT timestamps FROM rtt WHERE unique_pair = %s AND hop = %s", (unique_pair, c))
            allRTT = json.loads(cursor.fetchone()[0])
            cursor.execute("SELECT anomaly FROM rtt WHERE unique_pair = %s AND hop = %s", (unique_pair, 0))
            totalanom = float(cursor.fetchone()[0])


            #Checks if we have enough RTT lists for there to be a point to consider anomalies
            #print(c, len(allRTT))
            if len(allRTT) > rtt_threshold:

                summer = 0
                winter = 0

                for a in allRTT:
                    summer += float(a)

                average.append(round(summer/len(allRTT),2))

                if traceroute["rtt"][c] != []:
                    for a in traceroute["rtt"][c]:
                        winter += float(a)

                    abnormal.append(round(winter/len(traceroute["rtt"][c]),2))

                #Find Tukey quartiles used to check if a value is an outlier even if the value distribution is uneven

                q3, q1 = findTukeyQuartiles(allRTT)

                toohigh = q3 + rtt_tukeyfactor*abs(q3-q1)
                toolow = q1 - rtt_tukeyfactor*abs(q3-q1)

                #Consider anomaly if new RTTs deviate too much

                
                for z in traceroute["rtt"][c]:
                    if float(z) > toohigh or float(z) < toolow:
                        anomaly += 1
                        #print("toohigh", toohigh, "toolow", toolow, traceroute["rtt"][c])

                #print(toohigh, toolow, anomaly, traceroute["rtt"][c])

            #Adds the new RTTs to our database

            for l in traceroute["rtt"][c]:
                allRTT.append(l)
            
            #Prunes old RTTs to avoid breaking the database

            if len(allRTT) > 2000:
                allRTT = allRTT[math.floor(len(allRTT)/2):]

            cursor.execute(('UPDATE rtt SET timestamps = %s WHERE unique_pair = %s AND hop = %s'), (json.dumps(allRTT), unique_pair, c))

    #If the deviation of the full traceroute is significant enough, we increase the anomaly quotient
    #We also decrement slightly for freshness to make sure our data isn't old
    
    if float(anomaly) > rtt_minimum:
        
        cursor.execute("UPDATE rtt SET anomaly = (anomaly - %s) + 1 WHERE unique_pair = %s AND hop = %s", (rtt_freshness, unique_pair, 0))
        totalanom = (totalanom + 1) - rtt_freshness

        if float(totalanom) > rtt_sensitivity:
            printRTTalert(unique_pair, cursor, average, abnormal, time)
            cursor.execute("UPDATE rtt SET anomaly = 0 WHERE unique_pair = %s AND hop = %s", (unique_pair, 0))

    #If there is no significant deviation, we decrement the anomaly quotient
    #for freshness and also reduce the anomaly quotient a bit
    else:
        cursor.execute("UPDATE rtt SET anomaly = (anomaly - %s) * %s WHERE unique_pair = %s AND hop = %s", (rtt_freshness, rtt_reduction, unique_pair, 0))

    #cursor.execute("SELECT * FROM rtt WHERE unique_pair = %s and anomaly > 0", (unique_pair,))
    #n = cursor.fetchall()
    #print(n)

DB_STRINGFIELDS=[ 'unique_pair', 'report', 'destinations', 'normal', 'memory']
    
def build_sql_insert(state, table):
    """ Prepare a SQL INSERT command for traceroute state data
    """
    insert_fields = "("
    insert_values = "("
    for field in state:
        insert_fields += field + ", "
        if field in DB_STRINGFIELDS:
            insert_values += "'" + str(state[field]).strip() + "', "
        else:
            insert_values += str(state[field]) + ", "
    insert_fields = insert_fields[:-2] + ")" 
    insert_values = insert_values[:-2] + ")" 
    return_str = 'INSERT INTO ' + table + ' ' + insert_fields + " values " + insert_values
    #print(return_str)
    return return_str

def build_sql_update(state, table, cond_keys):
    """ Prepare a SQL UPDATE command for traceroute state data
    """
    update_key_values = ""
    for field in state:
        if not field in cond_keys:
            if field in DB_STRINGFIELDS:
                # Add quotes to strings
                update_key_values += field + " = '" + str(state[field]).strip() + "', "
            else:
                update_key_values += field + " = " + str(state[field]) + ", "
    update_key_values = update_key_values[:-2]
    # Prepare conditions
    cond_str = " WHERE "
    for field in cond_keys:
        cond_str += field + " = "
        if field in DB_STRINGFIELDS:
            cond_str += "'" + state[field] + "'"
        else:
            cond_str +=  str(state[field]) 
        cond_str += " AND "
    cond_str = cond_str[:-5]
    
    return_str = "UPDATE " + table + " SET " + update_key_values + cond_str
    if param["verbose"] > 3:
        print(return_str)
    return return_str

# State storage for analysis    
traceroute_analysis_state_routes = {}                  # State for route-end-state-analysis
traceroute_analysis_state_jumps = []                   # State for per-hop-analysis
traceroute_analysis_state_current_unique_pair = ""     # Latest traceroute src-dest pair analysed
traceroute_analysis_state_current_unique_pair_is_new = False     # True if current pair analysed has no entry in DB

def flush_analysis_state(cursor):
    """ Flush state currently in memory to DB
    """

    try:
        global traceroute_analysis_state_routes
        global traceroute_analysis_state_jumps
        global traceroute_analysis_state_current_unique_pair_is_new

        if param['all']:
            # Older traceroutes than the last traceroute applied to update state in DB may have been analized. Skip storing new state.
            return
    
        cursor.execute("START TRANSACTION")
        if traceroute_analysis_state_current_unique_pair_is_new:
            # Insert "route" state in DB (i.e. end-state analysis results)
            if  len(traceroute_analysis_state_routes)>0:
                cursor.execute( build_sql_insert(traceroute_analysis_state_routes, "routes") )
                # Insert "jumps" state in DB (i.e. per hop analysis results)
            for hop in traceroute_analysis_state_jumps:
                cursor.execute( build_sql_insert(hop, "jumps") )
            traceroute_analysis_state_current_unique_pair_is_new = False 
        else:
            # Update DB for end-state analysis
            if  len(traceroute_analysis_state_routes)>0:
                cursor.execute( build_sql_update(traceroute_analysis_state_routes, "routes", ['unique_pair']) )
            # Update DB for per-hop-analysis
            for hop in traceroute_analysis_state_jumps:
                cursor.execute( "SELECT unique_pair, hop FROM jumps WHERE unique_pair = '" + hop['unique_pair'] + "' AND hop = " + str(hop['hop']) )
                if cursor.rowcount == 0:
                    # Row is non-exitant. Insert new row instead
                    cursor.execute( build_sql_insert(hop, "jumps") )
                else:
                    # Udate row
                    cursor.execute( build_sql_update(hop, "jumps", ['unique_pair', 'hop']) )
            
        cursor.execute(('COMMIT'));

    except (KeyboardInterrupt, SystemExit) as e :
        # Ignore and quit
        pass 

    return

def analyze(traceroute, time, cursor):
    """ Analyzes each new incoming traceroute. Runs all the analysis routines
    """
    
    global tracesummary
    global traceroute_analysis_state_current_unique_pair
    global traceroute_analysis_state_current_unique_pair_is_new
    global traceroute_analysis_state_jumps
    global traceroute_analysis_state_routes
        
    if not traceroute["result"]:
        # Empty traceroute. Nothing to analyse.
        tracesummary.count('empty_routes')                 # Update summary stats
        return

    #Compose unique identifier of this route
    unique_pair = str(traceroute["src"]) + "/" + str(traceroute["dst"])
        
    # Update summary stats
    tracesummary.count('routes_analysed')              
    tracesummary.count( traceroute['type'] + '_routes')
    tracesummary.set_max('max_ttl', traceroute['maxhops'])

    if traceroute_analysis_state_current_unique_pair and traceroute_analysis_state_current_unique_pair != unique_pair:
        # Update state for previous end-state-analysis in DB
        if param['verbose'] > 3:
            pprint(traceroute_analysis_state_routes)
            pprint(traceroute_analysis_state_jumps)
        flush_analysis_state(cursor)

    if not traceroute_analysis_state_current_unique_pair or traceroute_analysis_state_current_unique_pair != unique_pair:
        traceroute_analysis_state_current_unique_pair = unique_pair
        # Gets state for lastest end-state-analysis from DB
        cursor.execute("START TRANSACTION")
        cursor.execute(("SELECT unique_pair, success, failed, partialfail, anomaly, normal, count, report, bookmark FROM routes WHERE unique_pair =%s"), (unique_pair,))
        traceroute_analysis_state_routes = fetch_one_dict(cursor)
        if traceroute_analysis_state_routes is None:
            # First time this "traceroute pair" is analyzed. Initialize.
            traceroute_analysis_state_routes = {
                "unique_pair": unique_pair,
                "success": 0,
                "failed": 0,
                "partialfail": 0,
                "anomaly": 0,
                "normal": 0,
                "count": 0,
                "report": '',
                "bookmark": time }
            traceroute_analysis_state_current_unique_pair_is_new = True

        elif traceroute_analysis_state_routes["bookmark"] >= time and param['all'] == 0:
            # We return empty if the last traceroute we analyzed is older than what we have bookmarked
            cursor.execute(('COMMIT'));
            return

        # Gets state for lastest per-hop-analysis (jumps)
        cursor.execute(("SELECT unique_pair, hop, destinations, frequencies, count, normal, memory, anomaly, trcrt, betweens, cross_entropy, timestamp FROM jumps WHERE unique_pair =%s ORDER BY hop"), (unique_pair,))
        traceroute_analysis_state_jumps = []
        stored_hop = fetch_one_dict(cursor)
        while (stored_hop):
            traceroute_analysis_state_jumps.append(stored_hop)
            stored_hop = fetch_one_dict(cursor)
        cursor.execute(('COMMIT'));
        
    
    # Add initial state values for new hops
    for hop in traceroute["result"]:
        if len(traceroute_analysis_state_jumps)< hop+1:
            traceroute_analysis_state_jumps.append(
                {
                    "unique_pair": unique_pair,
                    "hop": hop,
                    "destinations": json.dumps([]),
                    "frequencies": 0,
                    "count": 1,
                    "normal": json.dumps([]),
                    "memory": json.dumps([]),
                    "anomaly": 0,
                    "trcrt": 0,
                    "betweens": 0,
                    "cross_entropy": 0.0,
                    "timestamp": time
                }
            )
            
    if not traceroute_analysis_state_current_unique_pair_is_new:
        #If we have seen it before, we just update the bookmark/timestamp
        traceroute_analysis_state_routes["bookmark"] = time
        for hop in traceroute_analysis_state_jumps:
            hop["timestamp"] = time

    #Analyse final status of the traceroute, i.e. last hop
    errorCheck(traceroute, unique_pair, time, traceroute_analysis_state_routes)

#    pprint(traceroute)
#    pprint(traceroute_analysis_state_jumps)
            
    #Analyse variations in each hop
    RouteCompare(traceroute, unique_pair, time, traceroute_analysis_state_jumps, traceroute_analysis_state_routes)

    #The length of each traceroute
    #NOTE: TESTED TO LIMITED EXTENT 
    #lengthCompare(traceroute, cursor, unique_pair, time)

    #And the RTT values to what we believe is normal
    #NOTE: TESTED TO LIMITED EXTENT 
    #rttCompare(traceroute, cursor, unique_pair, time)

    #Used to aggregate results from multiple features and print a full report
    #considerAlert(connection, unique_pair, average, abnormal, lpos, state, traceroute["result"], normalRoute)

    
input_file = {}  # Filenames of inputfiles, indexed by thread  
input_dir = {}  # Folders for inputfiles, indexed by thread  
report_dir = {}  # Folders for outputfiles, indexed by thread  

# Prepare communication between Rabbitmq receive proccess and analysis process
pssrc_r, pssrc_w = os.pipe()                # Pipe from Rabbitmq reader to analysis process
pssrc_pipe_input = os.fdopen(pssrc_w, "w")  # File descriptor for writing data to analysis process 
pssrc_pipe_output = os.fdopen(pssrc_r)      # File descriptor for reading data inside analysis process  

def read(path, srchost, srcdate, mode="batch", thread=0, starttime=0):
    """ Parse raw log file and run analysis on each found traceroute run
        2022-01-20: Renovated to properly parse both traceroute and tcptraceroute logs
    """  

    if mode == "live":
        # Runs gztools in Linux and grabs the stdout
        p = subprocess.Popen(["gztool", "-v0", "-WT", path], stdout=subprocess.PIPE)
    elif mode in ["batch", "nosummary"]:
        p = subprocess.Popen(["zcat", path], stdout=subprocess.PIPE) #For batch reading
    elif mode == "pssrc":
        # Read from pipe (from parent process)
        p = pssrc_pipe_output
    else:
        print ("Error: Unknown mode '" + mode + "'.")
        sys.exit()

    # Check if filehandel really is open
    if (hasattr(p,'closed') and p.closed ) or (hasattr(p,'poll') and p.poll() is not None ):
        print("Error: Accessing source '" + path + "' failed (file descriptor closed).")
        return
    
    # Update thread-inputfile mapping
    filename = os.path.basename(path)
    input_file[thread] = filename
    input_dir[thread] = os.path.dirname(path)
    report_dir[thread] = param['reportpath'] + "/" + srchost + "/" + srcdate + "/" + param['reportpostpath']
    
    # Extract info from filename
    dsthost = str(filename)[filename.find("_")+1:-3]  # Assume "..._<ipv4-addr>.gz" filename format
    traceroute_type = "udp"
    if (filename.startswith("tcp")):
        traceroute_type = "tcp"

    traceroutes = {}
    time = 0

    #Connects to SQL server
    cursor = connect_db(param);              # Connect to DB

    #Reads new lines as they come in and once it has a full traceroute, sends it to analysis
    if param['verbose'] > 0:
        print("Started thread ", thread)
    if param['verbose'] > 0:
        print("Reading", path, "in", mode, "mode")

    # Parser states
    PS_INIT = 0
    PS_STARTLINE = 1
    PS_HEADERLINE = 2
    PS_LOGLINE = 3
    PS_ENDED = 4
    
    try:
        parser_state = PS_INIT
        while parser_state != PS_ENDED:

            # Get new line from log
            if mode == "pssrc":
                line = p.readline()
            else:
                line = str(p.stdout.readline(), 'UTF8')

            if not line and mode in ["batch", "nosummary"]:
                # No more input. End of parsing.
                parser_state = PS_ENDED
                continue

            if param['verbose'] > 3 and line.strip() != "" :
                print("Read from input: ", line,  end='')
            
            word = line.split();  # Split line on whitespaces

            if len(word) == 0:
                # Empty or corrupt line (or no line at all). Skip
                continue

            if word[0] == "ps_testid":
                # Strip off perfsonar test id
                ps_testid = word[1]
                word.pop(1)
                word.pop(0)
                
            if len(word) >= 6 and word[1] == "sudo" and word[2] == "traceroute" and word[6] =="-T":
                # TCP traceroute from perfsonar found. 
                traceroute_type = "tcp"
                # Clean away tcp-specific header stuff
                word.pop(6)
                word.pop(1)
                
            MICRODEPLOG = ( len(word) > 1 and word[1] == "starttime" )                        # E.g. logline ala "1617573742 starttime 00:02:22" found
            PERFSONARLOG = ( len(word) > 2 and word[1] == "traceroute" and word[2] == "-q" )  # E.g. log line ala "1617573742 traceroute -q 1 -4 -s 172.150.1.2 -N 30 -n 172.150.2.8" found

            if MICRODEPLOG or PERFSONARLOG:
                # Start line found
                if parser_state in [PS_STARTLINE, PS_LOGLINE]:
                    # Parsing of previous traceroute run has completed
                    if "src" in traceroutes[time] and "dst" in traceroutes[time]:
                        if len(traceroutes[time]["result"]) > traceroutes[time]["maxhops"]:
                            # Update maxhops
                            traceroutes[time]["maxhops"] = len(traceroutes[time]["result"])

                        if param['verbose'] > 2:
                            print ("New traceroute run found at time ", time ,", analysing...")
                        analyze(traceroutes[time], time, cursor)

                    else:
                        # Source or destination info missing. Traceroute is incomplete. Skip.
                        tracesummary.parse_error()
                elif parser_state == PS_INIT:
                    # First line of log file. Prepare for parsing of traceroute run
                    pass
                
                parser_state = PS_STARTLINE
                # Initializes for new traceroute
                time = int(word[0])  
                traceroutes[time] = {}
                if MICRODEPLOG:
                    traceroutes[time]["src"] = srchost
                    traceroutes[time]["dst"] = dsthost
                    tracesummary.set_current_pair(traceroutes[time]["src"] + "/" + traceroutes[time]["dst"], time, thread)
                elif PERFSONARLOG:
                    traceroutes[time]["src"] = word[6]
                    traceroutes[time]["dst"] = word[10]
                    traceroutes[time]["ipversion"] = int(word[4][-1])
                    if traceroutes[time]["ipversion"] == 6 and not param["ipv6"]:
                        # Do not parse ipv6 traceroutes
                        if param["verbose"] > 2:
                            print("Unsupported ipv6 traceroute. Skipping.")
                        parser_state = PS_INIT
                        continue
                    tracesummary.set_current_pair(traceroutes[time]["src"] + "/" + traceroutes[time]["dst"], time, thread)
                    tracesummary.set_pstestid(ps_testid)
                else:
                    if param['verbose'] > 2:
                        print ("Warning: Unrecognized start line format, skipping input.")
                    continue

                tracesummary.set_routetype(traceroute_type)
                traceroutes[time]["maxhops"] = 0
                traceroutes[time]["type"] = traceroute_type
                traceroutes[time]["result"] = {}
                traceroutes[time]["rtt"] = {}
                traceroutes[time]["thread"] = thread   # (for postfixing in output-filename)

            elif parser_state == PS_STARTLINE and word[0] == "traceroute":
                # Header line found, e.g. "traceroute to 109.105.116.52 (109.105.116.52), 30 hops max, 60 byte packets"
                traceroutes[time]["dst"] = word[2]   # Update dsthost found in filename or start line
                traceroutes[time]["maxhops"] = int(word[4])
                parser_state = PS_HEADERLINE
                
            elif ( parser_state in [PS_STARTLINE, PS_HEADERLINE, PS_LOGLINE]) and word[0].isdigit() and int(word[0]) > 0:
                # Logline found, e.g. "7  109.105.99.180  16.149 ms  16.133 ms  16.871 ms  16.850 ms  16.200 ms  16.173 ms"

                # Parse line
                adresses = []
                rtt = []
                tmp = None
                hop = int(word[0])

                new_ip_found_and_added = False
                for w in word[1:]:
                    w_dotsplit = w.split(".")
                    if w == "ms":
                        # RTT unit found. Ignore
                        pass
                    elif w == "*":
                        # No-response probe found
                        adresses.append(w)
                    elif w.replace('.','',1).isdigit():
                        # A number (int or float) found, assume to be RTT value
                        rtt.append(w)
                        if not new_ip_found_and_added:
                            # Add another copy of last added ip address since rtt found represents that address
                            if len(adresses)>0:
                                adresses.append(adresses[-1])
                            else:
                                tracesummary.parse_error()
                        new_ip_found_and_added = False
                    elif len(w_dotsplit) == 4 and (d.isdigit() for d in w_dotsplit):
                        # IPv4 address found
                        adresses.append(w)
                        new_ip_found_and_added = True
                    elif w == "[open]":
                        # tcptraceroute endport status found
                        tracesummary.count('tcp_routes_to_open')
                    elif w == "[closed]": 
                        # tcptraceroute endport status found
                        tracesummary.count('tcp_routes_to_closed')
                    elif w[0] == "!":
                        # ICMP error response found
                        adresses.append(w)
                    else:
                        if param["verbose"] > 2:
                            print("Warning: Strange string '" + w + "' found in traceroute line")
                        tracesummary.parse_error()

                # Store findings for current hop
                traceroutes[time]["result"][hop-1] = adresses
                traceroutes[time]["rtt"][hop-1] = rtt
                parser_state = PS_LOGLINE

            else:
                # Unrecognized line in traceroute
                if param["verbose"] > 2:
                    print ("Warning: Unrecognized line in traceroute: '" + line + "'") 
                tracesummary.parse_error()

        if time > 0 and "src" in traceroutes[time] and "dst" in traceroutes[time]:
            # Analyse also last traceroute in file
            if param['verbose'] > 2:
                print ("New traceroute run found at time ", time ,", analysing...")
            if len(traceroutes[time]["result"]) > traceroutes[time]["maxhops"]:
                # Update maxhops
                traceroutes[time]["maxhops"] = len(traceroutes[time]["result"]) 
            analyze(traceroutes[time], time, cursor)
            flush_analysis_state(cursor)      # Flush all state variables to DB
            
    except (KeyboardInterrupt, SystemExit) as e :
        # Flush all state variables to DB
        flush_analysis_state(cursor)  

    finally:

        if not mode in ["nosummary"]:
            # Output summary
            #tracesummary.print(traceroutes)
            tracesummary.print_all_pairs(thread)
            if param["verbose"] > 2 :
                print("General parse errors:", tracesummary.parse_errors)
            pass
        
        cursor.execute(('COMMIT'));
        close_db(cursor)

        if param['verbose'] > 0:
            print("Finished " + path + " in mode " , mode)


def sorted_json(js, result):
    """ Sort json structure on all levels
        Ref:  https://stackoverflow.com/questions/65886581/how-to-completely-sort-a-json-tree-alphabetically
    """
    def norm_str(s):
        # because of str special handling of single quotes
        return str(s).replace("'", '"')

    if type(js) in [int, str, bool, float] or js is None:
        return js

    if type(js) == list:
        res = [sorted_json(i, {}) for i in js]
        return sorted(res, key=norm_str)

    items = sorted(js.items(), key=itemgetter(0))
    for k, v in items:
        result[k] = sorted_json(v, {})

    return result

            
def amqp_read(url, mode, thread):
    """ 
    Read traceroute records from Rabbit message queue.
    PerfSONAR's trace-test format is expected
    """

    rmq_param = {
        "host": "localhost",
        "port": 5672,
        "vhost": "/",
        "exchange": "microdep-ana",
        "queue" : "",
        "user" : "guest",
        "passwd" : "guest"
    }
    
    # Parse Rabbitmq url
    pssrc_url = urlparse(url)
    if pssrc_url.scheme != "amqp":
        print("Error: --pssrc supports only amqp://")
        sys.exit(1)
    netloc = pssrc_url.netloc.split("@")
    if len(netloc)>1:      
        # Extract credentials
        creds = netloc[0].split(":")
        if len(creds)>1:
            (rmq_param["user"], rmq_param["passwd"]) = creds 
        netloc.pop(0)
    # Extract host and port
    hostloc = netloc[0].split(":")
    if len(hostloc)>1:
        (rmq_param["host"], rmq_param["post"]) = hostloc
    if len(hostloc)==1 and hostloc[0] != "" :
        rmq_param["host"] = hostloc[0]
    # Get queue specs
    if pssrc_url.path: 
        rmq_param["vhost"] = pssrc_url.path 
    query = dict(parse_qsl(pssrc_url.query))
    if "queue" in query:
        rmq_param["queue"] = query["queue"]
    if "exchange" in query:
        rmq_param["exchange"] = query["exchange"]

    if param['verbose'] > 2:
        print("Connecting to Rabbit message queue applying:'");
        pprint(rmq_param)
            
    # Connect to Rabbitmq server
    connection = pika.BlockingConnection(
        pika.ConnectionParameters(rmq_param["host"], rmq_param["port"], rmq_param["vhost"], pika.PlainCredentials(rmq_param["user"],rmq_param["passwd"]))
        #pika.connection.URLParameters(pssrc_url)
    )
    if not connection.is_open:
        print("Error: Connection to Rabbit message queue server failed")
        sys.exit(1)

    channel = connection.channel()
    if rmq_param["exchange"]:
        # Create exchange and queue
        channel.exchange_declare(exchange=rmq_param["exchange"], exchange_type='fanout')
        result = channel.queue_declare(queue=rmq_param["queue"], exclusive=True)
        # Update queue name in case of one-time-queue-name when only exchange is specified
        rmq_param["queue"] = result.method.queue
        channel.queue_bind(exchange=rmq_param["exchange"], queue=rmq_param["queue"])
        if param["verbose"] > 2:
            print("Exchange '%s' and queue '%s' declared and bound." % (rmq_param["exchange"],rmq_param["queue"],)) 
    elif rmq_param["queue"]:
        # Create queue (in case it does not yet exist)
        channel.queue_declare(queue=rmq_param["queue"])
        if param["verbose"] > 2:
            print("Default exchange and queue '%s' declared." % rmq_param["queue"]) 

    # Setup callback function
    #channel.basic_consume(amqp_read_callback, queue=rmq_param["queue"], no_ack=True)
    channel.basic_consume(rmq_param["queue"], amqp_read_callback)

    # Initiate parsing and analysis in child process
    pid = os.fork()
    if pid == 0:
        # Child process. Reading only from pipe
        os.close(pssrc_w)
        read("", "", "", mode)
        sys.exit()

    # Parent process. No need to read from pipe
    os.close(pssrc_r)
        
    try:
        channel.start_consuming()

    except (KeyboardInterrupt, SystemExit) as e :
        # Wait for analysis child process to exit
        os.wait()

def amqp_read_callback(_ch, _method, _properties, body):
    """
    Callback function for Rabbit message queue reader
    """
    if param['verbose'] > 4:
        print ("Element fetched from Rabbit mq:")
        print("%s" % (body.decode("ascii")))

    element = json.loads(body.decode("ascii")) 

    # Acknowledge the rmq-message manually
    _ch.basic_ack(delivery_tag=_method.delivery_tag)

    # Add to resolver
    resolver.add(element["test"]["spec"]["source"])
    resolver.add(element["test"]["spec"]["dest"])

    if element["test"]["type"] != "trace":
        # Ignore results from other test types
        if param['verbose'] > 2:
            print ("Unrelevant test-type '%s' found. Ignoring." % (element["test"]["type"]))
        return
    
    if param['verbose'] > 3:
        print ("Traceroute test results from Rabbit mq:")
        print("%s" % (body.decode("ascii")))

    # Get timestamp
    starttime  = str(int(isodate.parse_datetime(element["run"]["start-time"]).timestamp()))
    # Generate pcheduler test id/checksum (based on /usr/lib/perfsonar/logstash/ruby/pscheduler_test_checksum.rb)
    testid_obj = {}
    testid_obj["test"] = element["test"]
#    testid_obj["observer_ip"] = "127.0.0.1"  # Assuming locahost as sender of results
#    testid_obj["observer_ip"] = "172.150.1.2"  # Assuming current host as sender of results
    testid_obj["observer_ip"] = None   # Seems to end up as "Null" (?!) after logstash pipeline element /usr/lib/perfsonar/logstash/pipeline/02-pscheduler_common.conf
    testid_obj["tool"] = element["tool"]["name"]
    sorted_testid_obj = sorted_json(testid_obj, {})
    cleaned_testid_obj = json.dumps(sorted_testid_obj)
    cleaned_testid_obj = cleaned_testid_obj.replace(" ","")
    cleaned_testid_obj = cleaned_testid_obj.encode('utf-8')
    testid = hashlib.sha256(cleaned_testid_obj).hexdigest()
    # Forward to queue
    data = "ps_testid " + testid + " " + starttime + " " + element["run"]["result-full"][0]["diags"]
    #data = starttime + " " + element["run"]["result-full"][0]["diags"]
    pssrc_pipe_input.write(data)
    if param["verbose"] > 3:
        print("Wrote to pipe: '" + data + "'")
    try:
        pssrc_pipe_input.flush()
    except:
        # Ignore flush errors
        pass

        
           
# #   M a i n   t h r e a d   # #   

if __name__ == "__main__":

    #Finds logs to analyze and runs the rest of the program

    param = parse_cmd(param)   # Update default parameters in param[]

    if param["dbtype"] == "postgresql":
        import psycopg2        # Postgresql
    if param["pssrc"] != "":
        import isodate
        import pika        

    if param["ipv6" ]:
        print("Error: Parsing of Ipv6 addresses not yet supported.")
        sys.exit()
        
    asn_lookup = geoip2.database.Reader(param['geodb'])  # Instansiate ASN lookup object
    resolver = Resolver(param['namemap'])  # Initiate ip-to-name and name-to-ip resolver 

    cursor = connect_db(param)   # Connect to DB
    prepare_db(cursor, param)    # Create tables if not already created
    close_db(cursor)
    
    if len(param['file']) > 0:
              
        # Apply specific traceroute files as input
        thr = 0
        for tracefile in param['file']:
            srchost = tracefile.split("/")[-3]    # Extract source host (?)
            srcdate = tracefile.split("/")[-2]    # Extract date for source host (?)
            if not srchost :
                print ("Error: No sourcehost found in file path")
                sys.exit()
            if not srcdate :
                print ("Error: No source date found in file path")
                sys.exit()
            if param['live'] > 0:
                thr += 1
                # Create separat process to enable analysis with "tail -f" behavior
                pid = os.fork()
                if pid == 0:
                    # Child process
                    os.nice(5)    # Give process a bit lower priority than normal
                    read(tracefile, srchost, srcdate, "nosummary", thr)  # Analyse whole file
                    read(tracefile, srchost, srcdate, "live", thr)  # Analyse tail and follow file
                    sys.exit()
                    
                # Parent process
                if param['verbose'] > 1:
                    print("Forked child ", pid)
            elif param['profiler'] > 0:
                cProfile.run('read(tracefile, srchost, srcdate, "batch", thr)' ) # Analyse
            else:
                read(tracefile, srchost, srcdate, "batch", thr)  # Analyse
        if thr > 0:
            try:
                # Wait for child processes to finish
                os.wait()
            except (KeyboardInterrupt, SystemExit) as e :
                # Limit noise on stderr
                pass
                
    else:    
        if param['date']:
            # Search for files based on date
            date = param['date']
            mode = "batch"
            
        elif param['live'] > 0:
            # Apply files based on today's date in live mode
            date = datetime.date(datetime.now())
            mode = "live"
        elif param['pssrc']:
            # Read from perfSONAR data source applying today's date
            date = datetime.date(datetime.now())
            mode = 'pssrc'
            amqp_read(param['pssrc'], mode, 0) 
            sys.exit()
        else:
            # Should never come here
            print('Error: To few arguments.')
            sys.exit()
            
        #print(str(int(time.time())))
        path = param['path']     # Base path to search for relevant traceroute files (given date)
            
        thr = 0       # No of prallell procs strated
        thr_done = 0  # Procs completed
        # Find relevant traceroute files based on date and start analysis for each
        for srcfolder in os.listdir(path):
            for datefolder in os.listdir(path + "/" + srcfolder + "/"):
                if str(datefolder) != str(date): #Skips logs from other dates
                    continue

                for filename in os.listdir(path + "/" + srcfolder + "/" + datefolder + "/"):
                    prefix = "tcp" if param["tcp"] > 0 else ""
                    if filename.startswith(prefix + "traceroute"):
                        filepath = str(path + "/" + srcfolder + "/" + datefolder + "/" + filename)
                        if param['live'] > 0:
                            thr += 1
                            # Create separat process to enable analysis with "tail -f" behavior
                            sys.stdout.flush()   # Ensure stdout buffer is empty to avoid child proc inherit io content
                            pid = os.fork()
                            if pid == 0:
                                # Child process
#                                os.nice(5)    # Give process a bit lower priority than normal
                                read(filepath, srcfolder, datefolder, "nosummary", thr)  # Analyse whole file
                                read(filepath, srcfolder, datefolder, "live", thr)  # Analyse tail and follow file
                                sys.exit()
                                
                            # Parent process
                            if param['verbose'] > 1:
                                print("Forked child ", pid)
                        else:
                            while thr - thr_done >= int(param["maxprocs"]):
                                # Wait for a child process to exit
                                status = os.wait()  
                                thr_done += 1
                                
                            thr += 1
                            # Create separat process for analysis
                            sys.stdout.flush()   # Ensure stdout buffer is empty to avoid child proc inherit io content
                            pid = os.fork()
                            if pid == 0:
                                # Child process
#                                os.nice(5)    # Give process a bit lower priority than normal
                                read(filepath, srcfolder, datefolder, "batch", thr)  # Analyse whole file
                                sys.exit()
                                
                            # Parent process
                            if param['verbose'] > 1:
                                print("Forked child ", pid)
                                
        if param["verbose"] > 2:
            print ("Main process is waiting for " + str(thr - thr_done) + " child processes to complete or an SIGINT...")
        # Child processes are running
        try:
            while thr > thr_done:
                # Wait for child processes to finish
                os.wait()
                thr_done += 1
                    
        except (KeyboardInterrupt, SystemExit) as e :
            # Limit noise on stderr
            pass


