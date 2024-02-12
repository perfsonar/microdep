#!/bin/bash
#
# Add/remove network delay and/or loss
#
# Author: Otto J Wittner
#

LINK="both"
DELAY=""
LOSS=""
REMOVE="no"
SHOW="no"

function qdisc_action {
    # Check if qdisc is operative for interface
    # Return "change" if so and "add" if not
    IF=$1
    QDISC_ACTION="add"
    if [ $(tc qdisc | grep netem | grep -c $IF ) -gt 0 ]; then
	# Outgoing qdisc already added. Do "change" instead
	QDISC_ACTION="change"
    fi
    echo $QDISC_ACTION
}
    

# Parse arguments
while getopts ":d:l:rios" opt; do
    case $opt in
        d)
	    DELAY=${OPTARG}
	    ;;
        l)
	    LOSS=${OPTARG}
	    ;;
        r)
            REMOVE="yes"
            ;;
	i)
	    # INPUT ONLY
	    LINK="input"
	    ;;
	o)
	    # OUTPUT ONLY
	    LINK="output"
	    ;;
	s)
	    SHOW="yes"
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

if [ $# -lt 1 ]
then
    # No parameters given. Output help info.
    echo "Usage: `basename $0` [-iors] [-d <ms>] [-l <loss %>] interface-name"
    echo "  -d <delay in ms>  Add emulated delay to link(s)"
    echo "  -l <loss in %>    Add emulated loss to link(s)"
    echo "  -r                Remove all added emulations"
    echo "  -i                Input direction only"
    echo "  -o                Output direction only"
    echo "  -s                Show added emulations"
    exit 1
fi

IF=$1
TC_TAIL=""

if [ $DELAY ]; then
    # Add delay to tc string
    TC_TAIL="${TC_TAIL} delay ${DELAY}ms"
fi
if [ $LOSS ]; then
    # Add delay to tc string
    TC_TAIL="${TC_TAIL} loss ${LOSS}%"
fi

if [ "$LOSS" -o "$DELAY" ]; then
    echo -n "Adding..."
    # Add delay and/or loss
    if [  ${LINK} = "output"  -o  ${LINK} = "both"  ]
    then
	# Add to outgoing link
	tc qdisc $(qdisc_action $IF) dev $IF root netem ${TC_TAIL}
    fi
    if [  ${LINK} = "input"  -o  ${LINK} = "both"  ]
    then
	# Prepare for adding to incoming link 
	modprobe ifb
	ip link set dev ifb0 up
	tc qdisc add dev $IF ingress 2>/dev/null
	tc filter add dev $IF parent ffff: protocol ip u32 match u32 0 0 flowid 1:1 action mirred egress redirect dev ifb0 2>/dev/null
	# Add to incoming link 
	tc qdisc $(qdisc_action ifb0) dev ifb0 root netem ${TC_TAIL}
    fi
    echo "done."
fi

if [ $REMOVE = "yes" ]; then
    # Remove all
    echo -n "Removing..."
    tc qdisc delete dev $IF root 2> /dev/null
    tc qdisc delete dev ifb0 root 2> /dev/null
    tc filter delete dev $IF parent ffff:  2> /dev/null
    tc qdisc delete dev $IF ingress 2> /dev/null
    rmmod ifb 2> /dev/null
    echo "done."
fi

if [ $SHOW = "yes" ]; then
    # Show status for tc and qdisc
    tc qdisc show dev $IF
    tc filter show dev $IF
    tc qdisc show dev ifb0 2> /dev/null
fi

