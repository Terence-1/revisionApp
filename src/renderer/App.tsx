import { useState, useEffect, useCallback, useRef } from "react";
import type { OllamaStatus } from "./types/index.js";
import Sidebar from "./components/Sidebar.js";
import DeckList from "./components/DeckList.js";
import DeckView from "./components/DeckView.js";
import ReviewSession from "./components/ReviewSession.js";
import Settings from "./components/Settings.js";

type View =
  | { type: "home" }
  | { type: "folder"; path: string }
  | { type: "deck"; deckId: string; path: string }
  | { type: "review"; path: string }
  | { type: "settings" };

export default function App() {
  const [view, setView] = useState<View>({ type: "home" });
  const previousView = useRef<View>({ type: "home" });
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (window.api) {
      setApiReady(true);
    } else {
      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        if (window.api) {
          setApiReady(true);
          clearInterval(check);
        } else if (attempts > 20) {
          clearInterval(check);
        }
      }, 250);
      return () => clearInterval(check);
    }
  }, []);

  const checkOllama = useCallback(async () => {
    if (!window.api) return;
    try {
      const status = await window.api.checkOllama();
      setOllamaStatus(status);
    } catch {
      setOllamaStatus({ connected: false, model: "llama3.2", error: "Failed to check" });
    }
  }, []);

  useEffect(() => {
    if (!apiReady) return;
    checkOllama();
    const interval = setInterval(checkOllama, 30000);
    return () => clearInterval(interval);
  }, [apiReady, checkOllama]);

  // Derive selected path from view state
  const selectedPath =
    view.type === "folder"
      ? view.path
      : view.type === "deck"
        ? view.path
        : view.type === "review"
          ? view.path
          : null;

  const handleSelectPath = (path: string) => {
    if (!path) {
      setView({ type: "home" });
    } else {
      setView({ type: "folder", path });
    }
  };

  const handleViewDeck = (deckId: string, path: string) => {
    setView({ type: "deck", deckId, path });
  };

  const handleStartReview = (path: string) => {
    setView({ type: "review", path });
  };

  const handleToggleSettings = () => {
    if (view.type === "settings") {
      setView(previousView.current);
    } else {
      previousView.current = view;
      setView({ type: "settings" });
    }
  };

  // Derive a key for view transitions
  const viewKey =
    view.type === "home"
      ? "home"
      : view.type === "folder"
        ? `folder:${view.path}`
        : view.type === "deck"
          ? `deck:${view.deckId}`
          : view.type === "review"
            ? `review:${view.path}`
            : view.type === "settings"
              ? "settings"
              : "home";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      {!apiReady ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4" style={{ height: "100vh" }}>
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{
              borderColor: "var(--border)",
              borderTopColor: "var(--accent)",
            }}
          />
          <p style={{ color: "var(--text-muted)" }}>Connecting to backend...</p>
        </div>
      ) : (
        <div className="app-layout" style={{ height: "100vh" }}>
          <Sidebar
            selectedPath={selectedPath}
            onSelectPath={handleSelectPath}
            onSelectDeckId={handleViewDeck}
            onStartReview={handleStartReview}
            onToggleSettings={handleToggleSettings}
            isSettingsOpen={view.type === "settings"}
            refreshKey={refreshKey}
            ollamaStatus={ollamaStatus}
          />
          <div className="main-content" style={{ overflow: "auto" }}>
            <main key={viewKey} className="view-enter max-w-4xl mx-auto px-8 py-8 w-full">
              {view.type === "home" && (
                <DeckList
                  onSelectPath={handleSelectPath}
                  onViewDeck={handleViewDeck}
                  onStartReview={handleStartReview}
                  onDataChanged={triggerRefresh}
                  refreshKey={refreshKey}
                />
              )}
              {view.type === "folder" && (
                <DeckList
                  pathPrefix={view.path}
                  onSelectPath={handleSelectPath}
                  onViewDeck={handleViewDeck}
                  onStartReview={handleStartReview}
                  onDataChanged={triggerRefresh}
                  refreshKey={refreshKey}
                />
              )}
              {view.type === "deck" && (
                <DeckView
                  deckId={view.deckId}
                  path={view.path}
                  onNavigate={handleSelectPath}
                  onBack={() => {
                    const parts = view.path.split("::");
                    if (parts.length > 1) {
                      handleSelectPath(parts.slice(0, -1).join("::"));
                    } else {
                      setView({ type: "home" });
                    }
                  }}
                  onStartReview={() =>
                    handleStartReview(view.path)
                  }
                  onDataChanged={triggerRefresh}
                />
              )}
              {view.type === "review" && (
                <ReviewSession
                  pathPrefix={view.path}
                  onFinish={() => {
                    setView({ type: "folder", path: view.path });
                    triggerRefresh();
                  }}
                />
              )}
              {view.type === "settings" && <Settings />}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
