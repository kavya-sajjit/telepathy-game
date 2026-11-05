"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Skyline from "@/components/Skyline";
import Stations, { FALLBACK_PACKS } from "@/components/Stations";
import { createRoom, fetchPacks, PackMeta, roomExists } from "@/lib/api";
import { savedName, saveName } from "@/lib/identity";
import { useClientValue } from "@/lib/useClientValue";

export default function Home() {
  const router = useRouter();
  const stored = useClientValue(savedName, "");
  const [typed, setName] = useState<string | null>(null);
  const name = typed ?? stored;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"make" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packs, setPacks] = useState<PackMeta[]>(FALLBACK_PACKS);
  const [server, setServer] = useState<"waking" | "up" | "down">("waking");

  useEffect(() => {
    let alive = true;
    let tries = 0;
    const poke = () =>
      fetchPacks()
        .then((p) => alive && (setPacks(p), setServer("up")))
        .catch(() => {
          tries += 1;
          if (!alive) return;
          if (tries > 8) setServer("down");
          else setTimeout(poke, 4000);
        });
    poke();
    return () => {
      alive = false;
    };
  }, []);

  const ready = name.trim().length > 0;

  async function make() {
    if (!ready) return setError("Pick a name first, so your friends know who's who.");
    setBusy("make");
    setError(null);
    try {
      saveName(name);
      const c = await createRoom();
      router.push(`/room/${c}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return setError("Pick a name first, so your friends know who's who.");
    const c = code.trim().toUpperCase();
    if (c.length !== 4) return setError("Room codes are 4 letters.");
    setBusy("join");
    setError(null);
    try {
      if (!(await roomExists(c))) throw new Error(`No room called ${c}. Check the code with whoever made it.`);
      saveName(name);
      router.push(`/room/${c}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <main>
      <div className="scene">
        <Skyline signal={server === "up" ? "idle" : "thinking"} />
        <div className="scene-top">
          <h1 className="logo">Telepathy</h1>
          <span className="small muted" role="status">
            {server === "up" ? "tower online" : server === "waking" ? "waking the tower…" : "tower offline"}
          </span>
        </div>
      </div>

      <div className="wrap console">
        <div className="note" style={{ marginBottom: 22 }}>
          <p style={{ margin: 0, fontSize: 24 }}>
            Everyone sees half a word, like <b>break ____</b>. You each secretly finish it.
            If you all write <b>dance</b>, that&apos;s telepathy.
          </p>
        </div>

        <section className="panel" aria-labelledby="go">
          <h2 id="go">Get a room</h2>
          <label className="lbl" htmlFor="name">Your name</label>
          <input
            id="name"
            className="field"
            maxLength={16}
            autoComplete="nickname"
            placeholder="e.g. Kavya"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn-go" onClick={make} disabled={busy !== null}>
              {busy === "make" ? "Opening…" : "Start a room"}
            </button>
            <span className="muted">or</span>
            <form onSubmit={join} className="row">
              <input
                aria-label="Room code"
                className="field field-code"
                maxLength={4}
                placeholder="CODE"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, "").toUpperCase())}
              />
              <button className="btn" disabled={busy !== null}>
                {busy === "join" ? "Joining…" : "Join"}
              </button>
            </form>
          </div>
          {error && <p role="alert" style={{ color: "var(--sunset)", marginBottom: 0 }}>{error}</p>}
          {server === "down" && (
            <p className="muted small" style={{ marginBottom: 0 }}>
              The game server isn&apos;t answering. If it&apos;s on a free host it may be asleep. Give it a minute and refresh.
            </p>
          )}
        </section>

        <section className="panel" aria-labelledby="how">
          <h2 id="how">How a round goes</h2>
          <ol className="steps">
            <li><span>Everyone in the room sees the same half, say <b>make ____</b></span></li>
            <li><span>Each of you locks in an ending without talking. Sense? Up? A wish?</span></li>
            <li>Reveal. Everyone matching is a meld (3 pts). A pair matching is 1 pt.</li>
            <li>Syncing on a rarer answer earns a deep-cut bonus. Three melds in a row starts a streak.</li>
          </ol>
          <p className="muted small" style={{ marginBottom: 0 }}>Best with 2–3 people, room for 6. Send friends the room code or link.</p>
        </section>

        <section className="panel" aria-labelledby="st">
          <h2 id="st">On the dial</h2>
          <Stations packs={packs} readOnly />
        </section>
      </div>
    </main>
  );
}
