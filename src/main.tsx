import React, { Component, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CoifPublicPage from "./CoifPublicPage";
import "./styles.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-screen">
          <section className="work-panel">
            <p className="eyebrow">Recovery</p>
            <h1>FarrierOS hit a bad demo state</h1>
            <p className="helper-text">
              The app is still running. Refresh the page, or reset demo data from the left rail after it reloads.
            </p>
            <button className="primary" onClick={() => window.location.reload()}>
              Reload App
            </button>
            {this.state.message && <p className="error-detail">{this.state.message}</p>}
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {window.location.pathname.startsWith("/coif/") ? (
        <CoifPublicPage token={decodeURIComponent(window.location.pathname.slice("/coif/".length))} />
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
