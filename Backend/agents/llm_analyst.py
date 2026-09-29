"""
HexaSentinel — LLM Analyst
Llama 3.2 3B Instruct sourced from Qualcomm AI Hub, compiled for QNN Runtime
and running 100% on the Snapdragon X Elite Hexagon NPU.

Zero cloud calls at inference time — the only network activity is the
one-time model download during setup (model.from_pretrained()).

Falls back to a deterministic template when NPU hardware or the
qai-hub-models package is unavailable (dev/CI environments).
"""

import json
import threading

# ── System prompt — defines HexaSentinel's analyst persona ─────────────────────
SYSTEM_PROMPT = (
    "You are HexaSentinel, an on-device network security analyst running on a "
    "Qualcomm Snapdragon X Elite HP AI PC. You analyse network traffic anomalies "
    "detected by the on-device ONNX classifier and produce concise threat reports.\n\n"
    "For every threat context provided, generate exactly this structure:\n"
    "SEVERITY: <INFO|WARNING|CRITICAL>\n"
    "WHAT HAPPENED: <1-2 sentences, plain English>\n"
    "ATTACK VECTOR: <likely attack type and affected services>\n"
    "ACTIONS:\n"
    "1. <specific immediate action>\n"
    "2. <specific immediate action>\n"
    "3. <specific immediate action>\n\n"
    "Be specific, actionable, and under 200 words. No markdown."
)

CHAT_SYSTEM_PROMPT = (
    "You are HexaSentinel, an on-device network security analyst. "
    "You have access to real-time BGP threat intelligence and local network "
    "traffic analysis from the Snapdragon Hexagon NPU. "
    "Answer questions about network security, BGP incidents, RPKI, CERT-In "
    "procedures, and Indian internet infrastructure. "
    "Be concise and technically accurate. No markdown formatting."
)


