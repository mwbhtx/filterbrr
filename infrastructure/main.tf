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
