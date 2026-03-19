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
      DEMO_USER_SUB        = "b4f8a4e8-9091-709c-4e2e-ac3714c80c56"
    }
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_lambda_function_url" "backend" {
  function_name      = aws_lambda_function.backend.function_name
  authorization_type = "NONE"

  invoke_mode = "BUFFERED"

  cors {
    allow_origins = ["https://${var.domain_name}"]
    allow_methods = ["*"]
    allow_headers = ["*"]
    max_age       = 86400
  }
}
