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

# Fix default locals
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US.UTF-8
ENV LC_COLLATE=C
ENV LC_CTYPE=en_US.UTF-8

# Install management packages
RUN yum clean all && yum -y update && yum install -y  coreutils man-db nano emacs git openssh-client net-tools iputils-ping traceroute tcpdump curl bind9-host unzip gnupg software-properties-common 

# Fiks tcpdump issue for priveledge mode
RUN mv /usr/sbin/tcpdump /usr/bin/tcpdump
RUN ln -s /usr/bin/tcpdump /usr/sbin/tcpdump

# Install the EPEL RPM
RUN yum install -y epel-release
# Point CentOS installation at the perfSONAR main yum repository
RUN rpm -hUv http://software.internet2.edu/rpms/el7/x86_64/latest/packages/perfSONAR-repo-0.10-1.noarch.rpm
# Install the staging yum repository where test versions of the software are kept.
RUN yum install -y perfSONAR-repo-staging
RUN yum update -y

# Install and explicitly init postgres (since initialisation seems to not happen "by it self") 
#
# Based on a Dockerfile at
# https://raw.githubusercontent.com/zokeber/docker-postgresql/master/Dockerfile
# and
# https://raw.githubusercontent.com/perfsonar/perfsonar-testpoint-docker/master/systemd/Dockerfile

RUN yum install -y postgresql10-server

# Postgresql version
ENV PG_VERSION 10
ENV PGVERSION 10

# Set the environment variables
ENV PGDATA /var/lib/pgsql/10/data

# Initialize the database
RUN su - postgres -c "/usr/pgsql-10/bin/pg_ctl init"

# Overlay the configuration files
COPY perfsonar-testpoint-docker/postgresql/postgresql.conf /var/lib/pgsql/$PG_VERSION/data/postgresql.conf
COPY perfsonar-testpoint-docker/postgresql/pg_hba.conf /var/lib/pgsql/$PG_VERSION/data/pg_hba.conf

# Change own user
RUN chown -R postgres:postgres /var/lib/pgsql/$PG_VERSION/data/*

#Start postgresql and install perfSONAR
ARG TYPE
#RUN su - postgres -c "/usr/pgsql-10/bin/pg_ctl start -w -t 60" \
#RUN nohup bash -c "/lib/systemd/systemd &" && sleep 4 \
RUN su - postgres -c "/usr/pgsql-10/bin/pg_ctl -D /var/lib/pgsql/10/data -l logfile start -W -t 60" \
    && yum install -y perfsonar-$TYPE perfsonar-toolkit-security \
    && yum clean all \
    && rm -rf /var/cache/yum

# Rsyslog
# Note: need to modify default CentOS7 rsyslog configuration to work with Docker, 
# as described here: http://www.projectatomic.io/blog/2014/09/running-syslog-within-a-docker-container/
COPY perfsonar-testpoint-docker/rsyslog/rsyslog.conf /etc/rsyslog.conf
COPY perfsonar-testpoint-docker/rsyslog/listen.conf /etc/rsyslog.d/listen.conf
COPY perfsonar-testpoint-docker/rsyslog/python-pscheduler.conf /etc/rsyslog.d/python-pscheduler.conf
COPY perfsonar-testpoint-docker/rsyslog/owamp-syslog.conf /etc/rsyslog.d/owamp-syslog.conf

#RUN yum -y install postgresql10-server sudo && sudo -u postgres /usr/pgsql-10/bin/initdb --no-locale --encoding=UTF8 --auth='ident' /var/lib/pgsql/10/data/ && \
#RUN \
#    systemctl enable postgresql-10 && \
#RUN \
#    yum -y install perfsonar-$TYPE

#COPY etc/perfsonar-$TYPE/lsregistrationdaemon.conf /etc/perfsonar/lsregistrationdaemon.conf
# Set management gui user/password to admin/notadminnono
#RUN if [ "$TYPE" = "toolkit" ]; then yum -y install httpd-tools && htpasswd -c -b /etc/perfsonar/toolkit/psadmin.htpasswd admin notadminnono ; fi

# Add default tests (apply empty-file-trick to avoid errors when building)
COPY empty-file-do-not-remove *etc/perfsonar-$TYPE/psconfig/pscheduler.d/toolkit-webui.json /etc/perfsonar/psconfig/pscheduler.d/
RUN rm /etc/perfsonar/psconfig/pscheduler.d/empty-file-do-not-remove


# Prepare for feeding measurement via Rabbit message queue server
#RUN yum -y install rabbitmq-server python3-pika && systemctl enable rabbitmq-server.service 

#COPY etc/rabbitmq.json /etc/pscheduler/default-archives/rabbitmq.json
#COPY etc/rabbitmq.json /etc/perfsonar/psconfig/archives.d/

# Rabbitmq debugging tools
COPY bin/mfeit-rabbit-consume.py /root
COPY bin/consume.pl /root

# Add gap-analytics. NOTE: Assumes qstream-gap-ana is avaiable (https://scm.uninett.no/iou/microdep)
#RUN yum -y install perl-App-cpanminus perl-Statistics-Basic perl-DateTime perl-JSON-XS perl-File-ShareDir-Install perl-Test-Exception perl-AnyEvent perl-ExtUtils-MakeMaker perl-version perl-Readonly perl-namespace-clean perl-Devel-GlobalDestruction perl-File-ShareDir perl-List-MoreUtils perl-Class-Data-Inheritable perl-Test-Simple perl-Test-Deep 
#RUN cpanm AnyEvent::RabbitMQ
#RUN yum -y install perl-ExtUtils-MakeMaker perl-Test-Simple
#RUN cpanm Statistics::LineFit 
#COPY bin/qstream-gap-ana /root

EXPOSE 80
EXPOSE 443

# Add tool for adding transmission delay and loss
COPY bin/delay-loss-setup.sh /usr/local/bin

# Run systemd as in "parent"-image
CMD ["/lib/systemd/systemd"]
