%define install_base        /usr/lib/perfsonar/
%define microdep_bin_base   %{install_base}/bin
%define command_base        %{microdep_bin_base}/microdep_commands
%define config_base         /etc/perfsonar
%define microdep_config_base         %{config_base}/microdep
%define doc_base            /usr/share/doc/perfsonar/microdep
%define microdep_web_dir    %{install_base}/microdep-map

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			perfsonar-microdep
Version:		%{perfsonar_auto_version}
Release:		%{perfsonar_auto_relnum}%{?dist}
Summary:		perfSONAR Microdep Analysis
License:		ASL 2.0
Group:			Development/Libraries
URL:			http://www.perfsonar.net
Source0:		perfsonar-microdep-%{version}.tar.gz
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch
Requires:               perfsonar-microdep-map
Requires:               perfsonar-microdep-ana

%description
Meta-package pulling in packaged required for Microdep Analytics in perfSONAR

%package map
Summary:		Microdep map web GUI presenting analytic results
Group:			Applications/Communications
#Requires:               perfsonar-toolkit >= 5.0.7
Requires:		httpd
Requires:               mod_ssl
Requires:		perl >= 5.32
Requires:               perl(CGI) 
Requires:		perl(Data::Dumper)
Requires:               perl(DBI) 
Requires:		perl(Getopt::Long)
Requires:		perl(JSON)
Requires:		perl(LWP::Simple)
Requires:		perl(Socket)
Requires:		perl(strict)
Requires:		perl(URI)
Requires:		perl(warnings)
Requires:		perl(YAML)
Requires:               js-jquery
#Requires:               perfsonar-tracetree
Requires:               chartjs = 4.4.2
Requires:               d3js = 4
Requires:               hammerjs = 2.0.8
Requires:               leafletjs = 1.0.3
Requires:               momentjs = 2.27.0
Requires:               select2js = 4.0.0
%{?systemd_requires: %systemd_requires}
#BuildRequires:          systemd

%description map
Web GUI presenting Microdep analytic results in a map view

%package ana
Summary:		Microdep analytic toolset to analize perfSONAR datasets
Group:			Applications/Communications
# Rabbit message queue
#Requires:               perfsonar-toolkit >= 5.0.7
BuildRequires:          centos-release-rabbitmq-38
Requires:               rabbitmq-server
Requires:		perl >= 5.32
# qstream_gap_ana
Requires:               perl(Socket)
Requires:               perl(Statistics::LineFit)
Requires:               perl(Statistics::Basic)
Requires:               perl(Getopt::Long)
Requires:               perl(Time::Local)
#Requires:               perl(POSIX(strftime))
Requires:               perl(POSIX)
Requires:               perl(Data::Dumper)
Requires:               perl(constant)
Requires:               perl(sigtrap)
Requires:               perl(LWP::Simple)
Requires:               perl(AnyEvent::RabbitMQ)
#Requires:               perl-AnyEvent-RabbitMQ
Requires:               perl(Net::AMQP)
#Requires:               perl-Net-AMQP
Requires:               perl(URI)
Requires:               perl(JSON::PP)
Requires:               perl(Chart::Clicker)
# trace_event_reader.py
Requires:               postgresql-server
Requires:               python3-psycopg2
Requires:               python3-mysqlclient
Requires:               gcc
Requires:               python3-devel
Requires:               python3-multidict
#Requires:               typing_extensions
Requires:               python3-yarl
#Requires:               async_timeout
#Requires:               idna_ssl
Requires:               python3-aiosignal
#Requires:               cchardet
#Requires:               charset_normalizer
Requires:               python3-attrs
Requires:               python3-pika

%{?systemd_requires: %systemd_requires}
#BuildRequires:          systemd

%description ana
Analytic scripts to process perfSONAR data sets and generate events. Events may be viualized by Microdep map.

%prep
%setup -q

%install
rm -rf %{buildroot}
pwd & ls -l
make ROOTPATH=%{buildroot}/%{install_base} CONFIGPATH=%{buildroot}/%{microdep_config_base} install

