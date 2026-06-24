terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }

  # Recommended: enable an S3 + DynamoDB backend before running anything that
  # touches a real tenant. State contains SSH private keys and generated
  # passwords. Local state in this repo is fine for the first dry-run only.
  #
  # backend "s3" {
  #   bucket         = "horalix-tf-state"
  #   key            = "trials/${terraform.workspace}.tfstate"
  #   region         = "eu-central-1"
  #   encrypt        = true
  #   dynamodb_table = "horalix-tf-locks"
  # }
}
