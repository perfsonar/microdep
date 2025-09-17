#!/bin/bash
#
#  Configure Microdep indices, templates and policies in Opensearch
#
#  Code is based on  /usr/lib/perfsonar/archive/perfsonar-scripts/pselastic_secure_{pos,pre}.sh 
#
OPENSEARCH_URL="https://localhost:9200"
OPENSEARCH_CONFIG_DIR=/etc/opensearch
OPENSEARCH_SECURITY_PLUGIN=/usr/share/opensearch/plugins/opensearch-security
OPENSEARCH_SECURITY_CONFIG=${OPENSEARCH_CONFIG_DIR}/opensearch-security
PASSWORD_FILE=/etc/perfsonar/opensearch/auth_setup.out
MICRODEP_INDICES="dragonlab dragonlab_jitter dragonlab_routemon dragonlab_correvents microdep_gap_ana microdep_trace_ana microdep_corr_ana"

usage () {
    echo "Usage: `basename $0` [options] [opensearch-host-url]"
    echo "-h              Help message."
    echo "-p file         Password file. Default is $PASSWORD_FILE."
    echo "-c dir          Config directory. Defaults to $OPENSEARCH_CONFIG_DIR."
    echo "-s dir          Security plugin directory. Defaults to $OPENSEARCH_SECURITY_PLUGIN."
    echo "-r config|all   Remove Microdep configs from Logstash and Opensearch, or remove all (including templates, indices and data)."
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
while getopts ":p:c:s:r:qyh" opt; do
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
	    REMOVE=$OPTARG
	    ;;
	q)
	    QUIET=y
	    ;;
	y)
	    ANSWERYES=y
	    ;;
	h)
	    echo "Configure microdep indices, templates and policies in Opensearch."
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
    if [ "$REMOVE" = "config" -o "$REMOVE" = "all" ]; then
	# Clean up pipeline for logstash
	if [ -e /etc/logstash/pipelines.yml ]; then
	    msg "Removing Microdep pipeline from Logstash..."
	    TMPPIPELINE=$(mktemp)
	    cp /etc/logstash/pipelines.yml $TMPPIPELINE
	    grep -v -x -F -f /etc/perfsonar/microdep/logstash/microdep-pipelines.yml $TMPPIPELINE > /etc/logstash/pipelines.yml 
	    systemctl restart logstash.service || true
	fi
	# Remove read/write access to Microdep opensearch indices
	if [ -e /usr/lib/perfsonar/archive/config/roles.yml ]; then
	    msg "Removing read/write access to Microdep indices in Opensearch..."
	    TMPROLESYML=$(mktemp)
	    grep -v -x -F -f /etc/perfsonar/microdep/roles_yml_patch /usr/lib/perfsonar/archive/config/roles.yml > $TMPROLESYML && mv $TMPROLESYML /usr/lib/perfsonar/archive/config/roles.yml
	    # Refresh config of opensearch security
	    if [ -e $OPENSEARCH_SECURITY_CONFIG/roles.yml ]; then
		cp -f /usr/lib/perfsonar/archive/config/roles.yml $OPENSEARCH_SECURITY_CONFIG/roles.yml
		OPENSEARCH_JAVA_HOME=/usr/share/opensearch/jdk bash ${OPENSEARCH_SECURITY_PLUGIN}/tools/securityadmin.sh -cd ${OPENSEARCH_SECURITY_CONFIG} -icl -nhnv -cacert ${OPENSEARCH_CONFIG_DIR}/root-ca.pem -cert ${OPENSEARCH_CONFIG_DIR}/admin.pem -key ${OPENSEARCH_CONFIG_DIR}/admin-key.pem
	    fi
	fi
    else
	msg "Warning: Invalid removal mode '$REMOVE'."
    fi
    if [ "$REMOVE" = "all" ]; then
	# Prompt for full cleanup
	if [ -z "$ANSWERYES" ]; then
	    read -p "Removing all Microdep indices, templates and policies. This will likely cause data loss. Continue (yN)? " YESNO
	    if [ "$YESNO" != "y" -a "$YESNO" != "Y" ]; then
		# Abort
		exit 0
	    fi
	fi
	# Remove all
	msg "Removing Opensearch templates, policies and datastreams/indices for Microdep ..."
	curl -k -u admin:${ADMIN_PASS} -s -XDELETE "$OPENSEARCH_URL/_index_template/microdep_gap_ana" 2>/dev/null ; echo
	curl -k -u admin:${ADMIN_PASS} -s -XDELETE "$OPENSEARCH_URL/_index_template/microdep_trace_ana" 2>/dev/null ; echo
	curl -k -u admin:${ADMIN_PASS} -s -XDELETE "$OPENSEARCH_URL/_plugins/_ism/policies/microdep_default_policy" 2>/dev/null ; echo
	for i in $MICRODEP_INDICES; do
	    curl -k -u admin:${ADMIN_PASS} -s -XDELETE "$OPENSEARCH_URL/_data_stream/$i" 2>/dev/null ; echo
	done
    fi
    msg "Removal completed."
    exit 0
fi

# Enable Microdep pipeline for logstash (by adding content of /etc/perfsonar/microdep/microdep-pipelines.yml if not already present)
if [ -f /etc/logstash/pipelines.yml ]; then
    msg "Adding Microdep pipeline to Logstash..."
    grep -q -x -F -f /etc/perfsonar/microdep/logstash/microdep-pipelines.yml /etc/logstash/pipelines.yml || ( cat /etc/perfsonar/microdep/logstash/microdep-pipelines.yml >> /etc/logstash/pipelines.yml )
    systemctl restart logstash.service || true
