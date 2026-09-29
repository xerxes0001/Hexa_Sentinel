"""
HexaSentinel — Fast Synthetic ONNX Model Generator
=================================================
Generates a valid anomaly_classifier.onnx in ~30 seconds using
purely synthetic training data. No internet download required.

Use this for:
  • Demo preparation — judges won't wait for CICIDS-2018 download
  • CI / CD pipelines
  • Development on non-Snapdragon machines

For the highest F1 accuracy, use train_classifier.py with real CICIDS-2018 data.

Usage:
  pip install scikit-learn skl2onnx onnxruntime numpy
  python scripts/generate_synthetic_model.py
"""

import json, time, sys
from pathlib import Path

ROOT       = Path(__file__).parent.parent
MODEL_DIR  = ROOT / "backend" / "models"
MODEL_PATH = MODEL_DIR / "anomaly_classifier.onnx"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

def main():
    print("=" * 56)
    print("  HexaSentinel — Synthetic ONNX Model Generator")
    print("  ~30 seconds | No download required")
    print("=" * 56)
    print()

    # ── Dependency check ─────────────────────────────────────────────────────
    missing = []
    for pkg in ["sklearn", "skl2onnx", "onnxruntime", "numpy"]:
        try: __import__(pkg)
        except ImportError: missing.append(pkg.replace("sklearn","scikit-learn"))
    if missing:
        print(f"Install first: pip install {' '.join(missing)}")
        sys.exit(1)

    import numpy as np
    from sklearn.ensemble          import GradientBoostingClassifier
    from sklearn.pipeline          import Pipeline
    from sklearn.preprocessing     import StandardScaler
    from sklearn.model_selection   import train_test_split
    from sklearn.metrics           import f1_score
    from skl2onnx                  import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType
    import onnxruntime as ort

    N_FEATURES = 80
    N_SAMPLES  = 40_000
    RNG        = np.random.default_rng(2026)

    # ── Generate realistic synthetic traffic ─────────────────────────────────
    print("[1/4] Generating synthetic traffic data...")
    X = np.zeros((N_SAMPLES, N_FEATURES), dtype=np.float32)
    y = np.zeros(N_SAMPLES, dtype=np.int64)

    # NORMAL — 60%
    n0 = int(N_SAMPLES * 0.60)
    X[:n0, 0]  = RNG.normal(15, 6, n0).clip(0.5, 80)     # pkt/s
    X[:n0, 1]  = RNG.normal(5000, 1800, n0).clip(100, 25000)
    X[:n0, 2]  = RNG.normal(700, 200, n0).clip(64, 1500)
    X[:n0, 22] = RNG.beta(1, 12, n0)                      # low SYN
    X[:n0, 30] = RNG.uniform(0.5, 2.2, n0)                # low port entropy
    X[:n0, 20] = RNG.integers(1, 8, n0)
    X[:n0, 52] = RNG.beta(1, 15, n0)                      # low zero-payload
    y[:n0]     = 0

    # SUSPICIOUS — 25% (port scans, elevated SYN)
    n1 = int(N_SAMPLES * 0.25); s1 = n0
    X[s1:s1+n1, 0]  = RNG.normal(55, 18, n1).clip(10, 250)
    X[s1:s1+n1, 22] = RNG.beta(3, 4, n1)
    X[s1:s1+n1, 30] = RNG.uniform(3.2, 5.5, n1)
    X[s1:s1+n1, 20] = RNG.integers(15, 80, n1)
    X[s1:s1+n1, 21] = RNG.integers(80, 500, n1)
    y[s1:s1+n1]     = 1

    # THREAT — 15% (SYN flood, C2 beaconing, DDoS)
    n2 = N_SAMPLES - n0 - n1; s2 = n0 + n1
    # SYN flood sub-group
    nh = n2 // 2
    X[s2:s2+nh, 0]  = RNG.normal(900, 200, nh).clip(300, 5000)
    X[s2:s2+nh, 22] = RNG.beta(9, 1, nh)                  # very high SYN
    X[s2:s2+nh, 24] = RNG.normal(18, 5, nh).clip(5, 60)
    X[s2:s2+nh, 52] = RNG.beta(8, 2, nh)                  # high zero-payload
    # C2 beaconing sub-group (PVGCOET scenario, slide 8)
    X[s2+nh:, 0]    = RNG.normal(0.5, 0.1, n2-nh).clip(0.1, 2)  # very low rate
    X[s2+nh:, 52]   = RNG.beta(15, 1, n2-nh)              # near-100% zero payload
    X[s2+nh:, 30]   = RNG.uniform(0.05, 0.3, n2-nh)       # single-port (low entropy)
    X[s2+nh:, 20]   = np.ones(n2-nh)                      # single destination
    y[s2:]          = 2

    # Shuffle
    idx = RNG.permutation(N_SAMPLES)
    X, y = X[idx], y[idx]
    # Convert to binary: 0 = normal, 1 = threat (≥ suspicious)
    y_bin = (y >= 1).astype(np.int64)

    X_tr, X_te, y_tr, y_te = train_test_split(X, y_bin, test_size=0.2, random_state=42, stratify=y_bin)
    print(f"    Samples: {N_SAMPLES:,}  |  Normal: {(y_bin==0).sum():,}  |  Threat: {(y_bin==1).sum():,}")

    # ── Train GBDT ───────────────────────────────────────────────────────────
    print("[2/4] Training Gradient Boosted Decision Tree (GBDT)...")
    t0  = time.time()
    clf = Pipeline([
        ("scaler", StandardScaler()),
        ("gbdt",   GradientBoostingClassifier(
            n_estimators=150, max_depth=5, learning_rate=0.12,
            subsample=0.8, random_state=42,
        )),
    ])
    clf.fit(X_tr, y_tr)
    elapsed = time.time() - t0
    y_pred  = clf.predict(X_te)
    f1      = f1_score(y_te, y_pred, average="binary")
    print(f"    Done in {elapsed:.1f}s  |  F1={f1:.4f}")

    # ── Export to ONNX ───────────────────────────────────────────────────────
    print("[3/4] Exporting to ONNX (target opset 17)...")
    onnx_model = convert_sklearn(
        clf,
        name="HexaSentinelGBDTClassifier",
        initial_types=[("features", FloatTensorType([None, N_FEATURES]))],
        options={"zipmap": False},
        target_opset=17,
    )
    MODEL_PATH.write_bytes(onnx_model.SerializeToString())
    size_kb = MODEL_PATH.stat().st_size / 1024
    print(f"    Saved → {MODEL_PATH}  ({size_kb:.0f} KB)")

    # ── Verify ───────────────────────────────────────────────────────────────
    print("[4/4] Verifying ONNX model...")
    sess   = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    dummy  = np.zeros((1, N_FEATURES), dtype=np.float32)
    out    = sess.run(None, {"features": dummy})
    score  = float(out[1][0][1])        # P(threat)
    print(f"    Dummy inference → threat_score={score:.4f} (expected ≈ 0.05)")

    # Write report
    report = {"f1": round(f1,4), "samples": N_SAMPLES, "features": N_FEATURES,
              "model": "GBDT (synthetic)", "onnx_kb": round(size_kb,1)}
    (MODEL_DIR / "classifier_report.txt").write_text(json.dumps(report, indent=2))

    print()
    print("=" * 56)
    print(f"  ✓ Model ready — F1={f1:.4f}")
    print(f"  ✓ {MODEL_PATH}")
    print(f"  The HexaSentinel backend loads this automatically.")
    print("=" * 56)

if __name__ == "__main__":
    main()
