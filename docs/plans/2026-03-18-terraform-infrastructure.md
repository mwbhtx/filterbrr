# Terraform Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy the complete filterbrr application to AWS using Terraform — Lambda Function URL backend, S3+CloudFront frontend, Lambda scraper/analyzer, DynamoDB, Cognito, Route 53, ACM.

**Architecture:** Single-region (us-east-1) deployment. CloudFront serves the frontend from S3 and proxies `/api/*` to the NestJS backend running as a Lambda Function URL. Two additional Lambdas (scraper, analyzer) are invoked directly by the backend Lambda. Cognito handles auth with self-service signup. Route 53 manages filterbrr.com DNS with ACM for SSL.

**Tech Stack:** Terraform, AWS (Lambda, S3, CloudFront, DynamoDB, Cognito, Route 53, ACM, IAM)

---

## Project Structure

```
infrastructure/
├── main.tf              # Provider, backend config
├── variables.tf         # Input variables
├── outputs.tf           # Output values (URLs, IDs)
├── dynamodb.tf          # DynamoDB tables
├── s3.tf                # S3 buckets (data + frontend)
├── cognito.tf           # Cognito user pool + client
├── lambda-backend.tf    # Backend Lambda + Function URL
├── lambda-scraper.tf    # Scraper Lambda
├── lambda-analyzer.tf   # Analyzer Lambda
├── iam.tf               # IAM roles and policies
├── cloudfront.tf        # CloudFront distribution
├── dns.tf               # Route 53 + ACM certificate
└── terraform.tfvars     # Variable values (gitignored)
```

---

## Task 1: Terraform Foundation

**Files:**
- Create: `infrastructure/main.tf`
- Create: `infrastructure/variables.tf`
- Create: `infrastructure/outputs.tf`
- Create: `infrastructure/.gitignore`

**Step 1: Create infrastructure directory and foundation files**

`infrastructure/main.tf`:
```hcl
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state in S3 — create this bucket manually first:
  # aws s3 mb s3://filterbrr-terraform-state --region us-east-1
  backend "s3" {
    bucket = "filterbrr-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "filterbrr"
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}

# ACM certs for CloudFront must be in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
```

`infrastructure/variables.tf`:
```hcl
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Root domain name"
  type        = string
  default     = "filterbrr.com"
}

variable "app_name" {
  description = "Application name used for resource naming"
  type        = string
  default     = "filterbrr"
}
```

`infrastructure/outputs.tf`:
```hcl
output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "api_function_url" {
  value = aws_lambda_function_url.backend.function_url
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "s3_data_bucket" {
  value = aws_s3_bucket.data.id
}

output "nameservers" {
  value       = aws_route53_zone.main.name_servers
  description = "Set these as nameservers at your registrar (Spaceship)"
}
```

`infrastructure/.gitignore`:
```
*.tfstate
*.tfstate.backup
.terraform/
terraform.tfvars
*.auto.tfvars
```

**Step 2: Initialize Terraform**

First create the state bucket manually:
```bash
aws s3 mb s3://filterbrr-terraform-state --region us-east-1
```

Then:
```bash
cd infrastructure && terraform init
```

**Step 3: Commit**

```bash
git add infrastructure/
git commit -m "feat: terraform foundation — provider, variables, outputs"
```

---

## Task 2: DynamoDB Tables

**Files:**
- Create: `infrastructure/dynamodb.tf`

**Step 1: Define all 4 tables**

```hcl
resource "aws_dynamodb_table" "user_settings" {
  name         = "UserSettings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "filters" {
  name         = "Filters"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "filter_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "filter_id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "jobs" {
  name         = "Jobs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "job_id"

  attribute {
    name = "job_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "sync_state" {
  name         = "SyncState"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }
}
```

Note: TTL on Jobs table auto-cleans old job records (set TTL on creation in application code later).

**Step 2: Apply and verify**

```bash
terraform plan
terraform apply
```

**Step 3: Commit**

```bash
git commit -m "feat: terraform DynamoDB tables"
```

---

## Task 3: S3 Buckets

**Files:**
- Create: `infrastructure/s3.tf`

**Step 1: Create data bucket and frontend bucket**

