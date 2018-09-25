#!/usr/bin/env bash

DIRNAME=/home/woods

if [ -z ${BASH_ENV} ]; then
    echo "[ERR] Your env \"BASH_ENV\" must be initialise!"
    exit 1
fi

docker_file=""
if [  = "." ]; then
    docker_file=
else
    docker_file=${BASH_ENV}
fi

ls ${DIRNAME}/docker/docker-compose.${docker_file}.yml >> /dev/null 2>&1

if [  $? -ne 0 ]; then
    echo "[ERR] Docker file \"docker/docker-compose.${docker_file}.yml\" not exist!"
    exit 1
fi

cd ${DIRNAME}

ARG=''
for i in "$@"; do
    i="${i//\/\\}"
    ARG="$ARG \"${i//\"/\\"}\""
done

docker-compose -f ${DIRNAME}/docker-compose.yml -f ${DIRNAME}/docker/docker-compose.${docker_file}.yml exec -T mdp-node /bin/sh -c "npm run pretest && ./node_modules/mocha/bin/mocha ${ARG} --exit"
