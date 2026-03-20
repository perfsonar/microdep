#!/bin/bash

#####
# Helper script to output a archive definition for analytic results from e.g. Microdep add-on. 
#
# Params:
#   -n hostname: A valid hostname of the archive server. Defaults to the output of `hostname -f` 
#   -a authtype: Authorization. Valid values are 'basic', 'none' and 'ip' ('ip' is equivalent to 'none'). Default is 'basic'.
####

LOGSTASH_PATH="logstash-ana"
PS_ARCH_CONF_SCRIPT="/usr/lib/perfsonar/archive/perfsonar-scripts/psconfig_archive.sh"
ARCHIVE_HOSTNAME=$(hostname -f)
AUTH="basic"

function usage {
    # Output help info.
    echo "Output an archive definition for analytic results from e.g. Microdep add-on."
    echo "Usage: `basename $0` [options] "
    echo "  -n hostname       Hostname of archive server. Default is the output of 'hostname -f' "
    echo "  -a auth-type      Authorization type. Valid values are 'basic', 'none' and 'ip'. Default is '$AUTH'."
    echo "  -p path           Path (added to hostname) to logstash. Default is '$LOGSTASH_PATH'."
    echo "  -h                Help message."
    exit 1
}    

# Parse arguments
while getopts ":n:a:p:h" opt; do
    case $opt in
	h)
	    usage
	    ;;
        n)
	    ARCHIVE_HOSTNAME=${OPTARG}
            ;;
        a)
	    AUTH=${OPTARG}
            ;;
        p)
	    LOGSTASH_PATH=${OPTARG}
            ;;
        \?)
            echo "Invalid option: -$OPTARG" >&2
	    usage
            exit 1
            ;;
        :)
            echo "Option -$OPTARG requires an argument." >&2
	    usage
            exit 1
            ;;
    esac
done
shift $(($OPTIND - 1))  # (Shift away parsed arguments)

# Run "mother" script and fix'n'filter output
$PS_ARCH_CONF_SCRIPT -n "$ARCHIVE_HOSTNAME" -a "$AUTH" |
    sed -e "s|/logstash\"|/$LOGSTASH_PATH\"|g" \
	-e 's/"schema": 3/"schema": 1/' \
	-e '/x-ps-observer/d' \
	-e '/esmond_url/d' \
	-e '/_meta/d' -e '/},/d'


