variable "aws_region" {
  description = "Región AWS donde se despliega todo"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefijo para nombrar los recursos"
  type        = string
  default     = "todo-serverless"
}

variable "table_name" {
  description = "Nombre de la tabla DynamoDB de tareas"
  type        = string
  default     = "todo-tasks"
}

variable "cors_allow_origins" {
  description = "Orígenes permitidos por CORS en API Gateway"
  type        = list(string)
  default     = ["*"]
}
