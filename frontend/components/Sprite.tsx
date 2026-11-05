// A tiny pixel flower in the player's colour, used next to names.
const MAP = [
  "..pp.pp..",
  ".ppppppp.",
  ".ppcccpp.",
  "pppcccppp",
  ".ppcccpp.",
  ".ppppppp.",
  "..pp.pp..",
  "....s....",
  "...ls....",
];

export default function Sprite({ color, size = 20, dim = false }: { color: string; size?: number; dim?: boolean }) {
  const fill: Record<string, string> = { p: dim ? "#8b7b6c" : color, c: "#3b2416", s: "#5f9b4a", l: "#7cc06a" };
  return (
    <svg className="sprite" width={size} height={size} viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
      {MAP.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill[ch]} />)),
      )}
    </svg>
  );
}
