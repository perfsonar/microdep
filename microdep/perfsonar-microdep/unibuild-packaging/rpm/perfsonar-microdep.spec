%define install_base        /usr/lib/perfsonar/
%define microdep_bin_base   %{install_base}/bin
%define command_base        %{microdep_bin_base}/microdep_commands
%define config_base         /etc/perfsonar
%define microdep_config_base         %{config_base}/microdep
%define doc_base            /usr/share/doc/perfsonar/microdep
%define microdep_web_dir    %{install_base}/microdep-map

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.3
%define perfsonar_auto_relnum 1

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

%package geolite2
Summary:		MaxMind's Geolite2 geoip databases
Group:			Applications/Communications

%description geolite2
Geopositioning information from Maxmind to enrich datasets with AS numbers, city and country.

%package map
Summary:		Microdep map web GUI presenting analytic results
Group:			Applications/Communications
BuildRequires:          perl >= 5.32
BuildRequires:          perl(LWP::Simple)
BuildRequires:          perl(JSON)
BuildRequires:          perl(DBI)
BuildRequires:          perl(DBD::SQLite)
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
Requires:               perl(Hash::Merge::Simple)
Requires:               js-jquery
Requires:               js-jquery-ui
Requires:               datatablesjs 
Requires:               chartjs = 4.4.2
Requires:               chartjs-adapter-moment
Requires:               chartjs-plugin-zoom
Requires:               d3js = 4
Requires:               hammerjs = 2.0.8
Requires:               leafletjs = 1.0.3
Requires:               leafletjs-contextmenu
Requires:               leafletjs-markercluster
Requires:               leafletjs-curve
Requires:               leafletjs-L.LatLng.UTM
Requires:               latlon-sphericaljs
Requires:               momentjs = 2.30.1
Requires:               select2js = 4.0.0
Recommends:             perfsonar-tracetree
%{?systemd_requires: %systemd_requires}
BuildRequires:          systemd

%description map
Web GUI presenting Microdep analytic results in a map view

%package ana
Summary:		Microdep analytic toolset to analize perfSONAR datasets
Group:			Applications/Communications

# Rabbit message queue ... but since 'dnf update' is required between installing these two dependencies, things fail... hm
BuildRequires:          centos-release-rabbitmq-38
Requires:               erlang < 26.0
#Requires:               erlang 
Requires:               rabbitmq-server

BuildRequires:          perl >= 5.32
BuildRequires:          perl(DBI)
BuildRequires:          perl(DBD::SQLite)
BuildRequires:          perl(JSON)
Requires:		perl >= 5.32
# qstream_gap_ana
Requires:               perl(Socket)
Requires:               perl(Statistics::LineFit)
Requires:               perl(Statistics::Basic)
Requires:               perl(Getopt::Long)
Requires:               perl(Time::Local)
Requires:               perl(POSIX)
Requires:               perl(Data::Dumper)
Requires:               perl(constant)
Requires:               perl(sigtrap)
Requires:               perl(LWP::Simple)
Requires:               perl(AnyEvent::RabbitMQ)
Requires:               perl(URI)
Requires:               perl(JSON::PP)
Requires:               perl(Chart::Clicker)
# trace_event_reader.py + rabbitmq-consume.py (according to requirements.txt generated by pipreqs)
BuildRequires:          postgresql-server
Requires:               postgresql-server
Requires:               python3-geoip2
Requires:               python3-isodate
Requires:               python3-mysqlclient
Requires:               python3-pika
Requires:               python3-psycopg2
Requires:               python3-pytz
#Requires:               py3-tzlocal
Requires:               python3-tzlocal
Requires:               perfsonar-microdep-geolite2

# Potenial dependencies...
#Requires:               python3-psycopg2
#Requires:               python3-mysqlclient
#Requires:               gcc
#Requires:               python3-devel
#Requires:               python3-multidict
##Requires:               typing_extensions
#Requires:               python3-yarl
##Requires:               async_timeout
##Requires:               idna_ssl
#Requires:               python3-aiosignal
##Requires:               cchardet
##Requires:               charset_normalizer
#Requires:               python3-attrs
#Requires:               python3-pika


