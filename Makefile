#
# Makefile for Any Package
#

include $(wildcard unibuild/unibuild.make)

default:
	@echo "Run 'make system-test' to initiate container based test environment running PS Microdep"

system-test:
	@echo "Prepareing system test of PS Microdep..."
	@if [ ! -d unibuild-repo/RPMS ]; then echo "Error: Microdep repos seem unavailable. Apply unibuild to build packages."; exit 1; fi
	docker compose -f microdep/tests/system-test.yml --project-directory . build 
	docker compose -f microdep/tests/system-test.yml --project-directory . up

clean-test:
	docker compose -f microdep/tests/system-test.yml --project-directory . down 	
