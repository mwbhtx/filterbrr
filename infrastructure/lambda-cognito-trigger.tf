data "archive_file" "cognito_trigger_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.build/cognito-trigger-placeholder.zip"

  source {
    content  = "exports.handler = async (event) => event;"
    filename = "index.js"
  }
}

resource "aws_lambda_function" "cognito_trigger" {
  function_name = "${var.app_name}-cognito-trigger"
  role          = aws_iam_role.cognito_trigger_lambda.arn
  handler       = "dist/index.handler"
  runtime       = "nodejs22.x"
  memory_size   = 128
  timeout       = 5

  filename         = data.archive_file.cognito_trigger_placeholder.output_path
  source_code_hash = data.archive_file.cognito_trigger_placeholder.output_base64sha256

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

resource "aws_lambda_permission" "cognito_trigger" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_trigger.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
