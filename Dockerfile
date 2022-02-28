# Dockerfile to build perfSONAR test node
# To build
#   - cd to folder, run "docker build -t perfsonar-testpoint . "
#   - if git clone with ssh is applied, cd to folder, run "DOCKER_BUILDKIT=1 docker build --ssh default -t perfsonar-testpoint . "
#
# NOTE: This contain is customized for Uninett stamnett, and assumes the user building the container has ssh public keys registered i Uninett LDAP DB
#       such that GitLab on scm.uninett.no may be accessed
#
# To run container with systemd operative in none-priviledge mode (may not work...)
#   docker run -d --tmpfs /tmp --tmpfs /run -v /sys/fs/cgroup:/sys/fs/cgroup:ro --net=host --name perfsonar-testpoint --rm -p 80:8099 perfsonar-testpoint 
#
# ... or in privilede-mode
#   docker run -d --privileged --net=host --name perfsonar-testpoint --rm -p 80:8099 perfsonar-testpoint
#
# syntax=docker/dockerfile:experimental

FROM ubuntu:bionic
MAINTAINER Otto J Wittner <wittner@uninett.no>

# Install management packages
ENV DEBIAN_FRONTEND=noninteractive
RUN ln -fs /usr/share/zoneinfo/Europe/Oslo /etc/localtime  # To install tzdata quietly 
RUN apt-get update && apt-get -y upgrade && apt-get install -y apt-utils nano git openssh-client net-tools iputils-ping traceroute curl bind9-host unzip gnupg software-properties-common man-db

# Add perfsonar repository
RUN curl -s -o /etc/apt/sources.list.d/perfsonar-release.list http://downloads.perfsonar.net/debian/perfsonar-release.list
RUN curl -s http://downloads.perfsonar.net/debian/perfsonar-official.gpg.key | apt-key add -
RUN add-apt-repository universe
RUN apt-get update

# Install full perfsonar suit
RUN apt-get --download-only --no-install-recommends -y install perfsonar-testpoint
#RUN apt-get --download-only -y install perfsonar-testpoint
# Fix missing example conf file in perfsonar-lsregistrationdaemon package
RUN mkdir -p /usr/share/doc/perfsonar-lsregistrationdaemon/examples/
RUN curl -s -o /usr/share/doc/perfsonar-lsregistrationdaemon/examples/lsregistrationdaemon.conf https://github.com/perfsonar/ls-registration-daemon/raw/master/etc/lsregistrationdaemon.conf
RUN apt-get --no-install-recommends -y install perfsonar-testpoint
#RUN apt-get -y install perfsonar-testpoint
#ENTRYPOINT ["/bin/sleep","365d"]
EXPOSE 80
# Start container with systemd
RUN apt-get install -y systemd
STOPSIGNAL SIGRTMIN+3
CMD [ "/sbin/init" ]
