import { LocationProvider, useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { checkAuth, currentUser } from "@/lib/auth";
import { startSyncScheduler, stopSyncScheduler } from "@/sync/scheduler";
import { TabTransitionContainer } from "@/components/TabTransitionContainer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  pendingExpenses,
  refreshPendingExpenses,
  confirmingPending,
} from "@/lib/pending";

const LoginScreen = lazy(() => import("@/screens/Login"));

/**
 * Background-revalidates the cached user on mount, redirects as needed,
 * starts sync scheduler. currentUser is initialized synchronously from
 * localStorage in auth.ts, so first render already has the right state —
 * we never block the UI on a network call.
 */
function AuthGate() {
  const { route } = useLocation();

  useEffect(() => {
    checkAuth().then(() => {
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

  // Deep-link from a "tap to confirm" push notification: ?confirm=<id> on
  // load. We pull the pending list, find the row, set the confirming signal,
  // and clean the URL. If the row isn't found (race: the user already
  // confirmed it elsewhere, or the id is stale), we silently drop the deep
  // link and stay on /.
  useEffect(() => {
    if (!currentUser.value) return;
    const params = new URLSearchParams(window.location.search);
    const confirmId = params.get("confirm");
    if (!confirmId) return;
    refreshPendingExpenses().finally(() => {
      const found = pendingExpenses.value.find((p) => p.id === confirmId);
      if (found) confirmingPending.value = found;
      // Strip the query param either way so a refresh doesn't re-trigger.
      window.history.replaceState(null, "", window.location.pathname);
      route("/");
    });
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

  // Cap the app column at 560px on iPad/laptop. Fixed children (BottomNav,
  // Toast, edit save bar, DetailSheet) apply their own `max-w-[560px] mx-auto`
  // so they align with the column. We deliberately do NOT set a transform on
  // the shell: a transformed ancestor promotes itself to the containing block
  // for `position: fixed` descendants, and iOS Safari PWA cold-start
  // mis-measures that ancestor — leaving the bottom nav floating above the
  // home indicator until the first touch triggers a reflow.
  return (
    <div
      class="flex flex-col bg-bg-primary overflow-hidden mx-auto w-full max-w-[560px] h-full"
    >
      <Header onSettingsClick={() => route("/settings")} />
      <TabTransitionContainer />
      <BottomNav />
    </div>
  );
}

/** Top-level routing: login vs authenticated shell */
function AppRoutes() {
  const { path } = useLocation();

  if (path === "/login") {
    return (
      <Suspense fallback={null}>
        <LoginScreen />
      </Suspense>
    );
  }
  // No cached user and not on /login: render nothing while AuthGate's effect
  // redirects. Brief, only on cold start with empty cache.
  if (!currentUser.value) return null;
  return <AuthenticatedShell />;
}

import { ReauthOverlay } from "@/components/ReauthOverlay";

export function App() {
  return (
    <ErrorBoundary>
      <LocationProvider>
        <AuthGate />
        <AppRoutes />
        <ReauthOverlay />
      </LocationProvider>
    </ErrorBoundary>
  );
}
