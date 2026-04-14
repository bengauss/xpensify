import { useState, useEffect, useRef } from "preact/hooks";
import { db } from "@/db/local";

interface NoteInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function NoteInput({ value, onChange }: NoteInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const lower = value.toLowerCase();

    // Debounce: wait 200ms before querying.
    // Only scan the last 90 days — autocomplete cares about recent notes, and
    // the timestamp index lets Dexie skip the rest of the table.
    const timer = setTimeout(() => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      db.expenses
        .where("timestamp")
        .above(ninetyDaysAgo)
        .toArray()
        .then((expenses) => {
          if (cancelled) return;
          const freq = new Map<string, number>();
          for (const exp of expenses) {
            if (exp.deleted) continue;
            if (exp.note && exp.note.trim()) {
              const n = exp.note.trim();
              freq.set(n, (freq.get(n) || 0) + 1);
            }
          }
          const matches = [...freq.entries()]
            .filter(([n]) => n.toLowerCase().startsWith(lower) && n.toLowerCase() !== lower)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([n]) => n);
          setSuggestions(matches);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  return (
    <div class="flex flex-col gap-2">
      {suggestions.length > 0 && (
        <div class="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                setSuggestions([]);
                inputRef.current?.focus();
              }}
              class="rounded-full bg-accent/10 border border-accent/20 px-3 py-1 text-xs text-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="add a note..."
        class="w-full bg-transparent outline-none border-0 text-sm font-normal placeholder:text-[#2a2a32] py-1"
        style={{
          color: "#4a4a52",
          caretColor: "var(--color-accent)",
          borderBottom: `0.5px solid ${focused ? "rgba(255,255,255,0.06)" : "transparent"}`,
        }}
      />
    </div>
  );
}
