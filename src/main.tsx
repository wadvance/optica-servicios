import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#f4f1eb", color: "#0f172a", padding: 40, fontFamily: "monospace" }}>
          <h1 style={{ fontSize: 24, fontWeight: 900 }}>Error en la aplicacion</h1>
          <p style={{ marginTop: 16, color: "#dc2626" }}>{this.state.error.message}</p>
          <details style={{ marginTop: 16 }}>
            <summary>Stack trace</summary>
            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 12 }}>{this.state.error.stack}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
