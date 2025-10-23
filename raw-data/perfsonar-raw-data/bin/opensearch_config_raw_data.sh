#!/bin/bash
#
#  Configure indices, templates and policies for storage of raw test data in Opensearch
#
#  Code is based on  /usr/lib/perfsonar/archive/perfsonar-scripts/pselastic_secure_{pos,pre}.sh 
#
OPENSEARCH_URL="https://localhost:9200"
OPENSEARCH_CONFIG_DIR=/etc/opensearch
OPENSEARCH_SECURITY_PLUGIN=/usr/share/opensearch/plugins/opensearch-security
OPENSEARCH_SECURITY_CONFIG=${OPENSEARCH_CONFIG_DIR}/opensearch-security
PASSWORD_FILE=/etc/perfsonar/opensearch/auth_setup.out
INDICES="pscheduler_raw_latencybg"

usage () {
    echo "Usage: `basename $0` [options] [opensearch-host-url]"
    echo "-h              Help message."
    echo "-p file         Password file. Default is $PASSWORD_FILE."
    echo "-c dir          Config directory. Defaults to $OPENSEARCH_CONFIG_DIR."
    echo "-s dir          Security plugin directory. Defaults to $OPENSEARCH_SECURITY_PLUGIN."
    echo "-r              Remove templates, indices and data."
    echo "-q              Be quiet."
    echo "-y              Answer yes to prompts."

    exit 1;
}

msg () {
    # Output message to stdout if appropriate
    if [ -z $QUIET ]; then 
	echo $*
    fi
}

wait_opensearch () {
    # Wait for Opensearch to start
    msg "Waiting for opensearch to start..."
    opensearch_systemctl_status=$(systemctl is-active opensearch)
    i=0
    opensearch_restarts=0
    while [ $opensearch_systemctl_status != "active" ]
    do
	sleep 1
	((i++))
	# Wait a maximum of 100 seconds for the opensearch to start
	if [[ $i -eq 100 ]]; then
            msg "[Warning] Opensearch systemctl start timeout"
            exit 0
	fi
	#check if process failed
	if [ "$opensearch_systemctl_status" == "failed" ]; then
            if [[ $opensearch_restarts -eq 0 ]]; then
		msg "Restarting opensearch"
		systemctl reset-failed opensearch
		systemctl start opensearch
		((opensearch_restarts++))
		msg "Restart complete"
            else
		msg "[Warning] Opensearch in failed state even after restart attempt"
		exit 0
            fi
	fi
	opensearch_systemctl_status=$(systemctl is-active opensearch)
    done
    msg "Opensearch started!"
}

wait_opensearch_api () {
    # Wait for Opensearch API to start
    msg "Waiting for opensearch API to start..."
    api_status=$(curl -s -o /dev/null -w "%{http_code}" -u admin:${ADMIN_PASS} -k https://localhost:9200/_cluster/health)
    i=0
    while [[ $api_status -ne 200 ]]
    do
	sleep 1
	((i++))
	# Wait a maximum of 100 seconds for the API to start
	if [[ $i -eq 100 ]]; then
            msg "[Warning] API start timeout"
            exit 0
	fi
	api_status=$(curl -s -o /dev/null -w "%{http_code}" -u admin:${ADMIN_PASS} -k https://localhost:9200/_cluster/health)
    done
    
    msg "API started!"
}

# Parse arguments
while getopts ":p:c:s:rqyh" opt; do
    case $opt in
	p)
	    PASSWORD_FILE=$OPTARG
	    ;;
	c)
	    OPENSEARCH_CONFIG_DIR=$OPTARG
	    ;;
	s)
	    OPENSEARCH_SECURITY_PLUGIN=$OPTARG
	    ;;
	r)
	    REMOVE=y
	    ;;
	q)
	    QUIET=y
	    ;;
	y)
	    ANSWERYES=y
	    ;;
	h)
	    echo "Configure indices, templates and policies for storage of raw test results in Opensearch."
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

if [ "$1" ]; then
    OPENSEARCH_URL="$1"
fi

