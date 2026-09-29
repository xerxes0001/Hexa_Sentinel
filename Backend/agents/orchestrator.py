"""
HexaSentinel — Orchestrator
Coordinates the PacketCapture → FeatureExtractor → AnomalyDetector → LLMAnalyst
pipeline and manages the list of WebSocket subscribers (React dashboard).

Exposed as a module-level singleton so FastAPI endpoints and the WebSocket
handler share a single model instance and a single capture thread.
"""

import json
import threading
from typing import Callable

from .packet_capture import PacketCapture
from .llm_analyst import LLMAnalyst


class HexaSentinelOrchestrator:
    def __init__(self):
        self._analyst     = LLMAnalyst()      # shared model — lock inside LLMAnalyst
        self._subscribers: list[Callable]  = []
        self._sub_lock    = threading.Lock()
        self._stats       = {
            "windows_processed": 0,
            "threats_detected":  0,
            "suspicious":        0,
            "normal":            0,
            "simulated":         0,
        }

        self._capture = PacketCapture(
            on_threat_callback=self._on_threat,
            on_normal_callback=self._on_normal,
            analyst=self._analyst,  # shared — Llama loads only once
        )

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    def start(self, iface: str | None = None):
        self._capture.start(iface)
        print("[Orchestrator] HexaSentinel on-device pipeline started")

    def stop(self):
        self._capture.stop()

    # ── WebSocket subscriber management ──────────────────────────────────────
    def subscribe(self, callback: Callable):
        with self._sub_lock:
            self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable):
        with self._sub_lock:
            self._subscribers = [s for s in self._subscribers if s is not callback]

    def _broadcast(self, payload: str):
        with self._sub_lock:
            dead = []
            for cb in list(self._subscribers):
                try:
                    cb(payload)
                except Exception:
                    dead.append(cb)
            for cb in dead:
                self._subscribers.remove(cb)

    # ── Pipeline callbacks ────────────────────────────────────────────────────
    def _on_threat(self, event: dict):
        score = float(event.get("score", 0))
        if score >= 0.92:
            self._stats["threats_detected"] += 1
        else:
            self._stats["suspicious"] += 1
        self._stats["windows_processed"] += 1
        if event.get("simulated"):
            self._stats["simulated"] += 1
        # Broadcast to all connected React dashboard WebSockets
        self._broadcast(json.dumps({"type": "threat", **event}))

    def _on_normal(self, event: dict):
        self._stats["normal"] += 1
        self._stats["windows_processed"] += 1
        # Only broadcast NORMAL events as heartbeats (lower frequency)
        if self._stats["windows_processed"] % 5 == 0:
            self._broadcast(json.dumps({"type": "heartbeat", **event}))

    # ── AI endpoints (called by FastAPI routes) ───────────────────────────────
    def analyze_incident(self, context: dict | str) -> str:
        """
        On-demand incident analysis — called by POST /api/analyze.
        Used by AIAnalysis.jsx for BGP incidents from the RIPE RIS feed.
        """
        if isinstance(context, dict):
            context = json.dumps(context)
        return self._analyst.analyze(context)

    def chat(self, system_context: str, user_message: str) -> str:
        """
        Single-turn chat — called by POST /api/chat.
        Used by AdminChat.jsx and ConversationalQuery.jsx.
        """
        return self._analyst.chat(system_context, user_message)

    def generate_certin_report(self, incident: dict, analysis: str) -> str:
        return self._analyst.generate_certin_report(incident, analysis)

    def generate_isp_notification(self, incident: dict) -> str:
        return self._analyst.generate_isp_notification(incident)

    def get_stats(self) -> dict:
        s = dict(self._stats)
        total = max(s["windows_processed"], 1)
        s["simulated_ratio"] = round(s["simulated"] / total, 3)
        return s


# Module-level singleton — imported by main.py and websocket.py
orchestrator = HexaSentinelOrchestrator()
