%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			momentjs
Version:		2.30.1
Release:		1%{?dist}
Summary:		Dates and times tools in JavaScript
License:		MIT Licence
Group:			Development/Libraries
URL:			https://momentjs.com
Source0:                moment-2.30.1.tar.gz
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
Parse, validate, manipulate, and display dates and times in JavaScript.

%prep
%setup -n moment-%{version}

%install

#rm -rf %{buildroot}
# Install momentjs 
mkdir -p %{buildroot}/%{install_base}/momentjs/2.30.1/
cp -a ../moment-%{version}/dist/* %{buildroot}/%{install_base}/momentjs/2.30.1/
install -D -m 0644 ../moment-%{version}/LICENSE %{buildroot}/%{install_base}/momentjs/2.30.1/

# ** SOMETHING STRANGE WITH SOURCE... FETCH FROM CDN INSTEAD ***
# Fetch moment 2.30.1
curl --create-dirs -Lo %{buildroot}/%{install_base}/momentjs/2.30.1/moment.js https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.30.1/moment.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/momentjs/2.30.1/moment.js https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.30.1/moment.min.js
#curl --create-dirs -Lo %{buildroot}/%{install_base}/momentjs/2.27.0/LICENSE https://github.com/moment/moment/raw/develop/LICENSE

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{install_base}/momentjs/2.30.1/LICENSE
%{install_base}/momentjs/2.30.1/

%changelog
* Thu Mar 14 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

