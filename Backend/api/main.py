"""
HexaSentinel — FastAPI Application
Localhost-only server (127.0.0.1:8000) that bridges the on-device
AI pipeline (scapy → ONNX → Llama 3.2 3B) with the React dashboard.

Run: uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 --reload
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .websocket import router as ws_router
from .reports   import router as report_router
from .voice     import router as voice_router
from ..agents.orchestrator import orchestrator


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start packet capture + NPU pipeline on server startup
    orchestrator.start()
    yield
    orchestrator.stop()


app = FastAPI(
    title="HexaSentinel On-Device API",
    version="1.0.0",
    description=(
        "On-device network threat intelligence powered by "
        "Llama 3.2 3B Instruct (Qualcomm AI Hub) on Hexagon NPU. "
        "Zero cloud dependency at runtime."
    ),
    lifespan=lifespan,
)

# ── CORS — only allow the local Vite dev server ───────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",   # Vite preview
        "http://127.0.0.1:4173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)
app.include_router(report_router)
app.include_router(voice_router, prefix='/api')


# ── Chat endpoint ─────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    messages: list[dict] = []
    context:  str        = ""


@app.post("/api/chat")
async def chat(body: ChatRequest):
    """
    Drop-in replacement for Groq's chat API.
    Used by AdminChat.jsx and ConversationalQuery.jsx.
    Powered by Llama 3.2 3B on the Hexagon NPU.
    """
    user_msg = body.messages[-1]["content"] if body.messages else ""
    reply    = orchestrator.chat(body.context, user_msg)
    return {
        "reply":       reply,
        "model":       "llama-3.2-3b-instruct-qnn",
        "provider":    "Qualcomm AI Hub — Hexagon NPU",
    }


# ── On-demand incident analysis ───────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    context: dict | str = {}


@app.post("/api/analyze")
async def analyze(body: AnalyzeRequest):
    """
    On-demand analysis for a single BGP/network incident.
    Used by AIAnalysis.jsx when a new incident is selected.
    Powered by Llama 3.2 3B on the Hexagon NPU.
    """
    result = orchestrator.analyze_incident(body.context)
    return {
        "analysis": result,
        "model":    "llama-3.2-3b-instruct-qnn",
        "provider": "Qualcomm AI Hub — Hexagon NPU",
    }


# ── Health / stats ─────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {
        "status":    "ok",
        "pipeline":  "on-device",
        "llm":       "llama-3.2-3b-instruct (Qualcomm AI Hub)",
        "classifier":"onnx-anomaly-classifier (Hexagon NPU)",
        "cloud":     False,
        "stats":     orchestrator.get_stats(),
    }


@app.get("/")
async def root():
    return {"message": "HexaSentinel on-device API — see /docs for endpoints"}
