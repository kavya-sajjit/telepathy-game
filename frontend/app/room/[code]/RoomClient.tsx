"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Skyline, { Signal } from "@/components/Skyline";
import Sprite from "@/components/Sprite";
import Stations, { FALLBACK_PACKS } from "@/components/Stations";
import { fetchPacks, PackMeta, Player, RoomState, Settings, splitPrompt } from "@/lib/api";
import { playerId, savedName, saveName } from "@/lib/identity";
import { isMuted, play, setMuted } from "@/lib/sound";
import { useClientValue } from "@/lib/useClientValue";
import { Feedback, useRoom } from "@/lib/useRoom";

const EMOJI = ["🔥", "😂", "🤯", "🫶", "😭", "👀", "🧠", "✨"];
const DIFFS: Settings["difficulty"][] = ["mixed", "easy", "medium", "hard"];
const ROUNDS = [5, 8, 10, 15];
const TIMERS = [0, 20, 30, 45, 60];

type Send = (m: object) => void;

export default function RoomClient({ code }: { code: string }) {
  const stored = useClientValue(savedName, undefined);
  const [chosen, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const booted = stored !== undefined;
  const name = chosen ?? (stored || null);

  const room = useRoom(code, name);
  const { state, conn, fatal, reactions, send } = room;
  const me = playerId();

  const signal: Signal = !state
    ? "thinking"
    : state.phase === "guessing"
      ? "thinking"
      : state.phase === "reveal" && state.reveal
        ? state.reveal.result
        : "idle";

  // Sounds on result changes.
  const lastResult = useRef<string | null>(null);
  useEffect(() => {
    const key = state?.phase === "reveal" ? `${state.round?.n}:${state.reveal?.result}` : null;
    if (key && key !== lastResult.current && state?.reveal) play(state.reveal.result);
    lastResult.current = key;
  }, [state]);
  const lastCount = useRef(0);
  useEffect(() => {
    const n = state?.players.filter((p) => p.connected).length ?? 0;
    if (n > lastCount.current && lastCount.current > 0) play("join");
    lastCount.current = n;
  }, [state]);

  if (booted && !name) {
    return (
      <Shell code={code} signal="idle">
        <section className="panel">
          <h2>Joining room {code}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              saveName(draft);
              setName(draft.trim());
            }}
          >
            <label className="lbl" htmlFor="n">What should the others call you?</label>
            <div className="guessbar">
              <input id="n" className="field" autoFocus maxLength={16} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Your name" />
              <button className="btn btn-go" disabled={!draft.trim()}>Join room</button>
            </div>
          </form>
        </section>
      </Shell>
    );
  }

  if (fatal) {
    return (
      <Shell code={code} signal="static">
        <section className="panel center">
          <h2>Lost the signal</h2>
          <p>{fatal}</p>
          <Link className="btn btn-go" href="/">Back to the street</Link>
        </section>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell code={code} signal="thinking">
        <section className="panel center" role="status">
          <h2>Tuning in…</h2>
          <p className="muted">
            {conn === "dead"
              ? "Can't reach the game server. Check your connection and refresh."
              : "Connecting to the tower. If the server was asleep this can take up to a minute."}
          </p>
        </section>
      </Shell>
    );
  }

  return (
    <Shell code={code} signal={signal} state={state}>
      {conn !== "open" && (
        <p className="note small" role="status" style={{ marginBottom: 16 }}>
          Signal dropped. Reconnecting… your spot in the room is saved.
        </p>
      )}
      {state.phase === "lobby" && <Lobby state={state} me={me} send={send} />}
      {state.phase === "guessing" && <Guessing key={state.round?.n} state={state} me={me} send={send} feedback={room.feedback} clearFeedback={() => room.setFeedback(null)} skew={room.skew} />}
      {state.phase === "reveal" && <RevealView state={state} me={me} send={send} />}
      {state.phase === "finished" && <Finished state={state} me={me} send={send} />}

      {(state.phase === "guessing" || state.phase === "reveal") && <Crew players={state.players} mode={state.phase === "reveal" ? "ready" : "locked"} />}

      <div className="reacts" aria-label="Send a reaction">
        {EMOJI.map((e) => (
          <button key={e} onClick={() => send({ type: "react", emoji: e })} aria-label={`React ${e}`}>{e}</button>
        ))}
      </div>
      <div className="floaters" aria-hidden="true">
        {reactions.map((r, i) => {
          const p = state.players.find((x) => x.id === r.from);
          return (
            <div key={r.id} className="floater" style={{ left: `${12 + ((i * 37 + r.from.charCodeAt(0) * 7) % 76)}%` }}>
              {r.emoji}
              <span>{p?.name}</span>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ chrome
function Shell({ code, signal, state, children }: { code: string; signal: Signal; state?: RoomState; children: React.ReactNode }) {
  const storedMute = useClientValue(isMuted, false);
  const [override, setM] = useState<boolean | null>(null);
  const muted = override ?? storedMute;
  return (
    <main>
      <div className="scene">
        <Skyline signal={signal} />
        <div className="scene-top">
          <Link href="/" className="logo logo-sm">Telepathy</Link>
          <div className="row">
            {state && state.phase !== "lobby" && (
              <span className="small" style={{ color: "var(--paper)" }}>
                {state.score} pts{state.streak >= 2 ? ` · ${state.streak} in a row` : ""}
              </span>
            )}
            <span className="small" style={{ color: "var(--paper)" }}>room {code}</span>
            <button
              className="btn btn-icon"
              aria-pressed={!muted}
              aria-label={muted ? "Turn sound on" : "Turn sound off"}
              onClick={() => {
                setMuted(!muted);
                setM(!muted);
                if (muted) play("tick");
              }}
            >
              {muted ? "♪̸" : "♪"}
            </button>
          </div>
        </div>
      </div>
      <div className="wrap console">{children}</div>
    </main>
  );
}

function Crew({ players, mode }: { players: Player[]; mode: "locked" | "ready" }) {
  return (
    <section className="panel" aria-label="Players">
      <div className="crew">
        {players.map((p) => {
          const on = mode === "locked" ? p.locked : p.ready;
          return (
            <div key={p.id} className={`mind${p.connected ? "" : " off"}`}>
              <Sprite color={p.color} dim={!p.connected} />
              <span>{p.name}</span>
              {!p.connected ? (
                <span className="tag">away</span>
              ) : !p.inRound && mode === "locked" ? (
                <span className="tag">next round</span>
              ) : (
                <span className={`lamp${on ? " on" : ""}`} title={on ? (mode === "locked" ? "locked in" : "ready") : "thinking"} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ lobby
function Lobby({ state, me, send }: { state: RoomState; me: string; send: Send }) {
  const isHost = state.hostId === me;
  const [packs, setPacks] = useState<PackMeta[]>(FALLBACK_PACKS);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetchPacks().then(setPacks).catch(() => {});
  }, []);
  const s = state.settings;
  const set = (patch: Partial<Settings>) => send({ type: "settings", settings: patch });
  const live = state.players.filter((p) => p.connected);
  const link = typeof window !== "undefined" ? window.location.href : "";

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Telepathy", text: `Join my Telepathy room: ${state.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {}
  }

  return (
    <>
      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <label className="lbl">Room code</label>
            <span className="code-chip">{state.code}</span>
          </div>
          <button className="btn" onClick={share}>{copied ? "Link copied" : "Invite friends"}</button>
        </div>
        <div className="crew" style={{ marginTop: 18 }}>
          {state.players.map((p) => (
            <div key={p.id} className={`mind${p.connected ? "" : " off"}`}>
              <Sprite color={p.color} />
              <span>{p.name}{p.id === me ? " (you)" : ""}</span>
              {p.host && <span className="tag">host</span>}
            </div>
          ))}
          {live.length < 2 && <div className="mind off">waiting for a second mind…</div>}
        </div>
      </section>

      <section className="panel">
        <h2>Pick a station</h2>
        <Stations packs={packs} value={s.pack} onPick={(pack) => set({ pack })} readOnly={!isHost} />

        <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
          <Choice label="Difficulty" values={DIFFS} value={s.difficulty} render={(d) => (d === "mixed" ? "ramp up" : d)} onPick={(difficulty) => set({ difficulty })} disabled={!isHost} />
          <Choice label="Rounds" values={ROUNDS} value={s.rounds} onPick={(rounds) => set({ rounds })} disabled={!isHost} />
          <Choice label="Time per round" values={TIMERS} value={s.timer} render={(t) => (t ? `${t}s` : "no clock")} onPick={(timer) => set({ timer })} disabled={!isHost} />
          <Choice label="Show the answer list while guessing" values={[false, true]} value={s.assist} render={(a) => (a ? "yes, easier" : "no")} onPick={(assist) => set({ assist })} disabled={!isHost} />
        </div>
      </section>

      <div className="center" style={{ marginBottom: 22 }}>
        {isHost ? (
          <button className="btn btn-go" style={{ fontSize: 20, padding: "14px 28px" }} disabled={live.length < 2} onClick={() => send({ type: "start" })}>
            {live.length < 2 ? "Need one more player" : "Start transmitting"}
          </button>
        ) : (
          <p className="muted">{state.players.find((p) => p.host)?.name ?? "The host"} picks the station and starts the game.</p>
        )}
      </div>
    </>
  );
}

function Choice<T extends string | number | boolean>({
  label, values, value, onPick, render, disabled,
}: { label: string; values: T[]; value: T; onPick: (v: T) => void; render?: (v: T) => string; disabled?: boolean }) {
  return (
    <div>
      <label className="lbl">{label}</label>
      <div className="seg" role="group" aria-label={label}>
        {values.map((v) => (
          <button key={String(v)} type="button" aria-pressed={v === value} disabled={disabled} onClick={() => onPick(v)}>
            {render ? render(v) : String(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ guessing
function PromptLine({ prompt, fill }: { prompt: string; fill?: string | null }) {
  const [a, b] = splitPrompt(prompt);
  return (
    <p className="big-prompt">
      {a} <span className={`blank${fill ? " filled" : ""}`}>{fill || " "}</span> {b}
    </p>
  );
}

function useCountdown(deadline: number | null, skew: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - (now + skew)) : null;
}

function Guessing({
  state, me, send, feedback, clearFeedback, skew,
}: { state: RoomState; me: string; send: Send; feedback: Feedback | null; clearFeedback: () => void; skew: number }) {
  const r = state.round!;
  const you = state.you;
  const player = state.players.find((p) => p.id === me);
  const [text, setText] = useState("");
  const left = useCountdown(r.deadline, skew);
  const isHost = state.hostId === me;

  useEffect(() => {
    if (feedback?.status === "locked") play("lock");
  }, [feedback]);

  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (left === null) return;
    const s = Math.ceil(left / 1000);
    if (s <= 5 && s > 0 && s !== lastTick.current) play("tick");
    lastTick.current = s;
  }, [left]);

  const submit = (t: string, force = false) => {
    if (!t.trim()) return;
    send({ type: "guess", text: t, force });
  };

  const locked = you?.locked;
  const waitingOn = state.players.filter((p) => p.connected && p.inRound && !p.locked);
  const total = (state.settings.timer || 1) * 1000;

  return (
    <>
      <section className="panel transmission" aria-live="polite">
        <div className="meta">
          Round {r.n} of {r.total} · {r.difficulty} · {r.optionCount} known endings
        </div>
        <PromptLine prompt={r.prompt} fill={locked ? "▓▓▓" : null} />
        {r.deadline && left !== null && (
          <div className={`timer${left < 5000 ? " low" : ""}`} role="timer" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
            <i style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
          </div>
        )}
      </section>

      <section className="panel">
        {!player?.inRound ? (
          <p className="center muted">You joined mid-round. You&apos;re in from the next one. Watch them sweat.</p>
        ) : locked ? (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p style={{ margin: 0 }}>
              Locked in: <b style={{ color: "var(--window)" }}>{you?.guess}</b>
              {you?.offlist && <span className="muted"> (off the list, bold move)</span>}
              {feedback?.status === "locked" && feedback.corrected && <span className="muted"> (fixed your typo)</span>}
              <br />
              <span className="muted small">
                {waitingOn.length ? `Waiting on ${waitingOn.map((p) => p.name).join(", ")}…` : "Revealing…"}
              </span>
            </p>
            <button className="btn" onClick={() => send({ type: "unlock" })}>Change answer</button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
          >
            <label className="lbl" htmlFor="g">Your ending, in secret</label>
            <div className="guessbar">
              <input
                id="g"
                autoFocus
                className="field"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={40}
                placeholder="type the other half…"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (feedback) clearFeedback();
                }}
              />
              <button className="btn btn-go" disabled={!text.trim()}>Lock in</button>
            </div>
          </form>
        )}

        {!locked && feedback?.status === "unknown" && (
          <div className="note" style={{ marginTop: 14 }} role="alert">
            <p style={{ margin: "0 0 8px" }}>
              “{feedback.display}” isn&apos;t in our word list. Your friends probably won&apos;t guess it either.
            </p>
            <div className="row">
              {feedback.suggestions.map((s) => (
                <button key={s} className="btn" style={{ fontSize: 13 }} onClick={() => submit(s)}>{s}</button>
              ))}
              <button className="btn btn-ghost" style={{ fontSize: 13, color: "var(--ink)" }} onClick={() => submit(feedback.typed, true)}>
                Lock in “{feedback.typed}” anyway
              </button>
            </div>
          </div>
        )}
        {feedback?.status === "error" && <p role="alert" style={{ color: "var(--sunset)", marginBottom: 0 }}>{feedback.message}</p>}

        {r.options && (
          <details style={{ marginTop: 16 }}>
            <summary className="muted" style={{ cursor: "pointer" }}>See all {r.options.length} endings</summary>
            <ul className="options" style={{ marginTop: 10 }}>
              {r.options.map((o) => (
                <li key={o.key}>
                  <button className="btn-ghost" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }} onClick={() => submit(o.key)} disabled={locked}>
                    {o.display}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        {isHost && waitingOn.length > 0 && (
          <div className="center" style={{ marginTop: 14 }}>
            <button className="btn btn-ghost small" onClick={() => send({ type: "skip" })}>Reveal now (host)</button>
          </div>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ reveal
const VERDICT = {
  meld: "Mind meld!",
  partial: "Half a connection",
  static: "Static",
};

function RevealView({ state, me, send }: { state: RoomState; me: string; send: Send }) {
  const r = state.round!;
  const rv = state.reveal!;
  const byId = useMemo(() => Object.fromEntries(state.players.map((p) => [p.id, p])), [state.players]);
  const [a, b] = splitPrompt(r.prompt);
  const keyCount: Record<string, number> = {};
  Object.values(rv.guesses).forEach((g) => g.key && (keyCount[g.key] = (keyCount[g.key] || 0) + 1));
  const ready = state.players.find((p) => p.id === me)?.ready;
  const live = state.players.filter((p) => p.connected);
  const nReady = live.filter((p) => p.ready).length;
  const last = r.n >= r.total;
  const sharedKey = rv.result === "meld" ? Object.values(rv.guesses)[0]?.key : null;
  const sharedDisplay = sharedKey ? rv.options.concat(rv.offlist).find((o) => o.key === sharedKey)?.display : null;
  const options = [...rv.options, ...rv.offlist];

  return (
    <>
      <section className="panel transmission">
        <div className="meta">Round {r.n} of {r.total}</div>
        <p className={`verdict ${rv.result} pop-in`}>{VERDICT[rv.result]}</p>
        {sharedDisplay ? (
          <p className="big-prompt" style={{ color: "var(--signal)" }}>{sharedDisplay}</p>
        ) : (
          <PromptLine prompt={r.prompt} />
        )}
        <div className="scoreline">
          <span>this round<b>+{rv.points}</b></span>
          <span>total<b>{state.score}</b></span>
          {state.streak >= 2 && <span>streak<b>{state.streak}</b></span>}
        </div>
        {rv.bonus.length > 0 && <p style={{ color: "var(--window)", margin: "10px 0 0" }}>{rv.bonus.join(" + ")} bonus</p>}

        <div className="said">
          {Object.entries(rv.guesses).map(([pid, g]) => {
            const p = byId[pid];
            const hit = g.key && keyCount[g.key] > 1;
            return (
              <div key={pid} className={`bubble${hit ? " hit" : ""}`}>
                <div className="who row" style={{ gap: 6, color: p?.color }}>
                  {p && <Sprite color={p.color} size={16} />} {p?.name ?? "someone"}
                </div>
                <div className="what">{g.display ?? <span className="muted">…no answer</span>}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>Every ending we know for “{[a, "____", b].filter(Boolean).join(" ")}”</h2>
        <ul className="options">
          {options.map((o) => (
            <li key={o.key} className={o.by?.length ? "picked" : ""}>
              <span>{o.display}{o.pop === 0 && <span className="muted small"> (off-list)</span>}</span>
              <span className="dots">
                {o.by?.map((id) => <i key={id} style={{ background: byId[id]?.color }} title={byId[id]?.name} />)}
              </span>
              <span className="bar" aria-hidden="true"><i style={{ width: `${Math.max(3, o.pop)}%` }} /></span>
            </li>
          ))}
        </ul>
        <p className="muted small" style={{ marginBottom: 0 }}>Bars show how common each one is in English text.</p>
      </section>

      <div className="center" style={{ marginBottom: 22 }}>
        <button className="btn btn-go" style={{ fontSize: 18 }} disabled={ready} onClick={() => send({ type: "ready" })}>
          {ready ? `Waiting (${nReady}/${live.length} ready)` : last ? "See results" : "Next round"}
        </button>
        {state.hostId === me && ready && nReady < live.length && (
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-ghost small" onClick={() => send({ type: "skip" })}>Move on without them (host)</button>
          </div>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ results
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Finished({ state, me, send }: { state: RoomState; me: string; send: Send }) {
  const s = state.summary!;
  const isHost = state.hostId === me;
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  const pair = s.bestPair && state.players.length > 2 ? s.bestPair.ids.map((id) => byId[id]?.name).filter(Boolean) : null;
  const icon = { meld: "◆", partial: "◇", static: "×" } as Record<string, string>;
  return (
    <>
      <section className="panel center">
        <div className="sync-num pop-in">{s.sync}%</div>
        <p style={{ fontFamily: "var(--px)", fontSize: 24, margin: "8px 0 4px", color: "var(--paper)" }}>{s.title}</p>
        <p className="muted" style={{ margin: 0 }}>
          {plural(s.melds, "full meld")}, {plural(s.partial, "half connection")}, {plural(state.score, "point")}
          {s.bestStreak >= 2 ? `, longest streak ${s.bestStreak}` : ""}.
        </p>
        {pair && pair.length === 2 && (
          <p style={{ margin: "10px 0 0" }}>
            Strongest link: <b style={{ color: "var(--signal)" }}>{pair[0]} + {pair[1]}</b> ({s.bestPair!.hits} matches)
          </p>
        )}
      </section>

      <section className="panel">
        <h2>The tape</h2>
        <ul className="history">
          {s.history.map((h) => (
            <li key={h.round}>
              <span className={`r-${h.result}`} aria-label={h.result}>{icon[h.result]}</span>
              <span>
                <b>{h.prompt}</b>{" "}
                <span className="muted">
                  {Object.entries(h.answers).map(([n, a]) => `${n}: ${a ?? "—"}`).join("  ·  ")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="center row" style={{ justifyContent: "center", marginBottom: 22 }}>
        {isHost ? (
          <>
            <button className="btn btn-go" onClick={() => send({ type: "start" })}>Play again</button>
            <button className="btn" onClick={() => send({ type: "lobby" })}>Change station</button>
          </>
        ) : (
          <p className="muted">The host can start another game.</p>
        )}
      </div>
    </>
  );
}
