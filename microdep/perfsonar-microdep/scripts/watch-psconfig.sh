#!/bin/bash
#
# Watch for changes among psconfig-files
# and update microdep db if any changes are detected 
#

# Loop forever
while true; do

    inotifywait -e modify,create,delete -r /etc/perfsonar/psconfig/pscheduler.d | \
	<some command to execute when a file event is recorded. See inotifywait(1) man page for output format. >

done