```hcl
# Data bucket — datasets, reports
resource "aws_s3_bucket" "data" {
  bucket = "${var.app_name}-userdata"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Frontend bucket — static site files
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.app_name}-frontend"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront OAC for frontend bucket
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}
```

**Step 2: Commit**

```bash
git commit -m "feat: terraform S3 buckets for data and frontend"
```

---

## Task 4: Cognito

**Files:**
- Create: `infrastructure/cognito.tf`

**Step 1: Create user pool and client**

```hcl
resource "aws_cognito_user_pool" "main" {
  name = var.app_name

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.app_name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  # No client secret — public client for SPA
  generate_secret = false

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30
}
```

**Step 2: Commit**

```bash
git commit -m "feat: terraform Cognito user pool with self-service signup"
```

---

## Task 5: IAM Roles

**Files:**
- Create: `infrastructure/iam.tf`

**Step 1: Create Lambda execution roles**

```hcl
# Backend Lambda role
resource "aws_iam_role" "backend_lambda" {
  name = "${var.app_name}-backend-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "backend_lambda" {
  name = "${var.app_name}-backend-lambda-policy"
  role = aws_iam_role.backend_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:*"]
        Resource = [
          aws_dynamodb_table.user_settings.arn,
          aws_dynamodb_table.filters.arn,
          aws_dynamodb_table.jobs.arn,
          aws_dynamodb_table.sync_state.arn,
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]
        Resource = [
          aws_s3_bucket.data.arn,
          "${aws_s3_bucket.data.arn}/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = [
          aws_lambda_function.scraper.arn,
          aws_lambda_function.analyzer.arn,
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Scraper Lambda role
resource "aws_iam_role" "scraper_lambda" {
  name = "${var.app_name}-scraper-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "scraper_lambda" {
  name = "${var.app_name}-scraper-lambda-policy"
  role = aws_iam_role.scraper_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.jobs.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.data.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Analyzer Lambda role
resource "aws_iam_role" "analyzer_lambda" {
  name = "${var.app_name}-analyzer-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy" "analyzer_lambda" {
  name = "${var.app_name}-analyzer-lambda-policy"
  role = aws_iam_role.analyzer_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:PutItem"]
        Resource = [
          aws_dynamodb_table.jobs.arn,
          aws_dynamodb_table.filters.arn,
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.data.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}
```

**Step 2: Commit**

```bash
git commit -m "feat: terraform IAM roles for backend, scraper, analyzer Lambdas"
```

---

## Task 6: Lambda Functions

**Files:**
- Create: `infrastructure/lambda-backend.tf`
- Create: `infrastructure/lambda-scraper.tf`
- Create: `infrastructure/lambda-analyzer.tf`

These define the Lambda functions. The actual code deployment is handled separately (CI/CD or manual zip upload). For now we create placeholder zips.

**Step 1: Backend Lambda with Function URL**

`infrastructure/lambda-backend.tf`:
```hcl
# Placeholder zip — real code deployed via CI/CD
data "archive_file" "backend_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.build/backend-placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'placeholder' });"
    filename = "index.js"
  }
}

resource "aws_lambda_function" "backend" {
  function_name = "${var.app_name}-backend"
  role          = aws_iam_role.backend_lambda.arn
  handler       = "dist/lambda.handler"
  runtime       = "nodejs22.x"
  memory_size   = 512
  timeout       = 30

  filename         = data.archive_file.backend_placeholder.output_path
  source_code_hash = data.archive_file.backend_placeholder.output_base64sha256

  environment {
    variables = {
      NODE_ENV             = "production"
      AWS_REGION_OVERRIDE  = var.aws_region
      COGNITO_REGION       = var.aws_region
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
      S3_BUCKET            = aws_s3_bucket.data.id
    }
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_lambda_function_url" "backend" {
  function_name      = aws_lambda_function.backend.function_name
  authorization_type = "NONE"

  invoke_mode = "RESPONSE_STREAM"

  cors {
    allow_origins = ["https://${var.domain_name}"]
    allow_methods = ["*"]
    allow_headers = ["*"]
    max_age       = 86400
  }
}
```

**Step 2: Scraper Lambda**

