"""
HexaSentinel — ONNX Anomaly Classifier Training Script
═════════════════════════════════════════════════════
Trains a gradient-boosted classifier on the CICIDS-2018 intrusion
detection dataset and exports it to ONNX format for deployment on
the Qualcomm Hexagon NPU via the QNN Execution Provider.

Usage
─────
  # Install training dependencies first:
  pip install -r scripts/train_requirements.txt

  # Run (downloads ~150 MB CICIDS-2018 Friday subset automatically):
  python scripts/train_classifier.py

  # Force synthetic data (no download, good for CI / offline dev):
  python scripts/train_classifier.py --synthetic

Output
──────
  backend/models/anomaly_classifier.onnx   ← deploy this on the NPU
  backend/models/classifier_report.txt     ← accuracy / F1 per class

References
──────────
  CICIDS-2018: https://www.unb.ca/cic/datasets/ids-2018.html
  skl2onnx:   https://onnx.ai/sklearn-onnx/
"""

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent
MODEL_DIR  = ROOT / "backend" / "models"
MODEL_PATH = MODEL_DIR / "anomaly_classifier.onnx"
REPORT_PATH= MODEL_DIR / "classifier_report.txt"
RAW_DIR    = ROOT / "scripts" / ".cicids_cache"

MODEL_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR.mkdir(parents=True, exist_ok=True)

# ── CICIDS-2018 Friday CSV (DoS / DDoS / Botnet / Infiltration traffic) ───────
# Hosted by UNB — ~150 MB. Only the Friday split is used for speed.
CICIDS_URL = (
    "https://iscxdownloads.cs.unb.ca/iscxdownloads/CIC-IDS-2018/"
    "Thursday-15-02-2018_TrafficForML_CICFlowMeter.csv"
)
CICIDS_LOCAL = RAW_DIR / "cicids2018_thursday.csv"

# Column mapping from CICFlowMeter output → our 80 feature vector
# Each entry: (cicids_col_name, our_feature_index)
FEATURE_MAP = {
    # Flow stats
    " Flow Duration":          None,   # not directly used
    " Total Fwd Packets":       0,     # → pkt_rate proxy
    " Total Backward Packets":  1,     # → byte_rate proxy
    " Total Length of Fwd Packets": 2, # mean pkt size proxy
    " Flow Bytes/s":            1,
    " Flow Packets/s":          0,
    # Protocol
    " Protocol":               10,
    # Flags
    " SYN Flag Count":         22,
    " ACK Flag Count":         23,
    " RST Flag Count":         25,
    " FIN Flag Count":         26,
    # IAT
    " Flow IAT Mean":          40,
    " Flow IAT Std":           41,
    " Flow IAT Min":           42,
    " Flow IAT Max":           43,
    # Payload
    " Average Packet Size":     2,
    " Avg Fwd Segment Size":   50,
    # Port
    " Destination Port":       21,
}

LABEL_MAP = {
    "BENIGN":          0,   # NORMAL
    "DoS Hulk":        2,   # THREAT
    "DDoS":            2,   # THREAT
    "PortScan":        1,   # SUSPICIOUS
    "Bot":             2,   # THREAT
    "DoS GoldenEye":   2,   # THREAT
    "FTP-Patator":     1,   # SUSPICIOUS
    "SSH-Patator":     1,   # SUSPICIOUS
    "DoS slowloris":   2,   # THREAT
    "DoS Slowhttptest":2,   # THREAT
    "Heartbleed":      2,   # THREAT
    "Web Attack":      1,   # SUSPICIOUS
    "Infiltration":    2,   # THREAT
}


# ── Download helper ────────────────────────────────────────────────────────────
def download_cicids():
    if CICIDS_LOCAL.exists():
        print(f"[Data] Using cached CICIDS-2018: {CICIDS_LOCAL}")
        return True
    print(f"[Data] Downloading CICIDS-2018 Thursday split (~150 MB)…")
    print(f"       URL: {CICIDS_URL}")
    try:
        def progress(block_count, block_size, total):
            pct = min(block_count * block_size / total * 100, 100)
            print(f"\r       {pct:.1f}%", end="", flush=True)
        urllib.request.urlretrieve(CICIDS_URL, CICIDS_LOCAL, reporthook=progress)
        print()
        return True
    except Exception as exc:
        print(f"\n[Data] Download failed: {exc}")
        return False


