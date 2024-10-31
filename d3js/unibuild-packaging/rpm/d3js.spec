%define install_base        /usr/share/javascript/

Name:			d3js
Version:		4
Release:		1%{?dist}
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
%defattr(0644,root,root,0755)
%license %{install_base}/d3js/LICENSE
%{install_base}/d3js/d3.v4.js

%changelog
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

