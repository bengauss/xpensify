import { signal } from "@preact/signals";

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
}

export const currentUser = signal<User | null>(null);

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message ?? "Login failed");
  }

  const user = await res.json() as User;
  currentUser.value = user;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  currentUser.value = null;
}

export async function checkAuth(): Promise<void> {
  const res = await fetch("/api/auth/me");

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
