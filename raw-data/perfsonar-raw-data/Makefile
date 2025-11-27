PACKAGE=perfsonar-raw-data
ROOTPATH=/usr/lib/perfsonar
CONFIGPATH=/etc/perfsonar
PACKAGEPATH=.
PERFSONAR_AUTO_VERSION=5.3.0
PERFSONAR_AUTO_RELNUM=1
VERSION=${PERFSONAR_AUTO_VERSION}
RELEASE=${PERFSONAR_AUTO_RELNUM}
FORCE=no

default: dist

dist: MANIFEST
	@echo "Creating tar-package of project..."
	mkdir /tmp/$(PACKAGE)-$(VERSION)
# Create tar based on list of files in MANIFEST
	tar ch -T MANIFEST | tar x -C /tmp/$(PACKAGE)-$(VERSION)
	tar czf $(PACKAGE)-$(VERSION).tar.gz -C /tmp $(PACKAGE)-$(VERSION)
	rm -rf /tmp/$(PACKAGE)-$(VERSION)

install:
#	Install all files according to MANIFEST
	@echo Installing...
	@awk -v rp=$(ROOTPATH) -v cp=$(CONFIGPATH) '{ \
		if ( substr($$1,1,1) != "#" && NF >= 1) { \
			cmd=""; \
			if ( substr($$1,1,4) == "etc/" ) { \
				cmd="install -m 640 -TD "$$1" "cp"/"substr($$1,5) \
			} else { \
				cmd="install -m 640 -TD "$$1" "rp"/"$$1 \
			} \
			system(cmd); \
			split(cmd,c," "); print(c[6]); \
		} \
	}'  MANIFEST

uninstall:
#	Remove all files according to MANIFEST
	@echo Removing...
	@awk -v rp=$(ROOTPATH) -v cp=$(CONFIGPATH) '{ \
		if ( substr($$1,1,1) != "#" ) { \
			cmd=""; \
			if ( substr($$2,1,4) == "etc/" ) { \
				cmd="rm -f "cp"/"substr($$1,5) \
			} else { \
				cmd="rm -f "rp"/"$$1 \
			} \
			system(cmd); \
			split(cmd,c," "); print(c[3]); \
		} \
	}'  MANIFEST

clean:

#### psconfig leftovers... ###
#test:
#	PERL_DL_NONLAZY=1 /usr/bin/perl "-MExtUtils::Command::MM" "-e" "test_harness(0)" t/*.t

#test_jenkins:
#	mkdir -p tap_output
#	PERL5OPT=-MDevel::Cover prove t/ --archive tap_output/
