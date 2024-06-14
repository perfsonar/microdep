%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			select2js
Version:		4.0.0
Release:		1%{?dist}
Summary:		A jQuery-based replacement for select boxesA
License:		MIT Licence
Group:			Development/Libraries
URL:			https://select2.org/
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch
Requires:               js-jquery

%description
Select2 is a jQuery-based replacement for select boxes. It supports searching, remote data sets, and pagination of results.

%install

rm -rf %{buildroot}
# Fetch select2 4.0.0
curl --create-dirs -Lo %{buildroot}/%{install_base}/select2/4.0.0/js/select2.min.js https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.0/js/select2.min.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/select2/4.0.0/css/select2.min.css https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.0/css/select2.min.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/select2/4.0.0/LICENSE.mp https://raw.githubusercontent.com/select2/select2/develop/LICENSE.md

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{install_base}/select2/4.0.0/LICENSE.mp
%{install_base}/select2/4.0.0/js/select2.min.js
%{install_base}/select2/4.0.0/css/select2.min.css

%changelog
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

