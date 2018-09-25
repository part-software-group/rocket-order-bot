#!/usr/bin/env sh

DIRNAME=`realpath $0 | rev | cut -d'/' -f3- | rev`

if [ -z ${BASH_ENV} ]; then
    echo "[ERR] Your env \"BASH_ENV\" must be initialise!"
    exit 1
fi

docker_file=""
if [ `echo ${BASH_ENV} | cut -b 1` = "." ]; then
    docker_file=`echo ${BASH_ENV} | cut -b 2-`
else
    docker_file=${BASH_ENV}
fi

ls ${DIRNAME}/docker/docker-compose.${docker_file}.yml >> /dev/null 2>&1

if [  $? -ne 0 ]; then
    echo "[ERR] Docker file \"docker/docker-compose.${docker_file}.yml\" not exist!"
    exit 1
fi

cd ${DIRNAME}

docker-compose -f ${DIRNAME}/docker-compose.yml -f ${DIRNAME}/docker/docker-compose.${docker_file}.yml down

docker-compose -f ${DIRNAME}/docker-compose.yml -f ${DIRNAME}/docker/docker-compose.${docker_file}.yml up
