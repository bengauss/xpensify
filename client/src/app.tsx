import { LocationProvider, Router, Route, useLocation } from "preact-iso";
import { useEffect, useRef } from "preact/hooks";
import { signal } from "@preact/signals";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { AddScreen } from "@/screens/Add";
import { LoginScreen } from "@/screens/Login";
import { checkAuth, currentUser } from "@/lib/auth";
import { startSyncScheduler, stopSyncScheduler } from "@/sync/scheduler";
import { lazy } from "preact-iso";
import { contentEl, animateIn, pendingDirection, revealContent } from "@/lib/transitions";
import HistoryScreen from "@/screens/History";
import RecurringScreen from "@/screens/Recurring";
import RecurringForm from "@/screens/RecurringForm";
import SettingsScreen from "@/screens/Settings";

const AnalyticsScreen = lazy(() => import("@/screens/Analytics"));

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
 * Persistent shell that wraps all authenticated routes.
 * Stays mounted across tab navigation so the main ref is stable
 * and tab transitions work correctly.
 */
function AuthenticatedShell() {
  const { path, route } = useLocation();
  const mainRef = useRef<HTMLDivElement>(null);
  const prevPathRef = useRef(path);

  // Register content element and reveal on initial load (CSS hides it by default)
  useEffect(() => {
    contentEl.value = mainRef.current;
    revealContent();
    return () => { contentEl.value = null; };
  }, []);

  // After route change, animate in if there's a pending tab transition
  useEffect(() => {
    if (path !== prevPathRef.current) {
      prevPathRef.current = path;
      if (pendingDirection.value !== 0) {
        animateIn();
      }
    }
  }, [path]);

  return (
    <div class="flex min-h-dvh flex-col bg-bg-primary">
      <Header onSettingsClick={() => route("/settings")} />
      <main ref={mainRef} class="screen-content flex-1 pt-2">
        <Router>
          <Route path="/" component={AddScreen} />
          <Route path="/history" component={HistoryScreen} />
          <Route path="/recurring" component={RecurringScreen} />
          <Route path="/recurring/new" component={RecurringForm} />
          <Route path="/recurring/edit/:id" component={RecurringForm} />
          <Route path="/analytics" component={AnalyticsScreen} />
          <Route path="/settings" component={SettingsScreen} />
        </Router>
      </main>
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
