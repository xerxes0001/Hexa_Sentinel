"""
HexaSentinel — Packet Capture Agent
===================================
Implements the 5-stage Silicon Pipeline from Slide 5:

  Stage 1 — Passive Ingestion   : Scapy / WinPcap hook, rolling 30s ring
  Stage 2 — Feature Extraction  : 80-feature vector, ~12ms CPU
  Stage 3 — NPU Screening       : ONNX GBDT Classifier, S ∈ [0.0, 1.0], <3ms NPU
  Stage 4 — Deep Reasoning      : Llama 3.2 3B, 8-12s NPU (Threat branch only)
  Stage 5 — SOC Triage          : FastAPI WebSocket push → React dashboard

Conditional branching (Slide 5):
  S < 0.85  → Normal Branch : buffer purged, no LLM wake, 0% CPU/NPU waste
  S ≥ 0.85  → Threat Branch : structured JSON assembled, LLM high-priority queue

Energy: 0.015 Wh/incident  |  Power: ~1W NPU (classifier), 3-5W (LLM triage)
"""

import datetime
import json
import random
import threading
import time

from .feature_extractor  import FeatureExtractor
from .anomaly_detector   import AnomalyDetector, THREAT_THRESHOLD
from .llm_analyst        import LLMAnalyst  # imported only for type fallback

WINDOW_SEC = 30          # Slide 5: "Rolling 30s in-memory ring"


