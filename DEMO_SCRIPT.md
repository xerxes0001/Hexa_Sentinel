# HexaSentinel — Competition Demo Script
**Qualcomm Snapdragon AI Lab Challenge 2026**  
*Aniket Khot · PVGCOET, Pune*

---

## Before you present

| Check | Command |
|---|---|
| Backend running | `uvicorn backend.api.main:app --host 127.0.0.1 --port 8000` |
| Frontend running | `npm run dev` → open `http://localhost:5173` |
| Simulation mode | Check console — "Simulation mode active" means no admin rights (still works) |
| NPU status | Visit `http://127.0.0.1:8000/api/health` — confirm `"cloud": false` |

---

## Demo flow (8 minutes)

### 1. Open the dashboard (30s)
Point at the top bar:
> "This is HexaSentinel — a fully on-device network security analyst running on this HP AI PC.
> No cloud. No Groq API key. No Supabase. Everything you see is powered by two AI models
> on the Snapdragon Hexagon NPU."

Open a new tab → `http://127.0.0.1:8000/api/health` → show the judges:
```json
{ "cloud": false, "llm": "llama-3.2-3b-instruct (Qualcomm AI Hub)", "classifier": "onnx-anomaly-classifier (Hexagon NPU)" }
```

---

### 2. Live BGP threat feed (1.5 min)
The dashboard is already connected to the RIPE RIS live BGP feed.  
Watch for a real incident to appear, OR click **▶ Start Demo** in the top-right.

When an incident card appears:
> "The ONNX classifier running on the Hexagon NPU flagged this in under 5 milliseconds.
> No packet left this device. Llama 3.2 3B is now generating the threat analysis — on-device."

Point at the AI Analysis panel on the right side as it populates.

---

### 3. On-device NPU monitor — HexaSentinelPanel (1 min)
Point at the **ON-DEVICE NPU MONITOR** section (right panel or left column compact strip):
> "This panel shows real-time events from the packet capture pipeline.
> Every 30 seconds, scapy collects a traffic window, the ONNX model classifies it,
> and if it's suspicious, Llama generates a plain-English report — all on the NPU."

If simulation mode is active: point at `[sim]` labels and explain you're on a non-admin machine.

---

### 4. Network graph (1 min)
Click **Network Graph** tab (center panel):
> "This D3 visualization shows live packet flows — nodes are IP endpoints,
> edges are connections. Red nodes are flagged by the ONNX classifier."

Hover a red node to see the Llama-generated summary tooltip.

---

### 5. Severity meter + NPU status (30s)
Point at the **SeverityMeter** gauge in the top-right area:
> "This gauge updates in real time as the ONNX classifier scores each window.
> Green is normal traffic. Amber means the classifier is watching. Red means Llama is writing a report."

Point at the NPU status badge:
> "NPU LIVE means both models are running on the Hexagon NPU — not the CPU, not the cloud."

---

### 6. Click an incident → AI analysis (1.5 min)
Click any incident card. Show the AI Analysis panel:
> "This is Llama 3.2 3B producing a threat report. The model is 4-bit quantized
> for the Hexagon NPU — 3–4× faster than FP16 on the same silicon."

Show the three sections:  
- **WHAT HAPPENED** — plain English for non-specialists  
- **ATTACK VECTOR** — technical BGP/routing detail  
- **ACTIONS** — three specific steps for the NOC engineer  

---

### 7. Voice query — Whisper + Llama (1 min)
Open **Admin Chat** panel (top-right nav). Click 🎙 **Voice Query**:

Say: *"What is the severity of the latest BGP incident?"*

> "That was Whisper-Base-En from Qualcomm AI Hub transcribing my question on the NPU,
> then passing the text to Llama 3.2 3B for the answer — both models on the same Hexagon NPU,
> zero network calls."

---

### 8. CERT-In report export (45s)
With an incident selected, click **Generate CERT-In Report**:
> "This generates a formal CERT-In format report — the same format India's Computer
> Emergency Response Team uses. Llama writes the narrative. One click exports as PDF."

Show the generated report text.

---

### 9. Closing (30s)
> "HexaSentinel runs 100% on this HP AI PC. No subscription. No API keys. No data leaves the device.
> The Hexagon NPU handles both models — ONNX classifier in a continuous low-priority thread,
> Llama 3.2 3B on demand. This is what on-device AI for cybersecurity looks like."

Open `http://127.0.0.1:8000/docs` → show the clean FastAPI interface.

---

## Evaluation criteria mapping

| Criterion | What to point at |
|---|---|
| **Technical Implementation** | `/api/health` JSON · ONNX+QNN classifier · Llama 3.2 3B · `backend/` code |
| **Application Use Case & Innovation** | BGP hijack detection · CERT-In export · Indian infrastructure focus |
| **Deployment & Accessibility** | `setup.bat` · plain-English alerts · simulation mode fallback |
| **Presentation & Documentation** | This demo · `README.md` · `HexaSentinel_Proposal.html` |

---

## Fallback if NPU hardware is not available

All features still work in CPU/simulation mode:
- ONNX classifier → heuristic rule-based fallback
- Llama 3.2 3B → deterministic template fallback  
- Packet capture → synthetic event generator (fires every 30s)
- Whisper → stub transcription

The architecture, the dashboard, the BGP feed, the CERT-In export, the network graph — all fully functional.
