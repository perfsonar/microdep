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
	mkdir /tmp/$(PACKAGE)-$(VERSION)
# Install all files from MANIFEST.in in tmp folder
	awk -v rp=$(ROOTPATH) -v tmp=/tmp/$(PACKAGE)-$(VERSION) '{ \
		if ( substr($$1,1,1) != "#" && NF == 2 ) { \
			cmd=""; \
			if ( substr($$2,1,1) == "/" ) { \
				cmd="install -m 640 -TD "$$1" "tmp"/"substr($$2,2) \
			} else { \
				cmd="install -m 640 -TD "$$1" "tmp"/"substr(rp,2)"/"$$2 \
			} \
			system(cmd); \
		} \
	}'  MANIFEST.in > /tmp/$(PACKAGE)-$(VERSION)/MANIFEST
# Add MANIFEST file too
	find /tmp/$(PACKAGE)-$(VERSION) -type f | cut -f4- -d"/" > /tmp/$(PACKAGE)-$(VERSION)/MANIFEST
#	Wrap up and clean up 
	tar czf $(PACKAGE)-$(VERSION).tar.gz -C /tmp $(PACKAGE)-$(VERSION)
	rm -rf /tmp/$(PACKAGE)-$(VERSION)


install:

#	mkdir -p ${ROOTPATH}
#	mkdir -p ${CONFIGPATH}/pscheduler.d
#	mkdir -p ${CONFIGPATH}/maddash.d
#	mkdir -p ${CONFIGPATH}/archives.d
#	mkdir -p ${CONFIGPATH}/transforms.d
#	INSTMP=$(mktemp -d)
#
#	tar ch --exclude=etc/* --exclude=*spec --exclude=dependencies --exclude=LICENSE --exclude=MANIFEST --exclude=Makefile -T MANIFEST | tar x -C ${ROOTPATH}
#	for i in `cat MANIFEST | grep ^etc/ | sed "s/^etc\///"`; do  mkdir -p `dirname $(CONFIGPATH)/$${i}`; if [ -e $(CONFIGPATH)/$${i} ]; then install -m 640 -c etc/$${i} $(CONFIGPATH)/$${i}.new; else install -m 640 -c etc/$${i} $(CONFIGPATH)/$${i}; fi; done

#test:
#	PERL_DL_NONLAZY=1 /usr/bin/perl "-MExtUtils::Command::MM" "-e" "test_harness(0)" t/*.t

#test_jenkins:
#	mkdir -p tap_output
#	PERL5OPT=-MDevel::Cover prove t/ --archive tap_output/
