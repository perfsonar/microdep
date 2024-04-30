%define install_base        /usr/share/javascript/

Name:			sorttablejs
Version:		2
Release:		1%{?dist}
Summary:		Javascript lib to make tables sorttable
License:		MIT Licence
Group:			Development/Libraries
URL:			https://www.kryogenix.org/code/browser/sorttable
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
Javascript library to make html tables sorttable. Developed by Stuart Langridge.

%install

rm -rf %{buildroot}
# Fetch sorttable v2 (https://www.kryogenix.org/code/browser/sorttable)
curl --create-dirs -Lo %{buildroot}/%{install_base}/sorttable/v2/sorttable.js https://www.kryogenix.org/code/browser/sorttable/sorttable.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/sorttable/v2/licence.html https://www.kryogenix.org/code/browser/licence.html

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/sorttable/v2/licence.html 
%attr(0644,perfsonar,perfsonar) %{install_base}/sorttable/v2/sorttable.js

%changelog
* Tue Mar 12 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

