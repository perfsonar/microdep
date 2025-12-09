#
# Makefile for Any Package
#

include $(wildcard unibuild/unibuild.make)

BUILDCMD="unibuild build"   # May be replace by running e.g. "make BUILDCMD=bash deb" to enable manual building 
DEBDIST="u22"
RPMDIST="el9"
ARCH="amd64"

default:
	@echo "*** Building packages for Microdep ***"
	@echo "Run 'make rpm' or 'make deb' to clean and build packages for a distribution (applying 'unibuild' in containers)."
	@echo "Run 'make clean-rpm-build' or 'make clean-deb-build' to only clean away build files."
	@echo "Run 'make rpm-build' or 'make deb-build' to only build packages."
	@echo "Run 'bin/refresh-remote-repos.sh <hostname>' to install distribution on a remote perfsonar toolkit host (ssh access to root@<hostname> required)."
	@echo
	@echo "*** Running Microdep in container test environment ***"
	@echo "NOTE: CURRENTLY UNSTABLE/NOT WORKING 100%"
	@echo "Run 'make rpm-test' or 'make deb-test' to initiate container based test environment."
	@echo "Run 'make clean-test' to bring down running system test environment."

unibuild-compose.yml:
	@echo "Fetching unibuild docker compose file..."
	@wget -O unibuild-compose.yml https://raw.githubusercontent.com/perfsonar/unibuild/main/docker-envs/docker-compose.yml

submodules/pstracetree/Makefile:
	@echo "Fetching submodules..."
	git submodule init
	git submodule update

unibuild-repo/RPMS: unibuild-compose.yml submodules/pstracetree/Makefile
	@echo "Build Microdep rpms for ${RPMDIST}..."
	docker compose -f unibuild-compose.yml run ${RPMDIST} bash -c "${BUILDCMD}"

deb-systemd-services: 
	rsync  -t microdep/perfsonar-microdep/scripts/perfsonar-microdep-gap-ana.service microdep/perfsonar-microdep/unibuild-packaging/deb/perfsonar-microdep-ana.perfsonar-microdep-gap-ana.service
	rsync  -t microdep/perfsonar-microdep/scripts/perfsonar-microdep-trace-ana.service microdep/perfsonar-microdep/unibuild-packaging/deb/perfsonar-microdep-ana.perfsonar-microdep-trace-ana.service
	rsync  -t microdep/perfsonar-microdep/scripts/perfsonar-microdep-restart.service microdep/perfsonar-microdep/unibuild-packaging/deb/perfsonar-microdep-ana.perfsonar-microdep-restart.service
	rsync  -t microdep/perfsonar-microdep/scripts/perfsonar-microdep-restart.timer microdep/perfsonar-microdep/unibuild-packaging/deb/perfsonar-microdep-ana.perfsonar-microdep-restart.timer

unibuild-repo/Packages: deb-systemd-services unibuild-compose.yml submodules/pstracetree/Makefile
	@echo "Build Microdep deb packages for ${DEBDIST}..."
	docker compose -f unibuild-compose.yml run ${DEBDIST}_${ARCH} bash -c "apt -y update && ${BUILDCMD}"

rpm-build: unibuild-repo/RPMS 

rpm-test-build: 
	@echo "Building rpm system test environment (containers) for PS Microdep..."
	DISTRO=${RPMDIST} docker compose -f microdep/tests/system-test.yml --project-directory . build 

rpm-test-run:
	@echo "Starting rpm system test environment (containers) for PS Microdep..."
	DISTRO=${RPMDIST} docker compose -f microdep/tests/system-test.yml --project-directory . up

rpm-test:  clean-rpm-test rpm-build rpm-test-build rpm-test-run


deb-build: unibuild-repo/Packages 

deb-test-build: 
	@echo "Building deb system test environment (containers) for PS Microdep..."
	DISTRO=${DEBDIST} docker compose -f microdep/tests/system-test.yml --project-directory . build 

deb-test-run:  
	@echo "Starting deb system test environment (containers) for PS Microdep..."
	DISTRO=${DEBDIST} docker compose -f microdep/tests/system-test.yml --project-directory . up

deb-test:  clean-deb-test deb-build deb-test-build deb-test-run

clean-rpm-test:  
	@echo "Clean up rpm tests of PS Microdep..."
	-DISTRO=${RPMDIST} docker compose -f microdep/tests/system-test.yml --project-directory . down 	

clean-deb-test:  
	@echo "Clean up deb tests of PS Microdep..."
	-DISTRO=${DEBDIST} docker compose -f microdep/tests/system-test.yml --project-directory . down 	

clean-rpm-build: unibuild-compose.yml
	@echo "Removing locally built rpm repos..."
	-docker compose -f unibuild-compose.yml run ${RPMDIST} unibuild clean

clean-deb-build: unibuild-compose.yml
	@echo "Removing locally built deb repos..."
	-docker compose -f unibuild-compose.yml run ${DEBDIST}_${ARCH} unibuild clean

deb: clean-deb-build deb-build

rpm: clean-rpm-build rpm-build