fi

# Add read and write accesses to Microdep opensearch indices
if [ -e /usr/lib/perfsonar/archive/config/roles.yml ]; then
    if ! grep -q -x -F -f /etc/perfsonar/microdep/roles_yml_patch /usr/lib/perfsonar/archive/config/roles.yml; then
	# Microdep index missing. Add.
	wait_opensearch
	msg "Adding read and write access to Micordep indices..."
	sed -i '/prometheus\*/r /etc/perfsonar/microdep/roles_yml_patch' /usr/lib/perfsonar/archive/config/roles.yml
	sed -i '/prometheus_\*/r /etc/perfsonar/microdep/roles_yml_patch' /usr/lib/perfsonar/archive/config/roles.yml
	# Refresh config of opensearch security
	if [ -e $OPENSEARCH_SECURITY_CONFIG/roles.yml ]; then
	    cp -f /usr/lib/perfsonar/archive/config/roles.yml $OPENSEARCH_SECURITY_CONFIG/roles.yml
	    OPENSEARCH_JAVA_HOME=/usr/share/opensearch/jdk bash ${OPENSEARCH_SECURITY_PLUGIN}/tools/securityadmin.sh -cd ${OPENSEARCH_SECURITY_CONFIG} -icl -nhnv -cacert ${OPENSEARCH_CONFIG_DIR}/root-ca.pem -cert ${OPENSEARCH_CONFIG_DIR}/admin.pem -key ${OPENSEARCH_CONFIG_DIR}/admin-key.pem
	else
	    msg "Warning: Missing file $OPENSEARCH_SECURITY_CONFIG/roles.yml. Is Opensearch installed?"
	fi
    fi
fi


# Create Microdep ana index policies (ISM) and templates
ADMIN_PASS=$(grep -w "admin" $PASSWORD_FILE | head -n 1 | awk '{print $2}')
if [ $? -ne 0 ]; then
    msg "Warning: Failed to parse Opensearch password. Is perfsonar-toolkit installed?"
else
    wait_opensearch
    wait_opensearch_api
    # Opensearch is operational

    # Add templates
    msg "Adding Microdep index templates..."
    curl -k -u admin:${ADMIN_PASS} -s -H 'Content-Type: application/json' -XPUT "$OPENSEARCH_URL/_index_template/microdep_gap_ana" -d @/etc/perfsonar/microdep/os-template-gap-ana.json 2>/dev/null ; echo
    curl -k -u admin:${ADMIN_PASS} -s -H 'Content-Type: application/json' -XPUT "$OPENSEARCH_URL/_index_template/microdep_trace_ana" -d @/etc/perfsonar/microdep/os-template-trace-ana.json 2>/dev/null ; echo
    
    if [ $(curl -s -o /dev/null -w "%{http_code}" -u admin:${ADMIN_PASS} -k "$OPENSEARCH_URL/_plugins/_ism/policies/microdep_default_policy") -ne 200 ]; then
	# No policy found.  Create new.
	msg "Creating default Microdep index policy..."
	curl -k -u admin:${ADMIN_PASS} -H 'Content-Type: application/json' -X PUT "$OPENSEARCH_URL/_plugins/_ism/policies/microdep_default_policy" -d "@/etc/perfsonar/microdep/microdep_default_policy.json" 2>/dev/null ; echo
	# Apply policy to index
	msg "Applying Microdep index policy to indices..."
	curl -k -u admin:${ADMIN_PASS} -H 'Content-Type: application/json' -X POST "$OPENSEARCH_URL/_plugins/_ism/add/dragonlab*" -d '{ "policy_id": "microdep_default_policy" }' 2>/dev/null ; echo
	curl -k -u admin:${ADMIN_PASS} -H 'Content-Type: application/json' -X POST "$OPENSEARCH_URL/_plugins/_ism/add/microdep*" -d '{ "policy_id": "microdep_default_policy" }' 2>/dev/null ; echo
    else
	# Get policy identifiers
	P_SEQ_NO=$(curl -s -u admin:${ADMIN_PASS} -k $OPENSEARCH_URL/_plugins/_ism/policies/microdep_default_policy | jq ._seq_no)
	P_PRIM_TERM=$(curl -s -u admin:${ADMIN_PASS} -k $OPENSEARCH_URL/_plugins/_ism/policies/microdep_default_policy | jq ._primary_term)
	# Update policy
	msg "Updating default Microdep index policy..."
	curl -k -u admin:${ADMIN_PASS} -H 'Content-Type: application/json' -X PUT "$OPENSEARCH_URL/_plugins/_ism/policies/microdep_default_policy?if_seq_no=$P_SEQ_NO&if_primary_term=$P_PRIM_TERM" -d "@/etc/perfsonar/microdep/microdep_default_policy.json" 2>/dev/null ; echo
	# Roll over indices to activate new policy version
	msg "Rolling over indices to ensure new policy is applied..."
	for i in $MICRODEP_INDICES; do
	    curl -k -u admin:${ADMIN_PASS} -X POST "$OPENSEARCH_URL/$i/_rollover"  2>/dev/null ; echo
	done
    fi
fi
msg "Configuration completed."
