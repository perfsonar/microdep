%define install_base        /usr/share/javascript/

Name:			datatablesjs
Version:		1.13.1
Release:		1%{?dist}
Summary:		JS table enhancing library
License:		MIT License
Group:			Development/Libraries
URL:			https://datatables.net
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
DataTables is a Javascript HTML table enhancing library.

%install

rm -rf %{buildroot}
# Fetch d3.js v4
curl --create-dirs -Lo %{buildroot}/%{install_base}/datatablesjs/1.13.1/datatables.min.js https://cdn.datatables.net/v/dt/dt-1.13.1/datatables.min.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/datatablesjs/1.13.1/datatables.min.css https://cdn.datatables.net/v/dt/dt-1.13.1/datatables.min.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/datatablesjs/LICENSE https://raw.githubusercontent.com/DataTables/DataTables/master/license.txt

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{install_base}/datatablesjs/LICENSE
%{install_base}/datatablesjs/1.13.1/*.js
%{install_base}/datatablesjs/1.13.1/*.css

%changelog
* Thu Apr 18 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