class LLMAnalyst:
    """
    Thread-safe wrapper around Llama 3.2 3B Instruct from Qualcomm AI Hub.
    A single instance is shared across the FastAPI server via the orchestrator.
    The _lock ensures only one inference runs at a time on the NPU.
    """

    def __init__(self):
        self._model = None
        self._lock  = threading.Lock()
        self._load()

    # ── Model loading ─────────────────────────────────────────────────────────
    def _load(self):
        try:
            from qai_hub_models.models.llama_v3_2_3b_chat_quantized import Model
            print("[LLMAnalyst] Loading Llama 3.2 3B from Qualcomm AI Hub…")
            self._model = Model.from_pretrained()
            print("[LLMAnalyst] ✓ Llama 3.2 3B loaded — running on Hexagon NPU")
        except ImportError:
            print(
                "[LLMAnalyst] qai-hub-models not installed. "
                "Run: pip install qai-hub-models==0.18.0"
            )
        except Exception as exc:
            print(
                f"[LLMAnalyst] Llama 3.2 3B load failed: {exc}\n"
                "  → Using deterministic template fallback until hardware is available."
            )

    # ── Public API ────────────────────────────────────────────────────────────
    def analyze(self, threat_context_json: str) -> str:
        """
        Route to the correct analyst based on threat context type.
        - BGP incidents (type == 'bgp_incident') → BGP analyst prompt
        - Packet anomalies (no type field) → packet analyst prompt
        Called by PacketCapture and /api/analyze endpoint.
        """
        import json as _json
        try:
            ctx = _json.loads(threat_context_json) if isinstance(threat_context_json, str) else threat_context_json
            if isinstance(ctx, dict) and ctx.get("type") == "bgp_incident":
                return self._analyze_bgp(ctx)
        except Exception:
            pass
        prompt = f"{SYSTEM_PROMPT}\n\nThreat Context (JSON):\n{threat_context_json}"
        return self._run(prompt)

    def _analyze_bgp(self, ctx: dict) -> str:
        """
        Llama prompt specifically crafted for BGP hijacking incidents.
        Produces a CERT-In-ready format with BGP-specific context.
        """
        bgp_prompt = (
            "You are HexaSentinel, an on-device BGP and network security analyst.\n\n"
            "Analyse this BGP hijacking incident detected on the Indian internet infrastructure:\n\n"
            f"PREFIX HIJACKED:    {ctx.get('prefix', 'unknown')}\n"
            f"ATTACKER ASN:       {ctx.get('attacker_asn')} ({ctx.get('attacker_name')}, {ctx.get('attacker_country')})\n"
            f"VICTIM ASN:         {ctx.get('victim_asn')} ({ctx.get('victim_name')}, sector: {ctx.get('victim_sector')})\n"
            f"SEVERITY:           {ctx.get('severity')}\n"
            f"CONFIDENCE:         {ctx.get('confidence')}%\n"
            f"PATH ANOMALY:       {ctx.get('path_anomaly', 'none')}\n"
            f"RPKI STATE:         {ctx.get('rpki_state', 'unknown')}\n"
            f"REPEAT ATTACKER:    {'Yes (' + str(ctx.get('repeat_count')) + ' attacks)' if ctx.get('is_repeat') else 'No'}\n"
            f"COORDINATED ATTACK: {'Yes — BGP + TLS cert' if ctx.get('coordinated') else 'No'}\n\n"
            "Generate exactly:\n"
            "SEVERITY: <INFO|WARNING|CRITICAL>\n"
            "WHAT HAPPENED: <2 sentences explaining the BGP hijack in plain English>\n"
            "ATTACK VECTOR: <technical description of the BGP manipulation technique>\n"
            "INDIAN IMPACT: <which Indian services/users are affected>\n"
            "ACTIONS:\n"
            "1. <immediate NOC action>\n"
            "2. <RPKI/routing action>\n"
            "3. <CERT-In notification or escalation step>\n\n"
            "Be specific about BGP routing, RPKI, and Indian internet infrastructure. Under 220 words."
        )
        return self._run(bgp_prompt, max_new_tokens=280)

    def chat(self, system_context: str, user_message: str) -> str:
        """
        Single-turn Q&A for the Admin Chat panel and ConversationalQuery.
        system_context: live incident/BGP state from the frontend
        """
        full_system = f"{CHAT_SYSTEM_PROMPT}\n\nCurrent State:\n{system_context}"
        prompt = f"{full_system}\n\nUser: {user_message}\nHexaSentinel:"
        return self._run(prompt, max_new_tokens=300)

    def generate_certin_report(self, incident: dict, analysis: str) -> str:
        """
        Generate a formal CERT-In format network incident report.
        """
        import datetime
        inc_id = f"CERT-IN-NW-{datetime.datetime.now().strftime('%Y%m%d-%H%M')}"
        prompt = (
            f"You are a CERT-In cybersecurity specialist.\n\n"
            f"Generate a formal CERT-In network incident report.\n"
            f"Incident ID: {inc_id}\n"
            f"Date/Time: {datetime.datetime.now().isoformat()}\n"
            f"Detection: {incident.get('label','THREAT')} "
            f"at {incident.get('confidence', 0)}% confidence\n"
            f"Prior Analysis: {analysis}\n\n"
            f"Include sections: Executive Summary, Incident Classification, "
            f"Technical Timeline, Network Analysis, Impact Assessment, "
            f"Indicators of Compromise, Immediate Actions, Recommendations.\n"
            f"Format as plain text. No markdown."
        )
        return self._run(prompt, max_new_tokens=600)

    def generate_isp_notification(self, incident: dict) -> str:
        """
        Draft an urgent ISP NOC notification email.
        """
        prompt = (
            f"You are a senior network security engineer.\n\n"
            f"Draft an urgent ISP NOC notification email for a confirmed network threat.\n"
            f"Detection: {incident.get('label','THREAT')} "
            f"at {incident.get('confidence', 0)}% confidence\n"
            f"Include: TO field, SUBJECT line, technical body with affected services, "
            f"attack indicators, immediate actions required, 2-hour response SLA.\n"
            f"Plain text only."
        )
        return self._run(prompt, max_new_tokens=400)

    # ── Internal inference ────────────────────────────────────────────────────
    def _run(self, prompt: str, max_new_tokens: int = 250) -> str:
        """
        Thread-safe NPU inference. Falls back to deterministic template
        if the model is unavailable.
        """
        if self._model is not None:
            with self._lock:
                try:
                    result = self._model.generate(
                        prompt,
                        max_new_tokens=max_new_tokens,
                    )
                    return result.strip() if result else self._fallback(prompt)
                except Exception as exc:
                    print(f"[LLMAnalyst] Inference error: {exc}")

        return self._fallback(prompt)

    def _fallback(self, prompt: str) -> str:
        """
        Deterministic template — used when the Hexagon NPU or Llama model
        is not available. Keeps the system functional during development.
        """
        if "CERT-In" in prompt or "CERT-IN" in prompt:
            return (
                "CERT-IN INCIDENT REPORT\n"
                "========================\n"
                "EXECUTIVE SUMMARY: Anomalous network traffic detected by "
                "HexaSentinel on-device classifier. NPU model unavailable — "
                "manual review required.\n\n"
                "STATUS: Template response (Llama 3.2 3B not loaded)\n"
                "ACTION: Ensure qai-hub-models is installed and Llama model "
                "is downloaded via setup.bat"
            )
        if "NOC" in prompt or "ISP" in prompt:
            return (
                "TO: noc@isp.in\n"
                "SUBJECT: URGENT — Network Anomaly Detected\n\n"
                "HexaSentinel detected anomalous traffic. AI report unavailable "
                "(NPU model not loaded). Please review network logs manually.\n"
                "Response required within 2 hours."
            )
        # Generic threat analysis fallback
        try:
            ctx = json.loads(prompt.split("Threat Context (JSON):")[-1].strip())
            label = ctx.get("label", "SUSPICIOUS")
            conf  = ctx.get("confidence", 70)
            pkt   = ctx.get("pkt_rate", 0)
            entr  = ctx.get("port_entropy", 0)
        except Exception:
            label, conf, pkt, entr = "SUSPICIOUS", 70, 0, 0

        severity = "CRITICAL" if label == "THREAT" else "WARNING"
        return (
            f"SEVERITY: {severity}\n"
            f"WHAT HAPPENED: Anomalous network traffic detected by the on-device "
            f"ONNX classifier ({label} at {conf}% confidence). "
            f"Packet rate: {pkt:.1f}/s, port entropy: {entr:.2f}.\n"
            f"ATTACK VECTOR: Possible port scan, connection flood, or "
            f"beaconing malware based on traffic pattern.\n"
            f"ACTIONS:\n"
            f"1. Run 'netstat -an' to identify active connections\n"
            f"2. Check firewall logs for repeated connection attempts to "
            f"   unusual ports\n"
            f"3. Temporarily isolate the device if CRITICAL — contact your "
            f"   network administrator\n\n"
            f"[Note: Full AI analysis requires Llama 3.2 3B on Hexagon NPU. "
            f"Run setup.bat to download the model.]"
        )
