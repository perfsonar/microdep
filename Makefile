#
# Makefile for Any Package
#

include $(wildcard unibuild/unibuild.make)

default:
	@echo "Run 'make system-test' to initiate container based test environment running PS Microdep"

system-test:
	@echo "Prepareing system test of PS Microdep..."
	docker compose -f microdep/tests/system-test.yml --project-directory . build 
	docker compose -f microdep/tests/system-test.yml --project-directory . up 
	@echo "System test completed."
