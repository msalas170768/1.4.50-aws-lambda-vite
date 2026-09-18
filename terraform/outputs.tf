output "api_url" {
  description = "URL pública de la API (usar como VITE_API_URL)"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "lambda_function_name" {
  value = aws_lambda_function.api.function_name
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.tasks.name
}
