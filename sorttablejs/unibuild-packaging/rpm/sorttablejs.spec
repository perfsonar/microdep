%define install_base        /usr/share/javascript/

Name:			sorttablejs
Version:		2.0
Release:		1%{?dist}
Summary:		Javascript lib to make tables sorttable
License:		MIT Licence
Group:			Development/Libraries
URL:			https://www.kryogenix.org/code/browser/sorttable
Source0:                sorttable-%{version}.tar.gz
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
Javascript library to make html tables sorttable. Developed by Stuart Langridge.

%prep
# Unpack tar-file
%setup -n sorttable-%{version}


%install

rm -rf %{buildroot}

# Install tar-file content
mkdir -p  %{buildroot}/%{install_base}/sorttable/%{version}
install -D -m 0644 ../sorttable-%{version}/sorttable.js %{buildroot}/%{install_base}/sorttable/%{version}/
install -D -m 0644 ../sorttable-%{version}/licence.html %{buildroot}/%{install_base}/sorttable/%{version}/

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{install_base}/sorttable/%{version}/licence.html 
%{install_base}/sorttable/%{version}/sorttable.js

%changelog
* Tue Mar 12 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

