#!/bin/bash
#
# Manage connection access to pgsql database for user
#

USER="traceroute"
DBNAME="routingmonitor"
TAG="perfsonar-microdep-ana"

usage() {
    echo  "Usage: $0 [options] pg-conf-file" 1>&2;
    echo  "  -r           Remove access-config." 1>&2;
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


if [ "$REMOVE"  ]; then
    sed $INFILE "/^#BEGIN-$TAG/,/^#END-$TAG/d" $1
    exit $?
fi

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
