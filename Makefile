#
# Makefile for Any Package
#

include $(wildcard unibuild/unibuild.make)

default:
	@echo "Run 'make system-test' to initiate container based test environment running PS Microdep"

system-test:
	@echo "Prepareing system test of PS Microdep..."
	@sleep 3 # Simulate test
	@echo "System test completed."
