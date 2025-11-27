%define install_base        /usr/lib/perfsonar/
%define command_base        %{install_base}/archive/bin/commands/
%define config_base         %{install_base}/archive/config
%define doc_base            /usr/share/doc/perfsonar/microdep

#Version variables set by automated scripts
%define perfsonar_auto_version 5.3.0
%define perfsonar_auto_relnum 1

Name:			perfsonar-raw-data
Version:		%{perfsonar_auto_version}
Release:		%{perfsonar_auto_relnum}%{?dist}
Summary:		perfSONAR raw test data short term archiving
License:		ASL 2.0
Group:			Development/Libraries
URL:			http://www.perfsonar.net
Source0:		perfsonar-raw-data-%{version}.tar.gz
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch
Recommends:             perfsonar-archive

%description
Configures a perfsonar achiver (or toolkit) installation to provide short lived indices (named pscheduler_raw*) for raw measurement data

%pre
# Ensure perfsonar user exists
/usr/sbin/groupadd -r perfsonar 2> /dev/null || :
/usr/sbin/useradd -g perfsonar -r -s /sbin/nologin -c "perfSONAR User" -d /tmp perfsonar 2> /dev/null || :

%prep
%setup -q

%install
rm -rf %{buildroot}
pwd & ls -l
make ROOTPATH=%{buildroot}/%{install_base} CONFIGPATH=%{buildroot}/%{config_base} install

# Move some files into correct folders
install -D -m 0644 -t %{buildroot}/%{install_base}/logstash/pipeline/ %{buildroot}/%{install_base}/pipeline/*
install -D -m 0644 -t %{buildroot}/%{command_base}/ %{buildroot}/%{install_base}/bin/*
install -D -m 0644 -t %{buildroot}/%{config_base}/ilm/install/  %{buildroot}/%{config_base}/pscheduler_raw_data_policy.json

# Clean up copied/unrequired files
rm -rf %{buildroot}/%{install_base}/pipeline
rm -rf %{buildroot}/%{install_base}/bin
rm -f %{buildroot}/%{config_base}/pscheduler_raw_data_policy.json

%clean
rm -rf %{buildroot}

%post
# Fix permissions 
chown perfsonar:perfsonar %{install_base}/logstash/pipeline/*raw*.conf

# Add raw data templates and policies to Opensearch setup
%{command_base}/opensearch_config_raw_data.sh || true

# Restart Logstash to enable pipeline update
systemctl restart logstash.service || true

%preun
# Remove raw data indices, templates and policies from Opensearch
%{command_base}/opensearch_config_raw_data.sh -ry || true

%postun
# Restart Logstash to enable pipeline update
systemctl restart logstash.service || true

%files 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/LICENSE
%attr(0755,perfsonar,perfsonar) %{command_base}/opensearch_config_raw_data.sh
%{install_base}/logstash/pipeline/*
%{config_base}/*
%{config_base}/ilm/install/pscheduler_raw_data_policy.json

%changelog
* Thu Oct 24 2025 Otto J Wittner <otto.wittner@sikt.no>
- Ready for release 5.3


