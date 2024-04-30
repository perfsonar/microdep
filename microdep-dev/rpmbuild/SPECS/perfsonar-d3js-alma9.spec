%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			perfsonar-d3js
Version:		%{perfsonar_auto_version}
Release:		%{perfsonar_auto_relnum}%{?dist}
Summary:		JS library for visualizing data.
License:		ISC License
Group:			Development/Libraries
URL:			https://d3js.org
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
D3 is a free, open-source JavaScript library for visualizing data.

%install

rm -rf %{buildroot}
# Fetch d3.js v4
curl --create-dirs -Lo %{buildroot}/%{install_base}/d3js/d3.v4.js https://d3js.org/d3.v4.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/d3js/LICENSE https://raw.githubusercontent.com/d3/d3/main/LICENSE

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/d3js/LICENSE
%attr(0644,perfsonar,perfsonar) %{install_base}/d3js/d3.v4.js

%changelog
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

