"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Garden from "@/components/Garden";
import SeedPackets, { FALLBACK_PACKS } from "@/components/Stations";
import { createRoom, fetchPacks, PackMeta, roomExists } from "@/lib/api";
import { savedName, saveName } from "@/lib/identity";
import { useClientValue } from "@/lib/useClientValue";

const DEMO = [
  { id: "a", name: "you", color: "#ff7d9c" },
  { id: "b", name: "a friend", color: "#ffcf4a" },
  { id: "c", name: "another", color: "#7fd0f5" },
];

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
    if (!ready) return setError("Add your name first so your friends know which flower is you.");
    setBusy("make");
    setError(null);
    try {
      saveName(name);
      router.push(`/room/${await createRoom()}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return setError("Add your name first so your friends know which flower is you.");
    const c = code.trim().toUpperCase();
    if (c.length !== 4) return setError("Room codes are 4 letters.");
    setBusy("join");
    setError(null);
    try {
      if (!(await roomExists(c))) throw new Error(`There's no room ${c}. Check the code with whoever made it.`);
      saveName(name);
      router.push(`/room/${c}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <main>
      <div className="garden-wrap">
        <Garden plants={DEMO} mood="reveal" links={[["a", "b"], ["b", "c"]]} />
        <div className="garden-bar">
          <h1 className="wordmark-big">Telepathy</h1>
        </div>
      </div>

      <section className="layer">
        <div className="inner stack">
          <p className="lede">
            Everyone sees half a word, like <b>break ____</b>. You each finish it in secret.
            When your answers match, your roots light up.
          </p>
          <div>
            <label className="lbl" htmlFor="name">Your name</label>
            <input id="name" className="field" maxLength={16} autoComplete="nickname" placeholder="Kavya" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="row" style={{ gap: 16 }}>
            <button className="btn btn-gold btn-big" onClick={make} disabled={busy !== null}>
              {busy === "make" ? "Making a room…" : "Make a room"}
            </button>
            <form onSubmit={join} className="row" style={{ gap: 8 }}>
              <input aria-label="Room code" className="field field-code" maxLength={4} placeholder="code" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, "").toUpperCase())} />
              <button className="btn" disabled={busy !== null}>{busy === "join" ? "Joining…" : "Join"}</button>
            </form>
          </div>
          {error && <p role="alert" style={{ color: "var(--petal)", margin: 0 }}>{error}</p>}
          {server !== "up" && (
            <p className="muted small" role="status" style={{ margin: 0 }}>
              {server === "waking"
                ? "Waking up the game server. On a free host this can take up to a minute."
                : "The game server isn't answering. Give it a minute and refresh."}
            </p>
          )}
        </div>
      </section>

      <section className="layer">
        <div className="inner">
          <h2>How a round works</h2>
          <ol className="steps">
            <li>Everyone in the room sees the same half: <b>make ____</b></li>
            <li>Each of you locks in an ending without talking. Sense? Up? A wish?</li>
            <li>If everyone matches you score 3 points. Each matching pair scores 1.</li>
            <li>Matching on a less obvious answer earns a bonus point. So do streaks of three.</li>
          </ol>
          <p className="muted small" style={{ marginBottom: 0 }}>Best with 2 or 3 people. A room holds up to 6.</p>
        </div>
      </section>

      <section className="layer">
        <div className="inner">
          <h2>Word packs</h2>
          <SeedPackets packs={packs} readOnly />
        </div>
      </section>
    </main>
  );
}
