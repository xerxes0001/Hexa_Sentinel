# HexaSentinel — Competition Submission Information
**Qualcomm Snapdragon AI Lab Build & Present Challenge 2026**

---

## Intake Form (copy-paste ready)

**Participant Name:** Aniket Anand Khot  
**Email:** khotaniket3006@gmail.com  
**Institution:** PVG's College of Engineering and Technology (PVGCOET), Pune  
**Programme:** B.Tech Electronics & Telecommunication Engineering (SY)  
**University:** Savitribai Phule Pune University  

---

**Project Name:** HexaSentinel — Autonomous On-Device Network Threat Intelligence Analyst

**One-line description (< 160 chars):**
> On-device cybersecurity for HP AI PCs: Llama 3.2 3B + ONNX classifier on Hexagon NPU — zero cloud, zero egress, 0.015 Wh/incident.

**Full description (< 500 chars):**
> HexaSentinel is a privacy-first network threat intelligence system running 100% on the Snapdragon X Elite Hexagon NPU. It monitors live traffic via Scapy, classifies packet windows using an ONNX GBDT classifier (Score S ∈ [0.0, 1.0], < 3ms), and generates plain-English threat reports using Llama 3.2 3B Instruct from Qualcomm AI Hub (8-12s). Zero cloud dependency. DPDP Act 2023 compliant. Evolved from the author's SHYEN BGP intelligence dashboard.

---

**AI Models from Qualcomm AI Hub:**
1. **Llama-3.2-3B-Instruct-Quantized** (INT4 QNN Runtime) — threat report generation, admin chat, CERT-In reports
2. **Whisper-Base-En** (QNN Runtime) — voice query interface ("Show threats last 2 hours")

**Open-Source AI Models Added:**
- **ONNX GBDT Classifier** — trained on CICIDS-2018 dataset, outputs threat score S ∈ [0.0, 1.0], runs on Hexagon NPU via QNN Execution Provider, < 3ms latency

---

**Prior Project This Is Derived From:** SHYEN / RouteGuard AI  
**GitHub (original):** github.com/aniket-khot/shyen  

**Significant modifications made:**
1. Groq cloud API (llama-3.1-70b) → Llama 3.2 3B Instruct from Qualcomm AI Hub (Hexagon NPU)
2. Remote RIPE BGP monitoring only → live local packet capture via Scapy/WinPcap
3. No anomaly detection → ONNX GBDT classifier on Hexagon NPU (< 3ms, CICIDS-2018)
4. Supabase cloud database → fully in-memory, no data persistence
5. Cloud-dependent UI → React SOC dashboard with local FastAPI WebSocket, D3 Network Graph, Voice Query

---

**Target Hardware:**
- HP OmniBook X 14 — Snapdragon X Elite, 16 GB RAM, Windows 11 24H2
- HP EliteBook Ultra G1q — Snapdragon X Elite, 32 GB RAM, Windows 11 24H2

**GitHub Repository:** https://github.com/aniket-khot/hexasentinel  
**Demo Video:** [Add YouTube/Loom link after recording]  

---

## Evaluation Criteria — Self Assessment

| Criterion | Evidence |
|---|---|
| **Technical Implementation** | ONNX QNN EP < 3ms · Llama 3.2 3B INT4 QNN 8-12s · 5-stage pipeline · score-based branching (S ≥ 0.85) |
| **Application Use Case & Innovation** | BGP hijack + C2 detection · PVGCOET campus case study · CERT-In export · DPDP Act 2023 |
| **Deployment & Accessibility** | `setup.bat` < 12 min · ARM64 check · Npcap auto-install · simulation mode · plain-English alerts |
| **Presentation & Documentation** | 11-slide deck · proposal HTML · architecture SVG · DEMO_SCRIPT.md · setup-guide.md |
