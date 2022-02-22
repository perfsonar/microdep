# perfSONAR in Ubuntu container

Docker-stuff to enable perfSONAR in a container.

A script to set up firewall rules (applying "ufw") is also available.

To build container run

    docker build -t testing/perfsonar .

To run stuff

    docker run --net=host -it testing/perfsonar /bin/bash
	
... and then apply perfsonar tools

