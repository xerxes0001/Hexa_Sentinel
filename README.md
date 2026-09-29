<p align="center">
  <h1 align="center">🛡️ HexaSentinel</h1>
</p>

<p align="center">
  <strong>Privacy-First, On-Device Security Intelligence for Snapdragon® AI PCs</strong>
</p>

<p align="center">
  <strong>Detect locally. Correlate intelligently. Explain privately.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/type-research%20%2F%20competition%20prototype-7C3AED?style=for-the-badge" alt="Project type">
  <img src="https://img.shields.io/badge/platform-Windows%20ARM64-0078D4?style=for-the-badge&logo=windows" alt="Windows ARM64">
  <img src="https://img.shields.io/badge/architecture-on--device%20AI-16A34A?style=for-the-badge" alt="On-device AI">
  <img src="https://img.shields.io/badge/NPU-Snapdragon%20Hexagon-FF6B00?style=for-the-badge" alt="Snapdragon NPU">
  <img src="https://img.shields.io/badge/privacy-local--first-16A34A?style=for-the-badge" alt="Privacy">
  <img src="https://img.shields.io/badge/license-MIT-111827?style=for-the-badge" alt="License">
</p>

<p align="center">
  <a href="#-overview">Overview</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-features">Features</a> •
  <a href="#-technology-stack">Stack</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-competition-demo">Demo</a> •
  <a href="#-validation-plan">Validation</a> •
  <a href="#-roadmap">Roadmap</a>
</p>

---

## 🧭 Overview

Modern security tooling drowns analysts in disconnected signals: network flows, DNS lookups, process spawns, authentication events. The hard problem was never *detecting an event* — it's figuring out **which events belong together and what they mean**.

**HexaSentinel** turns a Snapdragon-powered AI PC into a small, continuously running security analyst that:

1. Collects **privacy-preserving, local-only** behavioral signals (metadata, never payloads)
2. Flags abnormal behavior with a lightweight, always-on AI model
3. Correlates related anomalies into a single **incident**
4. Hands that incident, not raw telemetry, to an **on-device generative model** for a human-readable explanation

```
Suspicious activity
        ↓
Local signal collection  →  Anomaly detection  →  Correlation  →  On-device explanation
        ↓                                                              ↓
   No cloud upload                                          Human-readable incident report
```

The core idea: **privacy is an architectural property, not a UI claim.** Raw security telemetry never has to leave the device, and the generative model only ever sees a small, structured evidence package, never a live packet stream.

