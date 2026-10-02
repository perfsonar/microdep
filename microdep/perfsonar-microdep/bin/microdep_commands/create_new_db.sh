#!/bin/bash
#
#  Create new DB for routing monitor
#

USERNAME="traceroute"
PASSWD=""
PASSWDFILE="/etc/perfsonar/microdep/dbpasswd"
DBHOST="localhost"
MSPORT=3306
PGPORT=5432
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
    echo "-p password     Password for user. Default is the one kept in the password file."
    echo "-f file         File the password is kept in. It gets a random password if it is missing or empty. Default '$PASSWDFILE'"
    echo "-H DB-hostname  Hostname for DB server. Default '$DBHOST'"
    echo "-P DB-port      Hostname for DB server. Default $MSPORT for mysql and $PGPORT for postgres."
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
while getopts ":hlsdDt:u:p:f:H:P:" opt; do
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
	f)
	    PASSWDFILE=$OPTARG
	    ;;
	H)
	    DBHOST=$OPTARG
	    ;;
	P)
	    MSPORT=$OPTARG
	    PGPORT=$OPTARG
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
if [ "$DBTYPE" = "postgres" ]; then
    if [ "$DBHOST" = "localhost" ]; then
	# Skip hostname config to avoid password issues
	DBHOST=
    else
	DBHOST="-h $DBHOST"
    fi
fi
    
if [ "$LIST" ]; then
    # List available database (only)
    if [ $DBTYPE = "mysql" ]; then
	sudo mysqlshow -h $DBHOST -P $MSPORT
    elif [ $DBTYPE = "postgres" ]; then
	su postgres -c "psql $DBHOST -p $PGPORT -c \"\\l\""
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
	sudo mysqlshow -h $DBHOST -P $MSPORT $DBNAME | grep -q "| Tables |" 2> /dev/null
	if [ $? -eq 0 ]; then
	    # Drop db first
	    msg -n "Dropping database $DBNAME..."
	    if [ $SILENT ]; then
		FORCE="--force"
	    fi
	    sudo mysqladmin -h $DBHOST -P $MSPORT $FORCE drop $DBNAME
	    msg "done."
	fi
    elif [ $DBTYPE = "postgres" ]; then
	# Check if db exits
	su postgres -c "psql $DBHOST -p $PGPORT -w -c \"\\l $DBNAME\"" | grep -q "(1 row)" 2> /dev/null
	if [ $? -eq 0 ]; then
	    # Drop db first
	    msg -n "Dropping database $DBNAME..."
	    su postgres -c "dropdb $DBHOST -p $PGPORT -w $DBNAME"
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
    sudo mysqladmin -h $DBHOST -P $MSPORT create $DBNAME
    exit_code=$?;
elif [ $DBTYPE = "postgres" ]; then
    su postgres -c "createdb $DBHOST -p $PGPORT $DBNAME"
    exit_code=$?;
fi
if [ $exit_code -gt 0 ]; then
    msg "Error: Failed creating DB."
    exit 1 
fi
msg "done."
   

# Password for the user: the one given with -p, or else the one kept in the
# password file. The file gets a random password the first time, so every
# installation has a password of its own.
if [ -z "$PASSWD" ]; then
    if [ ! -s "$PASSWDFILE" ]; then
	( umask 077; head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$PASSWDFILE" )
	if [ ! -s "$PASSWDFILE" ]; then
	    msg "Error: Failed creating password file $PASSWDFILE."
	    exit 1
	fi
    fi
    # Readable by root and, through the group, by the analyser (it runs as perfsonar)
    if getent group perfsonar > /dev/null; then
	chown root:perfsonar "$PASSWDFILE"
	chmod 0640 "$PASSWDFILE"
    else
	chmod 0600 "$PASSWDFILE"
    fi
    PASSWD=$(cat "$PASSWDFILE")
fi

# Add user
msg -n "Adding user '$USERNAME'..."
# The SQL holds the password: the file stays readable by root only and is
# handed to the database client on standard input.
SQLCMD=`mktemp`
if [ $DBTYPE = "mysql" ]; then
    echo "
DROP USER '$USERNAME';
FLUSH PRIVILEGES;
CREATE USER '$USERNAME' IDENTIFIED BY '$PASSWD';
GRANT ALL PRIVILEGES ON \`$DBNAME\`.* TO '$USERNAME';
FLUSH PRIVILEGES;
" > $SQLCMD
    sudo mysql -h $DBHOST -P $MSPORT $DBNAME < $SQLCMD
elif [ $DBTYPE = "postgres" ]; then
    echo "
    DROP ROLE IF EXISTS $USERNAME;
    CREATE ROLE $USERNAME WITH PASSWORD '$PASSWD' LOGIN;
    GRANT ALL ON DATABASE $DBNAME TO $USERNAME;
    GRANT CREATE ON SCHEMA public TO $USERNAME;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $USERNAME;
" > $SQLCMD
    su postgres -c "psql $DBHOST -p $PGPORT $DBNAME" < $SQLCMD
fi    
rm $SQLCMD
msg "done."
