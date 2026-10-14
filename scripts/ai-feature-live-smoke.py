#!/usr/bin/env python3
"""Local real-model/API/database smoke. --exercise creates and cleans synthetic fixtures.
Never dials, reads real customer material, or prints credentials. Real model calls incur API usage.
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


class Client:
    def __init__(self, base, token=""):
        self.base = base.rstrip("/")
        self.headers = {"Content-Type": "application/json", "tenant-id": "1"}
        if token:
            self.headers["Authorization"] = "Bearer " + token

    def request(self, method, path, body=None, key=None):
        headers = dict(self.headers)
        if key:
            headers["Idempotency-Key"] = key
        request = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                value = json.load(response)
        except urllib.error.HTTPError as error:
            try:
                problem = json.load(error).get("error", {})
                code = problem.get("code", "")
                code = code if isinstance(code, str) and re.fullmatch(r"[A-Z_]+", code) else ""
            except Exception:
                code = ""
            raise RuntimeError(f"{method} {path.split('?')[0]}: HTTP {error.code} {code}") from None
        if value.get("code", 0) != 0 or value.get("error"):
            raise RuntimeError(f"{method} {path.split('?')[0]}: business failure {value.get('code', value.get('error', {}).get('code'))}")
        return value.get("data")

    def stream(self, body):
        headers = {**self.headers, "Accept": "text/event-stream", "Idempotency-Key": body["request_id"]}
        request = urllib.request.Request(self.base + "/api/v1/mobile/ai/messages/stream", data=json.dumps(body).encode(), headers=headers)
        events = []
        with urllib.request.urlopen(request, timeout=30) as response:
            require("text/event-stream" in response.headers.get("Content-Type", ""), "Missing SSE response")
            deadline = time.monotonic() + 210
            for line in response:
                if time.monotonic() > deadline:
                    raise RuntimeError("Chat stream exceeded deadline")
                if line.startswith(b"data:"):
                    event = json.loads(line[5:].lstrip())
                    events.append(event)
                    if event["type"] in ("completed", "failed"):
                        break
        require(events and events[-1]["type"] == "completed", "Chat did not complete successfully: " + (str(events[-1].get("code", events[-1]["type"])) if events else "no events"))
        return events


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def database_counts(task_id, followup_id):
    require(re.fullmatch(r"[0-9a-f-]{36}", task_id) and re.fullmatch(r"[0-9]+", followup_id), "Invalid fixture identifiers")
    sql = f"SELECT COUNT(*) FROM cp_agent_followup_receipt WHERE agent_task_id='{task_id}';\nSELECT COUNT(*) FROM cp_follow_up_task WHERE id={followup_id};\n"
    result = subprocess.run(["docker", "exec", "-i", "yudao-local-mysql-1", "sh", "-c",
        'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket --default-character-set=utf8mb4 -uroot "$MYSQL_DATABASE" -N'],
        input=sql, text=True, capture_output=True, timeout=15)
    require(result.returncode == 0, "Database verification failed")
    return [int(value) for value in result.stdout.split()]


def exercise(base, chat_only=False, task_only=False):
    admin = Client(base)
    session = admin.request("POST", "/admin-api/system/auth/login", {"username": os.getenv("AI_SMOKE_ADMIN_USER", "admin"), "password": os.getenv("AI_SMOKE_ADMIN_PASSWORD", "admin123")})
    admin.headers["Authorization"] = "Bearer " + session["accessToken"]
    customer = device = pairing = conversation = followup = task_id = None
    mobile = Client(base)
    checks = []
    def passed(name):
        checks.append(name)
        print("PASS", name, flush=True)
    try:
        customer = admin.request("POST", "/admin-api/callphone/customer/save", {"name": "AI链路合成验收-" + uuid.uuid4().hex[:8], "phone": "13800000000", "stage": "new", "source": "integration-smoke", "tags": "合成资料；不会拨号"})
        pairing = admin.request("POST", "/admin-api/callphone/device/pairing-code/create")
        scanned = mobile.request("POST", "/api/v1/mobile/session/scan", {"pairingId": pairing["id"], "pairingCode": pairing["pairingCode"], "loginSecret": pairing["loginSecret"], "displayName": "AI闭环验收虚拟设备（不会拨号）"})
        device = scanned["deviceId"]
        mobile.headers.update({"Authorization": "Bearer " + scanned["accessToken"], "X-Callphone-Device-Id": str(device), "X-Callphone-Device-Key": scanned["deviceKey"]})
        require(mobile.request("POST", "/api/v1/mobile/devices/heartbeat"), "Device heartbeat failed")
        conversation = mobile.request("POST", "/api/v1/mobile/ai/conversations", {}, str(uuid.uuid4()))["id"]
        passed("real QR-scoped session / device authentication / owned conversation")

        if not task_only:
            body = {"request_id": str(uuid.uuid4()), "conversation_id": conversation, "content": "请联网搜索 Python 官方 zoneinfo 文档，简要说明 ZoneInfo 用途，100字以内。", "web_search": True}
            events = mobile.stream(body)
            answer = events[-1]["content"]
            require(any(e.get("stage") == "searching" for e in events), "No actual search activity")
            require("**联网来源**" in answer and "https://" in answer, "Missing grounded source links")
            require(mobile.stream(body)[-1]["content"] == answer, "Idempotent replay changed reply")
            history = mobile.request("GET", f"/api/v1/mobile/ai/conversations/{conversation}/messages?limit=50")
            require(history["items"][-1]["content"] == answer, "History lost search answer or sources")
            passed("real DeepSeek web search / SSE / sources / history / request replay")
        if chat_only:
            return checks

        due = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).isoformat(timespec="seconds").replace("+00:00", "Z")
        task_body = {"request_id": str(uuid.uuid4()), "conversation_id": conversation, "customer_id": str(customer),
            "prompt": f"本次为合成验收。整理资料并生成报告，提出一个标题为‘AI合成验收跟进’的待办建议，内容为确认演示方案，到期时间 {due}。等待我确认，不要声称已创建。",
            "attachment": {"name": "合成沟通资料.md", "content": "# 虚构资料\n客户希望了解演示方案，已同意明天沟通确认。以上仅为接口验收的合成内容，没有真实客户资料。"}}
        denied = {**task_body, "request_id": str(uuid.uuid4()), "conversation_id": "9223372036854775806"}
        try:
            mobile.request("POST", "/api/v1/mobile/ai/tasks", denied, denied["request_id"])
        except RuntimeError as error:
            require("HTTP 403" in str(error), "Unexpected foreign conversation response")
        else:
            raise RuntimeError("Unowned conversation accepted")
        created = mobile.request("POST", "/api/v1/mobile/ai/tasks", task_body, task_body["request_id"])
        task_id = created["id"]
        require(mobile.request("POST", "/api/v1/mobile/ai/tasks", task_body, task_body["request_id"])["id"] == task_id, "Duplicate task created")
        passed("conversation permission / task submission / duplicate submission")
        deadline = time.monotonic() + 220
        while time.monotonic() < deadline:
            task = mobile.request("GET", f"/api/v1/mobile/ai/tasks/{task_id}")
            if task["status"] in ("awaiting_confirmation", "failed", "completed", "cancelled"):
                break
            time.sleep(2)
        require(task["status"] == "awaiting_confirmation" and task.get("proposal"), "Real Agent did not produce a proposal")
        require(not task.get("follow_up_task_id"), "Business write occurred before confirmation")
        artifact = mobile.request("GET", f"/api/v1/mobile/ai/tasks/{task_id}/artifact")
        require(artifact["content"] and artifact["name"].endswith(".md"), "Report unavailable")
        require(any(item["id"] == task_id for item in mobile.request("GET", f"/api/v1/mobile/ai/tasks?conversation_id={conversation}")["items"]), "Background result missing on return")
        passed("real SDK/customer snapshot / Markdown report / background task restoration")
        confirmed = mobile.request("POST", f"/api/v1/mobile/ai/tasks/{task_id}/confirm", {})
        followup = confirmed["follow_up_task_id"]
        require(confirmed["status"] == "completed", "Receipt did not complete")
        require(mobile.request("POST", f"/api/v1/mobile/ai/tasks/{task_id}/confirm", {})["follow_up_task_id"] == followup, "Repeat confirmation created a different todo")
        require(database_counts(task_id, str(followup)) == [1, 1], "Database receipt or follow-up count is not exactly one")
        page = admin.request("GET", f"/admin-api/callphone/follow-up-task/page?customerId={customer}&pageNo=1&pageSize=20")
        saved = next((item for item in page["list"] if str(item["id"]) == str(followup)), None)
        require(saved and saved["title"] == task["proposal"]["title"].strip(), "PC cannot read persisted/decrypted todo")
        expected_due = dt.datetime.fromisoformat(task["proposal"]["due_at"].replace("Z", "+00:00")).timestamp() * 1000
        require(abs(saved["dueAt"] - expected_due) < 1000, "PC todo time differs from confirmed proposal")
        passed("mobile confirmation / real MySQL transaction / unique receipt / repeated confirmation / PC todo")
        return checks
    finally:
        cleanups = []
        if task_id and not followup:
            cleanups.append((mobile, "POST", f"/api/v1/mobile/ai/tasks/{task_id}/cancel", {}))
        if followup:
            cleanups.append((admin, "POST", f"/admin-api/callphone/follow-up-task/cancel?id={followup}", None))
        if conversation:
            cleanups.append((mobile, "DELETE", f"/api/v1/mobile/ai/conversations/{conversation}", None))
        if device:
            cleanups.append((admin, "POST", "/admin-api/callphone/device/revoke", {"id": device}))
        if pairing:
            cleanups.append((admin, "POST", "/admin-api/callphone/device/pairing-code/cancel", {"id": pairing["id"]}))
        if customer:
            cleanups.append((admin, "POST", f"/admin-api/callphone/customer/archive?id={customer}", None))
        for client, method, path, value in cleanups:
            try:
                client.request(method, path, value)
            except Exception:
                print("CLEANUP needs review:", path.split("?")[0], flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://127.0.0.1:48080")
    parser.add_argument("--exercise", action="store_true", required=True)
    parser.add_argument("--chat-only", action="store_true")
    parser.add_argument("--task-only", action="store_true")
    args = parser.parse_args()
    if urllib.parse.urlsplit(args.base).hostname not in ("127.0.0.1", "localhost"):
        raise SystemExit("This synthetic-write check is restricted to the local test environment.")
    try:
        if args.chat_only and args.task_only:
            raise SystemExit("Choose only one feature filter.")
        exercise(args.base, args.chat_only, args.task_only)
    except Exception as reason:
        raise SystemExit(str(reason))
