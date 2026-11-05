"use client";

import { PackMeta } from "@/lib/api";

// Shown before the server answers (or if it's asleep) so the dial is never empty.
export const FALLBACK_PACKS: PackMeta[] = [
  { id: "front", group: "Compounds", title: "Front Halves", tagline: "", example: ["sun ____", "flower · shine · set"], count: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 } },
  { id: "back", group: "Compounds", title: "Back Halves", tagline: "", example: ["____ ball", "foot · snow · eye"], count: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 } },
  { id: "phrases", group: "Phrases", title: "Verb Phrases", tagline: "", example: ["make ____", "sense · up · a wish"], count: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 } },
  { id: "idioms", group: "Idioms", title: "Idioms", tagline: "", example: ["under the ____", "weather · radar · table"], count: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 } },
  { id: "mix", group: "Shuffle", title: "Mixtape", tagline: "", example: ["??? ____", "a bit of everything"], count: 0, byDifficulty: { easy: 0, medium: 0, hard: 0 } },
];

const FREQ: Record<string, string> = { front: "88.1", back: "91.4", phrases: "96.7", idioms: "101.3", mix: "107.9" };

export default function Stations({
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
    <div className="dial" role="group" aria-label="Word pack">
      {packs.map((p) => (
        <button
          key={p.id}
          type="button"
          className="station"
          aria-pressed={value === p.id}
          disabled={readOnly}
          onClick={() => onPick?.(p.id)}
        >
          <span className="freq">{FREQ[p.id] ?? "99.9"} FM{p.count ? ` · ${p.count} prompts` : ""}</span>
          <span className="name">{p.title}</span>
          <span className="eg">
            {p.example[0]} <span aria-hidden="true">→</span> {p.example[1]}
          </span>
        </button>
      ))}
    </div>
  );
}
