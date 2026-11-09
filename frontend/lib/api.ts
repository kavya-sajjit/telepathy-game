export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = API_URL.replace(/^http/, "ws");

export type Answer = { key: string; display: string; pop: number; by?: string[] };

export type PackMeta = {
  id: string;
  group: string;
  title: string;
  tagline: string;
  example: [string, string];
  count: number;
  byDifficulty: Record<"easy" | "medium" | "hard", number>;
};

export type Player = {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  locked: boolean;
  ready: boolean;
  inRound: boolean;
  melds: number;
  host: boolean;
};

export type Settings = {
  pack: string;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  rounds: number;
  timer: number;
  assist: boolean;
};

export type Reveal = {
  result: "meld" | "partial" | "static";
  points: number;
  bonus: string[];
  guesses: Record<string, { display: string | null; key: string | null; offlist: boolean }>;
  options: Answer[];
  offlist: Answer[];
};

export type Summary = {
  rounds: number;
  melds: number;
  partial: number;
  sync: number;
  title: string;
  bestStreak: number;
  bestPair: { ids: [string, string]; hits: number } | null;
  history: { round: number; prompt: string; result: string; points: number; answers: Record<string, string | null> }[];
};

export type RoomState = {
  code: string;
  phase: "lobby" | "guessing" | "reveal" | "finished";
  hostId: string;
  players: Player[];
  settings: Settings;
  score: number;
  streak: number;
  round: {
    n: number;
    total: number;
    prompt: string;
    difficulty: string;
    pack: string;
    optionCount: number;
    deadline: number | null;
    options: Answer[] | null;
  } | null;
  reveal: Reveal | null;
  summary: Summary | null;
  serverNow: number;
  you?: { id: string; guess: string | null; locked: boolean; offlist: boolean };
};

export async function createRoom(): Promise<string> {
  const r = await fetch(`${API_URL}/api/rooms`, { method: "POST" });
  if (!r.ok) throw new Error("Couldn't open a room. Is the server running?");
  return (await r.json()).code;
}

export async function roomExists(code: string): Promise<boolean> {
  const r = await fetch(`${API_URL}/api/rooms/${encodeURIComponent(code)}`);
  return r.ok;
}

export async function fetchPacks(): Promise<PackMeta[]> {
  const r = await fetch(`${API_URL}/api/packs`);
  if (!r.ok) throw new Error("packs unavailable");
  return (await r.json()).packs;
}

/** Render "sun ____" with the blank as its own token so it can be styled. */
export function splitPrompt(prompt: string): [string, string] {
  const i = prompt.indexOf("____");
  return [prompt.slice(0, i).trim(), prompt.slice(i + 4).trim()];
}
