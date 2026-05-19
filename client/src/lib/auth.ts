import { signal } from "@preact/signals";
import { api } from "@/lib/api";
import { db } from "@/db/local";

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
}

const USER_CACHE_KEY = "xpensify_user";

// Cache the display profile so offline cold-starts can render the app shell
// and stamp user_id on new expenses without a network call. The HttpOnly
// session cookie remains the actual credential — this is rendering metadata.
function loadCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function setUser(user: User | null): void {
  currentUser.value = user;
  if (user) {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_CACHE_KEY);
  }
}

export const currentUser = signal<User | null>(loadCachedUser());
export const isSessionExpired = signal<boolean>(false);

export async function login(username: string, password: string): Promise<void> {
  const res = await api.api.auth.login.$post({ json: { username, password } });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Login failed");
  }

  const user = await res.json() as User;
  setUser(user);
  isSessionExpired.value = false;
}

export async function logout(): Promise<void> {
  try {
    await api.api.auth.logout.$post();
  } catch {
    // Network failure — still wipe local state so another user can't reuse the device
  }
  setUser(null);
  isSessionExpired.value = false;
  localStorage.removeItem("xpensify_last_sync");
  try {
    await db.delete();
  } catch {
    // If IndexedDB is unavailable, nothing to clean up
  }
  // Hard reload so all in-memory signals/liveQueries reset before next login
  window.location.href = "/login";
}

// Best-effort background revalidation. Called once on app boot. Never throws —
// offline is a normal state and must not strand the UI behind a rejected promise.
export async function checkAuth(): Promise<void> {
  let res: Response;
  try {
    res = await api.api.auth.me.$get();
  } catch {
    // Offline / network error — keep whatever we have cached. Sync 401s will
    // trigger logout() if the session has actually expired.
    return;
  }

  if (res.status === 401) {
    if (currentUser.value) {
      isSessionExpired.value = true;
      return;
    }
    setUser(null);
    return;
  }

  if (res.ok) {
    const user = await res.json() as User;
    setUser(user);
    isSessionExpired.value = false;
  }
  // Other statuses (5xx, etc.) — leave cached user alone; transient server
  // problems must not log the user out.
}
