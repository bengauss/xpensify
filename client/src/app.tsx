import { LocationProvider, Router, Route, useLocation } from "preact-iso";
import { useEffect } from "preact/hooks";
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

/** Mounts on the router level — checks auth and starts sync scheduler. */
function AuthGate() {
  const { path, route } = useLocation();

  useEffect(() => {
    checkAuth().then(() => {
      if (!currentUser.value && path !== "/login") {
        route("/login");
      } else if (currentUser.value && path === "/login") {
        route("/");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    </LocationProvider>
  );
}
