#!/bin/bash
#
# Send Query string to Opensearch instance
#

HOST="localhost"
CREDS=`sed 's| |:|' /etc/perfsonar/opensearch/opensearch_login`
ACTION="GET"
IPV="-4"

function usage {
    echo "Run api command towards Opensearch server"
    echo "`basename $0` [-h] [options] api-command-path [json-input-structure]"
    echo "  -h           Help message."
    ecoh "  -H hostname  Host name and port (default $HOST)"
    echo "  -G           Apply GET (default)"
    echo "  -P           Apply POST and read json from stdin"
    echo "  -D           Apply DELETE"
    exit 1;
}

FDATE=`date -I`
TFIELD="@timestamp"

# Parse arguments
while getopts ":H:hDPG" opt; do
    case $opt in
	H)
	    HOST=$OPTARG
	    ;;
	P)
	    ACTION="POST"
	    ;;
	G)
	    ACTION="GET"
	    ;;
	D)
	    echo -n "Applying DELETE. Are your sure (y/N)? "
	    read yesno
	    if [ -z $yesno ]; then exit 1; fi
	    if [ ! ${yesno:0:1} = "y" -a ! ${yesno:0:1} = "Y" ]; then
		exit 1;
	    fi
	    ACTION="DELETE"
	    ;;
	h)
	    usage
	    ;;
	\?)
	    echo "Invalid option: -$OPTARG" >&2
	    exit 1
	    ;;
	:)
	    echo "Option -$OPTARG requires an argument." >&2
	    exit 1
	    ;;
    esac
done
shift $(($OPTIND - 1))  # (Shift away parsed arguments)


if [ $# -lt 1 ]; then
    usage
fi

curl --insecure $IPV -u $CREDS https://$HOST:9200/$1
