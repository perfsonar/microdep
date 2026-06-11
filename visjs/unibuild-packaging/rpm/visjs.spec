%define install_base        /usr/share/javascript/


Name:			visjs
Version:		4.21.0
Release:		1%{?dist}
Summary:		Dynamic, browser based visualization libraries
License:		Apache 2.0
Group:			Development/Libraries
URL:			https://almende.github.io/vis/
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
A dynamic, browser based javascript visualization library. Developed by Almende B.V.

%install

rm -rf %{buildroot}
# Fetch visjs 4.21.0 (https://visjs.org)
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/vis.js https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.js 
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/vis.min.js https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.min.js 
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/vis.css https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/vis.min.css https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.min.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/cross.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/cross.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/backIcon.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/backIcon.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/addNodeIcon.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/addNodeIcon.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/editIcon.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/editIcon.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/connectIcon.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/connectIcon.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/deleteIcon.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/deleteIcon.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/upArrow.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/upArrow.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/downArrow.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/downArrow.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/leftArrow.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/leftArrow.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/rightArrow.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/rightArrow.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/plus.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/plus.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/minus.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/minus.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/img/network/zoomExtends.png https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/img/network/zoomExtends.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/vis-timeline-graph2d.min.css https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis-timeline-graph2d.min.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/visjs/4.21.0/LICENSE https://www.apache.org/licenses/LICENSE-2.0.txt

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/visjs/4.21.0/LICENSE
%attr(0644,perfsonar,perfsonar) %{install_base}/visjs/4.21.0/vis-timeline-graph2d.min.css
%attr(0644,perfsonar,perfsonar) %{install_base}/visjs/4.21.0/img/network/*
%attr(0644,perfsonar,perfsonar) %{install_base}/visjs/4.21.0/vis.css
%attr(0644,perfsonar,perfsonar) %{install_base}/visjs/4.21.0/vis.min.css
%attr(0644,perfsonar,perfsonar) %{install_base}/visjs/4.21.0/vis.js
%attr(0644,perfsonar,perfsonar) %{install_base}/visjs/4.21.0/vis.min.js

%changelog
* Tue Mar 12 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

