%define install_base        /usr/lib/perfsonar/
%define microdep_bin_base   %{install_base}/bin
%define command_base        %{microdep_bin_base}/microdep_commands
%define config_base         /etc/perfsonar
%define microdep_config_base         %{config_base}/microdep
%define doc_base            /usr/share/doc/perfsonar/microdep
%define microdep_web_dir    %{install_base}/microdep-map
%define srcroot             /home/src

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
Requires:               perfsonar-tracetree
Requires:               
%{?systemd_requires: %systemd_requires}
BuildRequires:          systemd

%description map
Web GUI presenting Microdep analytic results in a map view

%package ana
Summary:		Microdep map web GUI presenting analytic results
Group:			Applications/Communications
Requires:               perfsonar-toolkit >= 5.0.7
Requires:		perl >= 5.32
%{?systemd_requires: %systemd_requires}
#BuildRequires:          systemd

%description ana
Analytic scripts generating events for Microdep

%install
rm -rf %{buildroot}
make -C %{srcroot} ROOTPATH=%{buildroot}/%{install_base} CONFIGPATH=%{buildroot}/%{config_base} install

mkdir -p %{buildroot}/%{_unitdir}
install -D -m 0644 -t %{buildroot}/%{_unitdir} %{srcroot}/scripts/*.service 
rm -rf %{buildroot}/%{install_base}/scripts
rm -f %{buildroot}/%{install_base}/Makefile

%clean
rm -rf %{buildroot}

%post map
/usr/bin/sed -i 's|/var/lib/mircodep|%{configbase}|'  %{microdep_web_dir}/microdep-config.yml

%files map
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/LICENSE
#%config(noreplace) %{microdep_config_base}/microdep.db
%attr(0644,perfsonar,perfsonar) %{microdep_web_dir}/*.html
%attr(0644,perfsonar,perfsonar) %{microdep_web_dir}/*.gif
%attr(0644,perfsonar,perfsonar) %{microdep_web_dir}/*.yml
%attr(0644,perfsonar,perfsonar) %{microdep_web_dir}/js/*
%attr(0755,perfsonar,perfsonar) %{microdep_web_dir}/*.cgi
%attr(0755,perfsonar,perfsonar) %{microdep_web_dir}/*.pl
%attr(0755,perfsonar,perfsonar) %{command_base}/microdep-psconfig-load.pl
%attr(0755,perfsonar,perfsonar) %{command_base}/json2table.pl
%attr(0755,perfsonar,perfsonar) %{command_base}/rabbitmq-consume.py
%{config_base}/psconfig/pscheduler.d/microdep-tests.json

%files ana
%attr(0755,perfsonar,perfsonar) %{_unitdir}/perfsonar-microdep-gap-ana.service
%attr(0755,perfsonar,perfsonar) %{_unitdir}/perfsonar-microdep-trace-ana.service
%attr(0755,perfsonar,perfsonar) %{_unitdir}/perfsonar-microdep-restart.service

%changelog
* Thu Jan 04 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

