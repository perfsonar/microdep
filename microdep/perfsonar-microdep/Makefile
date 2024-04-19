PACKAGE=perfsonar-microdep
ROOTPATH=/usr/lib/perfsonar
CONFIGPATH=/etc/perfsonar
PACKAGEPATH=.
PERFSONAR_AUTO_VERSION=5.1.0
PERFSONAR_AUTO_RELNUM=1
VERSION=${PERFSONAR_AUTO_VERSION}
RELEASE=${PERFSONAR_AUTO_RELNUM}
FORCE=no

default:
# Check if files in current dev env are in sync with files in legacy dev env
	@awk '\
	BEGIN{ R=0 } \
	{ \
		if ( substr($$1,1,1) != "#" && NF == 2 ) { \
			D= system("diff -q "$$1" "$$2); \
			R=R + D; \
			if ( D > 0 && system("test "$$1" -ot "$$2) == 0 ) {\
				print("File  "$$1" is older than "$$2"\n") \
			}\
		} \
	} \
	END{ if ( R > 0) { \
                print "Files in root environment are out-of-sync with /dev. run \"make resync\"." ;\
             } else { \
                print "No need to build the package. Just run \"make install\"."; \
	     } \
        }'  DEV-PROD.map

resync:
# Sync files in (legacy) dev folder with root environment
	@awk -v f=$(FORCE) '\
	BEGIN{ R=0 } \
	{ \
		if ( substr($$1,1,1) != "#" && NF == 2 ) { \
			D=system("diff -q "$$1" "$$2); \
			if (  D > 0 || f == "yes" ) {\
				if ( D == 2 || system("test "$$1" -nt "$$2) == 0 || f == "yes" ) {\
					R=R + system("install -v -m 644 -TD "$$1" "$$2); \
				} else {\
					print("File  "$$1" is older than "$$2". Skipping update.\n") \
				}\
			}\
		} \
	} \
	END{ if ( R > 0) { \
                print "Error: Resync failed." ;\
		exit 1;\
             } else { \
                print "Ready for \"make install\" or \"make dist\" ( or rerun \"make -e FORCE=yes resync\" to sync older files too.)"; \
	     } \
        }'  DEV-PROD.map
# Update MANIFEST file
	@awk '{ if ( substr($$1,1,1) != "#") { print $$NF; } }'  DEV-PROD.map > MANIFEST

manifest:
# Update MANIFEST file
	awk '{ if ( substr($$1,1,1) != "#") { print $$NF; } }'  DEV-PROD.map > MANIFEST

dist:
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