> **Scope note:** HexaSentinel is a research / competition prototype. Model choices, latency, power and accuracy figures in this document are **design targets** that the [validation plan](#-validation-plan) is built to confirm, not published measurements.

---

## 🏗️ Architecture

### Why Snapdragon

A Snapdragon X-series SoC exposes three distinct compute resources, and HexaSentinel routes each workload to the one best suited for it:

```
                 Snapdragon SoC
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
       CPU            GPU            NPU
        │              │              │
  Collection,      Dashboard      AI inference
  orchestration,   rendering &    (behavioral model +
  DB, API           graphs        on-device LLM)
```

| Compute | Workload |
|---|---|
| **CPU** | Event collection, feature extraction, app logic, database ops, API/UI |
| **Hexagon NPU** | Behavioral classification, quantized inference, on-device generative inference |
| **GPU** | Incident graphs, network visualizations, dashboard rendering |

The pitch isn't *"runs on Snapdragon"* — it's **a pipeline designed around heterogeneous Snapdragon compute, with AI workloads specifically targeted at the Hexagon NPU.**

### End-to-end pipeline

```
HP AI PC — Snapdragon X Elite
┌──────────────────────────────────────────────────────────────┐
│  Network interface (Wi-Fi / Ethernet) · Processes · System   │
│         ↓                                                    │
│  Local collectors (metadata only, windowed)                  │
│         ↓                                                    │
│  Privacy sanitizer (hash / pseudonymize identifiers)         │
│         ↓                                                    │
│  Feature extraction (numerical behavioral features)          │
│         ↓                                                    │
│  Behavioral anomaly model  ← Hexagon NPU (QNN EP)            │
│         ↓ SUSPICIOUS / HIGH-RISK                             │
│  Correlation engine → Incident graph                         │
│         ↓                                                    │
│  Evidence construction (structured JSON)                     │
│         ↓                                                    │
│  On-device LLM analyst  ← Qualcomm AI Hub · Hexagon NPU      │
│         ↓                                                    │
│  Local API (127.0.0.1) → Dashboard                           │
└──────────────────────────────────────────────────────────────┘
           ◄── NO INTERNET REQUIRED AT RUNTIME ──►
```

#### 1. Collection

Only metadata and behavioral signals — never full packet payloads.

- **Network:** timestamp, protocol, src/dst, port, flow counts, connection duration, bytes transferred, DNS behavior, connection frequency
- **Process:** name, PID, parent process, start time, lifetime, network-activity relationship, resource behavior
- **System:** new-process events, adapter changes, application events, auth events, config changes

#### 2. Privacy sanitization

Real hostnames and identifiers are hashed/pseudonymized locally *before* anything reaches the AI layer. The model gets enough signal to reason about behavior without seeing private content — it doesn't need to know what a user typed to notice an unusual connection pattern.

#### 3. Feature extraction

Raw events become numerical behavioral features, for example:

```
connection_count         = 37
unique_destinations      = 14
mean_connection_duration = 0.83
dns_request_rate         = 12.4
destination_entropy      = 0.71
connection_burstiness    = 0.82
process_network_ratio    = 0.43
```

The final feature set is determined **experimentally** rather than copied from prior work.

#### 4. Behavioral AI (small, always-on)

A lightweight quantized model, small enough to run continuously on the NPU, scores each window of activity:

```
Behavioral Model
     │
 ┌───┼───┐
 ↓   ↓   ↓
Normal Anomalous High-risk
0.91   0.06      0.03
```

A configurable score threshold decides when a window is escalated. Sub-5 ms per-window inference is the design target.

#### 5. Why not run the LLM on every event?

Because it's wasteful and the wrong tool for the job:

```
10,000 events → small behavioral model → 37 suspicious events
             → correlation → 2 incidents → LLM investigation
```

The generative model is the **investigator**, not the packet filter.

#### 6. Event correlation

Independent anomalies (a process spawn, a new DNS destination, a connection burst) are linked into an incident graph rather than reported as isolated alerts — closer to how a human analyst actually thinks.

#### 7. Evidence construction

A structured object is built for the LLM, never a raw event stream:

```json
{
  "incident_id": "INC-1042",
  "risk": 0.89,
  "process_events": 3,
  "network_events": 7,
  "dns_events": 2,
  "behavioral_anomalies": 4,
  "timeline": ["...", "...", "..."]
}
```

#### 8. On-device AI investigation

The generative model consumes the evidence package and produces a structured explanation: severity, observed behavior, supporting evidence, and recommended next steps. It is explicitly **not** the detector — it's the explanation layer, invoked only once an incident exists.

---

## ✨ Features

- **Local-first by design** — no requirement to send security telemetry to any cloud service
- **Two-tier AI** — a cheap always-on behavioral model filters noise; a larger generative model runs only on the handful of events that become incidents
- **Incident correlation, not alert spam** — related anomalies are graphed into one incident
- **Human-readable explanations** — plain-language summaries and recommended investigation steps, not just a risk score
- **Analyst chat** — ask follow-up questions about an incident, answered by the same on-device model
- **Exportable reports** — incident summary export for hand-off (e.g. CERT-In style format or an ISP/NOC notification draft)
- **Heterogeneous compute story** — CPU for orchestration, NPU for inference, GPU for visualization
- **Chronological incident timeline** and a **security graph view**
- **Offline-capable** — full pipeline operates with no internet connection at runtime
- **Optional voice queries** — hands-free incident questions via an on-device speech model

---

## 🧰 Technology Stack

| Layer | Technology |
|---|---|
| **Platform** | Windows 11 on Snapdragon X Elite / X Plus (ARM64) |
| **Packet & event capture** | Python, Scapy with Npcap; Windows process/system event APIs |
| **Behavioral model** | Quantized ONNX classifier (gradient-boosted trees or small neural model), run through ONNX Runtime with the QNN execution provider |
| **Generative model** | Llama 3.2 3B Instruct (quantized), obtained via Qualcomm AI Hub, targeted at the Hexagon NPU |
| **Speech (optional)** | Whisper-Base-En via Qualcomm AI Hub |
| **Backend** | FastAPI with WebSocket event stream, bound to `127.0.0.1` |
| **Dashboard** | React with D3 for incident graph and timeline |
| **Storage** | In-memory by default; nothing written to disk unless the user exports |

> The exact Qualcomm AI Hub models, runtime path, and supported operators are confirmed against current Qualcomm documentation during validation (see below).

### Planned API surface

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend health and NPU status |
| `POST` | `/api/chat` | Analyst chat backed by the on-device LLM |
| `POST` | `/api/analyze` | On-demand incident analysis |
| `POST` | `/api/reports/export` | Incident report export |
| `WS` | `/ws` | Real-time incident/event stream |

---

## 🔒 Privacy Design Principles

- **No telemetry egress** — analysis and explanation run on-device
- **Metadata only** — payload content is never captured or stored
- **Sanitize before AI** — identifiers are pseudonymized before reaching any model
- **In-memory by default** — nothing persisted unless the user exports
- **Localhost-only API** — the service binds to `127.0.0.1`
- **Internet only for setup** — needed to download models once, not at runtime

---

## 💻 System Requirements

| | Minimum | Recommended |
|---|---|---|
| **Processor** | Snapdragon X Plus AI PC | Snapdragon X Elite AI PC |
| **RAM** | 16 GB | 32 GB |
| **Storage** | 5 GB free | 10 GB free |
| **OS** | Windows 11 22H2 | Windows 11 24H2 |
| **Python** | 3.11+ | 3.12 |
| **Node.js** | 18+ | 20+ LTS |
| **Packet capture** | Administrator rights or Npcap | — |

---

## 🚀 Quick Start

> The pipeline above is the design target, and this section is completed as each component lands (setup, dependencies, ARM64 build steps, model download/conversion).

```bash
git clone <repo-url>
cd hexasentinel

# Backend (planned)
pip install -r backend/requirements.txt
uvicorn backend.api.main:app --host 127.0.0.1 --port 8000

# Dashboard (planned)
npm install
npm run dev
```

---

## 🎥 Competition Demo

**Demo storyline:** a suspicious application is executed → makes an unusual DNS request → opens repeated outbound connections → the behavioral model flags each step → the correlation engine links them into one incident → the on-device model explains it in plain language, all without a single byte of security telemetry leaving the machine.

Dashboard concept:

```
╔══════════════════════════════════════════════════════╗
║                 HEXASENTINEL                          ║
║         ON-DEVICE SECURITY COPILOT                    ║
╠══════════════════════════════════════════════════════╣
║   SYSTEM STATUS             AI ENGINE                 ║
║   ● PROTECTED               ● ONLINE                  ║
║   Network      Normal        NPU      Active          ║
║   Processes    Normal        Model    Ready            ║
║   Incidents    1             Cloud    OFF              ║
╠══════════════════════════════════════════════════════╣
║                 INCIDENT TIMELINE                      ║
║  14:31  Process anomaly                                ║
║  14:31  DNS anomaly                                    ║
║  14:31  Network anomaly                                ║
║  14:31  INCIDENT CREATED                                ║
╠══════════════════════════════════════════════════════╣
║                 AI INVESTIGATION                       ║
║  HIGH RISK                                              ║
║  Unusual relationship between a process and             ║
║  outbound network activity.                             ║
║  [VIEW EVIDENCE]       [RESPONSE OPTIONS]               ║
╚══════════════════════════════════════════════════════╝
```

**What this demonstrates:** not *"we called an LLM from a security app"*, but *"we designed a local security intelligence pipeline around what a Snapdragon AI PC can do."*

---

## 🧪 Validation Plan

1. **Confirm the runtime path** — the exact Qualcomm AI Hub model(s), Windows ARM64 runtime, NPU execution provider, and supported operators, checked against current Qualcomm documentation.
2. **Establish every performance number experimentally**, including:
   - **AI quality:** precision, recall, F1, false-positive rate, detection rate
   - **NPU performance:** inference latency, throughput, NPU/CPU utilization, memory footprint
   - **System performance:** event processing rate, dashboard latency, startup time, battery/power impact per incident
   - **Privacy claim:** measured count of external network connections initiated by HexaSentinel itself (target: 0 application-telemetry destinations), separated from normal OS/network traffic

A dashboard that says "100% private" is a claim. A benchmark showing zero outbound telemetry connections during a monitored session is evidence, and that is what ships.

---

## 🗺️ Roadmap

- [ ] Implement local event collectors (network / process / system)
- [ ] Build and validate the privacy sanitization layer
- [ ] Finalize feature set via experimentation
- [ ] Train/select the behavioral anomaly model; benchmark on NPU vs CPU
- [ ] Implement correlation engine and incident graph construction
- [ ] Select and validate the on-device generative model and Qualcomm runtime path
- [ ] Build the dashboard (timeline + security graph)
- [ ] Add report export and optional voice queries
- [ ] Run full benchmark suite (AI quality, NPU perf, system perf, privacy)
- [ ] Prepare competition demo scenario and recording

---

## 👥 Candidate Information

| | |
|---|---|
| **Name** | Indraneel Kiran Rananaware |
| **Institution** | Department of Computer Engineering (B.Tech), Sinhgad Institute of Technology, Lonavala, Savitribai Phule Pune University |
| **Contact** | [indraneeelrananaware4190@gmail.com](mailto:indraneeelrananaware4190@gmail.com) |
| **Competition** | Qualcomm Snapdragon AI Lab Build & Present Challenge 2026 |

---

<p align="center">
  <sub>Built for a Qualcomm Snapdragon AI PC challenge · Local detection, local reasoning, local explanation.</sub>
</p>
