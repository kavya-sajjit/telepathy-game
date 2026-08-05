from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import random
import uuid
from datetime import datetime

app = FastAPI()

# Allow Next.js frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Room-based game state
rooms = {}

CLUES = [
    "butter ____",
    "ice ____",
    "____ dog",
    "sun ____",
    "____ chance",
    "super ____",
    "fire ____",
    "____ owl",
    "coffee ____",
    "moon ____",
    "star ____",
    "rain ____",
    "____ ball",
    "____ fish",
    "____ tree"
]

def get_next_clue():
    return random.choice(CLUES)

class GameRoom:
    def __init__(self, room_id):
        self.room_id = room_id
        self.players = {}  # websocket -> {"name": str, "guess": str or None}
        self.score = 0
        self.current_clue = get_next_clue()
        self.created_at = datetime.now()

    def get_info(self):
        return {
            "room_id": self.room_id,
            "player_count": len(self.players),
            "score": self.score,
            "created_at": self.created_at.isoformat()
        }

@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Telepathy Game API running",
        "rooms": len(rooms)
    }

@app.get("/rooms")
async def get_rooms():
    return {
        "active_rooms": [room.get_info() for room in rooms.values()]
    }

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()

    # Create room if it doesn't exist
    if room_id not in rooms:
        rooms[room_id] = GameRoom(room_id)

    room = rooms[room_id]
    player_ws = None

    try:
        while True:
            data = await websocket.receive_json()

            if data["type"] == "join":
                player_name = data["name"]
                room.players[websocket] = {"name": player_name, "guess": None}
                player_ws = websocket

                player_names = [p["name"] for p in room.players.values()]
                status_msg = f"✨ {player_name} joined! Players: {', '.join(player_names)}"

                # Broadcast to all in room
                for ws in room.players.keys():
                    await ws.send_json({
                        "type": "game_state",
                        "clue": room.current_clue,
                        "score": room.score,
                        "players": len(room.players),
                        "player_names": player_names,
                        "status": status_msg
                    })

            elif data["type"] == "guess":
                if websocket in room.players:
                    guess_value = data["value"].strip().lower()
                    room.players[websocket]["guess"] = guess_value

                    # Check if all players have guessed
                    all_guesses = [p["guess"] for p in room.players.values() if p["guess"] is not None]
                    player_count = len(room.players)

                    if len(all_guesses) == player_count and player_count >= 2:
                        # Process guesses
                        player_list = list(room.players.items())
                        ws1, data1 = player_list[0]
                        ws2, data2 = player_list[1]

                        guess1 = data1["guess"]
                        guess2 = data2["guess"]
                        name1 = data1["name"]
                        name2 = data2["name"]

                        if guess1 == guess2:
                            room.score += 1
                            result = "match"
                            msg = f"🎉 MATCH! Both said '{guess1.upper()}' — Great telepathy!"
                        else:
                            result = "no_match"
                            msg = f"💭 {name1} said '{guess1}', {name2} said '{guess2}'"

                        # Reset for next round
                        room.current_clue = get_next_clue()
                        for p in room.players.values():
                            p["guess"] = None

                        player_names = [p["name"] for p in room.players.values()]

                        # Broadcast result to all in room
                        for ws in room.players.keys():
                            await ws.send_json({
                                "type": "game_state",
                                "clue": room.current_clue,
                                "score": room.score,
                                "players": len(room.players),
                                "player_names": player_names,
                                "result": result,
                                "status": msg,
                                "reset_input": True
                            })

    except WebSocketDisconnect:
        if websocket in room.players:
            left_name = room.players[websocket]["name"]
            del room.players[websocket]

            if len(room.players) == 0:
                # Delete empty room
                del rooms[room_id]
            else:
                player_names = [p["name"] for p in room.players.values()]
                status_msg = f"👋 {left_name} disconnected. Players: {', '.join(player_names)}"

                for ws in room.players.keys():
                    await ws.send_json({
                        "type": "game_state",
                        "clue": room.current_clue,
                        "score": room.score,
                        "players": len(room.players),
                        "player_names": player_names,
                        "status": status_msg
                    })