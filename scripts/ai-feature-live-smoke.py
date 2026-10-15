#!/usr/bin/env python3
"""Local chat/web real-model/API smoke. --exercise creates and cleans synthetic fixtures.
Never dials, reads real customer material, or prints credentials. Real model calls incur API usage.
"""
import argparse
import json
import os
import re
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


def exercise(base):
    admin = Client(base)
    session = admin.request("POST", "/admin-api/system/auth/login", {"username": os.getenv("AI_SMOKE_ADMIN_USER", "admin"), "password": os.getenv("AI_SMOKE_ADMIN_PASSWORD", "admin123")})
    admin.headers["Authorization"] = "Bearer " + session["accessToken"]
    device = pairing = conversation = None
    mobile = Client(base)
    checks = []
    def passed(name):
        checks.append(name)
        print("PASS", name, flush=True)
    try:
        pairing = admin.request("POST", "/admin-api/callphone/device/pairing-code/create")
        scanned = mobile.request("POST", "/api/v1/mobile/session/scan", {"pairingId": pairing["id"], "pairingCode": pairing["pairingCode"], "loginSecret": pairing["loginSecret"], "displayName": "AI闭环验收虚拟设备（不会拨号）"})
        device = scanned["deviceId"]
        mobile.headers.update({"Authorization": "Bearer " + scanned["accessToken"], "X-Callphone-Device-Id": str(device), "X-Callphone-Device-Key": scanned["deviceKey"]})
        require(mobile.request("POST", "/api/v1/mobile/devices/heartbeat"), "Device heartbeat failed")
        conversation = mobile.request("POST", "/api/v1/mobile/ai/conversations", {}, str(uuid.uuid4()))["id"]
        passed("real QR-scoped session / device authentication / owned conversation")

        body = {"request_id": str(uuid.uuid4()), "conversation_id": conversation, "content": "请联网搜索 Python 官方 zoneinfo 文档，简要说明 ZoneInfo 用途，100字以内。", "web_search": True}
        events = mobile.stream(body)
        answer = events[-1]["content"]
        require(any(e.get("stage") == "searching" for e in events), "No actual search activity")
        require("**联网来源**" in answer and "https://" in answer, "Missing grounded source links")
        require(mobile.stream(body)[-1]["content"] == answer, "Idempotent replay changed reply")
        history = mobile.request("GET", f"/api/v1/mobile/ai/conversations/{conversation}/messages?limit=50")
        require(history["items"][-1]["content"] == answer, "History lost search answer or sources")
        passed("real DeepSeek web search / SSE / sources / history / request replay")
        return checks
    finally:
        cleanups = []
        if conversation:
            cleanups.append((mobile, "DELETE", f"/api/v1/mobile/ai/conversations/{conversation}", None))
        if device:
            cleanups.append((admin, "POST", "/admin-api/callphone/device/revoke", {"id": device}))
        if pairing:
            cleanups.append((admin, "POST", "/admin-api/callphone/device/pairing-code/cancel", {"id": pairing["id"]}))
        for client, method, path, value in cleanups:
            try:
                client.request(method, path, value)
            except Exception:
                print("CLEANUP needs review:", path.split("?")[0], flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://127.0.0.1:48080")
    parser.add_argument("--exercise", action="store_true", required=True)
    args = parser.parse_args()
    if urllib.parse.urlsplit(args.base).hostname not in ("127.0.0.1", "localhost"):
        raise SystemExit("This synthetic-write check is restricted to the local test environment.")
    try:
        exercise(args.base)
    except Exception as reason:
        raise SystemExit(str(reason))
