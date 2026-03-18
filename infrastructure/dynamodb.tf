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
