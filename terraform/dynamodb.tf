# Modelo de la lista de tareas:
#   id        (S, partition key) UUID v4
#   title     (S)  texto de la tarea
#   completed (BOOL)
#   createdAt (S)  ISO-8601 UTC
#   updatedAt (S)  ISO-8601 UTC
# DynamoDB es schemaless: solo se declara el atributo que forma la clave.
resource "aws_dynamodb_table" "tasks" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = false
  }
}
