"""
HexaSentinel — WebSocket Endpoint
Streams real-time threat events from the on-device pipeline to the
React dashboard. Each connected browser tab gets its own WebSocket.
"""

import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..agents.orchestrator import orchestrator

router = APIRouter()


@router.websocket("/ws")
async def threat_stream(ws: WebSocket):
    await ws.accept()

    loop = asyncio.get_event_loop()

    def send_to_ws(payload: str):
        """Called from the PacketCapture thread — schedules send on the event loop."""
        try:
            asyncio.run_coroutine_threadsafe(ws.send_text(payload), loop)
        except Exception:
            pass

    orchestrator.subscribe(send_to_ws)

    try:
        # Keep the connection alive — client can send pings or any text
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    finally:
        orchestrator.unsubscribe(send_to_ws)
