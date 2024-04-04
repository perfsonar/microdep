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
for PERLLIB in $*
do
    echo "Perparing unibuild evironment for $PERLLIB ..."
    
    DIR=$(echo $PERLLIB | awk '{print tolower($0)}' | sed 's/::/_/g')
    DIR="perl_${DIR}"

    # Prepare unibuild folders
    mkdir -p $DIR/unibuild-packaging/${DISTROS[$DISTRO]}
    cd $DIR
    # Fetch source and create spec
    cpanspec -o -m -v $PERLLIB
    # Fix source in spec
    sed -i -E 's|^(Source0:.*)http.*/(.*)|\1\2 |g' *.spec
    # Add perl module syntax to spec
    sed -i -E "s|^(%description)|Provides:       perl($PERLLIB)\n\n\1|g" *.spec

    mv *.spec unibuild-packaging/${DISTROS[$DISTRO]}
    cat <<EOF > Makefile
#
# Makefile for Any Package
#

include unibuild/unibuild.make
EOF
    cd ..
    sed  -i "s|# Order-list|# Order-list\n${DIR}|g" unibuild-order
    echo "$1 added to unibuild-order"
    echo
done
