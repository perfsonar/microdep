%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			chartjs-plugin-zoom
Version:		1.2.1
Release:		1%{?dist}
Summary:		Zoom and pan plugin for Chart.js
License:		MIT Licence
Group:			Development/Libraries
URL:			https://www.chartjs.org
Source0:                chartjs-plugin-zoom-%{version}.tgz
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch
Requires:               chartjs

%description
A zoom and pan plugin for Chart.js

%prep
%setup -T -D -a 2 -c -n chartjs-plugin-zoom-%{version}

%install

#rm -rf %{buildroot}
# Install plugin-zoom
mkdir -p %{buildroot}/%{install_base}/chartjs-plugin-zoom/%{version}
cp -dR  ../chartjs-plugin-zoom-%{version}/package/dist/* %{buildroot}/%{install_base}/chartjs-plugin-zoom/%{version}
install -D -m 0644 ../chartjs-plugin-zoom-%{version}/package/LICENSE.md %{buildroot}/%{install_base}/chartjs-plugin-zoom/%{version}

#chmod 755 %{buildroot}/%{install_base}/chartjs*/*

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{install_base}/chartjs-plugin-zoom/%{version}/LICENSE.md
%{install_base}/chartjs-plugin-zoom/%{version}/

%changelog
* Fri Apr 24 2026 Otto J Wittner <otto.wittner@sikt.no>
- Spec file created (to substitute spec inside chatjs.spec)

