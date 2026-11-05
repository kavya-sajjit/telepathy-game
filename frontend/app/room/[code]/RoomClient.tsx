"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Garden, { Mood, Plant } from "@/components/Garden";
import Sprite from "@/components/Sprite";
import SeedPackets, { FALLBACK_PACKS } from "@/components/Stations";
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Pairs of players who gave the same answer this round. */
function matchedPairs(state: RoomState): [string, string][] {
  if (state.phase === "reveal" && state.reveal) {
    const groups: Record<string, string[]> = {};
    for (const [pid, g] of Object.entries(state.reveal.guesses)) if (g.key) (groups[g.key] ||= []).push(pid);
    const out: [string, string][] = [];
    for (const ids of Object.values(groups)) for (let i = 1; i < ids.length; i++) out.push([ids[i - 1], ids[i]]);
    return out;
  }
  if (state.phase === "finished" && state.summary?.bestPair) return [state.summary.bestPair.ids];
  return [];
}

export default function RoomClient({ code }: { code: string }) {
  const stored = useClientValue(savedName, undefined);
  const [chosen, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const booted = stored !== undefined;
  const name = chosen ?? (stored || null);

  const room = useRoom(code, name);
  const { state, conn, fatal, reactions, send } = room;
  const me = playerId();

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

  const plants: Plant[] = state
    ? state.players.map((p) => ({ id: p.id, name: p.id === me ? `${p.name} (you)` : p.name, color: p.color, locked: p.locked, away: !p.connected }))
    : [];
  const mood: Mood = state?.phase === "guessing" ? "thinking" : state?.phase === "reveal" ? "reveal" : "idle";

  const top = (
    <Top code={code} state={state ?? undefined}>
      <Garden plants={plants} mood={mood} links={state ? matchedPairs(state) : []} />
    </Top>
  );

  if (booted && !name) {
    return (
      <main>
        {top}
        <section className="layer">
          <form
            className="inner stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              saveName(draft);
              setName(draft.trim());
            }}
          >
            <h2>You&apos;re joining room {code}</h2>
            <div>
              <label className="lbl" htmlFor="n">Your name</label>
              <div className="guessbar">
                <input id="n" className="field" autoFocus maxLength={16} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What should they call you?" />
                <button className="btn btn-gold" disabled={!draft.trim()}>Join room</button>
              </div>
            </div>
          </form>
        </section>
      </main>
    );
  }

  if (fatal || !state) {
    return (
      <main>
        {top}
        <section className="layer">
          <div className="inner stack" role="status">
            <h2>{fatal ? "Can't open this room" : "Connecting…"}</h2>
            <p style={{ margin: 0 }}>
              {fatal ??
                (conn === "dead"
                  ? "Can't reach the game server. Check your connection and refresh."
                  : "If the game server was asleep, this can take up to a minute.")}
            </p>
            {(fatal || conn === "dead") && (
              <p style={{ margin: 0 }}>
                <Link className="btn btn-gold" href="/">Make a new room</Link>
              </p>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      {top}
      {conn !== "open" && (
        <p className="inner callout" role="status">Connection dropped. Reconnecting, and your place in the room is saved.</p>
      )}
      {state.phase === "lobby" && <Lobby state={state} me={me} send={send} />}
      {state.phase === "guessing" && (
        <Guessing key={state.round?.n} state={state} me={me} send={send} feedback={room.feedback} skew={room.skew} />
      )}
      {state.phase === "reveal" && <RevealView state={state} me={me} send={send} />}
      {state.phase === "finished" && <Finished state={state} me={me} send={send} />}

      <section className="layer">
        <div className="inner row" style={{ justifyContent: "space-between" }}>
          <div className="reacts" aria-label="Send a reaction">
            {EMOJI.map((e) => (
              <button key={e} onClick={() => send({ type: "react", emoji: e })} aria-label={`React with ${e}`}>{e}</button>
            ))}
          </div>
          <Link href="/" className="btn-quiet">Leave room</Link>
        </div>
      </section>

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
    </main>
  );
}

// ------------------------------------------------------------------ top band
function Top({ code, state, children }: { code: string; state?: RoomState; children: React.ReactNode }) {
  const storedMute = useClientValue(isMuted, false);
  const [override, setM] = useState<boolean | null>(null);
  const muted = override ?? storedMute;
  return (
    <div className="garden-wrap">
      {children}
      <div className="garden-bar">
        <Link href="/" className="wordmark">Telepathy</Link>
        <div className="bar-meta">
          {state && state.phase !== "lobby" && <span>{plural(state.score, "point")}</span>}
          <span>Room {code}</span>
          <button
            className="btn-quiet"
            style={{ color: "#2b190f" }}
            aria-pressed={!muted}
            onClick={() => {
              setMuted(!muted);
              setM(!muted);
              if (muted) play("tick");
            }}
          >
            {muted ? "Sound off" : "Sound on"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Crew({ players, me, show }: { players: Player[]; me: string; show: "host" | "locked" | "ready" }) {
  return (
    <div className="crew">
      {players.map((p) => (
        <div key={p.id} className={`mind${p.connected ? "" : " off"}`}>
          <Sprite color={p.color} dim={!p.connected} />
          <span>{p.name}{p.id === me ? " (you)" : ""}</span>
          {!p.connected ? (
            <span className="tag">away</span>
          ) : show === "host" ? (
            p.host && <span className="tag">host</span>
          ) : show === "locked" && !p.inRound ? (
            <span className="tag">plays next round</span>
          ) : (
            <span
              className={`state-dot${(show === "locked" ? p.locked : p.ready) ? " on" : ""}`}
              title={show === "locked" ? (p.locked ? "Locked in" : "Thinking") : p.ready ? "Ready" : "Not ready"}
            />
          )}
        </div>
      ))}
    </div>
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
  const hostName = state.players.find((p) => p.host)?.name ?? "The host";

  async function share() {
    const link = window.location.href;
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
      <section className="layer">
        <div className="inner stack">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <label className="lbl">Room code</label>
              <div className="code">{state.code}</div>
            </div>
            <button className="btn" onClick={share}>{copied ? "Link copied" : "Share invite link"}</button>
          </div>
          <Crew players={state.players} me={me} show="host" />
          {live.length < 2 && <p className="muted" style={{ margin: 0 }}>Waiting for someone else to join. Send them the code or the link.</p>}
        </div>
      </section>

      <section className="layer">
        <div className="inner">
          <h2>{isHost ? "Pick a word pack" : `${hostName} is picking a word pack`}</h2>
          <SeedPackets packs={packs} value={s.pack} onPick={(pack) => set({ pack })} readOnly={!isHost} />
          <div className="settings">
            <Choice label="Difficulty" values={DIFFS} value={s.difficulty} render={(d) => (d === "mixed" ? "Start easy, get harder" : d[0].toUpperCase() + d.slice(1))} onPick={(difficulty) => set({ difficulty })} disabled={!isHost} />
            <Choice label="Rounds" values={ROUNDS} value={s.rounds} onPick={(rounds) => set({ rounds })} disabled={!isHost} />
            <Choice label="Time per round" values={TIMERS} value={s.timer} render={(t) => (t ? `${t}s` : "No timer")} onPick={(timer) => set({ timer })} disabled={!isHost} />
            <Choice label="Show possible answers while guessing" values={[false, true]} value={s.assist} render={(a) => (a ? "Yes (easier)" : "No")} onPick={(assist) => set({ assist })} disabled={!isHost} />
          </div>
        </div>
      </section>

      <section className="layer">
        <div className="inner">
          {isHost ? (
            <button className="btn btn-gold btn-big" disabled={live.length < 2} onClick={() => send({ type: "start" })}>
              {live.length < 2 ? "Needs one more player" : "Start the game"}
            </button>
          ) : (
            <p className="muted" style={{ margin: 0 }}>{hostName} starts the game when everyone&apos;s here.</p>
          )}
        </div>
      </section>
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
function PromptLine({ prompt, state = "open" }: { prompt: string; state?: "open" | "sealed" }) {
  const [a, b] = splitPrompt(prompt);
  return (
    <p className="big-prompt">
      {a} <span className={`blank${state === "sealed" ? " sealed" : ""}`} aria-label="blank" /> {b}
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

function Guessing({ state, me, send, feedback, skew }: { state: RoomState; me: string; send: Send; feedback: Feedback | null; skew: number }) {
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
    if (t.trim()) send({ type: "guess", text: t, force });
  };

  const locked = you?.locked;
  const waitingOn = state.players.filter((p) => p.connected && p.inRound && !p.locked);
  const total = (state.settings.timer || 1) * 1000;
  const unknown = !locked && feedback?.status === "unknown" ? feedback : null;

  return (
    <>
      <section className="layer">
        <div className="inner" aria-live="polite">
          <p className="round-meta">
            Round {r.n} of {r.total}. {r.optionCount} known endings, {r.difficulty}.
          </p>
          <PromptLine prompt={r.prompt} state={locked ? "sealed" : "open"} />
          {r.deadline && left !== null && (
            <div className={`timer${left < 5000 ? " low" : ""}`} role="timer" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
              <i style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
            </div>
          )}
        </div>
      </section>

      <section className="layer">
        <div className="inner stack">
          {!player?.inRound ? (
            <p style={{ margin: 0 }}>You joined partway through this round. You&apos;ll play from the next one.</p>
          ) : locked ? (
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <p style={{ margin: 0, fontSize: 22 }}>
                  You locked in <b style={{ color: "var(--gold)" }}>{you?.guess}</b>
                </p>
                <p className="muted small" style={{ margin: 0 }}>
                  {you?.offlist ? "It's not on the word list, so it's a long shot. " : ""}
                  {feedback?.status === "locked" && feedback.corrected ? "We fixed a typo. " : ""}
                  {waitingOn.length ? `Waiting for ${waitingOn.map((p) => p.name).join(", ")}.` : "Revealing…"}
                </p>
              </div>
              <button className="btn" onClick={() => send({ type: "unlock" })}>Change answer</button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(text);
              }}
            >
              <label className="lbl" htmlFor="g">Your ending. Nobody sees it until everyone has locked in.</label>
              <div className="guessbar">
                <input
                  id="g"
                  autoFocus
                  className="field"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={40}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button className="btn btn-gold" disabled={!text.trim()}>Lock in</button>
              </div>
            </form>
          )}

          {unknown && (
            <div className="callout" role="alert">
              <p style={{ margin: "0 0 10px" }}>
                “{unknown.display}” isn&apos;t in our word list, so your friends probably won&apos;t guess it.
                {unknown.suggestions.length ? " Did you mean one of these?" : ""}
              </p>
              <div className="row" style={{ gap: 8 }}>
                {unknown.suggestions.map((s) => (
                  <button key={s} className="btn" onClick={() => submit(s)}>{s}</button>
                ))}
                <button className="btn-quiet" onClick={() => submit(unknown.typed, true)}>Lock in “{unknown.typed}” anyway</button>
              </div>
            </div>
          )}
          {feedback?.status === "error" && <p role="alert" style={{ color: "var(--petal)", margin: 0 }}>{feedback.message}</p>}

          {r.options && (
            <details>
              <summary className="muted" style={{ cursor: "pointer" }}>Show all {r.options.length} possible answers</summary>
              <ul className="options" style={{ marginTop: 10 }}>
                {r.options.map((o) => (
                  <li key={o.key}>
                    <button className="btn-quiet" style={{ color: "var(--text)" }} onClick={() => submit(o.key)} disabled={locked}>
                      {o.display}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <Crew players={state.players} me={me} show="locked" />
            {isHost && waitingOn.length > 0 && (
              <button className="btn-quiet" onClick={() => send({ type: "skip" })}>Reveal now</button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ reveal
const VERDICT = { meld: "Everyone matched!", partial: "Some of you matched", static: "No matches" };
const BONUS: Record<string, string> = { "deep cut": "less obvious answer", "hive mind": "3 or more minds" };

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
  const options = [...rv.options, ...rv.offlist];
  const bonus = rv.bonus.map((x) => BONUS[x] ?? x.replace("×", " in a row"));

  return (
    <>
      <section className="layer">
        <div className="inner">
          <p className="round-meta">Round {r.n} of {r.total}: {r.prompt.replace("____", "…")}</p>
          <p className={`verdict ${rv.result}`}>{VERDICT[rv.result]}</p>
          <p className="points" style={{ margin: "4px 0 0" }}>
            <b>+{rv.points}</b> {rv.points === 1 ? "point" : "points"}
            {bonus.length > 0 && <span className="small"> (bonus: {bonus.join(", ")})</span>}
          </p>
          <div className="said">
            {Object.entries(rv.guesses).map(([pid, g]) => {
              const p = byId[pid];
              const hit = g.key && keyCount[g.key] > 1;
              return (
                <div key={pid} className={hit ? "hit" : undefined} style={{ "--who": p?.color ?? "#888" } as React.CSSProperties}>
                  <div className="who">{p?.name ?? "Someone"}{pid === me ? " (you)" : ""}</div>
                  <div className="what">{g.display ?? <span className="muted">no answer</span>}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="layer">
        <div className="inner">
          <h2>Every answer we know for {[a, "…", b].filter(Boolean).join(" ")}</h2>
          <ul className="options">
            {options.map((o) => (
              <li key={o.key} className={o.by?.length ? "picked" : ""}>
                <span>{o.display}{o.pop === 0 && <span className="muted small"> (not on the list)</span>}</span>
                <span className="dots">
                  {o.by?.map((id) => <i key={id} style={{ background: byId[id]?.color }} title={byId[id]?.name} />)}
                </span>
                <span className="depth" aria-hidden="true"><i style={{ width: `${Math.max(3, o.pop)}%` }} /></span>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ marginBottom: 0 }}>Longer lines are more common in everyday English.</p>
        </div>
      </section>

      <section className="layer">
        <div className="inner stack">
          <div className="row">
            <button className="btn btn-gold btn-big" disabled={ready} onClick={() => send({ type: "ready" })}>
              {ready ? `Waiting for others (${nReady} of ${live.length} ready)` : last ? "See results" : "Next round"}
            </button>
            {state.hostId === me && ready && nReady < live.length && (
              <button className="btn-quiet" onClick={() => send({ type: "skip" })}>Continue without waiting</button>
            )}
          </div>
          <Crew players={state.players} me={me} show="ready" />
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ results
function Finished({ state, me, send }: { state: RoomState; me: string; send: Send }) {
  const s = state.summary!;
  const isHost = state.hostId === me;
  const byId = Object.fromEntries(state.players.map((p) => [p.id, p]));
  const pair = s.bestPair && state.players.length > 2 ? s.bestPair.ids.map((id) => byId[id]?.name).filter(Boolean) : null;
  return (
    <>
      <section className="layer">
        <div className="inner">
          <div className="sync-num">{s.sync}%</div>
          <h2 style={{ margin: "6px 0 4px", fontSize: 30 }}>{s.title}</h2>
          <p style={{ margin: 0 }}>
            {plural(s.melds, "round")} where everyone matched, {plural(s.partial, "round")} with a partial match,
            {" "}{plural(state.score, "point")} in total{s.bestStreak >= 2 ? `, best streak ${s.bestStreak}` : ""}.
          </p>
          {pair && pair.length === 2 && (
            <p style={{ margin: "8px 0 0" }}>
              Most in sync: <b style={{ color: "var(--gold)" }}>{pair[0]} and {pair[1]}</b>, with {plural(s.bestPair!.hits, "match", )}.
            </p>
          )}
        </div>
      </section>

      <section className="layer">
        <div className="inner">
          <h2>Every round</h2>
          <ul className="history">
            {s.history.map((h) => (
              <li key={h.round}>
                <span className={`mark r-${h.result}`} title={VERDICT[h.result as keyof typeof VERDICT]} />
                <span>
                  <b>{h.prompt.replace("____", "…")}</b>
                  <br />
                  <span className="muted small">
                    {Object.entries(h.answers).map(([n, a]) => `${n}: ${a ?? "no answer"}`).join("; ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="layer">
        <div className="inner row">
          {isHost ? (
            <>
              <button className="btn btn-gold btn-big" onClick={() => send({ type: "start" })}>Play again</button>
              <button className="btn" onClick={() => send({ type: "lobby" })}>Change word pack</button>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>The host can start another game.</p>
          )}
        </div>
      </section>
    </>
  );
}
