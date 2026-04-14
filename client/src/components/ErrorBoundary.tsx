import { useErrorBoundary } from "preact/hooks";
import type { ComponentChildren } from "preact";

interface ErrorBoundaryProps {
  children: ComponentChildren;
}

export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  const [error, resetError] = useErrorBoundary((err) => {
    // Surface to the console so it's captured in dev tools + Sentry-style collectors
    console.error("[ErrorBoundary]", err);
  });

  if (error) {
    return (
      <div class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg-primary px-6 text-center">
        <div class="text-5xl">⚠️</div>
        <h1 class="text-lg font-semibold text-text-primary">something went wrong</h1>
        <p class="text-sm text-text-secondary">
          the app hit an unexpected error. try reloading — your data is saved locally.
        </p>
        <div class="flex gap-2">
          <button
            onClick={resetError}
            class="rounded-lg bg-accent/15 px-4 py-2 text-sm font-medium text-accent"
          >
            try again
          </button>
          <button
            onClick={() => window.location.reload()}
            class="rounded-lg bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary"
          >
            reload
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
