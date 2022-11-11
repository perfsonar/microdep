#!/bin/bash
#
# Open Gnome-terminal session towards remote host with a few tabs
#
HOST="streamer.uninett.no"
WDIR="~/microdep-dev/microdep-in-perfsonar"

if [ $# -lt 1 ]; then
    echo "Opens a few gnome terminals, sshs to host and cds into given folder"
    echo "Usage: `basename $0` remote-host remote-dir"
    echo -e "\nTrying defaults ($HOST:$WDIR)..."
fi
if [ $# -ge 1 ]; then
    HOST=$1
fi
if [ $# -ge 2 ]; then
    WDIR=$2
fi


gnome-terminal --tab --profile="white bg" --title "emacs on $HOST" -- ssh -4t $HOST emacs  $WDIR &
sleep 1
gnome-terminal --tab --profile="Default" -- ssh -4t $HOST "cd $WDIR && bash" &
gnome-terminal --tab --profile="Default" -- ssh -4t $HOST "cd $WDIR && bash" &
