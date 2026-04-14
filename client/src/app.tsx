import { LocationProvider, useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { LoginScreen } from "@/screens/Login";
import { checkAuth, currentUser } from "@/lib/auth";
import { startSyncScheduler, stopSyncScheduler } from "@/sync/scheduler";
import { TabTransitionContainer } from "@/components/TabTransitionContainer";

/** True once checkAuth() has resolved (regardless of result) */
const authChecked = signal(false);

/** Checks auth on mount, redirects as needed, starts sync scheduler. */
function AuthGate() {
  const { route } = useLocation();

  useEffect(() => {
    checkAuth().then(() => {
      authChecked.value = true;
      const currentPath = window.location.pathname;
      if (!currentUser.value && currentPath !== "/login") {
        route("/login");
      } else if (currentUser.value && currentPath === "/login") {
        route("/");
      }
    });
  }, []);

  useEffect(() => {
    if (!currentUser.value) return;
    startSyncScheduler();
    return () => stopSyncScheduler();
  }, [currentUser.value]);

  return null;
}

/**
 * Persistent shell wrapping the tab transition container.
 * Header and BottomNav stay completely outside the transition —
 * only the content area between them animates.
 */
function AuthenticatedShell() {
  const { route } = useLocation();

  return (
    <div class="flex min-h-dvh flex-col bg-bg-primary">
      <Header onSettingsClick={() => route("/settings")} />
      <TabTransitionContainer />
      <BottomNav />
    </div>
  );
}

/** Top-level routing: login vs authenticated shell */
function AppRoutes() {
  const { path } = useLocation();

  if (!authChecked.value) return null;
  if (path === "/login") return <LoginScreen />;
  return <AuthenticatedShell />;
}

export function App() {
  return (
    <LocationProvider>
      <AuthGate />
      <AppRoutes />
    </LocationProvider>
  );
}