# ── Build feature matrix from CICIDS CSV ──────────────────────────────────────
def load_cicids(max_rows: int = 200_000):
    import pandas as pd

    print(f"[Data] Loading CICIDS-2018 (max {max_rows:,} rows)…")
    df = pd.read_csv(
        CICIDS_LOCAL,
        nrows=max_rows,
        low_memory=False,
        on_bad_lines="skip",
    )
    df.columns = df.columns.str.strip()
    print(f"[Data] Loaded {len(df):,} rows, {len(df.columns)} columns")

    # Build 80-feature matrix aligned with feature_extractor.py
    X = np.zeros((len(df), 80), dtype=np.float32)

    col_map = {c.strip(): c for c in df.columns}

    def safe_col(name):
        return col_map.get(name.strip(), col_map.get(name, None))

    for cicids_col, feat_idx in FEATURE_MAP.items():
        if feat_idx is None:
            continue
        col = safe_col(cicids_col)
        if col and col in df.columns:
            vals = pd.to_numeric(df[col], errors="coerce").fillna(0).values
            X[:, feat_idx] = vals.astype(np.float32)

    # Port entropy approximation from destination port
    dp_col = safe_col("Destination Port")
    if dp_col and dp_col in df.columns:
        ports = pd.to_numeric(df[dp_col], errors="coerce").fillna(0).astype(int)
        X[:, 30] = (ports % 1024).astype(np.float32) / 1024.0  # normalised entropy proxy

    # Labels
    label_col = safe_col("Label")
    if label_col is None:
        label_col = "Label"
    raw_labels = df[label_col].astype(str).str.strip() if label_col in df.columns else ["BENIGN"] * len(df)
    y = np.array([LABEL_MAP.get(l, 0) for l in raw_labels], dtype=np.int64)

    # Clean infinities / NaNs
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    X = np.clip(X, -1e6, 1e6)

    print(f"[Data] Class distribution: NORMAL={np.sum(y==0):,}  SUSPICIOUS={np.sum(y==1):,}  THREAT={np.sum(y==2):,}")
    return X, y


# ── Generate synthetic data (offline / CI fallback) ───────────────────────────
def make_synthetic(n: int = 60_000, seed: int = 42):
    rng = np.random.default_rng(seed)
    X   = np.zeros((n, 80), dtype=np.float32)
    y   = np.zeros(n, dtype=np.int64)

    # ── NORMAL (60%) ──
    n0 = int(n * 0.60)
    X[:n0, 0]  = rng.normal(15, 5, n0).clip(1, 100)       # pkt/s
    X[:n0, 1]  = rng.normal(5000, 1500, n0).clip(100, 30000)  # byte/s
    X[:n0, 2]  = rng.normal(800, 200, n0).clip(64, 1500)   # mean pkt size
    X[:n0, 22] = rng.beta(1, 10, n0)                       # SYN ratio low
    X[:n0, 30] = rng.uniform(0.5, 2.5, n0)                 # port entropy low
    X[:n0, 20] = rng.integers(1, 8, n0).astype(np.float32) # unique dsts
    y[:n0]     = 0

    # ── SUSPICIOUS (25%) — port scan / brute force ──
    n1 = int(n * 0.25)
    s  = n0
    X[s:s+n1, 0]  = rng.normal(60, 20, n1).clip(10, 300)
    X[s:s+n1, 22] = rng.beta(4, 4, n1)
    X[s:s+n1, 30] = rng.uniform(3.0, 5.0, n1)             # higher entropy
    X[s:s+n1, 20] = rng.integers(10, 80, n1).astype(np.float32)
    X[s:s+n1, 21] = rng.integers(50, 400, n1).astype(np.float32)
    y[s:s+n1]     = 1

    # ── THREAT (15%) — DDoS / SYN flood ──
    n2 = n - n0 - n1
    s  = n0 + n1
    X[s:, 0]  = rng.normal(900, 200, n2).clip(200, 5000)   # high pkt rate
    X[s:, 22] = rng.beta(9, 1, n2)                         # very high SYN
    X[s:, 24] = rng.normal(15, 4, n2).clip(5, 50)          # SYN/ACK ratio
    X[s:, 30] = rng.uniform(0.1, 1.5, n2)                  # low entropy (one target)
    X[s:, 20] = rng.integers(1, 5, n2).astype(np.float32)
    y[s:]     = 2

    idx = rng.permutation(n)
    return X[idx], y[idx]


