%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.3.0
%define perfsonar_auto_relnum alfa1

Name:			chartjs-adapter-moment
Version:		0.1.1
Release:		1%{?dist}
Summary:		Chartjs adaptor for Momentsjs
License:		MIT Licence
Group:			Development/Libraries
URL:			https://www.chartjs.org
Source0:                chartjs-adapter-moment-%{version}.tar.gz
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch
Requires:               chartjs

%description
This adapter allows the use of Moment.js with Chart.js

%prep
%setup -T -D -b 1 -n chartjs-adapter-moment-%{version}

%install
#rm -rf %{buildroot}
# Install adaptor-moment
mkdir -p  %{buildroot}/%{install_base}/chartjs-adapter-moment/%{version}
cp -dR  ../chartjs-adapter-moment-%{version}/dist/* %{buildroot}/%{install_base}/chartjs-adapter-moment/%{version} 
install -D -m 0644 ../chartjs-adapter-moment-%{version}/LICENSE.md %{buildroot}/%{install_base}/chartjs-adapter-moment/%{version}

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{install_base}/chartjs-adapter-moment/%{version}/LICENSE.md
%{install_base}/chartjs-adapter-moment/%{version}/

%changelog
* Fri Apr 24 2026 Otto J Wittner <otto.wittner@sikt.no>
- Spec file created (to substitute spec inside chatjs.spec)

