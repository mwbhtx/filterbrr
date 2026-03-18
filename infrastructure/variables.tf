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
