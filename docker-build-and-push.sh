#!/bin/bash

version=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g')

version="$(echo -e "${version}" | sed -e 's/^[[:space:]]*//')"
echo "Docker image: ampnet/crowdfunding-ae-middleware:$version"
docker build -t ampnet/crowdfunding-ae-middleware:$version -t ampnet/crowdfunding-ae-middleware:latest .
#docker push ampnet/crowdfunding-ae-middleware:$version
#docker push ampnet/crowdfunding-ae-middleware:latest
