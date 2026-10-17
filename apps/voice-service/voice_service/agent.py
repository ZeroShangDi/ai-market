"""Text-only adapter to the existing bounded, read-only Agent stream."""
import json
import httpx


async def ask_agent(turns: list[dict], identity: dict, *, url: str, token: str) -> str:
    if len(token) < 32:
        raise RuntimeError("Agent is not configured")
    headers = {"Authorization": f"Bearer {token}", **{
        f"X-AI-{key.title()}": identity[key] for key in ("tenant", "user", "device")}}
    answer = []
    done = False
    async with httpx.AsyncClient(timeout=httpx.Timeout(170, connect=5), follow_redirects=False, trust_env=False) as client:
        async with client.stream("POST", url.rstrip("/") + "/internal/v1/agent/chat/stream",
                                 headers=headers, json={"turns": turns}) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                event = json.loads(line[6:])
                if event.get("type") == "error":
                    raise RuntimeError("Agent failed")
                if event.get("type") == "chunk":
                    answer.append(event.get("text", ""))
                    if sum(map(len, answer)) > 16000:
                        raise RuntimeError("Agent response too long")
                if event.get("type") == "done":
                    done = True
    if not done or not "".join(answer).strip():
        raise RuntimeError("Agent response incomplete")
    return "".join(answer)
