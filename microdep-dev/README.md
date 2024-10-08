# Microdep in perfSONAR - container based test environment

NOTE: Run `git submodule update --init --recursive` after cloning to init submodules

This project provides a docker container based test environment for integration of Microdep components into perfSONAR.

## Isolated test environment

The test environment applies `docker-compose` for multi-container management, hence assumes `docker.io` and `docker-compose` to be available. 

To prepare the test environment run:
  * `docker-compose build` or `OS=centos docker-compose build` to prepare a Centos based test environment
  * `OS=ubuntu docker-compose build` to prepare a Ubuntu based test environment

To initiate a test environment with a single toolkit node and N testpoint nodes run:
  * `docker-compose up --scale testpoint=<N>` with N=[1,10] for an Centos based setup
  * `OS=ubuntu docker-compose up --scale testpoint=<N>` with N=[1,10] for an Ubuntu based setup

The perfSONAR webadmin GUI is made available via `http://<container-host>:8085/toolkit`.

The Microdep map GUI is made available via `http://<container-host>:8085/microdep`

Opensearch dashboards (Kibana) may also be enabled with `docker exec microdep-in-perfsonar_toolkit_1 systemctl start opensearch-dashboards` and accessed via `http://<container-host>:5601`.

Note that docker-compose will initiate a network emulator (gaiaadm/pumba) for each testpoint node to add impairments to the testpoint nodes network interface.

## Test enviroment with external IPs

Container may be build directly with docker by running 

    TYPE='toolkit|testpoint' && docker build --buildargs TYPE=${TYPE} -t perfsonar-${TYPE} .

.. applying relevant node type.

To run container with systemd operative in none-priviledge mode (may not work...)

    TYPE='toolkit|testpoint' && docker run -d --tmpfs /tmp --tmpfs /run -v /sys/fs/cgroup:/sys/fs/cgroup:ro --net=host --name perfsonar-${TYPE} perfsonar-${TYPE} 

... or in priviledge-mode

    TYPE='toolkit|testpoint' && docker run -d --privileged --net=host --name perfsonar-${TYPE} --rm  perfsonar-${TYPE}

... and then apply perfsonar tools

Note apache2 inside the container will attempt to bind to port 80. Add e.g. `-p 8085:80` to map container port 80 to host port 8085. 

To aquire a global ip via dhcp for a container run: 

    TYPE='toolkit|testpoint' && docker run -d --privileged --net=none --name perfsonar-${TYPE} --rm perfsonar-${TYPE} && sudo ~/pipework/pipework eth0 perfsonar-${TYPE} dhclient-f U:${TYPE} && docker exec -it perfsonar-${TYPE} ifconfig eth1 

.. which assumes "pipework" is avaiable in ~/pipework (git clone https://github.com/jpetazzo/pipework.git )

A script to set up firewall rules with `ufw` is available.


## Cgroup v2 issues

The systemd image applied is designed to work for (legacy) cgroup v1 and v2 environments. Hence when running docker on a newer linux system (e.g. Ubuntu 22.04) with a kernel which by default supports cgrop v2 only (unified cgroup hierarchy) a kernel boot parameter needs to be added:

  * Edit `/etc/defaults/grub`
  * Add `systemd.unified_cgroup_hierarchy=false` to `GRUB_CMDLINE_LINUX_DEFAULT`
  * Run `sudo update-grub`
  * Reboot (in normal mode)
