%define install_base        /usr/share/javascript/

#Version variables set by automated scripts
%define perfsonar_auto_version 5.1.0
%define perfsonar_auto_relnum alfa1

Name:			leafletjs
Version:		1.0.3
Release:		1%{?dist}
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
Release:                1.2.1%{?dist}
License:                MIT Licence
Group:			Development/Libraries
Requires:               leafletjs

%description contextmenu
A context menu for Leaflet

%package markercluster
Summary:		Animated Marker Clustering
Release:                1.0.3%{?dist}
License:                MIT Licence
Group:			Development/Libraries
Requires:               leafletjs

%description markercluster
Provides Beautiful Animated Marker Clustering functionality for Leaflet.

%package curve
Summary:		Bézier curves for Leaflet
Release:                0.9.2%{?dist}
License:                MIT Licence
Group:			Development/Libraries
Requires:               leafletjs

%description curve
A Leaflet plugin for drawing Bézier curves and other complex shapes.

%package L.LatLng.UTM
Summary:	        UTM methods for L.LatLng
Release:                1.0%{?dist}
License:                BSD 3-Clause License
Group:			Development/Libraries
Requires:               leafletjs

%description L.LatLng.UTM
Simple UTM (WGS84) methods for L.LatLng.

%pre
pwd
ls -l

%install

rm -rf %{buildroot}
# Fetch leafletjs 1.0.3
#curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/leaflet.js https://unpkg.com/leaflet@1.0.3/dist/leaflet.js
#curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/leaflet.css https://unpkg.com/leaflet@1.0.3/dist/leaflet.css
#curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/LICENSE https://raw.githubusercontent.com/Leaflet/Leaflet/main/LICENSE
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/leaflet.js https://raw.githubusercontent.com/Leaflet/Leaflet/v1.0.3/dist/leaflet.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/leaflet.css https://raw.githubusercontent.com/Leaflet/Leaflet/v1.0.3/dist/leaflet.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/images/layers-2x.png https://github.com/Leaflet/Leaflet/blob/v1.0.3/dist/images/layers-2x.png?raw=true
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/images/layers.png https://github.com/Leaflet/Leaflet/blob/v1.0.3/dist/images/layers.png?raw=true
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/images/marker-icon-2x.png https://github.com/Leaflet/Leaflet/blob/v1.0.3/dist/images/marker-icon-2x.png?raw=true
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/images/marker-icon.png https://github.com/Leaflet/Leaflet/blob/v1.0.3/dist/images/marker-icon.png?raw=true
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/images/marker-shadow.png https://github.com/Leaflet/Leaflet/blob/v1.0.3/dist/images/marker-shadow.png?raw=true
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.0.3/LICENSE https://raw.githubusercontent.com/Leaflet/Leaflet/main/LICENSE
# Fetch leaflet context menu
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.js https://cdnjs.cloudflare.com/ajax/libs/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.css https://cdnjs.cloudflare.com/ajax/libs/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-contextmenu/1.2.1/license.html https://opensource.org/license/mit
# Fetch leaflet markercluster
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.0.3/leaflet.markercluster-src.js https://unpkg.com/leaflet.markercluster@1.0.3/dist/leaflet.markercluster-src.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.0.3/MarkerCluster.css https://unpkg.com/leaflet.markercluster@1.0.3/dist/MarkerCluster.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.0.3/MarkerCluster.Default.css https://unpkg.com/leaflet.markercluster@1.0.3/dist/MarkerCluster.Default.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.0.3/license.html https://mit-license.org/
# Install leaflet curve source
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-curve/0.9.2/leaflet.curve.js https://raw.githubusercontent.com/elfalem/Leaflet.curve/v0.9.2/src/leaflet.curve.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-curve/0.9.2/LICENSE https://raw.githubusercontent.com/elfalem/Leaflet.curve/v0.9.2/LICENSE
# Fetch leaflet L.LatLng.UTM source
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-L.LatLng.UTM/1.0/L.LatLng.UTM.js https://raw.githubusercontent.com/jjimenezshaw/Leaflet.UTM/v1.0.0/L.LatLng.UTM.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-L.LatLng.UTM/1.0/LICENSE https://raw.githubusercontent.com/jjimenezshaw/Leaflet.UTM/master/LICENSE

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{install_base}/leafletjs/1.0.3/LICENSE
%{install_base}/leafletjs/1.0.3/leaflet.js
%{install_base}/leafletjs/1.0.3/leaflet.css
%{install_base}/leafletjs/1.0.3/images/*.png

%files contextmenu 
%defattr(0644,root,root,0755)
%license %{install_base}/leaflet-contextmenu/1.2.1/license.html
%{install_base}/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.js
%{install_base}/leaflet-contextmenu/1.2.1/leaflet.contextmenu.min.css

%files markercluster
%defattr(0644,root,root,0755)
%license %{install_base}/leaflet-markercluster/1.0.3/license.html
%{install_base}/leaflet-markercluster/1.0.3/leaflet.markercluster-src.js
%{install_base}/leaflet-markercluster/1.0.3/MarkerCluster.css
%{install_base}/leaflet-markercluster/1.0.3/MarkerCluster.Default.css

%files curve
%defattr(0644,root,root,0755)
%license %{install_base}/leaflet-curve/0.9.2/LICENSE
%{install_base}/leaflet-curve/0.9.2/leaflet.curve.js

%files L.LatLng.UTM
%defattr(0644,root,root,0755)
%license %{install_base}/leaflet-L.LatLng.UTM/1.0/LICENSE
%{install_base}/leaflet-L.LatLng.UTM/1.0/L.LatLng.UTM.js

%changelog
* Wed Mar 13 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created

