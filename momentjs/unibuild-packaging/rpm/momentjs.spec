%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			momentjs
Version:		%{perfsonar_auto_version}
Release:		%{perfsonar_auto_relnum}%{?dist}
Summary:		Dates and times tools in JavaScript
License:		MIT Licence
Group:			Development/Libraries
URL:			https://momentjs.com
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
Parse, validate, manipulate, and display dates and times in JavaScript.

%install

rm -rf %{buildroot}
# Fetch moment 2.27.0
curl --create-dirs -o %{buildroot}/%{install_base}/momentjs/2.27.0/moment.js https://cdn.jsdelivr.net/npm/moment@2.27.0
curl --create-dirs -o %{buildroot}/%{install_base}/momentjs/2.27.0/LICENSE https://github.com/moment/moment/raw/develop/LICENSE

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/momentjs/2.27.0/LICENSE
%attr(0644,perfsonar,perfsonar) %{install_base}/momentjs/2.27.0/moment.js

%changelog
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

