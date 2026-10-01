import { tr, locale, actionLabel } from "./localization";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./theme.css";
import "./experience.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="fatal-error">
        <h1>{tr("Something interrupted this page.")}</h1>
        <p>{tr("Your saved information is safe. Reload to try again.")}</p>
        <button className="btn" onClick={() => location.reload()}>
          {tr("Reload page")}</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
