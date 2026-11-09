/**
 * The garden bed: one flower per player, roots in the soil, and the threads
 * (a fungal network) that join their roots. It mirrors the game state:
 *   thinking → buds, faint threads        locked → bud tinted with your colour
 *   reveal   → everyone blooms; matched players' roots glow gold, the rest go grey
 *   away     → wilted
 */
export type Mood = "idle" | "thinking" | "reveal";

export type Plant = {
  id: string;
  name: string;
  color: string;
  locked?: boolean;
  away?: boolean;
};

const W = 480;
const H = 150;
const GROUND = 78;
const ROOT_TIP = 112;

function stemHeight(i: number) {
  return 22 + ((i * 7) % 4) * 3;
}

function Flower({ x, i, p, mood }: { x: number; i: number; p: Plant; mood: Mood }) {
  const h = stemHeight(i);
  const top = GROUND - h;
  if (p.away) {
    // drooping, grey
    return (
      <g className="wilt">
        <rect x={x} y={GROUND - 14} width={2} height={14} />
        <rect x={x + 2} y={GROUND - 16} width={4} height={2} />
        <rect x={x + 6} y={GROUND - 14} width={2} height={4} />
        <rect x={x + 5} y={GROUND - 10} width={4} height={3} />
      </g>
    );
  }
  const bloom = mood === "idle" || mood === "reveal";
  return (
    <g>
      <rect x={x} y={top} width={2} height={h} className="stem" />
      <rect x={x - 4} y={top + h * 0.45} width={4} height={2} className="leaf" />
      <rect x={x - 6} y={top + h * 0.45 - 2} width={3} height={2} className="leaf" />
      <rect x={x + 2} y={top + h * 0.65} width={4} height={2} className="leaf" />
      <rect x={x + 5} y={top + h * 0.65 - 2} width={3} height={2} className="leaf" />
      {bloom ? (
        <g>
          <rect x={x - 3} y={top - 9} width={8} height={4} fill={p.color} />
          <rect x={x - 5} y={top - 7} width={12} height={6} fill={p.color} />
          <rect x={x - 3} y={top - 3} width={8} height={4} fill={p.color} />
          <rect x={x - 1} y={top - 7} width={4} height={4} className="pistil" />
        </g>
      ) : (
        <g>
          <rect x={x - 2} y={top - 8} width={6} height={8} className="bud" />
          <rect x={x - 1} y={top - 10} width={4} height={2} className="bud" />
          {p.locked && <rect x={x - 1} y={top - 10} width={4} height={4} fill={p.color} />}
        </g>
      )}
      {/* roots */}
      <rect x={x} y={GROUND + 4} width={2} height={ROOT_TIP - GROUND - 4} className="root" />
      <rect x={x - 4} y={GROUND + 14} width={4} height={2} className="root" />
      <rect x={x - 6} y={GROUND + 16} width={2} height={6} className="root" />
      <rect x={x + 2} y={GROUND + 22} width={5} height={2} className="root" />
      <rect x={x + 7} y={GROUND + 24} width={2} height={5} className="root" />
    </g>
  );
}

export default function Garden({
  plants,
  mood = "idle",
  links = [],
}: {
  plants: Plant[];
  mood?: Mood;
  /** pairs of plant ids whose answers matched (reveal only) */
  links?: [string, string][];
}) {
  const n = Math.max(plants.length, 1);
  const span = Math.min(240, 70 * (n - 1)); // stays inside what a phone shows
  const xs = plants.map((_, i) => Math.round(W / 2 - span / 2 + (n === 1 ? 0 : (span * i) / (n - 1))));
  const pos = Object.fromEntries(plants.map((p, i) => [p.id, xs[i]]));

  // Faint threads between neighbours always; gold ones for matches at reveal.
  const neighbours: [number, number][] = xs.slice(1).map((x, i) => [xs[i], x]);
  const gold = links.filter(([a, b]) => a in pos && b in pos).map(([a, b]) => [pos[a], pos[b]] as [number, number]);

  const thread = (a: number, b: number, depth: number) =>
    `M${a + 1} ${ROOT_TIP} C ${a + 1} ${ROOT_TIP + depth}, ${b + 1} ${ROOT_TIP + depth}, ${b + 1} ${ROOT_TIP}`;

  return (
    <svg className={`garden mood-${mood}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9bb6ff" />
          <stop offset="1" stopColor="#ffd6dc" />
        </linearGradient>
      </defs>
      <rect width={W} height={GROUND} fill="url(#sky)" />
      {/* clouds */}
      <g className="cloud">
        <rect x={70} y={18} width={28} height={6} />
        <rect x={76} y={14} width={14} height={4} />
        <rect x={362} y={28} width={34} height={6} />
        <rect x={370} y={24} width={16} height={4} />
      </g>
      <rect x={300} y={12} width={10} height={10} className="sun" />

      {/* ground + soil strata */}
      <rect x={0} y={GROUND} width={W} height={H - GROUND} className="soil" />
      <rect x={0} y={GROUND + 30} width={W} height={H - GROUND - 30} className="soil-2" />
      <rect x={0} y={GROUND} width={W} height={3} className="grass" />
      {Array.from({ length: 40 }, (_, i) => (
        <rect key={i} x={(i * 47) % W} y={GROUND - 2 - (i % 2)} width={1} height={2 + (i % 2)} className="grass" />
      ))}
      {Array.from({ length: 26 }, (_, i) => (
        <rect key={`p${i}`} x={(i * 73 + 11) % W} y={GROUND + 8 + ((i * 29) % 60)} width={2 + (i % 2)} height={2} className="pebble" />
      ))}

      {/* the network */}
      {neighbours.map(([a, b], i) => (
        <path key={`n${i}`} d={thread(a, b, 22)} className="thread" />
      ))}
      {gold.map(([a, b], i) => (
        <g key={`g${i}`}>
          <path d={thread(a, b, 26 + i * 4)} className="thread-gold" />
          {[0.2, 0.5, 0.8].map((t) => (
            <rect key={t} x={a + (b - a) * t} y={ROOT_TIP + 17 + i * 3} width={2} height={2} className="spore" style={{ animationDelay: `${t}s` }} />
          ))}
        </g>
      ))}

      {plants.map((p, i) => (
        <Flower key={p.id} x={xs[i]} i={i} p={p} mood={mood} />
      ))}
      {plants.map((p, i) => (
        <text key={`t${p.id}`} x={xs[i] + 1} y={GROUND - stemHeight(i) - 14} className="plant-name" textAnchor="middle">
          {p.name}
        </text>
      ))}
    </svg>
  );
}
