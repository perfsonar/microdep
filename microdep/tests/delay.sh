#!/bin/bash
#
# Add/remove network delay and packet drops on interface 
# applying 'tc qdisc netem'
#

LINK="both"
LOSSTYPE="iptables"
LOSSPORTRANGE="8760:9960"
LOSSPROTO="udp"

function usage {
    # Output help info.
    echo "Add emulated loss and delay to network traffic"
    echo "Usage: `basename $0` [options] [interface-name]"
    echo "  -d <delay in ms>  Add delay to link(s)"
    echo "  -l <loss %>       Add packet loss to link(s)"
    echo "  -r                Remove delay and/or packet loss"
    echo "  -i                Input direction only"
    echo "  -o                Output direction only"
    echo "  -s                Show status"
    echo "  -n                Set losstype to 'tc-netem'. Default '$LOSSTYPE'."
    echo "  -p portrange      Portrange for iptable based loss. Default $LOSSPORTRANGE."
    echo "  -T                Add iptable based loss to TCP traffic (instead of UDP)."
    echo "  -I                Add iptable based loss to ICMP traffic (instead of UDP)."
    exit 1
}    

# Parse arguments
while getopts ":d:l:p:riosTInh" opt; do
    case $opt in
	h)
	    usage
	    ;;
        d)
	    # Clean up
	    REMOVE="yes"
    	    # Add delay
	    DELAY=${OPTARG}
            ;;
        l)
	    # Clean up
	    REMOVE="yes"
    	    # Add packet dropping
	    LOSS=${OPTARG}
            ;;
        p)
	    # Set portrange
	    LOSSPORTRANGE=${OPTARG}
            ;;
        r)
            # Remove delay and/or drop
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
	    # SHOW STATUS
	    SHOW="yes"
	    ;;
        n)
    	    # Set loss type
	    LOSSTYPE="tc-netem"
            ;;
	T)
	    # SHOW STATUS
	    LOSSPROTO="tcp"
	    ;;
	I)
	    # SHOW STATUS
	    LOSSPROTO="icmp"
	    ;;
	h)
	    # SHOW STATUS
	    SHOW="yes"
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

