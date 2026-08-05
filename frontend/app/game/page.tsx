"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LobbyPage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 9).toUpperCase();
  };

  const handleCreateGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    setIsJoining(true);

    // Redirect to game room
    setTimeout(() => {
      router.push(`/game/${newRoomId}?name=${encodeURIComponent(playerName)}`);
    }, 500);
  };

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.
        trim() || !roomId.trim()) return;

    setIsJoining(true);
    setTimeout(() => {
      router.push(`/game/${roomId}?name=${encodeURIComponent(playerName)}`);
    }, 500);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Welcome Banner */}
      <div className="bg-linear-to-r from-indigo-200 via-purple-200 to-pink-200 border-3 border-purple-500 p-8 rounded-xl shadow-lg text-center">
        <h1 className="text-4xl font-bold mb-2">🧠 Mind Meld</h1>
        <p className="text-lg text-gray-700">Can you read your partner&apos;s mind?</p>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create Game */}
        <div className="bg-white border-3 border-green-400 p-8 rounded-xl shadow-md">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span>✨</span> Create Game
          </h2>

          <form onSubmit={handleCreateGame} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-3 border-2 border-green-300 rounded-lg focus:outline-none focus:border-green-600 text-black font-medium"
                disabled={isJoining}
              />
            </div>

            <button
              type="submit"
              disabled={!playerName.trim() || isJoining}
              className={`w-full font-bold py-3 rounded-lg transition text-white text-lg ${
                playerName.trim() && !isJoining
                  ? "bg-green-600 hover:bg-green-700 cursor-pointer"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              {isJoining ? "Launching..." : "Create New Game 🚀"}
            </button>

            <p className="text-sm text-gray-600 text-center pt-2">
              Share your game code with a friend to play together
            </p>
          </form>
        </div>

        {/* Join Game */}
        <div className="bg-white border-3 border-blue-400 p-8 rounded-xl shadow-md">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span>🎮</span> Join Game
          </h2>

          <form onSubmit={handleJoinGame} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 text-black font-medium"
                disabled={isJoining}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Game Code</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123XY"
                className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 text-black font-medium uppercase"
                disabled={isJoining}
              />
            </div>

            <button
              type="submit"
              disabled={!playerName.trim() || !roomId.trim() || isJoining}
              className={`w-full font-bold py-3 rounded-lg transition text-white text-lg ${
                playerName.trim() && roomId.trim() && !isJoining
                  ? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              {isJoining ? "Joining..." : "Join Game 🔗"}
            </button>

            <p className="text-sm text-gray-600 text-center pt-2">
              Ask your friend for their game code
            </p>
          </form>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-lg">
          <p className="font-bold text-yellow-900">💭 How it works</p>
          <p className="text-sm text-yellow-800 mt-2">You and your partner see a clue. Can you guess the same thing?</p>
        </div>

        <div className="bg-purple-50 border-2 border-purple-400 p-4 rounded-lg">
          <p className="font-bold text-purple-900">🧠 Telepathy Test</p>
          <p className="text-sm text-purple-800 mt-2">Build your score by matching answers. How connected are you?</p>
        </div>

        <div className="bg-pink-50 border-2 border-pink-400 p-4 rounded-lg">
          <p className="font-bold text-pink-900">⚡ Real-time</p>
          <p className="text-sm text-pink-800 mt-2">Instant feedback as you play. No lag, no waiting.</p>
        </div>
      </div>

      {/* Back Link */}
      <div className="text-center">
        <Link href="/" className="text-blue-600 hover:underline font-semibold">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
