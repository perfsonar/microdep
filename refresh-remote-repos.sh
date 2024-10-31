#!/bin/bash
#
# Refresh remote repos at give host
#

USER="root"
HOST=""
DISTRO="auto"

usage () {
    echo "Usage: `basename $0` [options] host-name"
    echo "-h              Help message."
    echo "-u username     Remote user. Default is $USER."
    echo "-d distro       Select distro, rpm/deb/auto. Default is $DISTRO."
    echo "-s              Be silent"

    exit 1;
}

msg () {
    # Output message to stdout if appropriate
    if [ -z $SILENT ]; then 
	echo $*
    fi
}

# Parse arguments
while getopts ":hsd:u:" opt; do
    case $opt in
	d)
	    DISTRO=$OPTARG
	    ;;
	u)
	    USER=$OPTARG
	    ;;
	s)
	    SILENT=y
	    ;;
	h)
	    echo "Refresh remote repos at give host."
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

HOST=$1
if [ -z "$HOST" ]; then
    usage
fi

if [ "$DISTRO"="auto" ]; then
    # Attempt to detect relevant distro
    ssh $USER@$HOST grep ID_LIKE /etc/os-release | grep -q rhel && DISTRO="rpm"
    ssh $USER@$HOST grep ID_LIKE /etc/os-release | grep -q debian && DISTRO="deb"
fi

read -p "Sync $DISTRO-repos to $USER@$HOST (y/N)? " YESNO
if [  "$YESNO" != "y" -a  "$YESNO" != "Y" ]; then exit 0; fi

if [ "$DISTRO" = "rpm" ]; then

    echo "Synching to remote repo at $USER@$HOST ..."
    rsync -vr unibuild-repo/RPMS $USER@$HOST:/var/lib/unibuild-repo/
    rsync -vr pstracetree/unibuild-repo/RPMS $USER@$HOST:/var/lib/unibuild-repo/

    echo "Preparing remote repo ..."
    ssh $USER@$HOST dnf -y install centos-release-rabbitmq-38 yum-utils createrepo
    #ssh $USER@$HOST rm -rf /var/lib/unibuild-repo/repodata
    ssh $USER@$HOST createrepo /var/lib/unibuild-repo
    
    ssh $USER@$HOST dnf repolist | grep -q file:///var/lib/unibuild-repo
#    if [ $? -gt 0 ]; then
	echo "Enabling remote repo ..."
	ssh $USER@$HOST yum-config-manager --add-repo file:///var/lib/unibuild-repo
#    fi
    echo "Refreshing repo list ..."
    ssh $USER@$HOST dnf clean all
    ssh $USER@$HOST dnf -y update --nogpgcheck
    echo "Done!"
    echo "Packages in local repo:"
    ssh $USER@$HOST dnf list | grep unibuild-repo

elif [ "$DISTRO" = "deb" ]; then
    echo "Synching to remote $DISTRO-repo at $USER@$HOST ..."
    rsync -vr unibuild-repo/*.deb unibuild-repo/Packages unibuild-repo/Release $USER@$HOST:/var/lib/unibuild-repo/
    rsync -vr pstracetree/unibuild-repo/*.deb pstracetree/unibuild-repo/Packages pstracetree/unibuild-repo/Release $USER@$HOST:/var/lib/unibuild-repo/

    echo "Enabling remote repo ..."
    TMPFILE=$(mktemp)
    echo "deb [trusted=yes] file:/var/lib/unibuild-microdep-repo ./" > $TMPFILE
    scp $TMPFILE $USER@$HOST:/etc/apt/sources.list.d/local-microdep-repo.list
    echo "Refreshing repo list ..."
    ssh $USER@$HOST apt-get -y update
    echo "Done!"
    echo "Packages in local repo:"
    ssh $USER@$HOST apt list | grep "\./"
   
else
    echo "Error: Unknown distro $DISTRO."
    exit 1
fi

