"""
HexaSentinel — ONNX GBDT Anomaly Detector
========================================
Slide 5 spec: "Output: Score S ∈ [0.0, 1.0]"
  Normal  branch: S < 0.85  → purge buffer, no LLM wake
  Threat  branch: S ≥ 0.85  → assemble threat context, signal LLM queue
  Latency target: < 3 ms on Hexagon NPU via QNN Execution Provider
  Power draw:     ~1 W continuous (NPU burst mode)
"""

from pathlib import Path
import numpy as np

THREAT_THRESHOLD = 0.85          # slide 5: "Score ≥ 0.85 → Threat Branch"
MODEL_PATH = Path(__file__).parent.parent / "models" / "anomaly_classifier.onnx"


class AnomalyDetector:
    """
    Wraps the ONNX GBDT classifier.
    classify() returns a single float score S ∈ [0.0, 1.0].
    Callers compare against THREAT_THRESHOLD to branch.
    """

    def __init__(self):
        self.session     = None
        self.using_npu   = False
        self._load()

    # ── Model loading ─────────────────────────────────────────────────────────
    def _load(self):
        if not MODEL_PATH.exists():
            print(
                "[AnomalyDetector] anomaly_classifier.onnx not found.\n"
                "  Run: python scripts/generate_synthetic_model.py  (30 seconds)\n"
                "  OR:  python scripts/train_classifier.py          (full CICIDS-2018)"
            )
            return
        try:
            import onnxruntime as ort
            # ── Qualcomm Hexagon NPU — QNN Execution Provider ──────────────
            providers = [
                ("QNNExecutionProvider", {
                    "backend_path":          "QnnHtp.dll",
                    "htp_performance_mode":  "burst",       # low-latency
                    "htp_arch":              "73",           # Snapdragon X Elite
                    "enable_htp_fp16_precision": "1",
                    "enable_htp_weight_sharing": "1",
                }),
                "CPUExecutionProvider",                      # x86/x64 fallback
            ]
            opts = ort.SessionOptions()
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            opts.intra_op_num_threads     = 1               # NPU handles threading
            self.session   = ort.InferenceSession(str(MODEL_PATH),
                                                  sess_options=opts,
                                                  providers=providers)
            active         = self.session.get_providers()[0]
            self.using_npu = "QNN" in active
            print(f"[AnomalyDetector] Loaded — provider: {active} | "
                  f"NPU={'YES (<3ms)' if self.using_npu else 'NO (CPU fallback)'}")
        except Exception as exc:
            print(f"[AnomalyDetector] ONNX load failed: {exc} — heuristic fallback active")

    # ── Public API ────────────────────────────────────────────────────────────
    def score(self, features: np.ndarray) -> float:
        """
        Return threat probability S ∈ [0.0, 1.0].
        Slide 5: Normal < 0.85, Threat ≥ 0.85.
        """
        if self.session is not None:
            try:
                inp = features.reshape(1, -1).astype(np.float32)
                out = self.session.run(None, {"features": inp})
                # out[1] = probability array [[P(normal), P(threat)]]
                # We want P(threat) = probability of being anomalous
                probs = out[1][0]
                # If binary: probs = [P(0), P(1)] → return P(1)
                # If multi-class: probs = [P(0), P(1), P(2)] → return max(P(1)+P(2))
                if len(probs) == 2:
                    return float(probs[1])
                elif len(probs) >= 3:
                    return float(probs[1] + probs[2])   # SUSPICIOUS + THREAT mass
                return float(np.max(probs[1:]))
            except Exception as exc:
                print(f"[AnomalyDetector] Inference error: {exc}")

        return self._heuristic_score(features)

    def is_threat(self, features: np.ndarray) -> tuple[float, bool]:
        """Returns (score, is_above_threshold)."""
        s = self.score(features)
        return s, s >= THREAT_THRESHOLD

    # ── Heuristic fallback ────────────────────────────────────────────────────
    # Used when no ONNX model is present. Derived from CICIDS-2018 thresholds.
    def _heuristic_score(self, f: np.ndarray) -> float:
        score = 0.0
        pkt_rate    = f[0]
        syn_ratio   = f[22]
        syn_ack     = f[24]   # SYN-to-ACK ratio — SYN flood indicator
        port_entr   = f[30]   # Shannon port entropy index
        unique_dsts = f[20]
        unique_ports= f[21]
        rst_ratio   = f[25]
        zero_pay    = f[52]

        # --- SYN flood (slide 5: DDoS scenario)
        if syn_ratio > 0.8 and pkt_rate > 500:
            score += 0.55
        elif syn_ratio > 0.5:
            score += 0.30
        elif syn_ratio > 0.3:
            score += 0.15

        # --- Port scan (high entropy = many distinct ports)
        if port_entr > 5.5:
            score += 0.30
        elif port_entr > 3.8:
            score += 0.18
        elif port_entr > 2.5:
            score += 0.08

        # --- Destination spread (C2 beacon or worm)
        if unique_dsts > 80:
            score += 0.20
        elif unique_dsts > 40:
            score += 0.10

        # --- RST flood
        if rst_ratio > 0.6:
            score += 0.25
        elif rst_ratio > 0.3:
            score += 0.10

        # --- Beaconing: periodic zero-payload pulses (PVGCOET case study, slide 8)
        if zero_pay > 0.85:
            score += 0.20
        elif zero_pay > 0.60:
            score += 0.08

        # --- SYN/ACK asymmetry
        if syn_ack > 10.0:
            score += 0.15
        elif syn_ack > 4.0:
            score += 0.07

        return min(float(score), 1.0)
