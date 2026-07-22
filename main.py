from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
import random

app = FastAPI()

game_state = {
    "score": 0,
    "target_score": 5,
    "current_clue": "",
    "guesses": {},
    "players": {}
}

CLUES = ["____ chance", "ice ____", "____ dog", "sun ____", "butter ____", "super ____", "fire ____", "____ owl", "coffee ____"]

def get_next_clue():
    return random.choice(CLUES)

game_state["current_clue"] = get_next_clue()

HTML_CLIENT = """
<!DOCTYPE html>
<html>
<head>
    <title>Telepathy Game</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: monospace; text-align: center; padding: 20px; background: #ffffff; color: #000000; }
        .card { border: 1px solid #000000; padding: 20px; max-width: 400px; margin: 20px auto; }
        input { font-family: monospace; font-size: 16px; padding: 8px; width: 80%; margin: 10px 0; border: 1px solid #000000; background: #ffffff; color: #000000; }
        button { font-family: monospace; font-size: 16px; padding: 8px 16px; background: #ffffff; color: #000000; border: 1px solid #000000; cursor: pointer; }
        button:disabled { border: 1px solid #ccc; color: #ccc; cursor: not-allowed; }
        .score { font-size: 18px; margin-bottom: 10px; }
        .clue { font-size: 24px; font-weight: bold; margin: 20px 0; }
        #status { margin-top: 15px; font-size: 14px; min-height: 20px; }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="card">
        <h1>TELEPATHY</h1>

        <div id="joinScreen">
            <p>Enter your name to join:</p>
            <form onsubmit="joinGame(event)">
                <input type="text" id="nameInput" placeholder="Your Name" required autocomplete="off" />
                <br>
                <button type="submit">Join Game</button>
            </form>
        </div>

        <div id="gameScreen" class="hidden">
            <div class="score">Team Score: <span id="score">0</span> / 5</div>
            <div class="clue" id="clue">Waiting for players...</div>
            
            <form id="guessForm" onsubmit="sendGuess(event)">
                <input type="text" id="guessInput" placeholder="Enter your word..." autocomplete="off" required />
                <br>
                <button type="submit" id="submitBtn">Submit Word</button>
            </form>
            <p id="status"></p>
        </div>
    </div>

    <script>
        let ws;
        let myName = "";

        const joinScreen = document.getElementById('joinScreen');
        const gameScreen = document.getElementById('gameScreen');
        const clueEl = document.getElementById('clue');
        const scoreEl = document.getElementById('score');
        const statusEl = document.getElementById('status');
        const submitBtn = document.getElementById('submitBtn');
        const guessInput = document.getElementById('guessInput');

        function joinGame(e) {
            e.preventDefault();
            myName = document.getElementById('nameInput').value.trim();
            if (!myName) return;

            ws = new WebSocket(`ws://${location.host}/ws`);

            ws.onopen = () => {
                ws.send(JSON.stringify({ type: 'join', name: myName }));
                joinScreen.classList.add('hidden');
                gameScreen.classList.remove('hidden');
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                scoreEl.innerText = data.score;
                clueEl.innerText = data.clue;
                
                if (data.status) {
                    statusEl.innerText = data.status;
                }

                if (data.reset_input) {
                    guessInput.value = '';
                    guessInput.disabled = false;
                    submitBtn.disabled = false;
                }

                if (data.score >= 5) {
                    clueEl.innerText = "WOOHOO YOU WON!";
                    statusEl.innerText = "mind sync gah damn";
                }
            };
        }

        function sendGuess(e) {
            e.preventDefault();
            const val = guessInput.value.trim().toLowerCase();
            if (val) {
                ws.send(JSON.stringify({ type: 'guess', value: val }));
                guessInput.disabled = true;
                submitBtn.disabled = true;
                statusEl.innerText = "Waiting for ur twin(?)";
            }
        }
    </script>
</body>
</html>
"""

@app.get("/")
async def get():
    return HTMLResponse(HTML_CLIENT)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_json()

            if data["type"] == "join":
                player_name = data["name"]
                game_state["players"][websocket] = player_name

                connected_names = list(game_state["players"].values())
                broadcast_msg = f"{player_name} joined. Connected: {', '.join(connected_names)}"

                for p in game_state["players"].keys():
                    await p.send_json({
                        "score": game_state["score"],
                        "clue": game_state["current_clue"],
                        "status": broadcast_msg
                    })

            elif data["type"] == "guess":
                game_state["guesses"][websocket] = data["value"]

                if len(game_state["guesses"]) >= len(game_state["players"]) and len(game_state["players"]) >= 2:
                    sockets = list(game_state["guesses"].keys())
                    p1_ws, p2_ws = sockets[0], sockets[1]

                    p1_name = game_state["players"][p1_ws]
                    p2_name = game_state["players"][p2_ws]

                    p1_guess = game_state["guesses"][p1_ws]
                    p2_guess = game_state["guesses"][p2_ws]

                    if p1_guess == p2_guess:
                        game_state["score"] += 1
                        msg = f"HELL YEA! TWINSIES '{p1_guess.upper()}'!"
                    else:
                        msg = f"BRUH {p1_name} said '{p1_guess}', {p2_name} said '{p2_guess}'."

                    game_state["current_clue"] = get_next_clue()
                    game_state["guesses"] = {}

                    for p in game_state["players"].keys():
                        await p.send_json({
                            "score": game_state["score"],
                            "clue": game_state["current_clue"],
                            "status": msg,
                            "reset_input": True
                        })

    except WebSocketDisconnect:
        if websocket in game_state["players"]:
            left_name = game_state["players"][websocket]
            del game_state["players"][websocket]
            if websocket in game_state["guesses"]:
                del game_state["guesses"][websocket]

            for p in game_state["players"].keys():
                await p.send_json({
                    "score": game_state["score"],
                    "clue": game_state["current_clue"],
                    "status": f"{left_name} disconnected."
                })