#/bin/bash
#
# Setup bridge for perfSONAR containers to be applying dhcp
#

if [ $#  -lt 1 ]; then
    echo "Usage: $( basename $0) external-interface"
    exit 1
fi

IF=$1
DHCP_CLIENT="dhclient"

# Create the bridge
sudo ip link add ps-bridge type bridge
sudo ip link set ps-bridge up

# Assuming 'eth0' is connected to your LAN (where the DHCP server is)
sudo ip link set $IF up
# Attach your network card to the bridge
sudo ip link set $IF master ps-bridge

# If your firewall's policy for forwarding is to drop packets, you'll need to add an ACCEPT rule
sudo iptables -A FORWARD -i ps-bridge -j ACCEPT

# Get an IP for the host (will go out to the DHCP server since eth0 is attached to the bridge)
# Replace this step with whatever network configuration you were using for eth0
#sudo dhcpcd ps-bridge
sudo $DHCP_CLIENT ps-bridge
