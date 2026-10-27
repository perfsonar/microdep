#!/bin/bash
#
# Manage connection access to pgsql database for user
#

USER="traceroute"
DBNAME="routingmonitor"
TAG="perfsonar-microdep-ana"

usage() {
    echo  "Usage: $0 [options] pg-conf-file" 1>&2;
    echo  "  -r           Only remove access-config (if existant)." 1>&2;
    echo  "  -i           Do it in file, i.e. edit given config file." 1>&2;
    echo  "  -u string    Set user name. Default is $USER." 1>&2;
    echo  "  -d string    Set database name. Default is $DBNAME." 1>&2;
    echo  "  -t string    Set tag to mark/recognise config. Default is $TAG." 1>&2;
    exit 1;
}


while getopts ":u:d:t:ir" o; do
    case "${o}" in
        r)
            REMOVE="yes";
            ;;
        i)
            INFILE="-i";
            ;;
        u)
            USER=${OPTARG}
            ;;
        d)
            DBNAME=${OPTARG}
            ;;
        t)
            TAG=${OPTARG}
            ;;
        *)
            usage
            ;;
    esac
done
shift $((OPTIND-1))

if [ $# -lt 1 ]; then
    echo "Missing filename for pg-conf-file."
    exit 2
fi

# Always remove exiting entry (if any). A block goes only up to its END line: one without
# it (an edited file) is left as it is, instead of everything after it being removed.
remove_block() {
    awk -v b="#BEGIN-$TAG" -v e="#END-$TAG" '
        index($0, b) == 1 { if (inb) printf "%s", buf; inb = 1; buf = $0 ORS; next }
        inb { buf = buf $0 ORS; if (index($0, e) == 1) { inb = 0; buf = "" } next }
        { print }
        END { if (inb) { printf "%s", buf; print b " without " e ": left as it is" > "/dev/stderr" } }' "$1"
}
if [ "$INFILE" ]; then
    TMP=$(mktemp) && remove_block "$1" > "$TMP" && cat "$TMP" > "$1"
    rm -f "$TMP"
else
    remove_block "$1"
fi

if [ "$REMOVE"  ]; then
    # Only remove.
    exit 0
fi

# Add entry
sed $INFILE "/^# TYPE  DATABASE.*/a\\
#BEGIN-$TAG\\
#\\
# Perfsonar Micordep analytics\\
#\\
# This user should never need to access the database from anywhere\\
# other than locally.\\
#\\
local     $DBNAME      $USER                            md5\\
host      $DBNAME      $USER     127.0.0.1/32           md5\\
host      $DBNAME      $USER     ::1/128                md5\\
#END-$TAG" $1
