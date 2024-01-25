#!/bin/bash
#
# Build rmp package(s)
#

SPEC=$1
RPMBUILDROOT=$(pwd)
SRCROOT=$(pwd)/../../

if [ "$1" == "" ]; then
    echo "Usage: build.sh specfile.spec"
    exit 1;
else
    if [ ${1:0:6} != "SPECS/" ]; then
	SPEC="SPECS/$SPEC"
    fi
    docker run \
	   --name rpmbuild-centos7 \
           -v $RPMBUILDROOT:/home/rpmbuilder/rpmbuild \
	   -v $SRCROOT:/home/src \
           --rm=true \
           rpmbuild-centos7-fixed \
           /bin/build-spec /home/rpmbuilder/rpmbuild/$SPEC
    
    exit $?
fi


