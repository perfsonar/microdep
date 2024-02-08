# perfSONAR Microdep 

This project provides a collection of tools realizing the *perfSONAR Microdep analytic system*.
*PS Microdep* provides
  * A set of analytic scripts which detects events in background latency data-sets and traceroue data-sets
  * Analytic scripts which search for corralations between events and report new corrolated events
  * A map-basded web-gui which presents overview and details of events reported by analysis
  * Charts and a traceroute topology viewer supporting the map-gui in presenting data

## Project structure

During the ongoing migration fase for *PS Microdep* the `/dev` folder holds misc subprojects the *PS Microdep analytic system* 
inherets its components from. A container based development environment is also provided for component and system testing.

Other folders hold scripts and files applied by the operational version of the system, i.e. files included in builds for different distributions.
Note that these files are currently copies of files under `/dev`. 

## Building

TO BE ADDED

## Installation

A set of packages composes the overal analytic system

  * **perfsonar-microdep**     : Root packages depending on other perfsonar-microdep packages 
  * **perfsonar-microdep-map** : Web based map-gui
  * **perfsonar-tracetree**    : Web based graphical traceroute viewer
  * **perfsonar-microdep-ana** : Realtime analytics for event discovery

Note that currently PS Microdep depends on **perfsonar-toolkit**, i.e. needs to be installed on a server running the full toolkit suit.

RPM-based distibutions
  * el7 (centos): `sudo yum install perfsonar-microdep`
  * el8, el9 (almalinux): `sudo dnf install perfsonar-microdep`
 
DEB-based distributions (Debian, Ubuntu)
  * `sudo apt install perfsonar-microdep`
  
From source
  * `tar zxvf perfsonar-microdep-xxx.yyy.zz.tar.gz`
  * `cd perfsonar-microdep`
  * `./configure`
  * `sudo make install`
  
  
  
