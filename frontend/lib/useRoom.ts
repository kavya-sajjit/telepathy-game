"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomState, WS_URL } from "./api";
import { playerId } from "./identity";

export type Feedback =
  | { status: "unknown"; typed: string; display: string; suggestions: string[] }
  | { status: "locked"; display: string; corrected: boolean; offlist: boolean }
  | { status: "error"; message: string };

export type Reaction = { id: number; from: string; emoji: string };

export type Conn = "connecting" | "open" | "retrying" | "dead";

export function useRoom(code: string, name: string | null) {
  const [state, setState] = useState<RoomState | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [fatal, setFatal] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [skew, setSkew] = useState(0); // serverNow - Date.now()
  const wsRef = useRef<WebSocket | null>(null);
  const tries = useRef(0);
  const roundRef = useRef<number | null>(null);
  const stopped = useRef(false);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    if (!name) return;
    stopped.current = false;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const ws = new WebSocket(`${WS_URL}/ws/${code}`);
      wsRef.current = ws;
      ws.onopen = () => {
        tries.current = 0;
        setConn("open");
        ws.send(JSON.stringify({ type: "hello", playerId: playerId(), name }));
        ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), 20000);
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        switch (m.type) {
          case "state": {
            const n = m.state.round?.n ?? null;
            if (n !== roundRef.current || m.state.phase !== "guessing") setFeedback(null);
            roundRef.current = m.state.phase === "guessing" ? n : null;
            setState(m.state);
            setSkew(m.state.serverNow - Date.now());
            break;
          }
          case "guess":
            setFeedback(m);
            break;
          case "error":
            setFeedback({ status: "error", message: m.message });
            break;
          case "fatal":
            stopped.current = true;
            setFatal(m.message);
            break;
          case "react": {
            const r = { id: Math.random(), from: m.from, emoji: m.emoji };
            setReactions((rs) => [...rs.slice(-12), r]);
            setTimeout(() => setReactions((rs) => rs.filter((x) => x.id !== r.id)), 2600);
            break;
          }
        }
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (stopped.current) {
          setConn("dead");
          return;
        }
        // Free-tier servers sleep; the first wake-up can take ~50s, so keep trying for a while.
        tries.current += 1;
        if (tries.current > 12) {
          setConn("dead");
          return;
        }
        setConn("retrying");
        retry = setTimeout(connect, Math.min(1000 * 2 ** (tries.current - 1), 8000));
      };
    };
    connect();
    return () => {
      stopped.current = true;
      clearInterval(ping);
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [code, name]);

  return { state, conn, fatal, feedback, setFeedback, reactions, send, skew };
}
