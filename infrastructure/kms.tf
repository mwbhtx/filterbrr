resource "aws_kms_key" "user_secrets" {
  description             = "Encrypts sensitive user settings (API keys, passwords)"
  deletion_window_in_days = 14
  enable_key_rotation     = true
}

resource "aws_kms_alias" "user_secrets" {
  name          = "alias/${var.app_name}-user-secrets"
  target_key_id = aws_kms_key.user_secrets.key_id
}
