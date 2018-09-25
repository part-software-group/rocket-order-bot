#!/bin/bash

: ${MONGO_HOST:=0.0.0.0}
: ${MONGO_PORT:=27017}

set -e

host="$1"
shift
cmd="$@"

until nc -z ${MONGO_HOST} ${MONGO_PORT}
do
    >&2 echo "Waiting for Mongodb (${MONGO_HOST}:${MONGO_PORT}) to start..."
    sleep 1
done

>&2 echo "Mongodb is up - executing command"
exec ${cmd}