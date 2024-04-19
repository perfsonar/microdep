%define install_base        /usr/share/javascript/

Name:			latlon-sphericaljs
Version:		2.3.0
Release:		1%{?dist}
Summary:		Latitude/longitude spherical geodesy tools
License:		MIT Licence
Group:			Development/Libraries
URL:			https://github.com/chrisveness/geodesy/tree/v2.3.0
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
Latitude/longitude spherical geodesy tools in JavaScript.

%install

rm -rf %{buildroot}
# Fetch source and license
curl --create-dirs -o %{buildroot}/%{install_base}/latlon-sphericaljs/2.3.0/latlon-spherical.js https://raw.githubusercontent.com/chrisveness/geodesy/v2.3.0/latlon-spherical.js
curl --create-dirs -o %{buildroot}/%{install_base}/latlon-sphericaljs/2.3.0/dms.js https://raw.githubusercontent.com/chrisveness/geodesy/v2.3.0/dms.js
curl --create-dirs -o %{buildroot}/%{install_base}/latlon-sphericaljs/2.3.0/LICENSE https://raw.githubusercontent.com/chrisveness/geodesy/v2.3.0/LICENSE

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/latlon-sphericaljs/2.3.0/LICENSE
%{install_base}/latlon-sphericaljs/2.3.0/*.js

%changelog
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

