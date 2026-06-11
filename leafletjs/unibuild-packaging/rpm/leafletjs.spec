%define install_base        /usr/share/javascript/

Name:			leafletjs
Version:		1.9.4
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
#Version:                1.4.0
#Release:                1.4.0%{?dist}
License:                MIT Licence
Group:			Development/Libraries
Requires:               leafletjs

%description contextmenu
A context menu for Leaflet

%package markercluster
Summary:		Animated Marker Clustering
#Version:                1.0.3
#Release:                1.0.3%{?dist}
License:                MIT Licence
Group:			Development/Libraries
Requires:               leafletjs

%description markercluster
Provides Beautiful Animated Marker Clustering functionality for Leaflet.

%package curve
Summary:		Bézier curves for Leaflet
#Version:                1.0.0%{?dist}
#Release:                1.0.0%{?dist}
License:                MIT Licence
Group:			Development/Libraries
Requires:               leafletjs

%description curve
A Leaflet plugin for drawing Bézier curves and other complex shapes.

%package UTM
Summary:	        UTM methods for L.LatLng
#Version:                1.0%{?dist}
#Release:                1.0%{?dist}
License:                BSD 3-Clause License
Group:			Development/Libraries
Requires:               leafletjs

%description UTM
Simple UTM (WGS84) methods for L.LatLng.

%pre
pwd
ls -l

%install

rm -rf %{buildroot}
# Fetch leafletjs 
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.9.4/leaflet.js https://unpkg.com/leaflet@1.9.4/dist/leaflet.js 
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.9.4/leaflet.css https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.9.4/LICENSE https://unpkg.com/leaflet@1.9.4/LICENSE
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.9.4/images/layers-2x.png https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.9.4/images/layers.png https://unpkg.com/leaflet@1.9.4/dist/images/layers.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.9.4/images/marker-icon-2x.png https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.9.4/images/marker-icon.png https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png
curl --create-dirs -Lo %{buildroot}/%{install_base}/leafletjs/1.9.4/images/marker-shadow.png https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png
# Fetch leaflet context menu
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-contextmenu/1.4.0/leaflet.contextmenu.js https://unpkg.com/leaflet-contextmenu@1.4.0/dist/leaflet.contextmenu.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-contextmenu/1.4.0/leaflet.contextmenu.css https://unpkg.com/leaflet-contextmenu@1.4.0/dist/leaflet.contextmenu.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-contextmenu/1.4.0/leaflet.contextmenu.min.js https://unpkg.com/leaflet-contextmenu@1.4.0/dist/leaflet.contextmenu.min.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-contextmenu/1.4.0/leaflet.contextmenu.min.css https://unpkg.com/leaflet-contextmenu@1.4.0/dist/leaflet.contextmenu.min.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-contextmenu/1.4.0/LICENSE.md https://unpkg.com/leaflet-contextmenu@1.4.0/LICENSE.md
# Fetch leaflet markercluster
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.5.3/leaflet.markercluster-src.js https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster-src.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.5.3/leaflet.markercluster-src.js.map https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster-src.js.map
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.5.3/leaflet.markercluster.js https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.5.3/leaflet.markercluster.js.map https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js.map
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.5.3/MarkerCluster.css https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.5.3/MarkerCluster.Default.css https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-markercluster/1.5.3/MIT-LICENCE.txt https://unpkg.com/leaflet.markercluster@1.5.3/MIT-LICENCE.txt
# Install leaflet curve source
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-curve/1.0.0/leaflet.curve.js https://unpkg.com/leaflet-curve@1.0.0/leaflet.curve.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-curve/1.0.0/LICENSE https://unpkg.com/leaflet-curve@1.0.0/LICENSE
# Fetch leaflet UTM source
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-UTM/1.0/L.LatLng.UTM.js https://unpkg.com/leaflet.utm@1.0.0/L.LatLng.UTM.js
curl --create-dirs -Lo %{buildroot}/%{install_base}/leaflet-UTM/1.0/LICENSE https://unpkg.com/leaflet.utm@1.0.0/LICENSE

%clean
rm -rf %{buildroot}

%files 
%defattr(0644,root,root,0755)
%license %{install_base}/leafletjs/1.9.4/LICENSE
%{install_base}/leafletjs/1.9.4/leaflet.js
%{install_base}/leafletjs/1.9.4/leaflet.css
%{install_base}/leafletjs/1.9.4/images/*.png

%files contextmenu 
%defattr(0644,root,root,0755)
%license %{install_base}/leaflet-contextmenu/1.4.0/LICENSE.md
%{install_base}/leaflet-contextmenu/1.4.0/leaflet.contextmenu.js
%{install_base}/leaflet-contextmenu/1.4.0/leaflet.contextmenu.css
%{install_base}/leaflet-contextmenu/1.4.0/leaflet.contextmenu.min.js
%{install_base}/leaflet-contextmenu/1.4.0/leaflet.contextmenu.min.css

%files markercluster
%defattr(0644,root,root,0755)
%license %{install_base}/leaflet-markercluster/1.5.3/MIT-LICENCE.txt
%{install_base}/leaflet-markercluster/1.5.3/leaflet.markercluster-src.js
%{install_base}/leaflet-markercluster/1.5.3/leaflet.markercluster-src.js.map
%{install_base}/leaflet-markercluster/1.5.3/leaflet.markercluster.js
%{install_base}/leaflet-markercluster/1.5.3/leaflet.markercluster.js.map
%{install_base}/leaflet-markercluster/1.5.3/MarkerCluster.css
%{install_base}/leaflet-markercluster/1.5.3/MarkerCluster.Default.css

%files curve
%defattr(0644,root,root,0755)
%license %{install_base}/leaflet-curve/1.0.0/LICENSE
%{install_base}/leaflet-curve/1.0.0/leaflet.curve.js

%files UTM
%defattr(0644,root,root,0755)
%license %{install_base}/leaflet-UTM/1.0/LICENSE
%{install_base}/leaflet-UTM/1.0/L.LatLng.UTM.js

%changelog
* Wed Mar 13 2024 Otto J Wittner <otto.wittner@sikt.no>
- Initial spec file created
* Thu Jun 11 2026 Otto J Wittner <otto.wittner@sikt.no>
- Latest version of all libs
