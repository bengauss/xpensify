import { useState, useRef, useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { animate } from "motion";
import { login } from "@/lib/auth";
import { durations, getReducedMotionOverride } from "@/lib/animations";
import { usePressScale } from "@/lib/usePressScale";

export default function LoginScreen() {
  const { route } = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const submitPress = usePressScale<HTMLButtonElement>(0.97);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  // First-impression fade-up. Default hidden state lives in CSS
  // ([data-login-card]) so Preact re-renders can't clobber opacity back to 0.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (animate as any)(
      el,
      { opacity: [0, 1], y: [10, 0] },
      { ...durations.soft, ...getReducedMotionOverride() },
    );
    el.setAttribute("data-revealed", "1");
  }, []);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      route("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("password")
        ? "invalid username or password"
        : msg.toLowerCase() || "invalid username or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        paddingLeft: 20,
        paddingRight: 20,
        backgroundColor: "#0c0d12",
      }}
    >
      <div
        ref={cardRef}
        data-login-card
        style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        {/* Logo + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
            <g transform="translate(512 512)">
              <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(45)" fill="#8aafff" />
              <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(135)" fill="#6c9cff" />
              <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(225)" fill="#4a7ee8" />
              <rect x="72" y="-78" width="400" height="156" rx="78" transform="rotate(315)" fill="#5a8def" />
            </g>
          </svg>
          <span style={{ color: "#6c9cff", fontSize: 24, fontWeight: 600, letterSpacing: 0.2 }}>
            xpensify
          </span>
        </div>

        {/* Subtitle */}
        <p
          style={{
            marginTop: 8,
            marginBottom: 32,
            fontSize: 14,
            color: "#8e8e93",
            whiteSpace: "nowrap",
          }}
        >
          sign in to continue
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column" }}>
          <LoginField
            ref={userRef}
            label="username"
            type="text"
            value={username}
            onInput={(v) => setUsername(v)}
            autocomplete="username"
          />

          <div style={{ height: 16 }} />

          <LoginField
            label="password"
            type="password"
            value={password}
            onInput={(v) => setPassword(v)}
            autocomplete="current-password"
          />

          <button
            ref={submitPress.ref}
            type="submit"
            disabled={loading}
            onPointerDown={submitPress.onPointerDown}
            onPointerUp={submitPress.onPointerUp}
            onPointerCancel={submitPress.onPointerCancel}
            style={{
              marginTop: 24,
              height: 48,
              borderRadius: 12,
              backgroundColor: "#6c9cff",
              color: "white",
              fontSize: 14,
              fontWeight: 500,
              border: 0,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "opacity 150ms ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {loading ? "signing in..." : "sign in"}
          </button>

          {error && (
            <p
              style={{
                marginTop: 16,
                fontSize: 13,
                color: "#ff375f",
                textAlign: "center",
              }}
            >
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

// ── Labeled input ────────────────────────────────────────────────────────────

import { forwardRef } from "preact/compat";

interface LoginFieldProps {
  label: string;
  type: "text" | "password";
  value: string;
  onInput: (v: string) => void;
  autocomplete: string;
}

const LoginField = forwardRef<HTMLInputElement, LoginFieldProps>(function LoginField(
  { label, type, value, onInput, autocomplete },
  ref
) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, color: "#8e8e93" }}>{label}</label>
      <input
        ref={ref}
        type={type}
        value={value}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autocomplete={autocomplete}
        required
        class="placeholder:text-[#3a3a42]"
        placeholder={label}
        style={{
          width: "100%",
          height: 48,
          boxSizing: "border-box",
          padding: "0 16px",
          fontSize: 16,
          color: "#c8c8d0",
          backgroundColor: "rgba(255,255,255,0.04)",
          border: `1px solid ${focused ? "#6c9cff" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 12,
          outline: "none",
          boxShadow: focused ? "0 0 0 2px rgba(108,156,255,0.2)" : "none",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
        }}
      />
    </div>
  );
});
