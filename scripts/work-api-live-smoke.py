#!/usr/bin/env python3
"""Explicit real-model mobile Work smoke, using synthetic files and a virtual device only."""
import argparse
import base64
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request
import uuid

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("chat_smoke", Path(__file__).with_name("ai-feature-live-smoke.py"))
chat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chat)
Client, require = chat.Client, chat.require
ROOT = "/api/v1/mobile/work/sessions"


def exercise(base, boundaries_only=False, queue=False):
    admin, mobile = Client(base), Client(base)
    auth = admin.request("POST", "/admin-api/system/auth/login", {
        "username": os.getenv("AI_SMOKE_ADMIN_USER", "admin"), "password": os.getenv("AI_SMOKE_ADMIN_PASSWORD", "admin123")})
    admin.headers["Authorization"] = "Bearer " + auth["accessToken"]
    pairing = device = conversation = work = None
    try:
        pairing = admin.request("POST", "/admin-api/callphone/device/pairing-code/create")
        scanned = mobile.request("POST", "/api/v1/mobile/session/scan", {
            "pairingId": pairing["id"], "pairingCode": pairing["pairingCode"], "loginSecret": pairing["loginSecret"],
            "displayName": "Work部署合成验收虚拟设备（不会拨号）"})
        device = scanned["deviceId"]
        mobile.headers.update({"Authorization": "Bearer " + scanned["accessToken"],
            "X-Callphone-Device-Id": str(device), "X-Callphone-Device-Key": scanned["deviceKey"]})
        mobile.request("POST", "/api/v1/mobile/devices/heartbeat")
        conversation = mobile.request("POST", "/api/v1/mobile/ai/conversations", {}, str(uuid.uuid4()))["id"]
        work = mobile.request("POST", ROOT, {"conversation_id": conversation})["id"]
        require(mobile.request("POST", ROOT, {"conversation_id": conversation})["id"] == work, "Work mapping is not idempotent")
        print("PASS actual mobile entry / device scope / conversation ownership / Work mapping", flush=True)

        resource = mobile.request("POST", f"{ROOT}/{work}/files", {
            "name": "synthetic-input.csv", "content_base64": base64.b64encode(b"name,count\nalpha,1\n").decode()})
        path = resource["path"]
        prompt = ("这是合成部署验收，只操作当前工作区。加载 workspace-files 技能并调用 work.workspace_info。"
            f"用 Bash 前台运行 python3，读取关联文件 {path}，确认内容为 name,count 换行 alpha,1 换行，"
            "创建 work-smoke.csv，保留原内容并追加 beta,2 这一行。"
            "同一 Python 命令必须实际 import pypdf, docx, openpyxl, pptx，成功后打印 DOCUMENT_LIBRARIES_OK。"
            "用 Read 核对并调用 work.present_files 发布 work-smoke.csv。不要重试失败命令、安装依赖、联网或使用未隔离执行；"
            "若 Bash 失败请如实停止，不改用 Write/Edit 绕过验收。无需提问。")

        def run(prompt, resources=None, queued_prompt=None):
            key = str(uuid.uuid4())
            body = {"request_id": key, "prompt": prompt, "resource_ids": resources or []}
            accepted = mobile.request("POST", f"{ROOT}/{work}/messages", body, key)
            require(mobile.request("POST", f"{ROOT}/{work}/messages", body, key)["run_id"] == accepted["run_id"], "Duplicate submission started a new run")
            queued_key = None
            if queued_prompt:
                queued_key = str(uuid.uuid4())
                queued_body = {"request_id": queued_key, "prompt": queued_prompt, "enqueue": True}
                queued = mobile.request("POST", f"{ROOT}/{work}/messages", queued_body, queued_key)
                require(any(m["id"] == queued_key and m.get("delivery") == "queued" for m in queued["messages"]), "Follow-up was not queued")
                mobile.request("POST", f"{ROOT}/{work}/messages", queued_body, queued_key)
            deadline = time.monotonic() + 210
            heartbeat = 0
            while time.monotonic() < deadline:
                state = mobile.request("GET", f"{ROOT}/{work}")
                for item in state["interactions"]:
                    if item["status"] == "pending":
                        mobile.request("POST", f"{ROOT}/{work}/interactions/{item['id']}", {"binding": item["binding"], "approved": False})
                        raise RuntimeError("Unexpected interaction: no high-risk action is approved by this check")
                if state["status"] not in ("running", "waiting"):
                    require(state["status"] == "idle", "Work execution did not finish successfully")
                    if queued_key:
                        require(sum(m["id"] == queued_key for m in state["messages"]) == 1, "Queue request duplicated")
                        require(any(m.get("run_id") == queued_key and m["role"] == "assistant" and "QUEUE_OK" in m["content"] for m in state["messages"]), "Queued result missing")
                        require(any(m["id"] == queued_key and m.get("delivery") == "completed" for m in state["messages"]), "Queue did not complete")
                        print("PASS running input queue / idempotent admission / separate final result", flush=True)
                    return state
                if time.monotonic() - heartbeat > 15:
                    mobile.request("POST", "/api/v1/mobile/devices/heartbeat")
                    heartbeat = time.monotonic()
                time.sleep(1)
            raise RuntimeError("Work execution exceeded the smoke deadline")

        def download(item):
            request = urllib.request.Request(base.rstrip("/") + f"{ROOT}/{work}/artifacts/{item['id']}", headers=mobile.headers)
            with urllib.request.urlopen(request, timeout=20) as response:
                require("attachment" in response.headers.get("Content-Disposition", ""), "Missing authenticated download headers")
                return response.read()

        if boundaries_only:
            state = run("这是合成隔离验收，只调用 Bash 运行以下前台命令，不打印文件内容或任何环境变量值。"
                "{ if cat ../mapping.json >/dev/null 2>&1; then echo PRIVATE_BAD; else echo PRIVATE_BLOCKED; fi; "
                'if [ -n "${ANTHROPIC_API_KEY:-}" ] || [ -n "${ANTHROPIC_AUTH_TOKEN:-}" ] || [ -n "${AGENT_INTERNAL_TOKEN:-}" ]; '
                "then echo ENV_BAD; else echo ENV_HIDDEN; fi; "
                'if [ "$(cat /proc/1/comm 2>/dev/null)" = node ]; then echo PROC_BAD; else echo PROC_ISOLATED; fi; '
                "if touch .claude/settings.json >/dev/null 2>&1; then echo CONFIG_BAD; else echo CONFIG_BLOCKED; fi; "
                "} > boundary.txt 。然后只用 work.present_files 发布 boundary.txt。"
                "不要使用 Write/Edit 替代这些测试，不要关闭沙箱或申请额外权限。")
            require(state["artifacts"], "No boundary evidence file")
            require(download(state["artifacts"][-1]) == b"PRIVATE_BLOCKED\nENV_HIDDEN\nPROC_ISOLATED\nCONFIG_BLOCKED\n", "Linux sandbox boundary checks failed")
            print("PASS sandbox blocks private mapping / provider environment / outer process visibility / configuration writes", flush=True)
            return

        state = run(prompt, [resource["id"]], "补充验收：调用 work.workspace_info，确认刚才上传的 synthetic-input.csv 仍在 resources 中；不再改动文件，成功时只回复 QUEUE_OK。" if queue else None)
        require(state["artifacts"], "No downloadable artifact")
        sdk_id = state["sdk_session_id"]
        artifact = state["artifacts"][-1]

        require(download(artifact) == b"name,count\nalpha,1\nbeta,2\n", "Real generated file bytes differ")
        content = mobile.request("GET", f"{ROOT}/{work}/artifacts/{artifact['id']}/content")
        require(base64.b64decode(content["content_base64"]) == download(artifact), "App content and binary download differ")
        print("PASS real SDK / uploaded original file / sandboxed Python / document libraries / authenticated artifact bytes", flush=True)

        state = run("继续刚才会话，使用 Bash 前台命令为现有 work-smoke.csv 追加 gamma,3 换行，Read 核对后发布新版本。不要重建原有内容，不要使用 Write/Edit，不需提问。")
        require(state["sdk_session_id"] == sdk_id, "SDK session was not resumed")
        require(download(state["artifacts"][-1]) == b"name,count\nalpha,1\nbeta,2\ngamma,3\n", "Resumed file modification differs")
        require(download(artifact) == b"name,count\nalpha,1\nbeta,2\n", "Earlier artifact was mutated")
        request = urllib.request.Request(base.rstrip("/") + f"{ROOT}/{work}/events?after=0", headers={**mobile.headers, "Accept": "text/event-stream"})
        with urllib.request.urlopen(request, timeout=15) as response:
            require("text/event-stream" in response.headers.get("Content-Type", ""), "Missing Work SSE")
            for line in response:
                if line.startswith(b"data:"):
                    event = json.loads(line[5:].lstrip())
                    require(event["sequence"] > 0 and event["type"], "Invalid replay event")
                    break
            else:
                raise RuntimeError("No replayed Work events")
        print("PASS native session resume / modification / immutable prior artifact / mobile SSE replay", flush=True)
    finally:
        cleanups = []
        if work:
            cleanups.append((mobile, "POST", f"{ROOT}/{work}/close", {}))
        if conversation:
            cleanups.append((mobile, "DELETE", f"/api/v1/mobile/ai/conversations/{conversation}", None))
        if device:
            cleanups.append((admin, "POST", "/admin-api/callphone/device/revoke", {"id": device}))
        if pairing:
            cleanups.append((admin, "POST", "/admin-api/callphone/device/pairing-code/cancel", {"id": pairing["id"]}))
        for client, method, path, body in cleanups:
            try:
                client.request(method, path, body)
            except Exception:
                print("CLEANUP needs review:", path.split("?")[0], flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://127.0.0.1:48080")
    parser.add_argument("--exercise", required=True, action="store_true")
    parser.add_argument("--boundaries-only", action="store_true")
    parser.add_argument("--queue", action="store_true")
    args = parser.parse_args()
    if urllib.parse.urlsplit(args.base).hostname not in ("127.0.0.1", "localhost", "100.87.254.68"):
        raise SystemExit("This synthetic-write check is restricted to the configured local/mobile deployment.")
    try:
        exercise(args.base, args.boundaries_only, args.queue)
    except Exception as error:
        raise SystemExit(str(error))
