%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			chartjs
Version:		4.4.2
Release:		1%{?dist}
Summary:		Simple Javascript charting library
License:		MIT Licence
Group:			Development/Libraries
URL:			https://www.chartjs.org
Source0:                chart.js-%{version}.tgz
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
Simple yet flexible JavaScript charting library for the modern web.

%package adapter-moment
Summary:		Chartjs adaptor for Momentsjs
Release:		0.1.1%{?dist}
License:                MIT Licence
Group:			Development/Libraries
Source1:                chartjs-adapter-moment-0.1.1.tar.gz
Requires:               chartjs

%description adapter-moment
This adapter allows the use of Moment.js with Chart.js

%package plugin-zoom
Summary:		Zoom and pan plugin for Chart.js
Release:		1.1.2%{?dist}
License:                MIT Licence
Group:			Development/Libraries
Source2:                chartjs-plugin-zoom-1.2.1.tgz
Requires:               chartjs

%description plugin-zoom
A zoom and pan plugin for Chart.js

%prep
%setup -c -n chartjs-%{version}
%setup -T -D -b 1 -n chartjs-adapter-moment-0.1.1
%setup -T -D -a 2 -c -n chartjs-plugin-zoom-1.2.1

%install

#rm -rf %{buildroot}
# Install chartjs
mkdir -p  %{buildroot}/%{install_base}/chartjs/4.4.2
cp -dR ../chartjs-%{version}/package/dist/* %{buildroot}/%{install_base}/chartjs/4.4.2/
install -D -m 0644 ../chartjs-%{version}/package/LICENSE.md %{buildroot}/%{install_base}/chartjs/4.4.2/
# Install adaptor-moment 0.1.1
mkdir -p  %{buildroot}/%{install_base}/chartjs-adapter-moment/0.1.1
cp -dR  ../chartjs-adapter-moment-0.1.1/dist/* %{buildroot}/%{install_base}/chartjs-adapter-moment/0.1.1 
install -D -m 0644 ../chartjs-adapter-moment-0.1.1/LICENSE.md %{buildroot}/%{install_base}/chartjs-adapter-moment/0.1.1
# Install plugin-zoom 1.2.1
mkdir -p %{buildroot}/%{install_base}/chartjs-plugin-zoom/1.2.1
cp -dR  ../chartjs-plugin-zoom-1.2.1/package/dist/* %{buildroot}/%{install_base}/chartjs-plugin-zoom/1.2.1
install -D -m 0644 ../chartjs-plugin-zoom-1.2.1/package/LICENSE.md %{buildroot}/%{install_base}/chartjs-plugin-zoom/1.2.1

#chmod 755 %{buildroot}/%{install_base}/chartjs*/*

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{install_base}/chartjs/4.4.2/LICENSE.md
%{install_base}/chartjs/4.4.2/

%files adapter-moment 
%defattr(0644,root,root,0755)
%license %{install_base}/chartjs-adapter-moment/0.1.1/LICENSE.md
%{install_base}/chartjs-adapter-moment/0.1.1/

%files plugin-zoom
%defattr(0644,root,root,0755)
%license %{install_base}/chartjs-plugin-zoom/1.2.1/LICENSE.md
%{install_base}/chartjs-plugin-zoom/1.2.1/

%changelog
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

