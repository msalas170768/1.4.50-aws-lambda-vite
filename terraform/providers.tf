terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
    }
  }
}

# Sin default_tags: crear un stage de API Gateway v2 con etiquetas exige
# apigateway:TagResource, acción que el editor de políticas IAM no admite.
provider "aws" {
  alias  = "untagged"
  region = var.aws_region
}
