#
# Makefile for Any Package
#

include $(wildcard unibuild/unibuild.make)

default:
	@echo "*** Building packages for Microdep ***"
	@echo "Run 'make rpm-build' or 'make deb-build' to build packages for a distribution (applying 'unibuild' in containers)."
	@echo "Run 'make clean-rpm-build' or 'make clean-deb-build' to clean away build files (applying 'unibuild' in containers)."
	@echo "Run 'bin/refresh-remote-repos.sh <hostname>' to install distribution on a remote perfsonar toolkit host (ssh access required)."
	@echo
	@echo "*** Running Microdep in container test environment ***"
	@echo "NOTE: CURRENTLY UNSTABLE/NOT WORKING 100%"
	@echo "Run 'make rpm-test' or 'make deb-test' to initiate container based test environment."
	@echo "Run 'make clean-test' to bring down running system test environment."

unibuild-compose.yml:
	@echo "Fetching unibuild docker compose file..."
	@wget -O unibuild-compose.yml https://raw.githubusercontent.com/perfsonar/unibuild/main/docker-envs/docker-compose.yml

pstracetree:
	@echo "Cloning pstracetree..."
	git clone https://github.com/perfsonar/pstracetree.git

pstracetree/unibuild-repo/RPMS: pstracetree unibuild-compose.yml
	@echo "Build pstracetree EL9 rpms..."
	cp unibuild-compose.yml pstracetree/
	cd pstracetree && docker compose -f unibuild-compose.yml run el9 bash -c "unibuild build"
#	cd pstracetree && docker compose -f unibuild-compose.yml run el9 bash -c "dnf -y update && unibuild build"

pstracetree/unibuild-repo/Packages: pstracetree unibuild-compose.yml
	@echo "Build pstracetree U22 deb packages..."
	cp unibuild-compose.yml pstracetree/
	cd pstracetree && docker compose -f unibuild-compose.yml run u22_amd64 bash -c "apt -y update && unibuild build"

unibuild-repo/RPMS: unibuild-compose.yml
	@echo "Build Microdep EL9 rpms..."
	docker compose -f unibuild-compose.yml run el9 bash -c "unibuild build"
#	docker compose -f unibuild-compose.yml run el9 bash -c "dnf -y update && unibuild build"

deb-systemd-services: 
	rsync  -t microdep/perfsonar-microdep/scripts/perfsonar-microdep-gap-ana.service microdep/perfsonar-microdep/unibuild-packaging/deb/perfsonar-microdep-ana.perfsonar-microdep-gap-ana.service
	rsync  -t microdep/perfsonar-microdep/scripts/perfsonar-microdep-trace-ana.service microdep/perfsonar-microdep/unibuild-packaging/deb/perfsonar-microdep-ana.perfsonar-microdep-trace-ana.service
	rsync  -t microdep/perfsonar-microdep/scripts/perfsonar-microdep-restart.service microdep/perfsonar-microdep/unibuild-packaging/deb/perfsonar-microdep-ana.perfsonar-microdep-restart.service
	rsync  -t microdep/perfsonar-microdep/scripts/perfsonar-microdep-restart.timer microdep/perfsonar-microdep/unibuild-packaging/deb/perfsonar-microdep-ana.perfsonar-microdep-restart.timer

unibuild-repo/Packages: deb-systemd-services unibuild-compose.yml pstracetree/unibuild-repo/Packages
	@echo "Build Microdep U22 deb packages..."
	docker compose -f unibuild-compose.yml run u22_amd64 bash -c "echo 'deb [trusted=yes] file:/app/pstracetree/unibuild-repo ./' > /etc/apt/sources.list.d/local-pstracetree-repo.list && apt -y update && unibuild build"

rpm-build: pstracetree/unibuild-repo/RPMS unibuild-repo/RPMS 

rpm-test-build: rpm-build 
	@echo "Building rpm system test environment (containers) for PS Microdep..."
	DISTRO=el9 docker compose -f microdep/tests/system-test.yml --project-directory . build 

rpm-test:  clean-rpm-test rpm-test-build
	@echo "Starting rpm system test environment (containers) for PS Microdep..."
	DISTRO=el9 docker compose -f microdep/tests/system-test.yml --project-directory . up

deb-build: unibuild-repo/Packages 

deb-test-build: pstracetree/unibuild-repo/Packages unibuild-repo/Packages 
	@echo "Building deb system test environment (containers) for PS Microdep..."
	DISTRO=u22 docker compose -f microdep/tests/system-test.yml --project-directory . build 

deb-test:  clean-deb-test deb-test-build
	@echo "Starting deb system test environment (containers) for PS Microdep..."
	DISTRO=u22 docker compose -f microdep/tests/system-test.yml --project-directory . up

clean-rpm-test:  
	@echo "Clean up rpm tests of PS Microdep..."
	-DISTRO=el9 docker compose -f microdep/tests/system-test.yml --project-directory . down 	

clean-deb-test:  
	@echo "Clean up deb tests of PS Microdep..."
	-DISTRO=u22 docker compose -f microdep/tests/system-test.yml --project-directory . down 	

clean-rpm-build: unibuild-compose.yml
	@echo "Removing locally built rpm repos..."
	-cp unibuild-compose.yml pstracetree/
	-cd pstracetree && docker compose -f unibuild-compose.yml run el9 unibuild clean
	-docker compose -f unibuild-compose.yml run el9 unibuild clean

clean-deb-build: unibuild-compose.yml
	@echo "Removing locally built deb repos..."
	-cp unibuild-compose.yml pstracetree/
	-cd pstracetree && docker compose -f unibuild-compose.yml run u22_amd64 unibuild clean
	-docker compose -f unibuild-compose.yml run u22_amd64 unibuild clean

deb: clean-deb-build deb-build

rpm: clean-rpm-build rpm-build
