#/bin/bash
#
# Setup bridge for perfSONAR containers to be applying dhcp
#
# (Source: https://github.com/devplayer0/docker-net-dhcp)
#

if [ $#  -lt 1 ]; then
    echo "Usage: ${0##*/} external-interface"
    exit 1
fi

echo "WARNING: Adding this bridge may challenge the hosts network connection as more IP-addresses are asked for via dhcp."
echo -n "Continue (N/y)? "
read yesno
if [[ "Yy" != *"${yesno:0:1}"* ]]; then
    exit 0;
fi

IF=$1
#DHCP_CLIENT="dhcpcd"
DHCP_CLIENT="dhclient"

# Create the bridge
sudo ip link add ps-bridge type bridge
sudo ip link set ps-bridge up

# Make sure relevant (LAN) interface is up
sudo ip link set $IF up
# Attach your network card to the bridge
sudo ip link set $IF master ps-bridge

# If your firewall's policy for forwarding is to drop packets, you'll need to add an ACCEPT rule
sudo iptables -A FORWARD -i ps-bridge -j ACCEPT

# Get an IP for the host (will go out to the DHCP server since eth0 is attached to the bridge)
# Replace this step with whatever network configuration you were using for eth0
sudo $DHCP_CLIENT ps-bridge
