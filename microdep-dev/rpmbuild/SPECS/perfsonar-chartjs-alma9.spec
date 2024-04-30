%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			perfsonar-chartjs
Version:		%{perfsonar_auto_version}
Release:		%{perfsonar_auto_relnum}%{?dist}
Summary:		Simple Javascript charting library
License:		MIT Licence
Group:			Development/Libraries
URL:			https://www.chartjs.org
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
Simple yet flexible JavaScript charting library for the modern web.

%package adapter-moment
Summary:		Chartjs adaptor for Momentsjs
License:                MIT Licence
Group:			Development/Libraries
Requires:               perfsonar-chartjs

%description adapter-moment
This adapter allows the use of Moment.js with Chart.js

%package plugin-zoom
Summary:		Zoom and pan plugin for Chart.js
License:                MIT Licence
Group:			Development/Libraries
Requires:               perfsonar-chartjs

%description plugin-zoom
A zoom and pan plugin for Chart.js

%install

rm -rf %{buildroot}
# Fetch chartjs 
curl --create-dirs -Lo %{buildroot}/%{install_base}/chartjs/chart.js https://cdn.jsdelivr.net/npm/chart.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/chartjs/LICENSE.md https://raw.githubusercontent.com/chartjs/Chart.js/master/LICENSE.md
# Fetch adaptor-moment 0.1.1
curl --create-dirs -Lo %{buildroot}/%{install_base}/chartjs-adapter-moment/0.1.1/chartjs-adapter-moment.js https://cdn.jsdelivr.net/npm/chartjs-adapter-moment@0.1.1
curl --create-dirs -Lo %{buildroot}/%{install_base}/chartjs-adapter-moment/0.1.1/LICENSE.md https://raw.githubusercontent.com/chartjs/chartjs-adapter-moment/master/LICENSE.md
# Fetch plugin-zoom 1.2.1
curl --create-dirs -Lo %{buildroot}/%{install_base}/chartjs-plugin-zoom/1.2.1/chartjs-plugin-zoom.min.js https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@1.2.1/dist/chartjs-plugin-zoom.min.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/chartjs-plugin-zoom/1.2.1/LICENSE.md https://raw.githubusercontent.com/chartjs/Chart.js/master/LICENSE.md

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/chartjs/LICENSE.md
%attr(0644,perfsonar,perfsonar) %{install_base}/chartjs/chart.js

%files adaptor-moment 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/chartjs-adapter-moment/0.1.1/LICENSE.md
%attr(0644,perfsonar,perfsonar) %{install_base}/chartjs-adapter-moment/0.1.1/chartjs-adapter-moment.js

%files plugin-zoom
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/chartjs-plugin-zoom/1.2.1/LICENSE.md
%attr(0644,perfsonar,perfsonar) %{install_base}/chartjs-plugin-zoom/1.2.1/chartjs-plugin-zoom.min.js

%changelog
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

