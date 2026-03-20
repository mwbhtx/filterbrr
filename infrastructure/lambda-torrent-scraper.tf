data "archive_file" "torrent_scraper_placeholder" {
  type        = "zip"
  output_path = "${path.module}/.build/torrent-scraper-placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'placeholder' });"
    filename = "index.js"
  }
}

resource "aws_lambda_function" "torrent_scraper" {
  function_name = "${var.app_name}-torrent-scraper"
  role          = aws_iam_role.torrent_scraper_lambda.arn
  handler       = "dist/index.handler"
  runtime       = "nodejs22.x"
  memory_size   = 1024
  timeout       = 900

  filename         = data.archive_file.torrent_scraper_placeholder.output_path
  source_code_hash = data.archive_file.torrent_scraper_placeholder.output_base64sha256

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
