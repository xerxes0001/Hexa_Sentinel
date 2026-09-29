"""
HexaSentinel — Voice Query Endpoint
POST /api/voice   — accepts raw audio, returns transcription + Llama answer.
Powered by Whisper-Base-En + Llama 3.2 3B, both on the Hexagon NPU.
"""

from fastapi import APIRouter, UploadFile, File, Form
from ..agents.whisper_agent  import whisper_agent
from ..agents.orchestrator   import orchestrator

router = APIRouter()


@router.post("/voice")
async def voice_query(
    audio: UploadFile = File(..., description="WAV or raw PCM16 audio, 16 kHz mono"),
    context: str      = Form(default="", description="Current dashboard context for the AI"),
):
    """
    1. Transcribe audio with Whisper-Base-En (Qualcomm AI Hub — Hexagon NPU)
    2. Pass transcript to Llama 3.2 3B for a contextual answer
    3. Return both transcript and answer to the React frontend

    Example voice queries:
      - "Show me all threats in the last hour"
      - "What is the status of the BGP incident affecting Jio?"
      - "Generate a CERT-In report for the last critical event"
    """
    audio_bytes = await audio.read()

    if not audio_bytes:
        return {"error": "No audio received", "transcript": "", "answer": ""}

    # Step 1: Transcribe
    transcript = whisper_agent.transcribe(audio_bytes, sample_rate=16_000)

    if not transcript or transcript.startswith("[Voice transcription"):
        return {
            "transcript": transcript,
            "answer":     "Voice transcription is unavailable. "
                          "Please ensure the Whisper-Base-En model is downloaded "
                          "and Snapdragon X Elite hardware is present.",
            "model":      "whisper-base-en (unavailable)",
        }

    # Step 2: Answer with Llama 3.2 3B
    answer = orchestrator.chat(
        system_context=context or "You are HexaSentinel, an on-device network security analyst.",
        user_message=transcript,
    )

    return {
        "transcript": transcript,
        "answer":     answer,
        "model":      "whisper-base-en + llama-3.2-3b (Qualcomm AI Hub — Hexagon NPU)",
    }


@router.get("/voice/status")
async def voice_status():
    return {
        "whisper_available": whisper_agent.is_available(),
        "model":             "whisper-base-en (Qualcomm AI Hub)",
        "npu":               "Hexagon NPU (QNN Runtime)",
    }