%{?systemd_requires: %systemd_requires}
 #BuildRequires:          systemd

%description ana
Analytic scripts to process perfSONAR data sets and generate events. Events may be viualized by Microdep map.

%pre geolite2
/usr/sbin/groupadd -r perfsonar 2> /dev/null || :
/usr/sbin/useradd -g perfsonar -r -s /sbin/nologin -c "perfSONAR User" -d /tmp perfsonar 2> /dev/null || :

%pre map
/usr/sbin/groupadd -r perfsonar 2> /dev/null || :
/usr/sbin/useradd -g perfsonar -r -s /sbin/nologin -c "perfSONAR User" -d /tmp perfsonar 2> /dev/null || :

%pre ana
/usr/sbin/groupadd -r perfsonar 2> /dev/null || :
/usr/sbin/useradd -g perfsonar -r -s /sbin/nologin -c "perfSONAR User" -d /tmp perfsonar 2> /dev/null || :

%prep
%setup -q

%install
rm -rf %{buildroot}
pwd & ls -l
make ROOTPATH=%{buildroot}/%{install_base} CONFIGPATH=%{buildroot}/%{microdep_config_base} install

# Install systemd services
mkdir -p %{buildroot}/%{_unitdir}
install -D -m 0644 -t %{buildroot}/%{_unitdir} %{buildroot}/%{install_base}/scripts/*.service
install -D -m 0644 -t %{buildroot}/%{_unitdir} %{buildroot}/%{install_base}/scripts/*.timer
# Move psconfig, httpd and logstash configs into correct folders
install -D -m 0644 -t %{buildroot}/%{config_base}/psconfig/pscheduler.d/ %{buildroot}/%{microdep_config_base}/microdep-tests.json
install -D -m 0644 -t %{buildroot}/etc/httpd/conf.d/ %{buildroot}/%{microdep_config_base}/apache-microdep-map.conf
install -D -m 0644 -t %{buildroot}/%{install_base}/logstash/pipeline/microdep %{buildroot}/%{microdep_config_base}/logstash/microdep/*

# Clean up copied/unrequired files
rm -rf %{buildroot}/%{install_base}/scripts
rm -f %{buildroot}/%{install_base}/Makefile
rm -rf %{buildroot}/%{microdep_config_base}/microdep-tests.json
rm -rf %{buildroot}/%{microdep_config_base}/apache-microdep-map.conf
rm -rf %{buildroot}/%{microdep_config_base}/logstash/

# Make js and css libs available in web folder (-r for relative paths ... to make rpmbuild happy)
ln -sr /usr/share/javascript/chartjs/4.4.2/chart.umd.js %{buildroot}/%{microdep_web_dir}/js
ln -sr /usr/share/javascript/chartjs/4.4.2/chart.umd.js.map %{buildroot}/%{microdep_web_dir}/js
ln -sr /usr/share/javascript/chartjs-adapter-moment/0.1.1/chartjs-adapter-moment.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/chartjs-plugin-zoom/1.2.1/chartjs-plugin-zoom.min.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/chartjs-plugin-zoom/1.2.1/chartjs-plugin-zoom.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/chartjs-plugin-zoom/1.2.1/chartjs-plugin-zoom.esm.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/d3js/d3.v4.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/datatablesjs/1.13.1/datatables.min.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/datatablesjs/1.13.1/datatables.min.css %{buildroot}/%{microdep_web_dir}/css/
ln -sr /usr/share/javascript/datatablesjs/1.13.1/datatables.min.css %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/hammerjs/2.0.8/hammer.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/hammerjs/2.0.8/hammer.min.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/hammerjs/2.0.8/hammer.min.js.map %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/hammerjs/2.0.8/hammer.min.map %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/jquery/latest/jquery.min.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/jquery/latest/jquery.min.map %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/jquery/latest/jquery.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/jquery-ui/jquery-ui.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/jquery-ui/jquery-ui.min.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/jquery-ui/jquery-ui.css %{buildroot}/%{microdep_web_dir}/css/
ln -sr /usr/share/javascript/jquery-ui/jquery-ui.min.css %{buildroot}/%{microdep_web_dir}/css/
ln -sr /usr/share/javascript/latlon-sphericaljs/2.3.0/latlon-spherical.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/latlon-sphericaljs/2.3.0/dms.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/leafletjs/1.0.3/leaflet.css %{buildroot}/%{microdep_web_dir}/css/
ln -sr /usr/share/javascript/leafletjs/1.0.3/leaflet.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/leafletjs/1.0.3/images %{buildroot}/%{microdep_web_dir}/css/
ln -sr /usr/share/javascript/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.css %{buildroot}/%{microdep_web_dir}/css/
ln -sr /usr/share/javascript/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/leaflet-markercluster/1.0.3/MarkerCluster.Default.css %{buildroot}/%{microdep_web_dir}/css/
ln -sr /usr/share/javascript/leaflet-markercluster/1.0.3/MarkerCluster.css %{buildroot}/%{microdep_web_dir}/css/
ln -sr /usr/share/javascript/leaflet-markercluster/1.0.3/leaflet.markercluster-src.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/leaflet-curve/0.9.2/leaflet.curve.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/leaflet-L.LatLng.UTM/1.0/L.LatLng.UTM.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/momentjs/2.30.1/moment.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/select2/4.0.0/css/select2.min.css %{buildroot}/%{microdep_web_dir}/css/
ln -sr /usr/share/javascript/select2/4.0.0/js/select2.min.js %{buildroot}/%{microdep_web_dir}/js/
ln -sr /usr/share/javascript/sorttable/v2/sorttable.js %{buildroot}/%{microdep_web_dir}/js/

# Link mapconfig
ln -sr %{microdep_config_base}/mapconfig.yml %{buildroot}/%{microdep_web_dir}

# Init Microdep config db with start time set to beginnig of yesterday local time (** This needs redesign **)
mkdir -p %{buildroot}/%{microdep_config_base}/mp-dragonlab/etc 
perl %{buildroot}/%{command_base}/microdep-psconfig-load.pl -c --db %{buildroot}/%{microdep_config_base}/mp-dragonlab/etc/microdep.db --start-time $(date --date "yesterday 00:00:00" +%s) %{buildroot}/%{config_base}/psconfig/pscheduler.d/microdep-tests.json

%clean
rm -rf %{buildroot}

%post map
# Fix credentials to ensure access to Opensearch
if [ -f /etc/perfsonar/opensearch/opensearch_login ]; then
    USER=`awk -F " " '{print $1}' /etc/perfsonar/opensearch/opensearch_login`
    PASSWD=`awk -F " " '{print $2}' /etc/perfsonar/opensearch/opensearch_login`
    sed -i "s|http://admin:no+nz+br|https://$USER:$PASSWD|g" %{microdep_config_base}/microdep-config.yml
fi
    
%post ana
# Create db
%{command_base}/create_new_db.sh -t postgres -d routingmonitor

# Enable Microdep pipeline for logstash
if [ -f /etc/logstash/pipelines.yml -a  -z "$(grep "pipeline.id: microdep" /etc/logstash/pipelines.yml)" ]; then
    echo -e "- path.config: /usr/lib/perfsonar/logstash/pipeline/microdep/*.conf\n  pipeline.ecs_compatibility: disabled
\n  pipeline.id: microdep\n" >> /etc/logstash/pipelines.yml
    # Add microdep index pattern to pscheduler user ... but this require opensearch to run...
    #sed -i "s|- 'pscheduler_\*'|- 'pscheduler_\*'\n      - 'dragonlab\*'|" opensearch/opensearch-security/roles.yml; \
	#sed -i "s|- 'pscheduler\*'|- 'pscheduler\*'\n      - 'dragonlab\*'|" opensearch/opensearch-security/roles.yml; \
	#/usr/share/opensearch/plugins/opensearch-security/tools/securityadmin.sh -f /etc/opensearch/opensearch-security/roles.yml -icl -nhnv -cert /etc/opensearch/admin.pem -cacert /etc/opensearch/root-ca.pem -key /etc/opensearch/admin-key.pem -t config
    # ... substitute in user+passwd instead
    USER=`awk -F " " '{print $1}' /etc/perfsonar/opensearch/opensearch_login` && sed -i "s|\${opensearch_admin_user}|$USER|g" %{install_base}/logstash/pipeline/microdep/03-microdep-outputs.conf
    PASSWD=`awk -F " " '{print $2}' /etc/perfsonar/opensearch/opensearch_login` && sed -i "s|\${opensearch_admin_password}|$PASSWD|g" %{install_base}/logstash/pipeline/microdep/03-microdep-outputs.conf
fi
# Prepare folder for json output from analytics scripts read by logstash
mkdir -p /var/lib/logstash/microdep && chown perfsonar:perfsonar /var/lib/logstash/microdep && chmod 755 /var/lib/logstash/microdep

# Enable executing of microdep ana scripts if SElinux is enabled
if [ -f /sbin/restorecon ]; then
    /sbin/restorecon -irv /usr/lib/perfsonar/bin/microdep_commands/
fi
    
# Enable systemd services (probably not the recommended method)
systemctl enable rabbitmq-server.service
systemctl enable perfsonar-microdep-gap-ana.service
systemctl enable perfsonar-microdep-trace-ana.service
systemctl enable perfsonar-microdep-restart.timer
systemctl start rabbitmq-server.service
systemctl start perfsonar-microdep-gap-ana.service
systemctl start perfsonar-microdep-trace-ana.service
systemctl start perfsonar-microdep-restart.timer

%postun
# Clean up pipline for logstash
sed -ie '/pipeline\/microdep/,+2d' /etc/logstash/pipelines.yml


%files 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/LICENSE

%files geolite2
%defattr(0644,perfsonar,perfsonar,0755)
%license %{microdep_config_base}/GeoLite2/LICENSE.txt
%{microdep_config_base}/GeoLite2/COPYRIGHT.txt
%{microdep_config_base}/GeoLite2/*.mmdb

%files map
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/LICENSE
%{microdep_web_dir}/*.html
%{microdep_web_dir}/img
%{microdep_web_dir}/js
%{microdep_web_dir}/css
%{microdep_web_dir}/*.yml
%attr(0755,perfsonar,perfsonar) %{command_base}/elastic-get-date-type.pl
%attr(0755,perfsonar,perfsonar) %{command_base}/microdep-config.cgi
%attr(0755,perfsonar,perfsonar) %{command_base}/yaml-to-json.cgi
%attr(0755,perfsonar,perfsonar) %{command_base}/get-mapconfig.cgi
%attr(0755,perfsonar,perfsonar) %{command_base}/microdep-psconfig-load.pl
%attr(0755,perfsonar,perfsonar) %{command_base}/json2table.pl
%attr(0755,perfsonar,perfsonar) %{command_base}/rabbitmq-consume.py
%config %{microdep_config_base}/microdep-config.yml
%config %{microdep_config_base}/mapconfig.yml
%config %{microdep_config_base}/mapconfig.d/
%config %{microdep_config_base}/mp-dragonlab/etc/microdep.db
%config %{config_base}/psconfig/pscheduler.d/microdep-tests.json
%config /etc/httpd/conf.d/apache-microdep-map.conf
%config %{microdep_web_dir}/dragonlab/dragonlab-base-geo.json

%files ana
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/LICENSE
%{_unitdir}/perfsonar-microdep-gap-ana.service
%{_unitdir}/perfsonar-microdep-trace-ana.service
%{_unitdir}/perfsonar-microdep-restart.service
%{_unitdir}/perfsonar-microdep-restart.timer
%attr(0755,perfsonar,perfsonar) %{command_base}/qstream-gap-ana
%attr(0755,perfsonar,perfsonar) %{command_base}/trace_event_reader.py
%attr(0755,perfsonar,perfsonar) %{command_base}/create_new_db.sh
%config %{install_base}/logstash/pipeline/microdep/01-microdep-inputs.conf
%config %{install_base}/logstash/pipeline/microdep/02-microdep-filter.conf
%config %{install_base}/logstash/pipeline/microdep/03-microdep-outputs.conf
%config %{microdep_config_base}/os-template-gap-ana.json
%config %{microdep_config_base}/os-template-trace-ana.json
%changelog
* Thu Jan 04 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

