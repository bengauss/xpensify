import { LocationProvider, Router, Route, useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { AddScreen } from "@/screens/Add";
import { LoginScreen } from "@/screens/Login";
import { checkAuth, currentUser } from "@/lib/auth";
import { startSyncScheduler, stopSyncScheduler } from "@/sync/scheduler";
import { lazy } from "preact-iso";

const HistoryScreen = lazy(() => import("@/screens/History"));
const RecurringScreen = lazy(() => import("@/screens/Recurring"));
const RecurringForm = lazy(() => import("@/screens/RecurringForm"));
const AnalyticsScreen = lazy(() => import("@/screens/Analytics"));
const SettingsScreen = lazy(() => import("@/screens/Settings"));

/** True once checkAuth() has resolved (regardless of result) */
const authChecked = signal(false);

/** Wraps a screen component with the shell chrome (Header + BottomNav) */
function Shell({ children }: { children: preact.ComponentChildren }) {
  const { route } = useLocation();
  return (
    <div class="flex min-h-dvh flex-col bg-bg-primary">
      <Header onSettingsClick={() => route("/settings")} />
      <main class="flex-1 pt-2">{children}</main>
      <BottomNav />
    </div>
  );
}

/** Checks auth on mount, redirects as needed, starts sync scheduler. */
function AuthGate() {
  const { route } = useLocation();

  useEffect(() => {
    checkAuth().then(() => {
      authChecked.value = true;
      // Read path fresh after the async call (not from stale closure)
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

export function App() {
  return (
    <LocationProvider>
      <AuthGate />
      {authChecked.value ? (
        <Router>
          <Route path="/login" component={LoginScreen} />
          <Route
            path="/"
            component={() => (
              <Shell>
                <AddScreen />
              </Shell>
            )}
          />
          <Route
            path="/history"
            component={() => (
              <Shell>
                <HistoryScreen />
              </Shell>
            )}
          />
          <Route
            path="/recurring"
            component={() => (
              <Shell>
                <RecurringScreen />
              </Shell>
            )}
          />
          <Route
            path="/recurring/new"
            component={() => (
              <Shell>
                <RecurringForm />
              </Shell>
            )}
          />
          <Route
            path="/recurring/edit/:id"
            component={() => (
              <Shell>
                <RecurringForm />
              </Shell>
            )}
          />
          <Route
            path="/analytics"
            component={() => (
              <Shell>
                <AnalyticsScreen />
              </Shell>
            )}
          />
          <Route
            path="/settings"
            component={() => (
              <Shell>
                <SettingsScreen />
              </Shell>
            )}
          />
        </Router>
      ) : null}
    </LocationProvider>
  );
}
