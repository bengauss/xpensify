import { useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { login } from "@/lib/auth";

export function LoginScreen() {
  const { route } = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      route("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="flex min-h-dvh items-center justify-center bg-bg-primary px-6">
      <div class="w-full max-w-sm rounded-2xl bg-bg-surface p-6 sm:p-8 flex flex-col gap-6">
        <div class="text-center">
          <h1 class="text-3xl font-light text-accent tracking-wide">xpensify</h1>
          <p class="mt-2 text-sm text-text-secondary">sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} class="flex flex-col gap-5">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-text-secondary uppercase tracking-wider">username</label>
            <input
              type="text"
              value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
              autocomplete="username"
              required
              class="rounded-xl bg-bg-primary border border-text-muted px-4 py-3.5 text-base text-text-primary outline-none focus:border-accent transition-colors"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-text-secondary uppercase tracking-wider">password</label>
            <input
              type="password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              autocomplete="current-password"
              required
              class="rounded-xl bg-bg-primary border border-text-muted px-4 py-3.5 text-base text-text-primary outline-none focus:border-accent transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            class="mt-2 rounded-xl bg-accent px-4 py-3.5 text-base font-medium text-bg-primary transition-opacity disabled:opacity-50 hover:opacity-90"
          >
            {loading ? "signing in…" : "sign in"}
          </button>

          {error && (
            <p class="text-sm text-[var(--color-danger)] text-center">{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
