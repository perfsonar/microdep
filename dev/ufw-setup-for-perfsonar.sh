#!/bin/bash
#
#  Set up firewall rules to support perfsonar
#

case $1 in
    "del")
	echo "Deleteing perfsonar rules..."
	sudo ufw delete allow proto tcp to any port 861 from any
	sudo ufw delete allow proto udp to any port 8760:9960 from any
	sudo ufw delete allow proto tcp to any port 862 from any 
	sudo ufw delete allow proto udp to any port 18760:19960 from any
	sudo ufw delete allow proto udp to any port 33434:33634 from any
	sudo ufw delete allow proto tcp to any port 5890:5900 from any
	sudo ufw delete allow proto tcp to any port 5000,5101 from any
	#  sudo ufw allow proto tcp to any port 5201 from any 
	#  sudo ufw allow proto tcp to any port 5001 from any
	#  sudo ufw allow proto ntp to any port 123 from any   
	sudo ufw delete allow proto tcp to any port 8085 from any
	sudo ufw delete allow proto tcp to any port 4435 from any
	echo "done."
	;;
    "add")
	echo "Adding perfsonar rules..."
	sudo ufw allow proto tcp to any port 861 from any comment 'Allow access to owamp control in perfsonar test container'
	sudo ufw allow proto udp to any port 8760:9960 from any comment 'Allow access to owamp tests in perfsonar test container'
	sudo ufw allow proto tcp to any port 862 from any comment 'Allow access to twam control in perfsonar test container'
	sudo ufw allow proto udp to any port 18760:19960 from any comment 'Allow access to twamp tests in perfsonar test container'
	sudo ufw allow proto udp to any port 33434:33634 from any comment 'Allow access to traceroute in perfsonar test container'
	sudo ufw allow proto tcp to any port 5890:5900 from any comment 'Allow access to simplestream in perfsonar test container'
	sudo ufw allow proto tcp to any port 5000,5101 from any comment 'Allow access to nuttcp in perfsonar test container'
	#  sudo ufw allow proto tcp to any port 5201 from any comment 'Allow access to iperf3 in perfsonar test container'
	#  sudo ufw allow proto tcp to any port 5001 from any comment 'Allow access to iperf2 in perfsonar test container'
	#  sudo ufw allow proto ntp to any port 123 from any comment 'Allow access to ntp in perfsonar test container'
	echo "done."
	;;
    "api")
	echo "Adding perfsonar rules for web-api..."
	sudo ufw allow proto tcp to any port 8085 from any comment 'Allow access to http server in perfsonar toolkit container'
	sudo ufw allow proto tcp to any port 4435 from any comment 'Allow access to https server in perfsonar toolkit container'
	;;
    *)
	echo "Usage: `basename $0` add|del"
	exit;
esac

