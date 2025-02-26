#!/bin/bash
#
# Refresh remote repos at give host
#

USER="root"
HOST=""
DISTRO="auto"
RSH="ssh"

usage () {
    echo "Usage: `basename $0` [options] host-name"
    echo "-h              Help message."
    echo "-u username     Remote user. Default is $USER."
    echo "-d distro       Select distro, rpm/deb/auto. Default is $DISTRO."
    echo "-e remote-sh    Remote shell cmd to apply. Default is $RSH."
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
while getopts ":hsd:u:e:" opt; do
    case $opt in
	d)
	    DISTRO=$OPTARG
	    ;;
	u)
	    USER=$OPTARG
	    ;;
	e)
	    RSH=$OPTARG
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

if [ "$DISTRO" = "auto" ]; then
    # Attempt to detect relevant distro
    $RSH $USER@$HOST grep ID_LIKE /etc/os-release | grep -q rhel && DISTRO="rpm"
    $RSH $USER@$HOST grep ID_LIKE /etc/os-release | grep -q debian && DISTRO="deb"
fi

if [ "$DISTRO" = "auto" ]; then
    echo "Error: Failed to detect distro." >&2
    exit 1
fi 

read -p "Sync $DISTRO-repos to $USER@$HOST (y/N)? " YESNO
if [  "$YESNO" != "y" -a  "$YESNO" != "Y" ]; then exit 0; fi

if [ "$DISTRO" = "rpm" ]; then

    echo "Synching to remote repo at $USER@$HOST ..."
    rsync -vr -e "$RSH" unibuild-repo/RPMS $USER@$HOST:/var/lib/unibuild-repo/
    rsync -vr -e "$RSH" pstracetree/unibuild-repo/RPMS $USER@$HOST:/var/lib/unibuild-repo/

    echo "Preparing remote repo ..."
    $RSH $USER@$HOST dnf -y install centos-release-rabbitmq-38 yum-utils createrepo
    #$RSH $USER@$HOST rm -rf /var/lib/unibuild-repo/repodata
    $RSH $USER@$HOST createrepo /var/lib/unibuild-repo
    
    $RSH $USER@$HOST dnf repolist | grep -q file:///var/lib/unibuild-repo
#    if [ $? -gt 0 ]; then
	echo "Enabling remote repo ..."
	$RSH $USER@$HOST yum-config-manager --add-repo file:///var/lib/unibuild-repo
#    fi
    echo "Refreshing repo list ..."
    $RSH $USER@$HOST dnf clean all
    $RSH $USER@$HOST dnf -y update --nogpgcheck
    echo "Done!"
    echo "Packages in local repo:"
    $RSH $USER@$HOST dnf list | grep unibuild-repo

elif [ "$DISTRO" = "deb" ]; then
    echo "Synching to remote $DISTRO-repo at $USER@$HOST ..."
    rsync -vr -e "$RSH" unibuild-repo/*.deb unibuild-repo/Packages unibuild-repo/Release $USER@$HOST:/var/lib/unibuild-microdep-repo/
    rsync -vr -e "$RSH" pstracetree/unibuild-repo/*.deb pstracetree/unibuild-repo/Packages pstracetree/unibuild-repo/Release $USER@$HOST:/var/lib/unibuild-pstracetree-repo/

    echo "Enabling remote repo ..."
    TMPDIR=$(mktemp -d)
    echo "deb [trusted=yes] file:/var/lib/unibuild-microdep-repo ./" > $TMPDIR/local-microdep-repo.list
    echo "deb [trusted=yes] file:/var/lib/unibuild-pstracetree-repo ./" > $TMPDIR/local-pstracetree-repo.list
    rsync -vr -e "$RSH" $TMPDIR/ $USER@$HOST:/etc/apt/sources.list.d/
    rm -r $TMPDIR
    echo "Refreshing repo list ..."
    $RSH $USER@$HOST apt-get -y update
    echo "Done!"
    echo "Packages in local repo:"
    $RSH $USER@$HOST apt list | grep "/unknown"
   
else
    echo "Error: Unknown distro $DISTRO."
    exit 1
fi

