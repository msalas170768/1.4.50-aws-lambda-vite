"""Tests del handler contra una DynamoDB simulada con moto."""

import importlib
import json
import os
import sys

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

TABLE = "todo-tasks-test"


@pytest.fixture
def handler(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("TABLE_NAME", TABLE)
    with mock_aws():
        boto3.client("dynamodb").create_table(
            TableName=TABLE,
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        import handler as module

        yield importlib.reload(module)


def call(handler, method, path, body=None):
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "body": None if body is None else json.dumps(body),
    }
    res = handler.lambda_handler(event, None)
    assert res["headers"]["Access-Control-Allow-Origin"] == "*"
    return res["statusCode"], json.loads(res["body"]) if res["body"] else None


def test_health(handler):
    assert call(handler, "GET", "/health") == (200, {"status": "ok", "table": TABLE})


def test_crud_flow(handler):
    status, task = call(handler, "POST", "/tasks", {"title": "  Comprar pan  "})
    assert status == 201
    assert task["title"] == "Comprar pan"
    assert task["completed"] is False
    assert task["createdAt"] == task["updatedAt"]

    status, tasks = call(handler, "GET", "/tasks")
    assert status == 200 and [t["id"] for t in tasks] == [task["id"]]

    assert call(handler, "GET", f"/tasks/{task['id']}")[1]["title"] == "Comprar pan"

    status, updated = call(handler, "PUT", f"/tasks/{task['id']}", {"completed": True})
    assert status == 200 and updated["completed"] is True and updated["title"] == "Comprar pan"

    status, renamed = call(handler, "PUT", f"/tasks/{task['id']}", {"title": "Comprar leche"})
    assert status == 200 and renamed["title"] == "Comprar leche" and renamed["completed"] is True

    assert call(handler, "DELETE", f"/tasks/{task['id']}") == (204, None)
    assert call(handler, "DELETE", f"/tasks/{task['id']}")[0] == 404
    assert call(handler, "GET", "/tasks") == (200, [])


def test_list_sorted_newest_first(handler):
    first = call(handler, "POST", "/tasks", {"title": "primera"})[1]
    second = call(handler, "POST", "/tasks", {"title": "segunda"})[1]
    ids = [t["id"] for t in call(handler, "GET", "/tasks")[1]]
    if first["createdAt"] != second["createdAt"]:
        assert ids == [second["id"], first["id"]]


@pytest.mark.parametrize(
    "method,path,body,status",
    [
        ("POST", "/tasks", {"title": ""}, 400),
        ("POST", "/tasks", {"title": "   "}, 400),
        ("POST", "/tasks", {"title": "x" * 201}, 400),
        ("POST", "/tasks", {}, 400),
        ("GET", "/tasks/no-existe", None, 404),
        ("PUT", "/tasks/no-existe", {"completed": True}, 404),
        ("DELETE", "/tasks/no-existe", None, 404),
        ("PATCH", "/tasks", None, 405),
        ("GET", "/otra-cosa", None, 404),
    ],
)
def test_errors(handler, method, path, body, status):
    code, payload = call(handler, method, path, body)
    assert code == status and "error" in payload


def test_update_validation(handler):
    task = call(handler, "POST", "/tasks", {"title": "t"})[1]
    assert call(handler, "PUT", f"/tasks/{task['id']}", {})[0] == 400
    assert call(handler, "PUT", f"/tasks/{task['id']}", {"completed": "yes"})[0] == 400


def test_invalid_json(handler):
    res = handler.lambda_handler(
        {"rawPath": "/tasks", "requestContext": {"http": {"method": "POST"}}, "body": "{nope"}, None
    )
    assert res["statusCode"] == 400


def test_options_preflight(handler):
    assert call(handler, "OPTIONS", "/tasks")[0] == 204
