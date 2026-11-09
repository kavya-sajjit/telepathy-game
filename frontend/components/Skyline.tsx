/**
 * Pixel city at dusk with two rooftop radio towers. The signal between them is the
 * game's heartbeat: idle pulse while thinking, mint lock on a match, pink static on a miss.
 * Everything is generated from a fixed seed so server and client render identically.
 */
export type Signal = "idle" | "thinking" | "meld" | "partial" | "static";

const W = 480;
const H = 132;
const GROUND = 118;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

type Bldg = { x: number; w: number; h: number; tone: number; wins: { x: number; y: number; lit: boolean; tw: boolean }[]; flowers: number[] };

function city(): { back: Bldg[]; front: Bldg[] } {
  const r = rng(42);
  const make = (minH: number, maxH: number, tone: number, avoid: [number, number][]) => {
    const out: Bldg[] = [];
    let x = -4;
    while (x < W) {
      const w = 14 + Math.floor(r() * 22);
      const h = minH + Math.floor(r() * (maxH - minH));
      const blocked = avoid.some(([a, b]) => x + w > a && x < b);
      if (!blocked) {
        const wins: Bldg["wins"] = [];
        for (let wy = GROUND - h + 5; wy < GROUND - 4; wy += 5) {
          for (let wx = x + 3; wx < x + w - 3; wx += 4) {
            const lit = r() < 0.42;
            wins.push({ x: wx, y: wy, lit, tw: lit && r() < 0.06 });
          }
        }
        // Flower boxes on a few lower windows (a little garden in every city).
        const flowers = tone === 1 && r() < 0.5 ? [x + 3 + Math.floor(r() * Math.max(1, w - 9))] : [];
        out.push({ x, w, h, tone, wins, flowers });
      }
      x += w + (tone === 1 && r() < 0.3 ? 2 : 0);
    }
    return out;
  };
  const towers: [number, number][] = [[148, 182], [292, 326]];
  return { back: make(40, 84, 0, []), front: make(18, 52, 1, towers) };
}

const { back, front } = city();
const TOWER_L = { x: 152, w: 28, h: 74 };
const TOWER_R = { x: 296, w: 28, h: 80 };

function Tower({ x, w, h, side }: { x: number; w: number; h: number; side: "l" | "r" }) {
  const top = GROUND - h;
  const mid = x + w / 2;
  const wins = [];
  for (let y = top + 6; y < GROUND - 6; y += 6) {
    for (let wx = x + 4; wx < x + w - 4; wx += 5) {
      wins.push(<rect key={`${wx}-${y}`} x={wx} y={y} width={2} height={3} className={(wx + y) % 3 ? "win lit" : "win"} />);
    }
  }
  return (
    <g>
      <rect x={x} y={top} width={w} height={h} className="tower" />
      <rect x={x - 1} y={top} width={w + 2} height={2} className="tower-cap" />
      {wins}
      {/* antenna */}
      <rect x={mid - 0.5} y={top - 16} width={1} height={16} className="mast" />
      <rect x={mid - 3} y={top - 10} width={6} height={1} className="mast" />
      <rect x={mid - 2} y={top - 6} width={4} height={1} className="mast" />
      <rect x={mid - 1} y={top - 18} width={2} height={2} className={`beacon beacon-${side}`} />
    </g>
  );
}

export default function Skyline({ signal = "idle" }: { signal?: Signal }) {
  const ly = GROUND - TOWER_L.h - 17;
  const ry = GROUND - TOWER_R.h - 17;
  const lx = TOWER_L.x + TOWER_L.w / 2;
  const rx = TOWER_R.x + TOWER_R.w / 2;
  // Square-wave path between the antennas, drawn on whole pixels.
  const pts: string[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(lx + (rx - lx) * t);
    const base = Math.round(ly + (ry - ly) * t - Math.sin(Math.PI * t) * 9);
    const amp = signal === "meld" ? 0 : signal === "static" ? ((i * 7) % 5) - 2 : i % 2 ? -2 : 2;
    pts.push(`${x},${base + amp}`);
  }

  return (
    <svg className={`skyline sig-${signal}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="dusk" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a1d52" />
          <stop offset="0.55" stopColor="#5b2a6e" />
          <stop offset="0.82" stopColor="#c2477a" />
          <stop offset="1" stopColor="#ff9f6b" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#dusk)" />
      {/* stars */}
      {Array.from({ length: 40 }, (_, i) => (
        <rect key={i} x={(i * 53) % W} y={(i * 29) % 46} width={1} height={1} className={i % 5 ? "star" : "star tw"} />
      ))}
      <rect x={110} y={16} width={8} height={8} className="moon" />
      <rect x={109} y={17} width={10} height={6} className="moon" />
      {back.map((b, i) => (
        <rect key={i} x={b.x} y={GROUND - b.h} width={b.w} height={b.h} className="bldg-back" />
      ))}
      <polyline points={pts.join(" ")} className="signal" />
      <Tower {...TOWER_L} side="l" />
      <Tower {...TOWER_R} side="r" />
      {front.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={GROUND - b.h} width={b.w} height={b.h} className="bldg" />
          {b.wins.map((w, j) => (
            <rect key={j} x={w.x} y={w.y} width={2} height={2} className={`win${w.lit ? " lit" : ""}${w.tw ? " tw" : ""}`} />
          ))}
          {b.flowers.map((fx) => (
            <g key={fx} transform={`translate(${fx} ${GROUND - 9})`}>
              <rect x={0} y={3} width={6} height={2} className="planter" />
              <rect x={1} y={1} width={1} height={2} className="stem" />
              <rect x={4} y={1} width={1} height={2} className="stem" />
              <rect x={0} y={0} width={2} height={1} className="petal-a" />
              <rect x={3} y={0} width={2} height={1} className="petal-b" />
            </g>
          ))}
        </g>
      ))}
      <rect x={0} y={GROUND} width={W} height={H - GROUND} className="street" />
      {Array.from({ length: 30 }, (_, i) => (
        <rect key={i} x={i * 17 + 3} y={GROUND + 7} width={8} height={1} className="lane" />
      ))}
    </svg>
  );
}
