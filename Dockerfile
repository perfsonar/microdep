# Dockerfile to build perfSONAR  node
# To build, cd to folder and run
#
#     docker build --build-arg TYPE=<node-variant> -t perfsonar-<node-variant> ."
#
# where <node-variant> may be "testpoint" og "toolkit" 
#
# To run container with systemd operative in none-priviledge mode (may not work...)  
#   docker run -d --tmpfs /tmp --tmpfs /run -v /sys/fs/cgroup:/sys/fs/cgroup:ro --net=host --name perfsonar-testpoint --rm perfsonar-testpoint
#   docker run -d --tmpfs /tmp --tmpfs /run -v /sys/fs/cgroup:/sys/fs/cgroup:ro --net=host --name perfsonar-toolkit --rm perfsonar-toolkit
#
# ... or in privilede-mode
#   docker run -d --privileged --net=host --name perfsonar-testpoint --rm perfsonar-testpoint
#   docker run -d --privileged --net=host --name perfsonar-toolkit --rm perfsonar-toolkit
#
# Apply pipeworks to give container its own dhcp address (set TYPE to relevant variant):
#
#    TYPE='toolkit|testpoint' && \
#    docker run -d --privileged --net=none --name perfsonar-${TYPE} --rm perfsonar-${TYPE} && \
#    sudo ~/pipework/pipework eth0 perfsonar-${TYPE} dhclient-f U:${TYPE} && \
#    docker exec -it perfsonar-${TYPE} ifconfig eth1 
#


#FROM ubuntu:bionic
# Ref: https://github.com/dhoppeIT/docker-ubuntu-systemd/blob/master/ubuntu-18.04.Dockerfile
#FROM  dhoppeit/docker-ubuntu-systemd:18.04
#FROM docker-ubuntu-systemd:latest 
FROM perfsonar-in-container_systemd-image:latest
MAINTAINER Otto J Wittner <wittner@uninett.no>

# Install management packages
ENV DEBIAN_FRONTEND=noninteractive

RUN ln -fs /usr/share/zoneinfo/Europe/Oslo /etc/localtime  # To install tzdata quietly 
RUN apt-get update && apt-get -y upgrade && apt-get install -y apt-utils coreutils man-db nano git openssh-client net-tools iputils-ping traceroute tcpdump curl bind9-host unzip gnupg software-properties-common 
# Fiks tcpdump issue for priveledge mode
RUN mv /usr/sbin/tcpdump /usr/bin/tcpdump
RUN ln -s /usr/bin/tcpdump /usr/sbin/tcpdump

# Add perfsonar repository
RUN curl -s -o /etc/apt/sources.list.d/perfsonar-release.list http://downloads.perfsonar.net/debian/perfsonar-release.list
RUN curl -s http://downloads.perfsonar.net/debian/perfsonar-official.gpg.key | apt-key add -
RUN add-apt-repository universe
RUN apt-get update

# Install full perfsonar suit
ARG TYPE
RUN apt-get --download-only --no-install-recommends -y install perfsonar-$TYPE
# Fix missing example conf file in perfsonar-lsregistrationdaemon package
RUN mkdir -p /usr/share/doc/perfsonar-lsregistrationdaemon/examples/
RUN curl -s -o /usr/share/doc/perfsonar-lsregistrationdaemon/examples/lsregistrationdaemon.conf https://raw.githubusercontent.com/perfsonar/ls-registration-daemon/master/etc/lsregistrationdaemon.conf
RUN apt-get --no-install-recommends -y install perfsonar-$TYPE
COPY etc/perfsonar-$TYPE/lsregistrationdaemon.conf /etc/perfsonar/lsregistrationdaemon.conf
# Set management gui user/password to admin/notadminnono
RUN if [ "$TYPE" = "toolkit" ]; then htpasswd -b /etc/perfsonar/toolkit/psadmin.htpasswd admin notadminnono ; fi
# Fix missing python package for applied by pscheduler
RUN apt-get -y install python3-cryptography
# Prepare for feeding measurement via Rabbit message queue server
RUN apt-get -y install rabbitmq-server 
#COPY etc/rabbitmq.json /etc/pscheduler/default-archives/rabbitmq.json
COPY etc/rabbitmq.json /etc/perfsonar/psconfig/archives.d/
# Add default tests
COPY empty-file-do-not-remove *etc/perfsonar-$TYPE/psconfig/pscheduler.d/toolkit-webui.json /etc/perfsonar/psconfig/pscheduler.d/
COPY empty-file-do-not-remove *etc/perfsonar-$TYPE/psconfig/pscheduler.d/toolkit-webui.json /etc/perfsonar/psconfig/pscheduler.d/

EXPOSE 80
EXPOSE 443

# Add tool for adding transmission delay and loss
COPY bin/delay-loss-setup.sh /usr/local/bin

# Run systemd as in "parent"-image
CMD ["/lib/systemd/systemd"]
