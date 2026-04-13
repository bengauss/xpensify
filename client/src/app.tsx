import { LocationProvider, Router, Route } from "preact-iso";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { AddScreen } from "@/screens/Add";
import { lazy } from "preact-iso";

const HistoryScreen = lazy(() => import("@/screens/History"));
const RecurringScreen = lazy(() => import("@/screens/Recurring"));
const AnalyticsScreen = lazy(() => import("@/screens/Analytics"));

function Placeholder({ name }: { name: string }) {
  return (
    <div class="flex flex-1 items-center justify-center px-4">
      <p class="text-text-secondary">{name} — coming soon</p>
    </div>
  );
}

export function App() {
  return (
    <LocationProvider>
      <div class="flex min-h-dvh flex-col bg-bg-primary">
        <Header />
        <main class="flex-1 pt-2">
          <Router>
            <Route path="/" component={AddScreen} />
            <Route path="/history" component={() => <Placeholder name="history" />} />
            <Route path="/recurring" component={() => <Placeholder name="recurring" />} />
            <Route path="/analytics" component={() => <Placeholder name="analytics" />} />
          </Router>
        </main>
        <BottomNav />
      </div>
    </LocationProvider>
  );
}