# Install systemd services
mkdir -p %{buildroot}/%{_unitdir}
install -D -m 0644 -t %{buildroot}/%{_unitdir} %{buildroot}/%{install_base}/scripts/*.service
# Move psconfig, httpd and logstash configs into correct folders
install -D -m 0644 -t %{buildroot}/%{config_base}/psconfig/pscheduler.d/ %{buildroot}/%{microdep_config_base}/psconfig/pscheduler.d/microdep-tests.json
install -D -m 0644 -t %{buildroot}/etc/httpd/conf.d/ %{buildroot}/%{microdep_config_base}/apache-microdep-map.conf
install -D -m 0644 -t %{buildroot}/%{install_base}/logstash/pipeline/microdep %{buildroot}/%{microdep_config_base}/logstash/microdep/*

# Clean up copied/unrequired files
rm -rf %{buildroot}/%{install_base}/scripts
rm -f %{buildroot}/%{install_base}/Makefile
rm -rf %{buildroot}/%{microdep_config_base}/psconfig/pscheduler.d/
rm -rf %{buildroot}/%{microdep_config_base}/apache-microdep-map.conf
rm -rf %{buildroot}/%{microdep_config_base}/logstash/

%clean
rm -rf %{buildroot}

%post map
# Make js libs available
ln -s /usr/share/javascript/jquery/latest/jquery.min.js %{microdep_web_dir}/js/jquery.min.js
ln -s /usr/share/javascript/d3js/d3.v4.js %{microdep_web_dir}/js/
ln -s /usr/share/javascript/hammerjs/2.0.8/hammer.js %{microdep_web_dir}/js/
ln -s /usr/share/javascript/leafletjs/1.0.3/leaflet.css %{microdep_web_dir}/css/
ln -s /usr/share/javascript/leafletjs/1.0.3/leaflet.js %{microdep_web_dir}/js/
ln -s /usr/share/javascript/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.css %{microdep_web_dir}/css/
ln -s /usr/share/javascript/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.js %{microdep_web_dir}/js/
ln -s /usr/share/javascript/leaflet-markercluster/1.0.3/MarkerCluster.Default.css %{microdep_web_dir}/css/
ln -s /usr/share/javascript/leaflet-markercluster/1.0.3/MarkerCluster.css %{microdep_web_dir}/css/
ln -s /usr/share/javascript/leaflet-markercluster/1.0.3/leaflet.markercluster-src.js %{microdep_web_dir}/js/
ln -s /usr/share/javascript/momentjs/2.27.0/moment.js %{microdep_web_dir}/js/
ln -s /usr/share/javascript/select2/4.0.0/css/select2.min.css %{microdep_web_dir}/css/
ln -s /usr/share/javascript/select2/4.0.0/js/select2.min.js %{microdep_web_dir}/js/
ln -s /usr/share/javascript/select2/4.0.0/css/select2.min.css %{microdep_web_dir}/css/
ln -s /usr/share/javascript/select2/4.0.0/js/select2.min.js %{microdep_web_dir}/js/

# Adjust config path
/usr/bin/sed -i 's|/var/lib/mircodep|%{configbase}|'  %{microdep_config_base}/microdep-config.yml

# Init Microdep config db
%{command_base}/microdep-psconfig-load.pl -c --db %{microdep_config_base}/microdep.db %{config_base}/psconfig/pscheduler.d/microdep-tests.json
mkdir -p %{microdep_web_dir}/mp-dragonlab/etc/ 
ln -s %{microdep_web_dir}/mp-dragonlab/etc/ %{microdep_config_base}/microdep.db

# Fix credentials and ingnore certificates to ensure access to Opensearch
USER=`awk -F " " '{print $1}' /etc/perfsonar/opensearch/opensearch_login`
PASSWD=`awk -F " " '{print $2}' /etc/perfsonar/opensearch/opensearch_login`
sed -i "s|http://admin:no+nz+br|https://$USER:$PASSWD|g" %{command_base}/elastic-get-date-type.pl
sed -i "s|curl -X POST|curl -X POST --insecure|g" %{command_base}/elastic-get-date-type.pl

%post ana
# Create db
%{command_base}/create_new_db.sh -t postgres -d routingmonitor

# Enable Microdep pipeline for logstash
echo -e "- path.config: /usr/lib/perfsonar/logstash/pipeline/microdep/*.conf\n  pipeline.id: microdep" >> /etc/logstash/pipelines.yml
# Add microdep index pattern to pscheduler user ... but this require opensearch to run...
#sed -i "s|- 'pscheduler_\*'|- 'pscheduler_\*'\n      - 'dragonlab\*'|" opensearch/opensearch-security/roles.yml; \
#sed -i "s|- 'pscheduler\*'|- 'pscheduler\*'\n      - 'dragonlab\*'|" opensearch/opensearch-security/roles.yml; \
#/usr/share/opensearch/plugins/opensearch-security/tools/securityadmin.sh -f /etc/opensearch/opensearch-security/roles.yml -icl -nhnv -cert /etc/opensearch/admin.pem -cacert /etc/opensearch/root-ca.pem -key /etc/opensearch/admin-key.pem -t config
# ... substitute in user+passwd instead
USER=`awk -F " " '{print $1}' /etc/perfsonar/opensearch/opensearch_login` && sed -i "s|\${opensearch_admin_user}|$USER|g" %{install_base}/logstash/pipeline/microdep/03-microdep-outputs.conf
PASSWD=`awk -F " " '{print $2}' /etc/perfsonar/opensearch/opensearch_login` && sed -i "s|\${opensearch_admin_password}|$PASSWD|g" %{install_base}/logstash/pipeline/microdep/03-microdep-outputs.conf
mkdir -p /var/lib/logstash/microdep && chmod 777 /var/lib/logstash/microdep

# Enable systemd services (probably not the recommended method)
systemctl enable rabbitmq-server.service
systemctl enable perfsonar-microdep-gap-ana.service
systemctl enable perfsonar-microdep-trace-ana.service
systemctl enable perfsonar-microdep-restart.timer

%files 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/LICENSE

%files map
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/LICENSE
%attr(0644,perfsonar,perfsonar) %{microdep_web_dir}/*.html
%attr(0644,perfsonar,perfsonar) %{microdep_web_dir}/*.gif
%attr(0644,perfsonar,perfsonar) %{microdep_web_dir}/js/*
%attr(0755,perfsonar,perfsonar) %{command_base}/elastic-get-date-type.pl
%attr(0755,perfsonar,perfsonar) %{command_base}/microdep-config.cgi
%attr(0755,perfsonar,perfsonar) %{command_base}/yaml-to-json.cgi
%attr(0755,perfsonar,perfsonar) %{command_base}/microdep-psconfig-load.pl
%attr(0755,perfsonar,perfsonar) %{command_base}/json2table.pl
%attr(0755,perfsonar,perfsonar) %{command_base}/rabbitmq-consume.py
%attr(0644,perfsonar,perfsonar) %{microdep_config_base}/*.yml
%attr(0644,perfsonar,perfsonar) %{config_base}/psconfig/pscheduler.d/microdep-tests.json
%attr(0644,perfsonar,perfsonar) /etc/httpd/conf.d/apache-microdep-map.conf

%files ana
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/LICENSE
%attr(0755,perfsonar,perfsonar) %{_unitdir}/perfsonar-microdep-gap-ana.service
%attr(0755,perfsonar,perfsonar) %{_unitdir}/perfsonar-microdep-trace-ana.service
%attr(0755,perfsonar,perfsonar) %{_unitdir}/perfsonar-microdep-restart.service
%attr(0755,perfsonar,perfsonar) %{command_base}/qstream-gap-ana
%attr(0755,perfsonar,perfsonar) %{command_base}/trace_event_reader.py
%attr(0644,perfsonar,perfsonar) %{install_base}/logstash/pipeline/microdep/01-microdep-inputs.conf
%attr(0644,perfsonar,perfsonar) %{install_base}/logstash/pipeline/microdep/02-microdep-filter.conf
%attr(0644,perfsonar,perfsonar) %{install_base}/logstash/pipeline/microdep/03-microdep-outputs.conf

%changelog
* Thu Jan 04 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

