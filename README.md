# perfSONAR Microdep 

**IMPORTANT**: This project is still very much under development and will currently not build nor run effortlessly. It is recommended to wait with installation and test until a release branch is ready (most likely 5.3.0).

This project provides a collection of tools realizing the *perfSONAR Microdep analytic system*.
*PS Microdep* provides
  * A set of analytic scripts which detects events in background latency data-sets and traceroue data-sets
  * Analytic scripts which search for corralations between events and report new corrolated events (not yet operational)
  * A map-basded web-gui which presents overview and details of events reported by analysis
  * Charts and a traceroute topology viewer supporting the map-gui in presenting data

## Project structure

During the ongoing migration fase for *PS Microdep* the `/dev` folder holds misc subprojects the *PS Microdep analytic system* 
inherets its components from, i.e. `/dev` holds the legacy Microdep development environment. 

Other folders hold scripts and files applied by the perfsonar version of the system, i.e. files included in builds for different distributions.
Note that these files are typically copies of files under `/dev`. Run `make resync` to ensure perfsonar version is in sync with legacy version. 

## Building

A Makefile is available to support building and testing
  * Ensure *docker* is installed: `sudo apt install docker-ce-cli docker-compose-plugin`
  * To clean out old builds: `make clean-rpm-build clean-deb-build`
  * To build el9 rpm-packages: `make rpm-build`
  * To build u22 deb-packages: `make deb-build`

Updated packages should become available in `unibuild-repo/` 

## Testing

A docker container based system test enviroment is available. As a minimum the environment consists of three containers, a toolkit node with the perfsonar-microdep add-on installed, a testpoint node and a network emulator node. The network emulator interconnects the toolkit and testpoint nodes, and introduces packet drops and delays as well as a traceroute hop.

To initiate a el9 test environment run: `make rpm-test`
To initiate a u22 test environment run: `make deb-test` **NOT YET OPERATIONAL**

When all containers are running the toolkit GUI should be accessable via https://localhost:4436/grafana and the Microdep add-ond via https://localhost:4436/microdep

## Installation

A set of packages composes the overal analytic system

  * **perfsonar-microdep**     : Root packages depending on other perfsonar-microdep packages 
  * **perfsonar-microdep-map** : Web based map-gui
  * **perfsonar-microdep-ana** : Realtime analytics for event discovery
  * **perfsonar-tracetree**    : Web based graphical traceroute viewer

Note that currently PS Microdep depends on **perfsonar-toolkit**, i.e. it needs to be installed on a server running the full toolkit suit.

Locally build repositories may be copied and prepared at a relevant toolkit host with the `refresh-remote-repos.sh`

To install RPM-based distibutions
  * el9 (almalinux): `sudo dnf install perfsonar-microdep prefsonar-tracetree`
 
To install DEB-based distributions (Debian, Ubuntu)
  * u22 (ubuntu): `sudo apt install perfsonar-microdep perfsonar-tracetree`
  
To install from source **NOT YET AVAILABLE**
  * `tar zxvf perfsonar-microdep-xxx.yyy.zz.tar.gz`
  * `cd perfsonar-microdep`
  * `./configure`
  * `sudo make install`

  
## Configuring

The Microdep add-on currently examines `/etc/perfsonar/psconfig/pscheduler.d/toolkit-webui.json` for measurement topologies. Changes made to this file (manually or via a psConfig tool) is detected automatically.

To enable Microdep analysis of a bglatency test, add the `"output-raw":true` to the tests spec-structure.

## Accessing

Analytic results from Microdep is available via https://my-toolkit-host/microdep

