# perfSONAR Microdep 

This project provides a collection of tools realizing the *perfSONAR Microdep analytic system*.
*PS Microdep* provides
  * A set of analytic scripts which detects events in background latency data-sets and traceroue data-sets
  * Analytic scripts which search for corralations between events and report new corrolated events
  * A map-basded web-gui which presents overview and details of events reported by analysis
  * Charts and a traceroute topology viewer supporting the map-gui in presenting data

## Project structure

During the ongoing migration fase for *PS Microdep* the `/dev` folder holds misc subprojects the *PS Microdep analytic system* 
inherets its components from, i.e. `/dev` holds the legacy Microdep development environment. 

Other folders hold scripts and files applied by the perfsonar version of the system, i.e. files included in builds for different distributions.
Note that these files are typically copies of files under `/dev`. Run `make resync` to ensure perfsonar version is in sync with legacy version. 

## Building

As a start rpm-packages for el9 (almalinux) are under development. To re-build PS Microdep packages
  * `make resync`
  * `cd rpmbuild/`
  * `./build.sh SPECS/perfsonar-microdep-alma9.spec`

Updated rpm packages should become available in `rpmbuild/RPMS`

Note the building requires `docker` and `docker-compose` to be available.

`unibuild` is intended to replace this build procedure soon.

## Installation

A set of packages composes the overal analytic system

  * **perfsonar-microdep**     : Root packages depending on other perfsonar-microdep packages 
  * **perfsonar-microdep-map** : Web based map-gui
  * **perfsonar-tracetree**    : Web based graphical traceroute viewer
  * **perfsonar-microdep-ana** : Realtime analytics for event discovery

Note that currently PS Microdep depends on **perfsonar-toolkit**, i.e. it needs to be installed on a server running the full toolkit suit.

RPM-based distibutions
  * el7 (centos): `sudo yum install perfsonar-microdep` **NOT YET AVAILABLE**
  * el8, el9 (almalinux): `sudo dnf install perfsonar-microdep`
 
DEB-based distributions (Debian, Ubuntu) **NOT YET AVAILABLE**
  * `sudo apt install perfsonar-microdep`
  
From source **NOT YET AVAIABLE**
  * `tar zxvf perfsonar-microdep-xxx.yyy.zz.tar.gz`
  * `cd perfsonar-microdep`
  * `./configure`
  * `sudo make install`
  
  
  
