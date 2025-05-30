#!/bin/bash
#
#  Create new DB for routing monitor
#

USERNAME="traceroute"
PASSWD="NeeLeoth9e"
HOST="localhost"
LIST=""
DROP=""
DROPONLY=""
SILNET=""
DBTYPE="mysql"

usage () {
    echo "Usage: `basename $0` [-h] [-u username] [-H dbhost] database-name"
    echo "-h              Help message."
    echo "-t dbtype       Database type. Supported are 'mysql' and 'postgres'. Default '$DBTYPE'"
    echo "-u username     Username to add. Default '$USERNAME'"
    echo "-p password     Password for user. Default '$PASSWD'"
    echo "-H DB-hostname  Hostname for DB server. Default '$HOST'"
    echo "-l              List databases only."
    echo "-d              Drop DB first (if it exists) before creating new."
    echo "-D              Drop DB only (if it exists) and do not create new."
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
while getopts ":hlsdDt:u:p:H:" opt; do
    case $opt in
	t)
	    DBTYPE=$OPTARG
	    ;;
	u)
	    USERNAME=$OPTARG
	    ;;
	p)
	    PASSWD=$OPTARG
	    ;;
	H)
	    HOST=$OPTARG
	    ;;
	l)
	    LIST=y
	    ;;
	d)
	    DROP=y
	    ;;
	D)
	    DROPONLY=y
	    ;;
	s)
	    SILENT=y
	    ;;
	h)
	    echo "Run all job from crontab for given user."
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


if [ "$DBTYPE" != "mysql" -a "$DBTYPE" != "postgres" ]; then
    msg "Error: Unsupported database type."
    exit 1;
fi

if [ "$LIST" ]; then
    # List available database (only)
    if [ $DBTYPE = "mysql" ]; then
	sudo mysqlshow
    elif [ $DBTYPE = "postgres" ]; then
	psql -U postgres postgres -c \\l
    fi
    exit 0
fi

DBNAME=$1
if [ -z "$DBNAME" ]; then
    usage
fi

if [ "$DROP" -o "$DROPONLY" ]; then
    if [ $DBTYPE = "mysql" ]; then
	# Check if db exits
	sudo mysqlshow $DBNAME | grep -q "| Tables |" 2> /dev/null
	if [ $? -eq 0 ]; then
	    # Drop db first
	    msg -n "Dropping database $DBNAME..."
	    if [ $SILENT ]; then
		FORCE="--force"
	    fi
	    sudo mysqladmin $FORCE drop $DBNAME
	    msg "done."
	fi
    elif [ $DBTYPE = "postgres" ]; then
	# Check if db exits
	su postgres -c 'psql -c "\l routingmonitor"' | grep -q "(1 row)" 2> /dev/null
	if [ $? -eq 0 ]; then
	    # Drop db first
	    msg -n "Dropping database $DBNAME..."
	    su postgres -c "dropdb $DBNAME"
	    msg "done."
	    
	fi
    fi
fi

if [ $DROPONLY ]; then
    exit 0
fi

# Create new db
msg -n "Creating databasbase $DBNAME..."
exit_code=0
if [ $DBTYPE = "mysql" ]; then
    sudo mysqladmin create $DBNAME
    exit_code=$?;
elif [ $DBTYPE = "postgres" ]; then
    su postgres -c "createdb $DBNAME"
    exit_code=$?;
fi
if [ $exit_code -gt 0 ]; then
    msg "Error: Failed creating DB."
    exit 1 
fi
msg "done."
   

# Add user
msg -n "Adding user '$USERNAME' with password '$PASSWD'..."
SQLCMD=`mktemp`
touch $SQLCMD
chmod o+r $SQLCMD
if [ $DBTYPE = "mysql" ]; then
    echo "
DROP USER '$USERNAME'@'$HOST';
FLUSH PRIVILEGES;
CREATE USER '$USERNAME'@'$HOST' IDENTIFIED BY '$PASSWD';
GRANT ALL PRIVILEGES ON *.* TO '$USERNAME'@'$HOST';
FLUSH PRIVILEGES;
" > $SQLCMD
    sudo mysql $DBNAME < $SQLCMD
elif [ $DBTYPE = "postgres" ]; then
    echo "
    DROP ROLE IF EXISTS $USERNAME;
    CREATE ROLE $USERNAME WITH PASSWORD '$PASSWD' LOGIN;
" > $SQLCMD
    su postgres -c "psql -f $SQLCMD $DBNAME"  
fi    
rm $SQLCMD
msg "done."
