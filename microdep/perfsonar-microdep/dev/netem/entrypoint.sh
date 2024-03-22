#!/bin/bash
#  This entrypoint configurator assumes a star-topology ala
#
#      toolkit --- toolkit-net--- netem --- testpoint-net ---- testpoint_1
#                      |                          |    | `---- testpoint_2
#                      `------- docker host ------'    `------ testpoint_3
#
#     * netem adds routes in toolkit and testpoints containers to enable traffic to flow between toolkit and testpoints via netem
#     * netem also adds traffic impairments (i.e. loss and delay) on the path between testpoints and toolkit


# Add impaiments to transit traffic by adding delay and loss to outgoing interfaces (except lo)
ifconfig | grep "^\S" | cut -f1 -d" "| while read i; do
    if [ $i != 'lo' ]; then
	echo -n Adding delay and loss to $i ...
	tc qdisc add dev $i root netem delay 10ms loss 30% 80%
	if [ $? -eq 0 ]; then echo done; else echo failed. ; fi
    fi
done

# Enable ip forwarding in netem
echo -n "Enabling forwarding ..."
echo 1 > /proc/sys/net/ipv4/ip_forward
if [ $? -eq 0 ]; then echo "done."; else echo "failed." ; fi

# Add required routes in testpoint and toolkit  contaniers to make netem transit node
docker ps -q -f name="testpoint" |
    while read pid; do
	echo -n "Adding route to testpoint (pid $pid) ..."
	nsenter -n -t $(docker inspect --format {{.State.Pid}} $pid) ip route add 172.150.1.0/24 via 172.150.2.200
	if [ $? -eq 0 ]; then echo "done."; else echo "failed." ; fi
    done
docker ps -q -f name="toolkit" |
    while read pid; do
	echo -n "Adding route to toolkit (pid $pid) ..."
	nsenter -n -t $(docker inspect --format {{.State.Pid}} $pid) ip route add 172.150.2.0/24 via 172.150.1.200
	if [ $? -eq 0 ]; then echo "done."; else echo "failed." ; fi
    done

# Sleep forever (an let kernel do forwarding)
echo "Sleeping (and forwarding)..."
sleep infinity
