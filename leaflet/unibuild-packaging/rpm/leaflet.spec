%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			leafletjs
Version:		%{perfsonar_auto_version}
Release:		%{perfsonar_auto_relnum}%{?dist}
Summary:		JS library for mobile-friendly interactive maps.
License:		BSD 2
Group:			Development/Libraries
URL:			https://leafletjs.com
BuildRoot:		%{_tmppath}/%{name}-%{version}-root-%(%{__id_u} -n)
BuildArch:		noarch

%description
An open-source JavaScript library for mobile-friendly interactive maps. Developed by Volodymyr Agafonkin.

%package contextmenu
Summary:		A context menu for Leaflet
License:                MIT Licence
Group:			Development/Libraries
Requires:               leafletjs

%description contextmenu
A context menu for Leaflet

%package markercluster
Summary:		Animated Marker Clustering
License:                MIT Licence
Group:			Development/Libraries
Requires:               leafletjs

%description markercluster
Provides Beautiful Animated Marker Clustering functionality for Leaflet.

%install

rm -rf %{buildroot}
# Fetch leafletjs 1.0.3
curl --create-dirs -o %{buildroot}/%{install_base}/leafletjs/1.0.3/leaflet.js https://unpkg.com/leaflet@1.0.3/dist/leaflet.js
curl --create-dirs -o %{buildroot}/%{install_base}/leafletjs/1.0.3/leaflet.css https://unpkg.com/leaflet@1.0.3/dist/leaflet.css
curl --create-dirs -o %{buildroot}/%{install_base}/leafletjs/1.0.3/LICENSE https://raw.githubusercontent.com/Leaflet/Leaflet/main/LICENSE
# Fetch leaflet context menu
curl --create-dirs -o %{buildroot}/%{install_base}/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.js https://cdnjs.cloudflare.com/ajax/libs/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.js
curl --create-dirs -o %{buildroot}/%{install_base}/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.css https://cdnjs.cloudflare.com/ajax/libs/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.css
curl --create-dirs -o %{buildroot}/%{install_base}/leaflet-contextmenu/1.0.3/license.html https://opensource.org/license/mit
# Fetch leaflet markercluster
curl --create-dirs -o %{buildroot}/%{install_base}/leaflet-markercluster/1.0.3/leaflet.markercluster-src.js https://unpkg.com/leaflet.markercluster@1.0.3/dist/leaflet.markercluster-src.js
curl --create-dirs -o %{buildroot}/%{install_base}/leaflet-markercluster/1.0.3/MarkerCluster.css https://unpkg.com/leaflet.markercluster@1.0.3/dist/MarkerCluster.css
curl --create-dirs -o %{buildroot}/%{install_base}/leaflet-markercluster/1.0.3/MarkerCluster.Default.css https://unpkg.com/leaflet.markercluster@1.0.3/dist/MarkerCluster.Default.css
curl --create-dirs -o %{buildroot}/%{install_base}/leaflet-markercluster/1.0.3/license.html https://mit-license.org/

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/leafletjs/1.0.3/LICENSE
%attr(0644,perfsonar,perfsonar) %{install_base}/leafletjs/1.0.3/leaflet.js
%attr(0644,perfsonar,perfsonar) %{install_base}/leafletjs/1.0.3/leaflet.css

%files contextmenu 
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/leaflet-contextmenu/1.0.3/license.html
%attr(0644,perfsonar,perfsonar) %{install_base}/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.js
%attr(0644,perfsonar,perfsonar) %{install_base}/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.css

%files markercluster
%defattr(0644,perfsonar,perfsonar,0755)
%license %{install_base}/leaflet-markercluster/1.0.3/license.html
%attr(0644,perfsonar,perfsonar) %{install_base}/leaflet-markercluster/1.0.3/leaflet.markercluster-src.js
%attr(0644,perfsonar,perfsonar) %{install_base}/leaflet-markercluster/1.0.3/MarkerCluster.css
%attr(0644,perfsonar,perfsonar) %{install_base}/leaflet-markercluster/1.0.3/MarkerCluster.Default.css

%changelog
* Wed Mar 13 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

