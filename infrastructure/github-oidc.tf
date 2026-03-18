# GitHub Actions OIDC — allows GitHub to assume an IAM role without static credentials

variable "github_repo" {
  description = "GitHub repository in format owner/repo"
  type        = string
  default     = "mwbhtx/filterbrr"
}

data "aws_caller_identity" "current" {}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_deploy" {
  name = "${var.app_name}-github-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:ref:refs/heads/main"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "${var.app_name}-github-deploy-policy"
  role = aws_iam_role.github_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["lambda:UpdateFunctionCode"]
        Resource = [
          aws_lambda_function.backend.arn,
          aws_lambda_function.scraper.arn,
          aws_lambda_function.analyzer.arn,
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.frontend.arn,
          "${aws_s3_bucket.frontend.arn}/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation", "cloudfront:ListDistributions"]
        Resource = "*"
      },
      {
        # Terraform state access
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::filterbrr-terraform-state",
          "arn:aws:s3:::filterbrr-terraform-state/*",
        ]
      },
      {
        # Terraform needs broad read + write for plan/apply
        Effect = "Allow"
        Action = [
          "dynamodb:*",
          "s3:*",
          "lambda:*",
          "iam:*",
          "cognito-idp:*",
          "cloudfront:*",
          "route53:*",
          "acm:*",
          "logs:*",
        ]
        Resource = "*"
      }
    ]
  })
}

output "github_deploy_role_arn" {
  value       = aws_iam_role.github_deploy.arn
  description = "Add this as AWS_DEPLOY_ROLE_ARN secret in GitHub repo settings"
}
