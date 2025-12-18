# perfSONAR Microdep 

**IMPORTANT**: This project is still very much under development and will currently not build nor run effortlessly. It is recommended to wait with installation and test until a release branch is ready (most likely 5.3.0).

This project provides a collection of tools realizing the *perfSONAR Microdep analytic system*.
*PS Microdep* provides
  * A set of analytic scripts which detects events in background latency data-sets and traceroue data-sets
  * Analytic scripts which search for corralations between events and report new corrolated events (not yet operational)
  * A map-basded web-gui which presents overview and details of events reported by analysis
  * Charts and a traceroute topology viewer supporting the map-gui in presenting data

## Project structure

The folder structure follows perfsonar standards to enable building with *unibuild*. The *microdep* folder holds source and build specs for Microdep core packages and well as a collection of other folders and build specs for libraries Microdep also depends on.

A *microdep-dev* folder exists with some legacy version of misc files. Please ignore this one (or have a look if you suspect some old ideas can be re-introduced.)

## Building

A Makefile is available to support building and testing on a debian based host
  * Ensure *docker* is installed: `sudo apt install docker-ce-cli docker-compose-plugin`
  * To cleanup'n'build rpm-packages: `make rpm`
  * To cleanup'n'build deb-packages: `make deb`
  * To specify which distro to build for (defaults are *el9* and *u22*) run e.g. `make -e DEBDIST=u20 deb`
  
  * To clean out builds apply `make clean-rpm-build` or `make clean-deb-build`
  * To build only apply `make rpm-build` or `make deb-build`

## Testing

### Creating a local microdep-package repo in test host

If all works well while building (i.e. *unibuild* is cloned, applied for building, and the requested build is succeedfull) the resulting repo of packages may be install via a local repo on a host by applying
  * `bin/refresh-remote-repos.sh <hostname>`

Note that the `refresh-remote-repos.sh` script requires an admin/root-account with remote access to be available on the target host (e.g. via `ssh root@<hostname>`) .

On a test host microdep packages may now be installed applying the instructions given below.

### Running it all in docker

**NOT CURRENTLY FULLY OPERATIONAL**
  
A docker container based system test enviroment is available. As a minimum the environment consists of three containers, a toolkit node with the perfsonar-microdep add-on installed, a testpoint node and a network emulator node. The network emulator interconnects the toolkit and testpoint nodes, and introduces packet drops and delays as well as a traceroute hop.

To initiate an rpm test environment run: `make rpm-test`
To initiate a deb test environment run: `make deb-test` 

When all containers are running the toolkit GUI should be accessable via https://localhost:4436/grafana and the Microdep add-ond via https://localhost:4436/microdep

## Installation

A set of packages composes the overall analytic system

  * **perfsonar-microdep**     : Root packages depending on other perfsonar-microdep packages 
  * **perfsonar-microdep-map** : Web based map-gui
  * **perfsonar-microdep-ana** : Realtime analytics for event discovery
  * **perfsonar-tracetree**    : Web based graphical traceroute viewer
  * **perfsonar-raw-data**     : Logstash pipeline additions to enable short-term indices in Opensearch for raw-data from tests

Note that currently PS Microdep depends on **perfsonar-toolkit**, i.e. it needs to be installed on a server running the full toolkit suit. **TO BE FIXED BEFORE 5.3 RELEASE**

To install RPM-based distibutions
  * `sudo dnf install perfsonar-microdep`
 
To install DEB-based distributions (Debian, Ubuntu)
  * `sudo apt install perfsonar-microdep`
  
To install from source **NOT YET AVAILABLE**
  * `tar zxvf perfsonar-microdep-xxx.yyy.zz.tar.gz`
  * `cd perfsonar-microdep`
  * `./configure`
  * `sudo make install`

  
## Configuring

As the Microdep add-on relies on raw-data from tests to perform analysis, only selected tests will be analyzed (assuming the *perfsonar-raw-data package* is installed):
  * **traceroute tests** : All tests as the all supply raw data.
  * **latencybg  tests** : All tests where the flag **"output-raw": true** is included as attribute in the **"spec"**-structure of a test (see `microdep-tests.json.example`).
  
## Accessing analytic results

Analytic results from Microdep is available via https://<my-host>/microdep.



