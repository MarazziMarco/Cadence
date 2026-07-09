import sys, os, json, asyncio
from emergentintegrations.llm.chat import LlmChat, UserMessage

SYSTEM = """You convert natural-language scheduling notes for an appointment business into STRICT JSON.
Output ONLY a single JSON object, no markdown fences, no commentary.

Schema:
{"commands":[{
  "patient_name": string,
  "available": [{"weekday":"monday|tuesday|wednesday|thursday|friday|saturday|sunday","period":"morning|afternoon|evening|any"|null,"start_time":"HH:MM"|null,"end_time":"HH:MM"|null}],
  "unavailable": [{"weekday":"monday|...|sunday","period":"morning|afternoon|evening|any"|null}],
  "duration_minutes": number|null,
  "priority": "low|normal|high"|null,
  "notes": string|null
}]}

Rules:
- Weekdays MUST be lowercase English full names.
- When only a period is mentioned, map to times: morning=09:00-13:00, afternoon=14:00-18:00, evening=18:00-21:00. If a whole day, start_time/end_time=null and period="any".
- Extract the client's given name into patient_name (capitalize normally).
- Support multiple clients -> multiple command objects.
- If nothing for a field, use null or empty array.
- Output ONLY the JSON object.
"""

async def main():
    raw = sys.stdin.read() or "{}"
    data = json.loads(raw)
    text = data.get("text", "")
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        print(json.dumps({"error": "EMERGENT_LLM_KEY missing"})); return
    if not text.strip():
        print(json.dumps({"commands": []})); return
    chat = LlmChat(api_key=key, session_id=data.get("session_id", "ai-parse"), system_message=SYSTEM).with_model("gemini", "gemini-2.5-flash")
    resp = await chat.send_message(UserMessage(text=text))
    out = (resp or "").strip()
    if out.startswith("```"):
        out = out.strip("`")
        if out.lower().startswith("json"):
            out = out[4:]
    out = out.strip()
    try:
        parsed = json.loads(out)
        print(json.dumps(parsed))
    except Exception:
        print(json.dumps({"error": "parse_failed", "raw": out[:2000]}))

asyncio.run(main())
