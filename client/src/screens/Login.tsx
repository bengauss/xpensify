import { useState, useRef, useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import { login } from "@/lib/auth";

export function LoginScreen() {
  const { route } = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userRef.current?.focus();
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
        padding: 20,
        backgroundColor: "#0c0d12",
      }}
    >
      <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Logo + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="1" y="1" width="22" height="22" rx="6" fill="none" stroke="#6c9cff" stroke-width="1.5" />
            <path d="M8 8L16 16M16 8L8 16" stroke="#6c9cff" stroke-width="1.75" stroke-linecap="round" />
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
            type="submit"
            disabled={loading}
            onPointerDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)"; }}
            onPointerUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; }}
            onPointerLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ""; }}
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
              transition: "transform 120ms ease, opacity 150ms ease",
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