class PacketCapture:
    def __init__(self, on_threat_callback, on_normal_callback=None, analyst=None):
        self.extractor         = FeatureExtractor()
        self.detector          = AnomalyDetector()
        # Use shared analyst from orchestrator — avoids loading Llama twice
        self.analyst           = analyst if analyst is not None else LLMAnalyst()
        self.on_threat         = on_threat_callback
        self.on_normal         = on_normal_callback
        self._window: list     = []
        self._window_start     = None
        self._running          = False
        self._lock             = threading.Lock()

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    def start(self, iface=None):
        self._running = True
        threading.Thread(target=self._stage1_capture,
                         args=(iface,), daemon=True).start()

    def stop(self):
        self._running = False

    # ── Stage 1: Passive Ingestion (Scapy / WinPcap) ─────────────────────────
    def _stage1_capture(self, iface):
        """
        Slide 5 Stage 1: Scapy/WinPcap hook.
        Zero disk I/O — payload stripped immediately at capture.
        Captures raw 802.11/802.3 frames.
        """
        try:
            from scapy.all import sniff
            print(f"[Stage 1] Scapy capture started on iface={iface or 'default'}")
            sniff(iface=iface, store=False, prn=self._ingest_packet,
                  stop_filter=lambda _: not self._running)
        except Exception as exc:
            print(f"[Stage 1] Scapy error: {exc}\n"
                  "  → Simulation mode active (install Npcap for live capture)")
            self._simulation_mode()

    def _ingest_packet(self, pkt):
        """Strip payload immediately — only statistical metadata kept (DPDP Act)."""
        try:
            from scapy.all import IP, TCP, UDP
            if IP not in pkt:
                return
            now = time.time()
            row = {
                "ts":          now,
                "size":        len(pkt),
                "proto":       pkt[IP].proto,
                "src":         pkt[IP].src,
                "dst":         pkt[IP].dst,
                "sport":       pkt[TCP].sport if TCP in pkt else (pkt[UDP].sport if UDP in pkt else 0),
                "dport":       pkt[TCP].dport if TCP in pkt else (pkt[UDP].dport if UDP in pkt else 0),
                "flags":       str(pkt[TCP].flags) if TCP in pkt else "",
                "payload_len": len(bytes(pkt[IP].payload)) if pkt[IP].payload else 0,
                # payload CONTENT is never stored — only length (Slide 6: Privacy-by-Design)
            }
            with self._lock:
                if self._window_start is None:
                    self._window_start = now
                self._window.append(row)
                if now - self._window_start >= WINDOW_SEC:
                    window_copy         = list(self._window)
                    self._window        = []
                    self._window_start  = now
                    threading.Thread(target=self._stage2_extract,
                                     args=(window_copy,), daemon=True).start()
        except Exception:
            pass

    # ── Stage 2: Feature Extraction (~12ms CPU) ───────────────────────────────
    def _stage2_extract(self, window: list):
        """Slide 5 Stage 2: 80-feature vector. Shannon entropy, IAT jitter, SYN/ACK."""
        t0       = time.perf_counter()
        features = self.extractor.extract(window)
        elapsed  = (time.perf_counter() - t0) * 1000          # ms
        self._stage3_screen(features, window, elapsed)

    # ── Stage 3: NPU Screening (<3ms, ONNX GBDT) ─────────────────────────────
    def _stage3_screen(self, features, window, stage2_ms):
        """
        Slide 5 Stage 3: ONNX GBDT Classifier on Hexagon NPU via QNN EP.
        Continuous ~1W power draw. Output: Score S ∈ [0.0, 1.0].
        """
        t0             = time.perf_counter()
        score, is_thrt = self.detector.is_threat(features)
        elapsed        = (time.perf_counter() - t0) * 1000

        ts = datetime.datetime.utcnow().isoformat() + "Z"

        if is_thrt:
            # Slide 5: Threat Branch — assemble context, wake LLM
            ctx = self._build_threat_context(features, score, len(window))
            self._stage4_reason(ctx, score, features, ts, stage2_ms, elapsed)
        else:
            # Slide 5: Normal Branch — purge buffer, log, 0% LLM waste
            if self.on_normal:
                self.on_normal({
                    "label":        "NORMAL",
                    "score":        round(score, 4),
                    "threshold":    THREAT_THRESHOLD,
                    "window_pkts":  len(window),
                    "stage2_ms":    round(stage2_ms, 2),
                    "stage3_ms":    round(elapsed, 2),
                    "timestamp":    ts,
                })

    # ── Stage 4: Deep Reasoning (Llama 3.2 3B, 8-12s NPU) ───────────────────
    def _stage4_reason(self, ctx_json, score, features, ts, stage2_ms, stage3_ms):
        """
        Slide 5 Stage 4: Qualcomm AI Hub INT4 QNN Runtime.
        ~20 tokens/sec local throughput. Plain-English summary + 3 tactical steps.
        Energy: 0.015 Wh/incident.
        """
        t0     = time.perf_counter()
        report = self.analyst.analyze(ctx_json)
        elapsed= (time.perf_counter() - t0)

        label  = "THREAT" if score >= 0.92 else "SUSPICIOUS"
        self.on_threat({
            "label":         label,
            "score":         round(score, 4),
            "threshold":     THREAT_THRESHOLD,
            "report":        report,
            "features": {
                "pkt_rate":     round(float(features[0]), 2),
                "byte_rate":    round(float(features[1]), 2),
                "unique_dsts":  int(features[20]),
                "unique_ports": int(features[21]),
                "syn_ratio":    round(float(features[22]), 3),
                "port_entropy": round(float(features[30]), 3),
                "zero_payload": round(float(features[52]), 3),
            },
            "latency": {
                "stage2_feature_ms":  round(stage2_ms, 2),
                "stage3_onnx_ms":     round((time.perf_counter() - elapsed) * 1000 - stage2_ms, 2),
                "stage4_llm_sec":     round(elapsed, 2),
            },
            "energy_wh":     0.015,           # Slide 5: 0.015 Wh/incident
            "timestamp":     datetime.datetime.utcnow().isoformat() + "Z",
        })

    # ── Context builder ───────────────────────────────────────────────────────
    def _build_threat_context(self, f, score: float, n_pkts: int) -> str:
        return json.dumps({
            "score":         round(score, 4),
            "threshold":     THREAT_THRESHOLD,
            "pkt_rate":      round(float(f[0]), 2),
            "byte_rate":     round(float(f[1]), 2),
            "unique_dsts":   int(f[20]),
            "unique_ports":  int(f[21]),
            "syn_ratio":     round(float(f[22]), 3),
            "syn_ack_ratio": round(float(f[24]), 3),
            "rst_ratio":     round(float(f[25]), 3),
            "port_entropy":  round(float(f[30]), 3),
            "zero_payload":  round(float(f[52]), 3),
            "window_pkts":   n_pkts,
        })

    # ── Simulation Mode ───────────────────────────────────────────────────────
    def _simulation_mode(self):
        """
        Realistic synthetic events for demo without Npcap/admin rights.
        Includes the PVGCOET C2 beaconing scenario from Slide 8.
        """
        print("[Stage 1] Simulation: events fire every 30s "
              "(install Npcap + run as Admin for live capture)")

        SCENARIOS = [
            # (score, label, features_override, report_override)
            (0.12, "NORMAL",     {"pkt_rate":12.4, "byte_rate":4820, "unique_dsts":4,  "unique_ports":6,   "syn_ratio":0.07, "port_entropy":1.1, "zero_payload":0.02}, None),
            (0.08, "NORMAL",     {"pkt_rate":8.1,  "byte_rate":2100, "unique_dsts":3,  "unique_ports":5,   "syn_ratio":0.05, "port_entropy":0.9, "zero_payload":0.01}, None),
            (0.23, "NORMAL",     {"pkt_rate":18.2, "byte_rate":6400, "unique_dsts":6,  "unique_ports":9,   "syn_ratio":0.09, "port_entropy":1.8, "zero_payload":0.04}, None),
            # ── Slide 8: PVGCOET C2 beaconing scenario ──────────────────────
            (0.94, "THREAT",     {"pkt_rate":0.5,  "byte_rate":60,   "unique_dsts":1,  "unique_ports":1,   "syn_ratio":0.10, "port_entropy":0.1, "zero_payload":0.98},
             "SEVERITY: CRITICAL\n"
             "WHAT HAPPENED: Workstation 192.168.10.45 is exhibiting automated C2 beaconing "
             "to external IP 185.220.101.5 on port 443 with zero-payload periodic pulses every "
             "120 seconds — characteristic of a Cobalt Strike implant in staging mode.\n"
             "ATTACK VECTOR: Command-and-Control (C2) beaconing via encrypted HTTPS channel. "
             "Implant is performing host survey prior to lateral movement.\n"
             "ACTIONS:\n"
             "1. Quarantine MAC address of 192.168.10.45 on Core Switch VLAN 10 immediately.\n"
             "2. Inspect host active processes for unauthorized PowerShell injection or "
             "   scheduled tasks executing from %TEMP%.\n"
             "3. Add destination IP 185.220.101.5 to border gateway drop table and "
             "   notify CERT-In within 6 hours per DPDP Act 2023."),
            # ── SYN flood ───────────────────────────────────────────────────
            (0.91, "THREAT",     {"pkt_rate":847.0,"byte_rate":48000,"unique_dsts":1,  "unique_ports":3,   "syn_ratio":0.95, "port_entropy":0.4, "zero_payload":0.88}, None),
            # ── Port scan ───────────────────────────────────────────────────
            (0.87, "SUSPICIOUS", {"pkt_rate":48.2, "byte_rate":9100, "unique_dsts":22, "unique_ports":420, "syn_ratio":0.41, "port_entropy":6.1, "zero_payload":0.12}, None),
            # ── Elevated SYN ────────────────────────────────────────────────
            (0.76, "SUSPICIOUS", {"pkt_rate":32.0, "byte_rate":3200, "unique_dsts":8,  "unique_ports":12,  "syn_ratio":0.52, "port_entropy":2.9, "zero_payload":0.05}, None),
        ]
        WEIGHTS = [30, 25, 20, 5, 6, 8, 6]    # NORMAL most frequent

        while self._running:
            time.sleep(WINDOW_SEC)
            score, label, feats, report_override = random.choices(SCENARIOS, weights=WEIGHTS, k=1)[0]
            ts = datetime.datetime.utcnow().isoformat() + "Z"

            if score >= THREAT_THRESHOLD:
                if report_override is None:
                    ctx_json = json.dumps({"score": score, **feats})
                    report   = self.analyst.analyze(ctx_json)
                else:
                    report = report_override
                self.on_threat({
                    "label":     label,
                    "score":     score,
                    "threshold": THREAT_THRESHOLD,
                    "report":    report,
                    "features":  feats,
                    "latency":   {"stage2_feature_ms": 12.1, "stage3_onnx_ms": 2.8, "stage4_llm_sec": 9.4},
                    "energy_wh": 0.015,
                    "simulated": True,
                    "timestamp": ts,
                })
            else:
                if self.on_normal:
                    self.on_normal({
                        "label":       label,
                        "score":       score,
                        "threshold":   THREAT_THRESHOLD,
                        "window_pkts": random.randint(200, 800),
                        "simulated":   True,
                        "timestamp":   ts,
                    })
