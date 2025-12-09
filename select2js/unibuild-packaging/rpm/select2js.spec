%define install_base        /usr/share/javascript/


Name:			select2js
Version:		4.0.13
Release:		1%{?dist}
Summary:		A jQuery-based replacement for select boxes
License:		MIT Licence
Group:			Development/Libraries
URL:			https://select2.org/
Source0:                select2-%{version}.tar.gz
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch
Requires:               js-jquery

%description
Select2 is a jQuery-based replacement for select boxes. It supports searching, remote data sets, and pagination of results.


###

%prep
# Unpack tar-file
%setup -n select2-%{version}

%install

rm -rf %{buildroot}

# Install tar-file content
mkdir -p  %{buildroot}/%{install_base}/select2/%{version}
install -D -m 0644 -t %{buildroot}/%{install_base}/select2/%{version}/js ../select2-%{version}/dist/js/*.js 
install -D -m 0644 -t %{buildroot}/%{install_base}/select2/%{version}/js/i18n/ ../select2-%{version}/dist/js/i18n/* 
install -D -m 0644 -t %{buildroot}/%{install_base}/select2/%{version}/css ../select2-%{version}/dist/css/* 
install -D -m 0644 ../select2-%{version}/LICENSE.md %{buildroot}/%{install_base}/select2/%{version}/

%clean
rm -rf %{buildroot}


%files 
%defattr(0644,root,root,0755)
%license %{install_base}/select2/%{version}/LICENSE.md
%{install_base}/select2/%{version}/js/*
%{install_base}/select2/%{version}/css/*

%changelog
* Mon Dec 01 2025 Otto J Wittner <otto.wittner@sikt.no>
- Updated to read tar-file rather than downloading
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

