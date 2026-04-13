import { signal } from "@preact/signals";
import { api } from "@/lib/api";

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
  await api.api.auth.logout.$post();
  currentUser.value = null;
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
