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


FROM microdep-in-perfsonar_systemd-image:latest
MAINTAINER Otto J Wittner <wittner@sikt.no>

# Fix default locals
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US.UTF-8
ENV LC_COLLATE=C
ENV LC_CTYPE=en_US.UTF-8

# ---- D o w n l o a d   a n d   i n s t a l l   p a c k a g e s  ------

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
RUN mkdir -p /var/run/postgresql && chown postgres.postgres /var/run/postgresql \
    && su - postgres -c "/usr/pgsql-10/bin/pg_ctl -D /var/lib/pgsql/10/data start -w -t 120" \
#su - postgres -c "/usr/pgsql-10/bin/pg_ctl -D /var/lib/pgsql/10/data -l logfile start -W -t 60" \
    && yum install -y perfsonar-$TYPE perfsonar-toolkit-security \
    && yum clean all \
    && rm -rf /var/cache/yum

RUN if [ "$TYPE" = "toolkit" ]; then \
       # Add Opensearch dashboards ("Kibana")
       yum -y install opensearch-dashboards && systemctl enable opensearch-dashboards.service ; \
    fi
RUN if [ "$TYPE" = "toolkit" ]; then \
       # Add Grafana visualisation server
       sudo yum -y install wget; \
       cd /tmp; \
       wget https://dl.grafana.com/oss/release/grafana-9.3.2-1.x86_64.rpm; \
       sudo yum -y install grafana-9.3.2-1.x86_64.rpm; \
       systemctl enable grafana-server.service; \
    fi

# Add Rabbit message queue packages
RUN yum -y install rabbitmq-server python36-pika && systemctl enable rabbitmq-server.service 

# Add packages required by microdep analytics.
#   - qstream-gap-ana dependencies:
RUN yum -y install perl-App-cpanminus perl-Statistics-Basic perl-DateTime perl-JSON-XS perl-File-ShareDir-Install perl-Test-Exception perl-AnyEvent perl-ExtUtils-MakeMaker perl-version perl-Readonly perl-namespace-clean perl-Devel-GlobalDestruction perl-File-ShareDir perl-List-MoreUtils perl-Class-Data-Inheritable perl-Test-Simple perl-Test-Deep perl-YAML-LibYAML wget
RUN cpanm AnyEvent::RabbitMQ
RUN yum -y install perl-ExtUtils-MakeMaker perl-Test-Simple
RUN cpanm Statistics::LineFit
#  - trace_event_reader dependencies
RUN yum -y install python36-mysql gcc python3-devel
RUN pip3 install multidict typing_extensions yarl async_timeout idna_ssl aiosignal cchardet charset_normalizer
RUN pip3 install geoip2
COPY etc/microdep/GeoLite2-ASN.mmdb /usr/share/GeoIP/

