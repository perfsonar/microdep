#!/bin/bash
#
# Prepare a unibuild folder for building a perl library from CPAN
#
# Changlog:
#  - 2024-04-04 Otto J Wittner - Created

BUILDROOT=$(pwd)
SRCROOT=$(dirname $(pwd))
DISTRO="el9"
declare -A DISTROS
DISTROS[el9]="rpm"

usage () {
    echo "Usage: `basename $0` [options] cpan-lib ..."
    echo "  -h         Help message."
    echo "  -d distro  Linux distro to build for. Default is $DISTRO. Supported are: ${!DISTROS[@]}"
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

#Prepare environment
cp .rpmmacros ~/
dnf install -qy cpanspec

for PERLLIB in $*
do
    msg "Perparing unibuild evironment for $PERLLIB ..."
    
    DIR=$(echo $PERLLIB | awk '{print tolower($0)}' | sed 's/::/_/g')
    DIR="perl_${DIR}"

    # Prepare unibuild folders
    mkdir -p $DIR/unibuild-packaging/${DISTROS[$DISTRO]}
    cd $DIR
    # Fetch source and create spec (with perl module syntax spec as "Provides:")
    TARFILE=$(ls *.tar.gz 2>/dev/null | head -n 1)
    if [ "$TARFILE" ]; then
	# Make spec of available tar
	cpanspec -o -m -v $TARFILE
    else
	# Download tar from CPAN and make spec
	cpanspec -o -m -v $PERLLIB
    fi
    if [ $? -eq 0 ]; then
	# cpanspec succeeded.
	# Fix source in spec
	sed -i -E 's|^(Source0:.*)http.*/(.*)|\1\2 |g' *.spec

	# Add modules provided by lib
	#MODULES=$( tar -tvf *.tar.gz  | grep "/lib/.*\.pm" | sed -E 's|.*/lib/(.*)\.pm|\1|g' | sed 's|/|::|g')
	MODULES=$( tar -tvf *.tar.gz  | awk '{print $6}' | grep "^[^/]*/lib/.*\.pm" |  sed -E 's|.*/lib/(.*)\.pm|\1|g' | sed 's|/|::|g')
	for l in $MODULES; do
	    # Add perl module syntax to spec for module
	    sed -i -E "s|^(%description)|Provides:       perl($l)\n\1|g" *.spec
	done
	if [ "$MODULES" ]; then
	    # Make it pretty. Add an extra line feed
	    sed -i -E "s|^(%description)|\n\1|g" *.spec
	else
	    msg "Waring: No modules (*.pm) found in /lib in library."
	    # Add perl module syntax to spec for core module
	    sed -i -E "s|^(%description)|Provides:       perl($PERLLIB)\n\n\1|g" *.spec
	fi
	
	mv *.spec unibuild-packaging/${DISTROS[$DISTRO]}
	cat <<EOF > Makefile
#
# Makefile for Any Package
#

include unibuild/unibuild.make
EOF
	cd ..
	grep -q "^${DIR}$" unibuild-order
	if [ $? -gt 0 ]; then
	    # Add new module to order list
	    sed  -i "s|# Order-list|# Order-list\n${DIR}|g" unibuild-order
	    echo "${DIR} added to unibuild-order"
	fi
    fi
	echo
done
