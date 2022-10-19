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


FROM perfsonar-in-container_systemd-image:latest
MAINTAINER Otto J Wittner <wittner@sikt.no>

# Install management packages
#ENV DEBIAN_FRONTEND=noninteractive

#RUN ln -fs /usr/share/zoneinfo/Europe/Oslo /etc/localtime  # To install tzdata quietly

RUN yum clean all && yum -y update && yum -y install -y coreutils man-db nano emacs git openssh-client net-tools iputils-ping traceroute tcpdump curl bind9-host unzip gnupg software-properties-common

# Fiks tcpdump issue for priveledge mode
#RUN mv /usr/sbin/tcpdump /usr/bin/tcpdump
#RUN ln -s /usr/bin/tcpdump /usr/sbin/tcpdump

# Point CentOS installation at the perfSONAR main yum repository
RUN rpm -hUv http://software.internet2.edu/rpms/el7/x86_64/latest/packages/perfSONAR-repo-0.10-1.noarch.rpm
# Install the staging yum repository where test versions of the software are kept.
RUN yum -y install perfSONAR-repo-staging
RUN yum -y update

# Install full perfsonar suit
ARG TYPE
# Fix missing example conf file in perfsonar-lsregistrationdaemon package
#RUN mkdir -p /usr/share/doc/perfsonar-lsregistrationdaemon/examples/
#RUN curl -s -o /usr/share/doc/perfsonar-lsregistrationdaemon/examples/lsregistrationdaemon.conf https://raw.githubusercontent.com/perfsonar/ls-registration-daemon/master/etc/lsregistrationdaemon.conf
RUN rpm -Va --nofiles --nodigest
RUN yum -y install perfsonar-$TYPE
#COPY etc/perfsonar-$TYPE/lsregistrationdaemon.conf /etc/perfsonar/lsregistrationdaemon.conf
# Set management gui user/password to admin/notadminnono
RUN if [ "$TYPE" = "toolkit" ]; then htpasswd -b /etc/perfsonar/toolkit/psadmin.htpasswd admin notadminnono ; fi
# Fix missing python package for applied by pscheduler
#RUN yum -y install python3-cryptography

# Prepare for feeding measurement via Rabbit message queue server
RUN yum -y install rabbitmq-server python3-pika
# Add queue policy with geneous max queue size
#RUN rabbitmqctl set_policy my-pol "^200-meg$" '{"max-length-bytes":209715200}' --apply-to queues
#COPY etc/rabbitmq.json /etc/pscheduler/default-archives/rabbitmq.json
COPY etc/rabbitmq.json /etc/perfsonar/psconfig/archives.d/
# Add default tests (apply empty-file-trick to avoid errors when building)
COPY empty-file-do-not-remove *etc/perfsonar-$TYPE/psconfig/pscheduler.d/toolkit-webui.json /etc/perfsonar/psconfig/pscheduler.d/
RUN rm /etc/perfsonar/psconfig/pscheduler.d/empty-file-do-not-remove
# Rabbitmq debugging tools
COPY bin/mfeit-rabbit-consume.py /root

# Add gap-analytics. NOTE: Assumes qstream-gap-ana is avaiable (i.e. has been cloned from https://scm.uninett.no/iou/microdep/-/raw/master/bin/qstream-gap-ana)
RUN yum -y install libstatistics-linefit-perl libstatistics-basic-perl libdatetime-perl libjson-xs-perl libanyevent-rabbitmq-perl
COPY bin/qstream-gap-ana /root

EXPOSE 80
EXPOSE 443

# Add tool for adding transmission delay and loss
COPY bin/delay-loss-setup.sh /usr/local/bin


# Run systemd as in "parent"-image
CMD ["/lib/systemd/systemd"]
