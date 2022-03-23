# perfSONAR in Ubuntu container

Docker-stuff to enable perfSONAR in a container.

A script to set up firewall rules (applying "ufw") is also available.

To build container run

    TYPE='toolkit|testpoint' && docker build --buildargs TYPE=${TYPE} -t perfsonar-${TYPE} .

.. applying relevant node type.

To run container with systemd operative in none-priviledge mode (may not work...)

    TYPE='toolkit|testpoint' && docker run -d --tmpfs /tmp --tmpfs /run -v /sys/fs/cgroup:/sys/fs/cgroup:ro --net=host --name perfsonar-${TYPE} perfsonar-${TYPE} 

... or in priviledge-mode

    TYPE='toolkit|testpoint' && docker run -d --privileged --net=host --name perfsonar-${TYPE} --rm  perfsonar-${TYPE}

... and then apply perfsonar tools

Note apache2 inside the container will attempt to bind to port 80.

To get global ip via dhcp for container: 


    TYPE='toolkit|testpoint' && docker run -d --privileged --net=none --name perfsonar-${TYPE} --rm perfsonar-${TYPE} && sudo ~/pipework/pipework eth0 perfsonar-${TYPE} dhclient-f U:${TYPE} && docker exec -it perfsonar-${TYPE} ifconfig eth1 

.. which assumes "pipework" is avaiable in ~/pipework (git clone https://github.com/jpetazzo/pipework.git )


To run perfsonar is an isolated enviroment with one testpoint and one toolkit-node do

    docker-compose up 
