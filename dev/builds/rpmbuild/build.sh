#!/bin/bash
#
# Build rmp package(s)
#
# Based on https://hub.docker.com/r/jc21/rpmbuild-centos7
#

BUILDROOT=$(pwd)
SRCROOT=$(dirname $(dirname $(pwd)))
DISTRO=alma9
DISTROS="alma9 centos7"

usage () {
    echo "Usage: `basename $0` [-hq] [-d distro] specfile.spec"
    echo "  -h         Help message."
    echo "  -d distro  Linux distro to build for. Default is $DISTRO. Supported are: $DISTROS"
    echo "  -q         Be quiet."
    exit 1;
}

msg () {
    # Output message to stdout if appropriate
    if [ -z $QUIET ]; then 
	echo $*
    fi
}

# Parse arguments
while getopts ":hqd:" opt; do
    case $opt in
	d)
	    if [ "`echo "$DISTROS" | grep -w $OPTARG`" ]; then
		DISTRO=$OPTARG
	    else
		echo "Unsupported distro $OPTARG."
		exit 1
	    fi
	    ;;
	q)
	    QUIET="yes"
	    ;;
	h)
	    echo "Run all job from crontab for given user."
	    usage
	    ;;
	\?)
	    echo "Invalid option: -$OPTARG" >&2
	    exit 1
	    ;;
	:)
	    echo "Option -$OPTARG requires an argument." >&2
	    exit 1
	    ;;
    esac
done
shift $(($OPTIND - 1))  # (Shift away parsed arguments)

if [ $# -lt 1 ]; then
    usage
fi

SPEC=$(basename $1)
if [ ! -f "SPECS/$SPEC"  ]; then
    # Specfile not in expected folder
    echo "Error: Copy specfile into ./SPECS/ subfolder"
    exit 1
fi

#echo $DISTRO $BUILDROOT $SRCROOT $SPEC

# Prepare source file archive
make -C $SRCROOT dist
cp $SRCROOT/perfsonar-microdep*.tar.gz SOURCES

#docker run \
#       --name rpmbuild-$DISTRO \
#       -v $RPMBUILDROOT:/home/rpmbuilder/rpmbuild \
#       -v $SRCROOT:/home/src \
#       --rm=true \
#       ottojwittner/rpmbuild-$DISTRO \
#       /bin/build-spec /home/rpmbuilder/rpmbuild/$SPEC

export DISTRO
#export BUILDROOT
#export SRCROOT
export SPEC

docker-compose up --build rpmbuild

exit $?


