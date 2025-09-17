#!/bin/bash
#
# Clear all scheduled tasks and restart both pscheduler and psconfig
#
#

echo "Stopping psConfig..."
sudo systemctl stop psconfig-pscheduler-agent.service
echo "Stopping pscheduler..."
sudo pscheduler internal service stop
echo "Clearing pscheduler..."
#date -I | sudo pscheduler internal reset
sudo pscheduler internal reset
echo "Restarting pscheduler..."
sudo pscheduler internal service start
echo "Restarting psConfig..."
sudo systemctl start psconfig-pscheduler-agent.service
