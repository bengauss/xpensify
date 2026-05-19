import { useState, useRef, useEffect } from "preact/hooks";
import { currentUser, isSessionExpired, login, logout } from "@/lib/auth";
import { usePressScale } from "@/lib/usePressScale";
import { animate } from "motion";
import { durations, getReducedMotionOverride } from "@/lib/animations";

export function ReauthOverlay() {
  const expired = isSessionExpired.value;
  if (!expired || !currentUser.value) return null;

  const user = currentUser.value;
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pwdRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const submitPress = usePressScale<HTMLButtonElement>(0.97);

  useEffect(() => {
    if (expired) {
      pwdRef.current?.focus();
    }
  }, [expired]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !expired) return;
    (animate as any)(
      el,
      { opacity: [0, 1], y: [10, 0] },
      { ...durations.soft, ...getReducedMotionOverride() },
    );
  }, [expired]);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await login(user.username, password);
      setPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("password")
          ? "invalid password"
          : msg.toLowerCase() || "invalid password"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backgroundColor: "rgba(12, 13, 18, 0.8)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div
        ref={cardRef}
        style={{
          width: "100%",
          maxWidth: 320,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* User avatar/initial circle badge */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            backgroundColor: user.avatar_color || "#6c9cff",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            marginBottom: 16,
          }}
        >
          {user.display_name ? user.display_name.slice(0, 1).toUpperCase() : user.username.slice(0, 1).toUpperCase()}
        </div>

        <span style={{ color: "#c8c8d0", fontSize: 20, fontWeight: 600, letterSpacing: 0.1 }}>
          {user.display_name || user.username}
        </span>

        <p
          style={{
            marginTop: 6,
            marginBottom: 32,
            fontSize: 14,
            color: "#8e8e93",
          }}
        >
          your session has expired
        </p>

        <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, color: "#8e8e93" }}>password</label>
            <input
              ref={pwdRef}
              type="password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              autocomplete="current-password"
              required
              class="placeholder:text-[#3a3a42]"
              placeholder="password"
              style={{
                width: "100%",
                height: 48,
                boxSizing: "border-box",
                padding: "0 16px",
                fontSize: 16,
                color: "#c8c8d0",
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                outline: "none",
                transition: "border-color 120ms ease, box-shadow 120ms ease",
              }}
              onFocus={(e) => {
                const target = e.target as HTMLInputElement;
                target.style.borderColor = "#6c9cff";
                target.style.boxShadow = "0 0 0 2px rgba(108,156,255,0.2)";
              }}
              onBlur={(e) => {
                const target = e.target as HTMLInputElement;
                target.style.borderColor = "rgba(255,255,255,0.08)";
                target.style.boxShadow = "none";
              }}
            />
          </div>

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
            {loading ? "unlocking..." : "unlock"}
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

        <button
          type="button"
          onClick={() => logout()}
          style={{
            background: "none",
            border: "none",
            color: "#ff375f",
            fontSize: 13,
            fontWeight: 500,
            marginTop: 24,
            cursor: "pointer",
            textDecoration: "none",
          }}
        >
          sign out / switch user
        </button>
      </div>
    </div>
  );
}