# Fetch css, js and other source-files for Microdep
COPY microdep/server/script/*  /usr/lib/perfsonar/microdep/
RUN  mkdir -p /usr/lib/perfsonar/microdep/js
RUN if [ "$TYPE" = "toolkit" ]; then \
       wget -P /usr/lib/perfsonar/microdep/js/ -i /usr/lib/perfsonar/microdep/list-of-external-sources.txt; \
    fi

# ----  E n d   d o w n l o a d s   a n d   p a c k a g e   i n s t a l l   ----

# Patch postgres-load to apply user "postgress" as default
RUN chmod +w /usr/bin/postgresql-load \
    &&  sed -i 's|die "Unable to determine PostgreSQL user."|PG_USER="postgres" && echo "Applying default user."|g' /usr/bin/postgresql-load
# Reconfigure prefsonar Postgres DB (start db server first)
RUN mkdir -p /var/run/postgresql && chown postgres.postgres /var/run/postgresql \
    && su - postgres -c "/usr/pgsql-10/bin/pg_ctl -D /var/lib/pgsql/10/data start -w -t 120" \
    && /usr/libexec/pscheduler/internals/db-update \
    && /usr/libexec/pscheduler/internals/db-change-password

# Rsyslog
# Note: need to modify default CentOS7 rsyslog configuration to work with Docker, 
# as described here: http://www.projectatomic.io/blog/2014/09/running-syslog-within-a-docker-container/
COPY perfsonar-testpoint-docker/rsyslog/rsyslog.conf /etc/rsyslog.conf
COPY perfsonar-testpoint-docker/rsyslog/listen.conf /etc/rsyslog.d/listen.conf
COPY perfsonar-testpoint-docker/rsyslog/python-pscheduler.conf /etc/rsyslog.d/python-pscheduler.conf
COPY perfsonar-testpoint-docker/rsyslog/owamp-syslog.conf /etc/rsyslog.d/owamp-syslog.conf

# Make ntdp stay root and stop attempting to update system clock
RUN sed -i 's|-u ntp:ntp ||g' /usr/lib/systemd/system/ntpd.service
RUN echo "disable kernel" >> /etc/ntp.conf

# Fix bind issue for memcached
RUN sed -i 's|-l 127.0.0.1,::1|-l 0.0.0.0,::|' /etc/sysconfig/memcached

RUN if [ "$TYPE" = "toolkit" ]; then \
# Fix JNA and temp-file issue with Opensearch and Logstash,
       sed -i 's|${OPENSEARCH_TMPDIR}|/var/log/opensearch|g' /etc/opensearch/jvm.options; \
       sed -i 's|#-Djava.io.tmpdir=$HOME|-Djava.io.tmpdir=/var/log/logstash|g' /etc/logstash/jvm.options; \
# Increase startup timeout and add auto restart for Opensearch
       sed -i 's|TimeoutStartSec=75|TimeoutStartSec=600\nRestart=on-failure\nRestartSec=10s|g' /usr/lib/systemd/system/opensearch.service; \
# Fix template error for Logstash
       cp /usr/share/logstash/vendor/local_gems/022abded/logstash-output-opensearch/lib/logstash/outputs/opensearch/templates/ecs-disabled/1x.json /usr/share/logstash/vendor/local_gems/022abded/logstash-output-opensearch/lib/logstash/outputs/opensearch/templates/ecs-disabled/2x.json; \
# Fix SSL problems with proxy towards Opensearch
       cp /etc/opensearch/node.pem /etc/opensearch/both.pem; \
       sed 's|PRI|RSA PRI|g' /etc/opensearch/node-key.pem >> /etc/opensearch/both.pem; \
       sed -i 's|ProxyPass|    SSLProxyVerify none\n    SSLProxyCheckPeerCN off\n    SSLProxyCheckPeerName off\n    SSLProxyCheckPeerExpire off\n    SSLProxyMachineCertificateFile /etc/opensearch/both.pem\n    ProxyPass|' /etc/httpd/conf.d/apache-opensearch.conf; \
    fi

# Set management gui user/password to admin/notadminnono
#RUN if [ "$TYPE" = "toolkit" ]; then yum -y install httpd-tools && htpasswd -c -b /etc/perfsonar/toolkit/psadmin.htpasswd admin notadminnono ; fi

# Add default tests (apply empty-file-trick to avoid errors when building)
#COPY empty-file-do-not-remove *etc/perfsonar-$TYPE/psconfig/pscheduler.d/toolkit-webui.json /etc/perfsonar/psconfig/pscheduler.d/
COPY empty-file-do-not-remove *etc/perfsonar-$TYPE/psconfig/pscheduler.d/microdep-tests.json /etc/perfsonar/psconfig/pscheduler.d/
RUN rm /etc/perfsonar/psconfig/pscheduler.d/empty-file-do-not-remove

# Prepare for feeding measurement via Rabbit message queue server
#COPY etc/rabbitmq.json /etc/pscheduler/default-archives/rabbitmq.json
#COPY etc/rabbitmq.json /etc/perfsonar/psconfig/archives.d/
# Arciving is now specified in microdep-tests.json

# Add some Rabbitmq and Opensearch debugging tools
COPY bin/mfeit-rabbit-consume.py /usr/local/bin
COPY bin/consume.pl /usr/local/bin 
COPY bin/json2table.pl /usr/local/bin
COPY bin/opensearch-query.sh /usr/local/bin

#  Make Logstash feed analytic results to Opensearch
COPY etc/logstash/from-gap-ana.conf /etc/logstash/conf.d/
RUN if [ "$TYPE" = "toolkit" ]; then \
       #echo -e "opensearch_admin_user=admin\nopensearch_admin_password=admin" >> /etc/perfsonar/logstash/logstash_sysconfig; \
       USER=`awk -F " " '{print $1}' /etc/perfsonar/opensearch/opensearch_login` && sed -i "s|\${opensearch_admin_user}|$USER|g" /etc/logstash/conf.d/from-gap-ana.conf; \
       PASSWD=`awk -F " " '{print $2}' /etc/perfsonar/opensearch/opensearch_login` && sed -i "s|\${opensearch_admin_password}|$PASSWD|g" /etc/logstash/conf.d/from-gap-ana.conf; \
       mkdir -p /var/lib/logstash/microdep && chmod 777 /var/lib/logstash/microdep; \
    fi

# Fix host address, username and password for Opensearch dashboard ("Kibana")
RUN if [ "$TYPE" = "toolkit" ]; then \
       sed -i 's/# server.host: "localhost"/server.host: "0.0.0.0"/' /etc/opensearch-dashboards/opensearch_dashboards.yml; \
       USER=`awk -F " " '{print $1}' /etc/perfsonar/opensearch/opensearch_login` && sed -i "s|opensearch.username: kibanaserver|opensearch.username: $USER|g" /etc/opensearch-dashboards/opensearch_dashboards.yml; \
       PASSWD=`awk -F " " '{print $2}' /etc/perfsonar/opensearch/opensearch_login` && sed -i "s|opensearch.password: kibanaserver|opensearch.password: $PASSWD|g" /etc/opensearch-dashboards/opensearch_dashboards.yml; \
    fi

#  A d d   M i c r o d e p   m a p   w e b   G U I
# Add http config and html+js+ccs stuff
COPY etc/httpd/apache-microdep-gui.conf /etc/httpd/conf.d
# Moved to download/install: COPY microdep/server/script/*  /usr/lib/perfsonar/microdep/
RUN ln -s /usr/lib/perfsonar/microdep /root
RUN cd /usr/lib/perfsonar/microdep/; ln -s microdep-map.html index.html
# Fix cross origin mess and missing/obsolite/missplaced css, js and other source-files
# Moved to download/install: RUN mkdir /usr/lib/perfsonar/microdep/js
# Moved to download/install: RUN wget -P /usr/lib/perfsonar/microdep/js/ -i /usr/lib/perfsonar/microdep/list-of-external-sources.txt
RUN sed -i \
    -e 's|<link rel="stylesheet" href="/uninett-bootstrap-theme/css/bootstrap.min.css">||' \
    -e 's|<link rel="stylesheet" href="/uninett-theme/css/uninett.css">||' \
    -e 's|; @import url("/styles.css");||' \
    -e 's|https://.*\(/.*\.js"\)|js\1|' \
    -e 's|https://.*\(/.*\.css"\)|js\1|' \
    -e 's|//.*\(/.*\.js"\)|js\1|' \
    -e 's|//.*\(/.*\.css"\)|js\1|' \
    -e 's|/js/ajax-loader.gif|"js/ajax-loader.gif"|' \
    -e 's|favicon.ico|/toolkit/favicon.ico|'    /usr/lib/perfsonar/microdep/microdep-map.html
RUN mv /usr/lib/perfsonar/microdep/stats.js /usr/lib/perfsonar/microdep/js/
RUN mv /usr/lib/perfsonar/microdep/ajax-loader.gif /usr/lib/perfsonar/microdep/js/
COPY etc/microdep/marker-*.png /usr/lib/perfsonar/microdep/js/images/
# Move inline css to file
#RUN sed  -n '/<style type=/{n;:a;p;n;/<\/style>/!ba;s/.*//p;}' /usr/lib/perfsonar/microdep/microdep-map.html > /usr/lib/perfsonar/microdep/js/microdep-map.css
#RUN sed -i 's|\(<style type=.*>\)|<link rel="stylesheet" href="js/microdep-map.css">\n\1|'  /usr/lib/perfsonar/microdep/microdep-map.html
#RUN sed -i '/<style type=/,/<\/style>/d' /usr/lib/perfsonar/microdep/microdep-map.html
# Open up security restrictions
#RUN sed -i 's|</head>|<meta http-equiv="Content-Security-Policy" content="default-src * ; img-src * http://* https://*; style-src * https://* http://*; script-src * https://* http://*" />\n</head>|' /usr/lib/perfsonar/microdep/microdep-map.html
# CGI support for perl
#RUN yum install -y perl-CGI
# Fiks some perl libs
RUN sed -i 's|::Simple||' /usr/lib/perfsonar/microdep/microdep-config.cgi
RUN sed -i "s|YAML|YAML::XS|g" /usr/lib/perfsonar/microdep/yaml-to-json.cgi
# Add and adjust to support global/Dragonlab topology (and remove Uninett topology)
RUN sed -i '/uninett:/,$d' /usr/lib/perfsonar/microdep/mapconfig.yml
RUN sed -i 's|/var/lib/microdep|/usr/lib/perfsonar/microdep|' /usr/lib/perfsonar/microdep/microdep-config.yml
COPY etc/microdep/dragonlab*.json /usr/lib/perfsonar/microdep/dragonlab/
COPY etc/microdep/mp-names.txt /usr/lib/perfsonar/microdep/mp-dragonlab/etc/
COPY etc/microdep/mp-address.txt /usr/lib/perfsonar/microdep/mp-dragonlab/etc/
COPY etc/microdep/rude-list.cfg /usr/lib/perfsonar/microdep/mp-dragonlab/etc/
COPY etc/microdep/rude-extra.cfg /usr/lib/perfsonar/microdep/mp-dragonlab/etc/
COPY bin/do-mvar-config /usr/local/bin/
# Init Microdep config db
RUN if [ "$TYPE" = "toolkit" ]; then \
        sqlite3 /usr/lib/perfsonar/microdep/mp-dragonlab/etc/microdep.db "CREATE TABLE peers(id integer primary key autoincrement, from_name, to_name, start integer, end integer, type, timestamp);" ; \
        sqlite3 /usr/lib/perfsonar/microdep/mp-dragonlab/etc/microdep.db "CREATE TABLE members(id integer primary key autoincrement, datetime,name, user, dns, ip, rude_port, crude_port, ssh_port, status, timestamp);" ; \
        do-mvar-config -b /usr/lib/perfsonar/microdep -r /usr/lib/perfsonar/microdep -d "-1 day 0" -s; \
    fi