`infrastructure/lambda-scraper.tf`:
```hcl
data "archive_file" "scraper_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.build/scraper-placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'placeholder' });"
    filename = "index.js"
  }
}

resource "aws_lambda_function" "scraper" {
  function_name = "${var.app_name}-scraper"
  role          = aws_iam_role.scraper_lambda.arn
  handler       = "dist/index.handler"
  runtime       = "nodejs22.x"
  memory_size   = 1024
  timeout       = 900

  filename         = data.archive_file.scraper_placeholder.output_path
  source_code_hash = data.archive_file.scraper_placeholder.output_base64sha256

  environment {
    variables = {
      AWS_REGION_OVERRIDE = var.aws_region
      S3_BUCKET           = aws_s3_bucket.data.id
    }
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}
```

**Step 3: Analyzer Lambda**

`infrastructure/lambda-analyzer.tf`:
```hcl
data "archive_file" "analyzer_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.build/analyzer-placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'placeholder' });"
    filename = "index.js"
  }
}

resource "aws_lambda_function" "analyzer" {
  function_name = "${var.app_name}-analyzer"
  role          = aws_iam_role.analyzer_lambda.arn
  handler       = "dist/index.handler"
  runtime       = "nodejs22.x"
  memory_size   = 1024
  timeout       = 900

  filename         = data.archive_file.analyzer_placeholder.output_path
  source_code_hash = data.archive_file.analyzer_placeholder.output_base64sha256

  environment {
    variables = {
      AWS_REGION_OVERRIDE = var.aws_region
      S3_BUCKET           = aws_s3_bucket.data.id
    }
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}
```

**Step 4: Commit**

```bash
git commit -m "feat: terraform Lambda functions with Function URL for backend"
```

---

## Task 7: DNS and SSL Certificate

**Files:**
- Create: `infrastructure/dns.tf`

**Step 1: Route 53 zone and ACM cert**

```hcl
resource "aws_route53_zone" "main" {
  name = var.domain_name
}

# SSL certificate for filterbrr.com and *.filterbrr.com
resource "aws_acm_certificate" "main" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.main.zone_id
}

resource "aws_acm_certificate_validation" "main" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# A record pointing to CloudFront
resource "aws_route53_record" "root" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
```

**Important:** After `terraform apply`, you must update nameservers at Spaceship to the Route 53 nameservers shown in the output. DNS propagation takes up to 48 hours. ACM cert validation won't complete until DNS is pointed to Route 53.

**Step 2: Commit**

```bash
git commit -m "feat: terraform Route 53 DNS and ACM SSL certificate"
```

---

## Task 8: CloudFront Distribution

**Files:**
- Create: `infrastructure/cloudfront.tf`

**Step 1: Create CloudFront distribution**

```hcl
# OAC for S3 frontend access
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.app_name}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.domain_name, "www.${var.domain_name}"]
  price_class         = "PriceClass_100"

  # Frontend origin — S3
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # API origin — Lambda Function URL
  origin {
    domain_name = replace(aws_lambda_function_url.backend.function_url, "https://", "")
    origin_id   = "api"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # API behavior — /api/* routes to Lambda
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    target_origin_id = "api"
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    compress         = true

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Accept", "Content-Type"]

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }

  # Default behavior — frontend from S3
  default_cache_behavior {
    target_origin_id       = "frontend"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # SPA fallback — return index.html for any 404
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.main.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.main]
}
```

**Step 2: Commit**

```bash
git commit -m "feat: terraform CloudFront with S3 frontend + Lambda API proxy"
```

---

## Task 9: Backend Lambda Streaming Adapter

**Files:**
- Modify: `backend/src/lambda.ts`
- Modify: `backend/package.json` (may need `@aws-sdk/client-lambda-runtime` or streaming adapter)

The current `lambda.ts` uses `@vendia/serverless-express` which doesn't support Lambda Function URL response streaming. We need to update it to work with Function URLs.

**Important:** `@vendia/serverless-express` actually works with Lambda Function URLs — the Function URL translates to API Gateway v2 format which serverless-express handles. The `RESPONSE_STREAM` invoke mode in Terraform enables streaming, but the NestJS SSE endpoint needs the `awslambda.streamifyResponse` wrapper for true streaming.

For now, keep `@vendia/serverless-express` — it works for all non-streaming endpoints. SSE will fall back to buffered responses (the full response arrives at once when the stream ends, rather than progressively). This is acceptable — the frontend handles it either way.

**Step 1: Verify lambda.ts works as-is**

