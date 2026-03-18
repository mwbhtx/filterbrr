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