# Fix credentials ++ for accessing Opensearch
RUN if [ "$TYPE" = "toolkit" ]; then \
        USER=`awk -F " " '{print $1}' /etc/perfsonar/opensearch/opensearch_login` ;\
        PASSWD=`awk -F " " '{print $2}' /etc/perfsonar/opensearch/opensearch_login` ; \
        sed -i "s|http://admin:no+nz+br|https://$USER:$PASSWD|g" /usr/lib/perfsonar/microdep/elastic-get-date-type.pl; \
        sed -i "s|curl -X POST|curl -X POST --insecure|g" /usr/lib/perfsonar/microdep/elastic-get-date-type.pl; \
    fi

#   A d d   M i c r o d e p   a n a l y t i c s 
#    Gap analytics
#    (qstream-gap-ana is avaiable from https://scm.uninett.no/iou/microdep)
COPY bin/qstream-gap-ana /usr/local/bin
COPY etc/microdep/perfsonar-microdep-gap-ana.service /usr/lib/systemd/system/
RUN systemctl enable perfsonar-microdep-gap-ana.service
# Services which restart microdep services at 23:59 every evening. Note: Such restarts trigger output of required daily summary reports.
COPY etc/microdep/perfsonar-microdep-restart.service /usr/lib/systemd/system/
COPY etc/microdep/perfsonar-microdep-restart.timer /usr/lib/systemd/system/
RUN systemctl enable perfsonar-microdep-restart.timer
#    Traceroute analytics
COPY bin/create_new_db.sh /usr/local/bin
RUN mkdir -p /var/run/postgresql && chown postgres.postgres /var/run/postgresql \
    && su - postgres -c "/usr/pgsql-10/bin/pg_ctl -D /var/lib/pgsql/10/data start -w -t 120" \
    && create_new_db.sh -t postgres -d routingmonitor
COPY bin/trace_event_reader.py /usr/local/bin

#COPY etc/microdep/perfsonar-microdep-trace-ana.service /usr/lib/systemd/system/
#RUN systemctl enable perfsonar-microdep-trace-ana.service

# http web (use 443 instead!)
EXPOSE 80  
# https web
EXPOSE 443
# Opensearch (use https://<hostname>:443/opensearch/ instead)
#EXPOSE 9200
# Opensearch Dashboard   
EXPOSE 5601
# Grafana   
EXPOSE 3000   

# Run systemd as in "parent"-image
CMD ["/lib/systemd/systemd"]
