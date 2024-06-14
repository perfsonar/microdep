%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			hammerjs
Version:		2.0.8
Release:		1%{?dist}
Summary:		JS lib to recognize gestures.
License:		MIT Licence
Group:			Development/Libraries
URL:			http://hammerjs.github.io
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
An open-source library that can recognize gestures made by touch, mouse and pointerEvents.

%install

rm -rf %{buildroot}
# Fetch hammerjs 2.0.8
#curl --create-dirs -Lo %{buildroot}/%{install_base}/hammerjs/2.0.8/hammer.min.js https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/hammerjs/2.0.8/hammer.min.js https://github.com/hammerjs/hammer.js/raw/v2.0.8/hammer.min.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/hammerjs/2.0.8/hammer.min.js.map https://github.com/hammerjs/hammer.js/raw/v2.0.8/hammer.min.js.map
curl --create-dirs -Lo %{buildroot}/%{install_base}/hammerjs/2.0.8/hammer.min.map https://github.com/hammerjs/hammer.js/raw/v2.0.8/hammer.min.map
curl --create-dirs -Lo %{buildroot}/%{install_base}/hammerjs/2.0.8/hammer.js https://github.com/hammerjs/hammer.js/raw/v2.0.8/hammer.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/hammerjs/2.0.8/LICENSE.md https://raw.githubusercontent.com/hammerjs/hammer.js/v2.0.8/LICENSE.md

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{install_base}/hammerjs/2.0.8/LICENSE.md
%{install_base}/hammerjs/2.0.8/*.js
%{install_base}/hammerjs/2.0.8/*.map

%changelog
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