if [ $# -lt 1 ]; then
    # No interface specified. Apply interface for default route
    IF=$(ip route | grep default | awk '{print $5}')
else
    IF=$1
fi

if [ "${REMOVE}" ]; then
    # Clean up
    TC=$(tc qdisc show dev $IF | grep netem; tc filter show dev $IF; tc qdisc show dev ifb0 2> /dev/null)
    if [ "$TC" ]; then
	tc qdisc delete dev $IF root
	tc qdisc delete dev ifb0 root
	tc filter delete dev $IF parent ffff: 
	tc qdisc delete dev $IF ingress 
	rmmod ifb
    fi
    # Drop all iptable rules with probailistic drop-rules
#    for p in $(iptables -L | grep probability | awk '{print $13}'); do
    for p in $(iptables -L | grep probability | awk '{ if ( length($13) > 0 ) print $13; else print $10 }'); do
	if [ "$LOSSPROTO" = "icmp" ]; then
	    iptables -D INPUT -i $IF -p "$LOSSPROTO" -m statistic --mode random --probability $p -j DROP 2> /dev/null
	    iptables -D OUTPUT -o $IF -p "$LOSSPROTO" -m statistic --mode random --probability $p -j DROP 2> /dev/null
	    ip6tables -D INPUT -i $IF -p "$LOSSPROTO" -m statistic --mode random --probability $p -j DROP 2> /dev/null
	    ip6tables -D OUTPUT -o $IF -p "$LOSSPROTO" -m statistic --mode random --probability $p -j DROP 2> /dev/null
	else
	    iptables -D INPUT -i $IF -p "$LOSSPROTO" --match multiport --dports "$LOSSPORTRANGE" -m statistic --mode random --probability $p -j DROP 2> /dev/null
	    iptables -D OUTPUT -o $IF -p "$LOSSPROTO" --match multiport --dports "$LOSSPORTRANGE" -m statistic --mode random --probability $p -j DROP 2> /dev/null
	    ip6tables -D INPUT -i $IF -p "$LOSSPROTO" --match multiport --dports "$LOSSPORTRANGE" -m statistic --mode random --probability $p -j DROP 2> /dev/null
	    ip6tables -D OUTPUT -o $IF -p "$LOSSPROTO" --match multiport --dports "$LOSSPORTRANGE" -m statistic --mode random --probability $p -j DROP 2> /dev/null
	fi
    done
fi

if [ "${DELAY}" -o "${LOSS}" ]; then
    NETEM="netem"
    if [ "${DELAY}" ]; then
	# Add delay
	NETEM="$NETEM delay ${DELAY}ms"
    fi
    if [ "${LOSS}" -a "$LOSSTYPE" = "tc-netem" ]; then
	# Add loss with some burstiness
	NETEM="$NETEM loss random ${LOSS}% 50%"
    fi
    if [  "${LINK}" = "output"  -o  "${LINK}" = "both"  ]; then
	# Add to outgoing link
	tc qdisc add dev $IF root ${NETEM}
    fi
    if [  "${LINK}" = "input" -o "${LINK}" = "both"  ]; then
	# Add to incoming link 
	#modprobe ifb
	ip link add name ifb0 type ifb
	ip link set dev ifb0 up
	tc qdisc add dev $IF ingress
	tc filter add dev $IF parent ffff: protocol ip u32 match u32 0 0 flowid 1:1 action mirred egress redirect dev ifb0
	tc qdisc add dev ifb0 root ${NETEM}
    fi
fi

if [ "$LOSS" -a "$LOSSTYPE" = "iptables" ]; then
    # Add loss via iptables filtering
    PROB=$(echo "$LOSS" | LC_ALL=C awk '{printf "%.2f", $1 / 100}')
    if [  "${LINK}" = "output"  -o  "${LINK}" = "both"  ]; then
	if [ "$LOSSPROTO" = "icmp" ]; then
	    iptables -A OUTPUT -o $IF -p "$LOSSPROTO" -m statistic --mode random --probability $PROB -j DROP
	    ip6tables -A OUTPUT -o $IF -p "$LOSSPROTO" -m statistic --mode random --probability $PROB -j DROP
	else
	    iptables -A OUTPUT -o $IF -p "$LOSSPROTO" --match multiport --dports "$LOSSPORTRANGE" -m statistic --mode random --probability $PROB -j DROP
	    ip6tables -A OUTPUT -o $IF -p "$LOSSPROTO" --match multiport --dports "$LOSSPORTRANGE" -m statistic --mode random --probability $PROB -j DROP
	fi
    fi    
    if [  "${LINK}" = "input" -o "${LINK}" = "both"  ]; then
	if [ "$LOSSPROTO" = "icmp" ]; then
	    iptables -A INPUT -i $IF -p "$LOSSPROTO" -m statistic --mode random --probability $PROB -j DROP
	    ip6tables -A INPUT -i $IF -p "$LOSSPROTO" -m statistic --mode random --probability $PROB -j DROP
	else
	    iptables -A INPUT -i $IF -p "$LOSSPROTO" --match multiport --dports "$LOSSPORTRANGE" -m statistic --mode random --probability $PROB -j DROP
	    ip6tables -A INPUT -i $IF -p "$LOSSPROTO" --match multiport --dports "$LOSSPORTRANGE" -m statistic --mode random --probability $PROB -j DROP
	fi
    fi
fi

if [ "${SHOW}" ]; then
    # Show status for tc and qdisc
    echo "# Interface '$IF':"
    TC=$(tc qdisc show dev $IF | grep netem; tc filter show dev $IF; tc qdisc show dev ifb0 2> /dev/null)
    if [ "$TC" ]; then
	echo "$TC"
    else
	echo "No delay or loss added via 'tc qdisc netem'."
    fi

    if [ "$LOSSTYPE" = "iptables" ]; then
	# Show iptables
	IPT=""
	IPT_RES=$(iptables -vL INPUT | grep probability)
	if [ "$IPT_RES" ]; then
	    IPT="INPUT:\n$IPT_RES\n"
	fi
	IPT_RES=$(iptables -vL OUTPUT | grep probability)
	if [ "$IPT_RES" ]; then
	    IPT="${IPT}OUTPUT:\n$IPT_RES\n"
	fi
	IPT_RES=$(ip6tables -vL INPUT | grep probability)
	if [ "$IPT_RES" ]; then
	    IPT="${IPT}INPUT6:\n$IPT_RES\n"
	fi
	IPT_RES=$(ip6tables -vL OUTPUT | grep probability)
	if [ "$IPT_RES" ]; then
	    IPT="${IPT}OUTPUT6:\n$IPT_RES\n"
	fi
	if [  "$IPT" ]; then
	    echo -e "\n# Iptables:"
	    echo -e "$IPT"
	else
	    echo "No loss added via 'iptables'. "
	fi
    fi
fi
