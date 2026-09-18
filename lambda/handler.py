"""API REST de tareas sobre DynamoDB.

Una sola Lambda enruta internamente según método y path del evento
(API Gateway HTTP API, payload v2.0) y siempre devuelve JSON con CORS.
"""

import base64
import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

TABLE_NAME = os.environ.get("TABLE_NAME", "todo-tasks")
MAX_TITLE_LENGTH = 200

table = boto3.resource("dynamodb").Table(TABLE_NAME)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def response(status, body=None):
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": "" if body is None else json.dumps(body),
    }


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        body = json.loads(raw)
    except json.JSONDecodeError:
        raise ApiError(400, "El cuerpo debe ser JSON válido")
    if not isinstance(body, dict):
        raise ApiError(400, "El cuerpo debe ser un objeto JSON")
    return body


def validate_title(title):
    if not isinstance(title, str) or not title.strip():
        raise ApiError(400, "El campo 'title' es obligatorio")
    title = title.strip()
    if len(title) > MAX_TITLE_LENGTH:
        raise ApiError(400, f"El título no puede superar {MAX_TITLE_LENGTH} caracteres")
    return title


# --- Operaciones -----------------------------------------------------------


def list_tasks():
    items, kwargs = [], {}
    while True:
        page = table.scan(**kwargs)
        items.extend(page.get("Items", []))
        if "LastEvaluatedKey" not in page:
            break
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
    items.sort(key=lambda t: t.get("createdAt", ""), reverse=True)
    return response(200, items)


def create_task(event):
    body = parse_body(event)
    ts = now_iso()
    task = {
        "id": str(uuid.uuid4()),
        "title": validate_title(body.get("title")),
        "completed": bool(body.get("completed", False)),
        "createdAt": ts,
        "updatedAt": ts,
    }
    table.put_item(Item=task)
    return response(201, task)


def get_task(task_id):
    item = table.get_item(Key={"id": task_id}).get("Item")
    if not item:
        raise ApiError(404, "Tarea no encontrada")
    return response(200, item)


def update_task(task_id, event):
    body = parse_body(event)
    names, values, sets = {}, {":u": now_iso()}, ["#u = :u"]
    names["#u"] = "updatedAt"
    if "title" in body:
        names["#t"] = "title"
        values[":t"] = validate_title(body["title"])
        sets.append("#t = :t")
    if "completed" in body:
        if not isinstance(body["completed"], bool):
            raise ApiError(400, "El campo 'completed' debe ser booleano")
        names["#c"] = "completed"
        values[":c"] = body["completed"]
        sets.append("#c = :c")
    if len(sets) == 1:
        raise ApiError(400, "Nada que actualizar: envía 'title' y/o 'completed'")
    try:
        result = table.update_item(
            Key={"id": task_id},
            UpdateExpression="SET " + ", ".join(sets),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
            ConditionExpression="attribute_exists(id)",
            ReturnValues="ALL_NEW",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise ApiError(404, "Tarea no encontrada")
        raise
    return response(200, result["Attributes"])


def delete_task(task_id):
    try:
        table.delete_item(Key={"id": task_id}, ConditionExpression="attribute_exists(id)")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise ApiError(404, "Tarea no encontrada")
        raise
    return response(204)


# --- Router ----------------------------------------------------------------


def route(method, path, event):
    parts = [p for p in path.split("/") if p]
    if method == "OPTIONS":
        return response(204)
    if parts == ["tasks"]:
        if method == "GET":
            return list_tasks()
        if method == "POST":
            return create_task(event)
        raise ApiError(405, "Método no permitido")
    if len(parts) == 2 and parts[0] == "tasks":
        task_id = parts[1]
        if method == "GET":
            return get_task(task_id)
        if method == "PUT":
            return update_task(task_id, event)
        if method == "DELETE":
            return delete_task(task_id)
        raise ApiError(405, "Método no permitido")
    if parts in ([], ["health"]):
        return response(200, {"status": "ok", "table": TABLE_NAME})
    raise ApiError(404, "Ruta no encontrada")


def lambda_handler(event, context):
    http = event.get("requestContext", {}).get("http", {})
    method = http.get("method") or event.get("httpMethod", "GET")
    path = event.get("rawPath") or event.get("path") or "/"
    try:
        return route(method.upper(), path, event)
    except ApiError as e:
        return response(e.status, {"error": e.message})
    except Exception as e:  # noqa: BLE001 - último recurso: no filtrar trazas al cliente
        print(f"Error inesperado: {e!r}")
        return response(500, {"error": "Error interno del servidor"})