The current lambda.ts should work with Function URLs without changes. The `RESPONSE_STREAM` invoke mode is a capability — it doesn't break non-streaming responses.

**Step 2: Update the backend build for Lambda deployment**

Create a build script that:
1. Runs `npm run build` (TypeScript compilation)
2. Copies `dist/`, `node_modules/`, and `package.json` into a zip
3. Uploads to Lambda

Create `scripts/deploy-backend.sh`:
```bash
#!/bin/bash
set -e

echo "Building backend..."
cd backend
npm ci --production=false
npm run build

echo "Creating deployment package..."
cd dist
cp ../package.json .
cp -r ../node_modules .
zip -r ../../infrastructure/.build/backend.zip . -x "*.map"

echo "Deploying to Lambda..."
aws lambda update-function-code \
  --function-name filterbrr-backend \
  --zip-file fileb://../../infrastructure/.build/backend.zip \
  --region us-east-1

echo "Backend deployed!"
```

Create similar scripts for scraper and analyzer:

`scripts/deploy-scraper.sh`:
```bash
#!/bin/bash
set -e

echo "Building scraper..."
cd lambdas/scraper
npm ci --production=false
npm run build

echo "Creating deployment package..."
mkdir -p ../../infrastructure/.build
cd dist
cp ../package.json .
cp -r ../node_modules .
zip -r ../../../infrastructure/.build/scraper.zip . -x "*.map"

echo "Deploying to Lambda..."
aws lambda update-function-code \
  --function-name filterbrr-scraper \
  --zip-file fileb://../../../infrastructure/.build/scraper.zip \
  --region us-east-1

echo "Scraper deployed!"
```

`scripts/deploy-analyzer.sh`:
```bash
#!/bin/bash
set -e

echo "Building analyzer..."
cd lambdas/analyzer
npm ci --production=false
npm run build

echo "Creating deployment package..."
mkdir -p ../../infrastructure/.build
cd dist
cp ../package.json .
cp -r ../node_modules .
zip -r ../../../infrastructure/.build/analyzer.zip . -x "*.map"

echo "Deploying to Lambda..."
aws lambda update-function-code \
  --function-name filterbrr-analyzer \
  --zip-file fileb://../../../infrastructure/.build/analyzer.zip \
  --region us-east-1

echo "Analyzer deployed!"
```

`scripts/deploy-frontend.sh`:
```bash
#!/bin/bash
set -e

echo "Building frontend..."
cd frontend
npm ci
npm run build

echo "Syncing to S3..."
aws s3 sync dist/ s3://filterbrr-frontend --delete --region us-east-1

echo "Invalidating CloudFront cache..."
DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[?contains(@, 'filterbrr.com')]].Id" --output text)
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"

echo "Frontend deployed!"
```

**Step 3: Commit**

```bash
git add scripts/ backend/src/lambda.ts
git commit -m "feat: add deployment scripts for backend, scraper, analyzer, frontend"
```

---

## Task 10: Deploy and Verify

This is the manual deployment sequence.

**Step 1: Create Terraform state bucket**

```bash
aws s3 mb s3://filterbrr-terraform-state --region us-east-1
```

**Step 2: Initialize and apply Terraform**

```bash
cd infrastructure
terraform init
terraform plan
terraform apply
```

**Step 3: Update nameservers at Spaceship**

From the Terraform output, copy the 4 Route 53 nameservers and set them at Spaceship. Wait for DNS propagation (check with `dig filterbrr.com NS`).

**Step 4: Deploy code**

```bash
# From project root
chmod +x scripts/*.sh
./scripts/deploy-backend.sh
./scripts/deploy-scraper.sh
./scripts/deploy-analyzer.sh

# Set frontend env vars for production
cat > frontend/.env.production <<EOF
VITE_COGNITO_USER_POOL_ID=$(terraform -chdir=infrastructure output -raw cognito_user_pool_id)
VITE_COGNITO_CLIENT_ID=$(terraform -chdir=infrastructure output -raw cognito_client_id)
EOF

./scripts/deploy-frontend.sh
```

**Step 5: Verify**

1. Visit https://filterbrr.com — should load the frontend
2. Create an account — Cognito signup
3. Log in — should get token
4. Run a scrape — verify Lambda invocation
5. Check DynamoDB tables have data
