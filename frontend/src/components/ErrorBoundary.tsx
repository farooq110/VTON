import { Component, ReactNode } from "react";

/**
 * ErrorBoundary — catches render-time errors anywhere in the child tree.
 *
 * Spec: "Error should be handle global at build time"
 *
 * Without this, a single component throwing during render would crash the whole
 * app to a blank white screen. With this, the user sees a friendly message +
 * a "Reload" button, and the rest of the app keeps working.
 *
 * Note: this catches render/lifecycle errors. It does NOT catch:
 *   - Event-handler errors (those just log to console)
 *   - Async errors (use try/catch)
 *   - Errors in lazy-loaded chunks (Suspense + error boundary combo handles those)
 */
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // In production, send to error reporting service (Sentry, etc.)
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen grid place-items-center bg-background p-4">
          <div className="text-center max-w-md">
            <div className="h-14 w-14 rounded-full bg-destructive/10 text-destructive grid place-items-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="font-display text-xl font-medium">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mt-2">
              The app hit an unexpected error. Try reloading — your saved data is preserved.
            </p>
            {this.state.error && (
              <pre className="mt-3 text-[10px] font-mono text-muted-foreground bg-muted p-2 rounded-md overflow-x-auto text-left max-h-32 overflow-y-auto">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="mt-5 h-11 px-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
