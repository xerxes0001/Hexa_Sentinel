"""
HexaSentinel — Feature Extractor
Converts a raw 30-second packet window into 80 numerical features
compatible with the ONNX anomaly classifier.
"""

import math
from collections import Counter
import numpy as np


class FeatureExtractor:
    """Stateless; call extract(packets) once per window."""

    def extract(self, packets: list) -> np.ndarray:
        if not packets:
            return np.zeros(80, dtype=np.float32)

        sizes    = [p["size"]        for p in packets]
        payloads = [p["payload_len"] for p in packets]
        protos   = [p["proto"]       for p in packets]
        dsts     = [p["dst"]         for p in packets]
        dports   = [p["dport"]       for p in packets]
        flags    = [p["flags"]       for p in packets]
        ts       = [p["ts"]          for p in packets]

        n   = len(packets)
        dur = max(ts[-1] - ts[0], 1e-6)

        # ── Features 0-9: Flow statistics ───────────────────────────────────
        feats = [
            n / dur,                                      # 0  packets/s
            sum(sizes) / dur,                             # 1  bytes/s
            float(np.mean(sizes)),                        # 2  mean pkt size
            float(np.std(sizes)),                         # 3  std pkt size
            float(min(sizes)),                            # 4  min pkt size
            float(max(sizes)),                            # 5  max pkt size
            float(np.percentile(sizes, 25)),              # 6  Q1 pkt size
            float(np.percentile(sizes, 75)),              # 7  Q3 pkt size
            float(np.median(sizes)),                      # 8  median pkt size
            sum(1 for s in sizes if s == 0) / n,          # 9  zero-size ratio
        ]

        # ── Features 10-19: Protocol distribution ───────────────────────────
        proto_c = Counter(protos)
        feats += [
            proto_c.get(6,  0) / n,                       # 10 TCP ratio
            proto_c.get(17, 0) / n,                       # 11 UDP ratio
            proto_c.get(1,  0) / n,                       # 12 ICMP ratio
            len(proto_c) / max(n, 1),                     # 13 protocol diversity
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0,                # 14-19 reserved
        ]

        # ── Features 20-29: Connection behaviour ────────────────────────────
        syn_count = sum(1 for f in flags if "S" in str(f))
        ack_count = sum(1 for f in flags if "A" in str(f))
        rst_count = sum(1 for f in flags if "R" in str(f))
        fin_count = sum(1 for f in flags if "F" in str(f))
        feats += [
            float(len(set(dsts))),                        # 20 unique dst IPs
            float(len(set(dports))),                      # 21 unique dst ports
            syn_count / max(n, 1),                        # 22 SYN ratio
            ack_count / max(n, 1),                        # 23 ACK ratio
            syn_count / max(ack_count, 1),                # 24 SYN/ACK ratio (SYN flood indicator)
            rst_count / max(n, 1),                        # 25 RST ratio
            fin_count / max(n, 1),                        # 26 FIN ratio
            0.0, 0.0, 0.0,                               # 27-29 reserved
        ]

        # ── Features 30-39: Port entropy ────────────────────────────────────
        port_c = Counter(dports)
        total_ports = sum(port_c.values()) or 1
        entropy = -sum(
            (v / total_ports) * math.log2(v / total_ports)
            for v in port_c.values() if v > 0
        )
        well_known = sum(1 for p in dports if p < 1024) / max(n, 1)
        ephemeral  = sum(1 for p in dports if p >= 49152) / max(n, 1)
        feats += [
            entropy,                                      # 30 destination port entropy
            well_known,                                   # 31 well-known port ratio (<1024)
            ephemeral,                                    # 32 ephemeral port ratio (>=49152)
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,          # 33-39 reserved
        ]

        # ── Features 40-49: Inter-arrival time (IAT) statistics ─────────────
        iats = np.diff(ts).tolist() if len(ts) > 1 else [0.0]
        feats += [
            float(np.mean(iats)),                         # 40 mean IAT
            float(np.std(iats)),                          # 41 std IAT
            float(np.min(iats)),                          # 42 min IAT
            float(np.max(iats)),                          # 43 max IAT
            float(np.percentile(iats, 10)),               # 44 10th-percentile IAT
            float(np.percentile(iats, 90)),               # 45 90th-percentile IAT
            0.0, 0.0, 0.0, 0.0,                          # 46-49 reserved
        ]

        # ── Features 50-59: Payload statistics ──────────────────────────────
        feats += [
            float(np.mean(payloads)),                     # 50 mean payload size
            float(np.std(payloads)),                      # 51 std payload size
            sum(1 for p in payloads if p == 0) / n,       # 52 zero-payload ratio
            sum(1 for p in payloads if p < 64) / n,       # 53 small-packet ratio
            sum(1 for p in payloads if p > 1400) / n,     # 54 large-packet ratio
            0.0, 0.0, 0.0, 0.0, 0.0,                    # 55-59 reserved
        ]

        # ── Features 60-79: Destination IP diversity ─────────────────────────
        unique_dsts = len(set(dsts))
        dst_per_pkt = unique_dsts / max(n, 1)
        feats += [
            float(unique_dsts),                           # 60 unique destination IPs
            dst_per_pkt,                                  # 61 unique dsts per packet (scan indicator)
        ]
        feats += [0.0] * (80 - len(feats))               # 62-79 padding

        return np.array(feats[:80], dtype=np.float32)
