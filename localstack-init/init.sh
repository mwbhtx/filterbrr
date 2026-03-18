#!/bin/bash

echo "Ensuring S3 bucket exists: filterbrr-userdata"
awslocal s3 mb s3://filterbrr-userdata --region us-east-1 2>/dev/null || true

echo "Done."
