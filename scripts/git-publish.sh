#!/usr/bin/env bash

DIRNAME=`realpath $0 | rev | cut -d'/' -f3- | rev`

version=$(head -n 1 ${DIRNAME}/CHANGELOG.md)
branch=`git branch | grep \* | cut -d ' ' -f2`

sed -i -E 's/"version": "(.+)"/"version": "'${version:3}'"/g' ${DIRNAME}/package.json

git commit -m "Update to ${version:2}" ${DIRNAME}/package.json ${DIRNAME}/CHANGELOG.md
git push origin ${branch}

echo "Pushed"
