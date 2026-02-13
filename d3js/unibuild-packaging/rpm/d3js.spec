%define install_base        /usr/share/javascript/
%define doc_base            /usr/share/doc/

Name:			d3js
Version:		4.13.0
Release:		1%{?dist}
Summary:		JS library for visualizing data.
License:		MIT Licence
Group:			Development/Libraries
URL:			https://d3js.org
Source0:                d3-%{version}.tar.gz
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
D3 is a free, open-source JavaScript library for visualizing data.

###

%prep
# Unpack tar-file
%setup -n d3-%{version}

%install

rm -rf %{buildroot}

# Install tar-file content
mkdir -p  %{buildroot}/%{install_base}/d3/%{version}
install -D -m 0644 -t %{buildroot}/%{install_base}/d3/%{version}/ ../d3-%{version}/*.js 
install -D -m 0644 -t %{buildroot}/%{doc_base}/d3/%{version}/ ../d3-%{version}/*.md 
install -D -m 0644 ../d3-%{version}/LICENSE %{buildroot}/%{doc_base}/d3/%{version}/

# Add some alternative paths (-r to make rpmbuild happy)
ln -sr %{buildroot}/%{install_base}/d3/%{version} %{buildroot}/%{install_base}/d3/latest

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{doc_base}/d3/%{version}/LICENSE
%{install_base}/d3/%{version}/*
%{doc_base}/d3/%{version}/*.md
%{install_base}/d3/latest

%changelog
* Wed Feb 11 2026 Otto J Wittner <otto.wittner@sikt.no>
- Updated to read tar-file rather than downloading
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

