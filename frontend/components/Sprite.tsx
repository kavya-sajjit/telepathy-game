// 11x11 pixel person tinted in the player's colour.
const MAP = [
  "...hhhhh...",
  "..hhhhhhh..",
  "..hsssssh..",
  "..ssesess..",
  "..sssssss..",
  "...sssss...",
  "..ccccccc..",
  ".ccccccccc.",
  ".scccccccs.",
  "...cc.cc...",
  "...pp.pp...",
];

export default function Sprite({ color, size = 22, dim = false }: { color: string; size?: number; dim?: boolean }) {
  const fill: Record<string, string> = { h: "#3b2416", s: "#ffd2a8", e: "#1c1433", c: color, p: "#2b1f52" };
  return (
    <svg className="sprite" width={size} height={size} viewBox="0 0 11 11" shapeRendering="crispEdges" style={{ opacity: dim ? 0.45 : 1 }} aria-hidden="true">
      {MAP.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill[ch]} />)),
      )}
    </svg>
  );
}
