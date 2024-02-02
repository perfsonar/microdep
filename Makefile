PACKAGE=perfsonar-microdep
ROOTPATH=/usr/lib/perfsonar
CONFIGPATH=/etc/perfsonar/microdep
PERFSONAR_AUTO_VERSION=5.1.0
PERFSONAR_AUTO_RELNUM=1
VERSION=${PERFSONAR_AUTO_VERSION}
RELEASE=${PERFSONAR_AUTO_RELNUM}

default:
	@echo No need to build the package. Just run \"make install\"

dist:
	@echo -n Preparing package $(PACKAGE)-$(VERSION) ...
	@mkdir /tmp/$(PACKAGE)-$(VERSION)
# Install all files from MANIFEST.in in tmp folder
	@awk -v rp=$(ROOTPATH) -v tmp=/tmp/$(PACKAGE)-$(VERSION) '{ \
		if ( substr($$1,1,1) != "#" && NF == 2 ) { \
			cmd=""; \
			if ( substr($$2,1,1) == "/" ) { \
				cmd="install -m 640 -TD "$$1" "tmp"/"substr($$2,2) \
			} else { \
				cmd="install -m 640 -TD "$$1" "tmp"/"substr(rp,2)"/"$$2 \
			} \
			system(cmd); \
			split(cmd,c," "); print(C[6]); \
		} \
	}'  MANIFEST.in > /tmp/$(PACKAGE)-$(VERSION)/MANIFEST
# Add MANIFEST file too
	@find /tmp/$(PACKAGE)-$(VERSION) -type f | cut -f4- -d"/" > /tmp/$(PACKAGE)-$(VERSION)/MANIFEST
#	Wrap up and clean up 
	@tar czf $(PACKAGE)-$(VERSION).tar.gz -C /tmp $(PACKAGE)-$(VERSION)
	@rm -rf /tmp/$(PACKAGE)-$(VERSION)
	@echo " done."

install:
#	Install all file as specified in MANIFEST.in
	@echo Installing...
	@awk -v rp=$(ROOTPATH) '{ \
		if ( substr($$1,1,1) != "#" && NF == 2 ) { \
			cmd=""; \
			if ( substr($$2,1,1) == "/" ) { \
				cmd="install -m 640 -TD "$$1" "$$2 \
			} else { \
				cmd="install -m 640 -TD "$$1" "rp"/"$$2 \
			} \
			system(cmd); \
			split(cmd,c," "); print(c[6]); \
		} \
	}'  MANIFEST.in

uninstall:
#	Remove all file as specified in MANIFEST.in
	@echo Removing...
	@awk -v rp=$(ROOTPATH) '{ \
		if ( substr($$1,1,1) != "#" && NF == 2 ) { \
			cmd=""; \
			if ( substr($$2,1,1) == "/" ) { \
				cmd="rm -f "$$2 \
			} else { \
				cmd="rm -f "rp"/"$$2 \
			} \
			system(cmd); \
			split(cmd,c," "); print(c[3]); \
		} \
	}'  MANIFEST.in 

#### psconfig leftovers... ###
#test:
#	PERL_DL_NONLAZY=1 /usr/bin/perl "-MExtUtils::Command::MM" "-e" "test_harness(0)" t/*.t

#test_jenkins:
#	mkdir -p tap_output
#	PERL5OPT=-MDevel::Cover prove t/ --archive tap_output/
