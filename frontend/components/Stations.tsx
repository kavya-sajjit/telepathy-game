"use client";

import { PackMeta } from "@/lib/api";

// Shown before the server answers (or while it's asleep) so the shelf is never empty.
export const FALLBACK_PACKS: PackMeta[] = [
  { id: "front", group: "Compounds", title: "Front Halves", tagline: "", example: ["sun ____", "flower, shine, set"], count: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 } },
  { id: "back", group: "Compounds", title: "Back Halves", tagline: "", example: ["____ ball", "foot, snow, eye"], count: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 } },
  { id: "phrases", group: "Phrases", title: "Verb Phrases", tagline: "", example: ["make ____", "sense, up, a wish"], count: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 } },
  { id: "idioms", group: "Idioms", title: "Idioms", tagline: "", example: ["under the ____", "weather, radar, table"], count: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 } },
  { id: "mix", group: "Shuffle", title: "Mixed Bag", tagline: "", example: ["anything ____", "all four packs"], count: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 } },
];

const HUE: Record<string, string> = {
  front: "#ff7d9c",
  back: "#7fd0f5",
  phrases: "#ffcf4a",
  idioms: "#b99bff",
  mix: "#93dc84",
};

const tidy = (s: string) => s.replace(/ · /g, ", ");

/** Word packs drawn as seed packets. */
export default function SeedPackets({
  packs,
  value,
  onPick,
  readOnly = false,
}: {
  packs: PackMeta[];
  value?: string;
  onPick?: (id: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="packets" role={readOnly ? undefined : "radiogroup"} aria-label="Word pack">
      {packs.map((p) => {
        const Tag = readOnly ? "div" : "button";
        return (
          <Tag
            key={p.id}
            {...(readOnly ? {} : { type: "button" as const, role: "radio", "aria-checked": value === p.id, onClick: () => onPick?.(p.id) })}
            className={`packet${value === p.id ? " planted" : ""}`}
            style={{ "--hue": HUE[p.id] ?? "#ddd" } as React.CSSProperties}
          >
            <span className="packet-fold" />
            <span className="packet-name">{p.title}</span>
            <span className="packet-eg">{p.example[0]}</span>
            <span className="packet-ans">{tidy(p.example[1])}</span>
            {p.count > 0 && <span className="packet-count">{p.count} prompts</span>}
          </Tag>
        );
      })}
    </div>
  );
}
