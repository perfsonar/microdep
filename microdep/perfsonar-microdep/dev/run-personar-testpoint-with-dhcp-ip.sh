#! /bin/bash
#
#

docker run -d --privileged --net=none --name perfsonar-testpoint --rm perfsonar-testpoint
sudo ~/pipework/pipework eth0 perfsonar-testpoint dhclient-f U:testpoint1
docker exec -it perfsonar-testpoint ifconfig eth1 
