import { useState, useEffect, useRef } from "preact/hooks";
import { db } from "@/db/local";

interface NoteInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function NoteInput({ value, onChange }: NoteInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const lower = value.toLowerCase();

    // Debounce: wait 200ms before querying
    const timer = setTimeout(() => {
      db.expenses.toArray().then((expenses) => {
        if (cancelled) return;
        // Count note frequencies
        const freq = new Map<string, number>();
        for (const exp of expenses) {
          if (exp.note && exp.note.trim()) {
            const n = exp.note.trim();
            freq.set(n, (freq.get(n) || 0) + 1);
          }
        }
        // Filter by prefix match, sort by frequency desc, take top 5
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
      <input
        ref={inputRef}
        type="text"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        placeholder="add a note..."
        class="w-full rounded-lg bg-bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-hint outline-none border border-text-ghost/20"
      />
      {suggestions.length > 0 && (
        <div class="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                setSuggestions([]);
              }}
              class="rounded-full bg-accent/10 border border-accent/20 px-3 py-1 text-xs text-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
