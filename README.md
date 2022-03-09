# perfSONAR in Ubuntu container

Docker-stuff to enable perfSONAR in a container.

A script to set up firewall rules (applying "ufw") is also available.

To build container run

    docker build -t perfsonar-testpoint .

To run container with systemd operative in none-priviledge mode (may not work...)

    docker run -d --tmpfs /tmp --tmpfs /run -v /sys/fs/cgroup:/sys/fs/cgroup:ro --net=host --name perfsonar-testpoint --rm -p 80:8099 perfsonar-testpoint 

... or in privilede-mode

    docker run -d --privileged --net=host --name perfsonar-testpoint --rm  perfsonar-testpoint

... and then apply perfsonar tools

Note apache2 inside the container will attempt to bind to port 80.

To get global ip for container: 

    docker run -d --privileged --net=none --name perfsonar-testpoint --rm perfsonar-testpoint
	sudo ~/pipework/pipework eth0 perfsonar-testpoint dhclient
    docker exec -it perfsonar-testpoint ifconfig eth1