# ── Train + export ─────────────────────────────────────────────────────────────
def train_and_export(X, y, use_xgb: bool = True):
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing   import StandardScaler
    from sklearn.pipeline        import Pipeline
    from sklearn.metrics         import classification_report, f1_score

    # Convert to binary: 0=normal, 1=threat(suspicious+threat)
    y_bin = (y >= 1).astype(np.int64)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_bin, test_size=0.20, random_state=42, stratify=y_bin
    )
    print(f"[Train] Train={len(X_train):,}  Test={len(X_test):,}")

    # ── Choose estimator ──
    if use_xgb:
        try:
            from xgboost import XGBClassifier
            clf = XGBClassifier(
                n_estimators=300,
                max_depth=6,
                learning_rate=0.1,
                subsample=0.8,
                colsample_bytree=0.8,
                use_label_encoder=False,
                eval_metric="mlogloss",
                random_state=42,
                n_jobs=-1,
            )
            print("[Train] Using XGBoost")
        except ImportError:
            use_xgb = False
            print("[Train] XGBoost not installed — falling back to sklearn GBC")

    if not use_xgb:
        from sklearn.ensemble import GradientBoostingClassifier
        clf = GradientBoostingClassifier(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.1,
            subsample=0.8,
            random_state=42,
        )
        print("[Train] Using sklearn GradientBoostingClassifier")

    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf",    clf),
    ])

    print("[Train] Fitting…")
    t0 = time.time()
    pipe.fit(X_train, y_train)
    print(f"[Train] Done in {time.time()-t0:.1f}s")

    y_pred = pipe.predict(X_test)
    report = classification_report(y_test, y_pred, target_names=["NORMAL","SUSPICIOUS","THREAT"])
    f1     = f1_score(y_test, y_pred, average="weighted")
    print(f"\n[Eval] Weighted F1 = {f1:.4f}")
    print(report)

    # ── Export to ONNX ──
    print(f"\n[ONNX] Exporting to {MODEL_PATH}…")
    from skl2onnx              import convert_sklearn, update_registered_converter
    from skl2onnx.common.data_types import FloatTensorType

    initial_type = [("features", FloatTensorType([None, 80]))]
    onnx_model   = convert_sklearn(
        pipe,
        name="HexaSentinelAnomalyClassifier",
        initial_types=initial_type,
        options={"zipmap": False, "nocl": [True, False]},  # binary prob output
        target_opset=17,
    )

    with open(MODEL_PATH, "wb") as f:
        f.write(onnx_model.SerializeToString())

    size_kb = MODEL_PATH.stat().st_size / 1024
    print(f"[ONNX] Saved → {MODEL_PATH}  ({size_kb:.1f} KB)")

    # ── Write report ──
    meta = {
        "weighted_f1": round(f1, 4),
        "model":       "XGBoost" if use_xgb else "GradientBoostingClassifier",
        "features":    80,
        "classes":     ["NORMAL","SUSPICIOUS","THREAT"],
        "dataset":     "CICIDS-2018 (Thursday split)" if CICIDS_LOCAL.exists() else "Synthetic",
        "onnx_opset":  17,
        "onnx_size_kb": round(size_kb, 1),
    }
    REPORT_PATH.write_text(json.dumps(meta, indent=2) + "\n\n" + report)
    print(f"[ONNX] Report → {REPORT_PATH}")
    return f1


# ── Verify the exported model runs ────────────────────────────────────────────
def verify_onnx():
    import onnxruntime as ort
    print("\n[Verify] Loading ONNX model with CPUExecutionProvider…")
    sess = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    dummy = np.zeros((1, 80), dtype=np.float32)
    out   = sess.run(None, {"features": dummy})
    labels= ["NORMAL","SUSPICIOUS","THREAT"]
    print(f"[Verify] Dummy inference → class={labels[out[0][0]]}  probs={np.round(out[1][0],3)}")
    print("[Verify] ✓ ONNX model is valid and runnable")


# ── CLI ────────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="Train HexaSentinel ONNX anomaly classifier")
    ap.add_argument("--synthetic", action="store_true", help="Use synthetic data (no download)")
    ap.add_argument("--rows",      type=int, default=200_000, help="Max CICIDS rows to load")
    ap.add_argument("--no-xgb",   action="store_true", help="Force sklearn GBC (skip XGBoost)")
    args = ap.parse_args()

    print("=" * 64)
    print("  HexaSentinel — ONNX Anomaly Classifier Training")
    print("  Qualcomm Snapdragon AI Lab Challenge 2026")
    print("=" * 64)
    print()

    if args.synthetic:
        print("[Data] --synthetic flag set — using generated data")
        X, y = make_synthetic()
    else:
        ok = download_cicids()
        if ok:
            try:
                X, y = load_cicids(max_rows=args.rows)
            except Exception as exc:
                print(f"[Data] CSV parse error: {exc} — falling back to synthetic data")
                X, y = make_synthetic()
        else:
            print("[Data] Falling back to synthetic training data")
            X, y = make_synthetic()

    f1 = train_and_export(X, y, use_xgb=not args.no_xgb)
    verify_onnx()

    print()
    print("=" * 64)
    if f1 >= 0.90:
        print(f"  ✓ Training complete — F1={f1:.4f}")
        print(f"  Model saved to: backend/models/anomaly_classifier.onnx")
        print(f"  The HexaSentinel backend will load this on next start.")
    else:
        print(f"  ⚠ F1={f1:.4f} is below 0.90 — consider more data or tuning")
    print("=" * 64)


if __name__ == "__main__":
    main()
