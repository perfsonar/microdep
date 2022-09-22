#!/bin/bash
#
#  Start up and initialise microdep+perfosonar test environment
#
#  Author: Otto J Wittner <otto.wittner@sikt.no>
#  Date: 2022-09-09
#

# Start docker containers (detatched)
echo "Starting containers..."
docker-compose up -d
echo "done"

# Setup delay and loss in internal network
echo "Setting up network emulation..."
docker exec perfsonar-in-container_testpoint_1 delay-loss-setup.sh -o -d 20 -l 5 eth0
#docker exec perfsonar-in-container_toolkit_1 delay-loss-setup.sh -o -d 20 -l 5 eth0
echo "done."



