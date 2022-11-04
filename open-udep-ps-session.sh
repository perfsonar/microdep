#!/bin/bash
#
# Open Gnome-terminal session towards remote host with a few tabs
#
HOST="streamer.uninett.no"
WDIR="~/microdep-dev/perfsonar-in-container"

if [ $# -ge 1 ]; then
    HOST=$1
fi

gnome-terminal --tab --profile="white bg" -- ssh -4t $HOST emacs  $WDIR &
sleep 1
gnome-terminal --tab --profile="Default" -- ssh -4t $HOST "cd $WDIR && bash" &
gnome-terminal --tab --profile="Default" -- ssh -4t $HOST "cd $WDIR && bash" &