if [ "$REMOVE" ]; then
    # Prompt for full cleanup
    if [ -z "$ANSWERYES" ]; then
	read -p "Removing all raw data indices, templates and policies. This will likely cause data loss. Continue (yN)? " YESNO
	if [ "$YESNO" != "y" -a "$YESNO" != "Y" ]; then
	    # Abort
	    exit 0
	fi
    fi
    # Ensure Opensearch is operational
    wait_opensearch
    wait_opensearch_api
    # Remove all
    msg "Removing Opensearch templates, policies and datastreams/indices for raw data ..."
    curl -k -u admin:${ADMIN_PASS} -s -XDELETE "$OPENSEARCH_URL/_index_template/pscheduler_raw_data_policy" 2>/dev/null ; echo
    curl -k -u admin:${ADMIN_PASS} -s -XDELETE "$OPENSEARCH_URL/_plugins/_ism/policies/pscheduler_raw_data_policy" 2>/dev/null ; echo
    for i in $INDICES; do
	curl -k -u admin:${ADMIN_PASS} -s -XDELETE "$OPENSEARCH_URL/_data_stream/$i" 2>/dev/null ; echo
    done

    msg "Removal completed."
    exit 0
fi

# Create raw data index policies (ISM) and templates
ADMIN_PASS=$(grep -w "admin" $PASSWORD_FILE | head -n 1 | awk '{print $2}')
if [ $? -ne 0 ]; then
    msg "Warning: Failed to parse Opensearch password. Is perfsonar-toolkit installed?"
else
    # Ensure Opensearch is operational
    wait_opensearch
    wait_opensearch_api

    # Add templates
    msg "Adding raw data index template..."
    curl -k -u admin:${ADMIN_PASS} -s -H 'Content-Type: application/json' -XPUT "$OPENSEARCH_URL/_index_template/pscheduler_raw_data_policy" -d @/usr/lib/perfsonar/archive/config/index_template-pscheduler_raw.json 2>/dev/null ; echo
    
    if [ $(curl -s -o /dev/null -w "%{http_code}" -u admin:${ADMIN_PASS} -k "$OPENSEARCH_URL/_plugins/_ism/policies/pscheduler_raw_data_policy") -ne 200 ]; then
	# No policy found.  Create new.
	msg "Creating raw data index policy..."
	curl -k -u admin:${ADMIN_PASS} -H 'Content-Type: application/json' -X PUT "$OPENSEARCH_URL/_plugins/_ism/policies/pscheduler_raw_data_policy" -d "@/usr/lib/perfsonar/archive/config/ilm/install/pscheduler_raw_data_policy.json" 2>/dev/null ; echo
	# Apply policy to index
	msg "Applying raw data index policy to indices..."
	curl -k -u admin:${ADMIN_PASS} -H 'Content-Type: application/json' -X POST "$OPENSEARCH_URL/_plugins/_ism/add/pscheduler_raw*" -d '{ "policy_id": "pscheduler_raw_data_policy" }' 2>/dev/null ; echo
    else
	# Get policy identifiers
	P_SEQ_NO=$(curl -s -u admin:${ADMIN_PASS} -k $OPENSEARCH_URL/_plugins/_ism/policies/pscheduler_raw_data_policy | jq ._seq_no)
	P_PRIM_TERM=$(curl -s -u admin:${ADMIN_PASS} -k $OPENSEARCH_URL/_plugins/_ism/policies/pscheduler_raw_data_policy | jq ._primary_term)
	# Update policy
	msg "Updating raw data index policy..."
	curl -k -u admin:${ADMIN_PASS} -H 'Content-Type: application/json' -X PUT "$OPENSEARCH_URL/_plugins/_ism/policies/pscheduler_raw_data_policy?if_seq_no=$P_SEQ_NO&if_primary_term=$P_PRIM_TERM" -d "@/usr/lib/perfsonar/archive/config/ilm/install/pscheduler_raw_data_policy.json" 2>/dev/null ; echo
	# Roll over indices to activate new policy version
	msg "Rolling over raw data indices to ensure new policy is applied..."
	for i in INDICES; do
	    curl -k -u admin:${ADMIN_PASS} -X POST "$OPENSEARCH_URL/$i/_rollover"  2>/dev/null ; echo
	done
    fi
fi
msg "Configuration completed."
