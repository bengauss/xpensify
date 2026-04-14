import { signal } from "@preact/signals";
import { api } from "@/lib/api";
import { db } from "@/db/local";

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
}

export const currentUser = signal<User | null>(null);

export async function login(username: string, password: string): Promise<void> {
  const res = await api.api.auth.login.$post({ json: { username, password } });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Login failed");
  }

  const user = await res.json() as User;
  currentUser.value = user;
}

export async function logout(): Promise<void> {
  try {
    await api.api.auth.logout.$post();
  } catch {
    // Network failure — still wipe local state so another user can't reuse the device
  }
  currentUser.value = null;
  localStorage.removeItem("xpensify_last_sync");
  try {
    await db.delete();
  } catch {
    // If IndexedDB is unavailable, nothing to clean up
  }
  // Hard reload so all in-memory signals/liveQueries reset before next login
  window.location.href = "/login";
}

export async function checkAuth(): Promise<void> {
  const res = await api.api.auth.me.$get();

  if (res.status === 401) {
    currentUser.value = null;
    return;
  }

  if (res.ok) {
    const user = await res.json() as User;
    currentUser.value = user;
  } else {
    currentUser.value = null;
  }
}
