import { useState } from "react";
import { MessageSquare, BookOpen } from "lucide-react";
import ChatPanel from "./components/ChatPanel";
import PlaybookGallery from "./components/PlaybookGallery";
import PlaybookRunner from "./components/PlaybookRunner";
import type { PlaybookInfo } from "./lib/types";

type View = "chat" | "playbooks" | "playbook-run";

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [selectedPlaybook, setSelectedPlaybook] = useState<PlaybookInfo | null>(
    null
  );

  const handlePlaybookSelect = (pb: PlaybookInfo) => {
    setSelectedPlaybook(pb);
    setView("playbook-run");
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-16 bg-gray-900 flex flex-col items-center py-4 gap-2">
        <div className="mb-4">
          <span className="text-2xl">🌊</span>
        </div>
        <button
          onClick={() => setView("chat")}
          className={`p-3 rounded-xl transition ${
            view === "chat"
              ? "bg-brand-600 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
          title="Chat"
        >
          <MessageSquare size={20} />
        </button>
        <button
          onClick={() => setView("playbooks")}
          className={`p-3 rounded-xl transition ${
            view === "playbooks" || view === "playbook-run"
              ? "bg-brand-600 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
          title="Playbooks"
        >
          <BookOpen size={20} />
        </button>
      </aside>

      {/* Main content area */}
      <main className="flex-1 flex flex-col bg-gray-50">
        {/* Top bar */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6">
          <h1 className="text-lg font-bold text-gray-900">
            Meta<span className="text-brand-600">Flow</span>
          </h1>
          <span className="ml-3 text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
            Multi-Agent Orchestrator
          </span>
        </header>

        {/* View content */}
        <div className="flex-1 overflow-hidden">
          {view === "chat" && <ChatPanel />}
          {view === "playbooks" && (
            <PlaybookGallery onSelect={handlePlaybookSelect} />
          )}
          {view === "playbook-run" && selectedPlaybook && (
            <PlaybookRunner
              playbook={selectedPlaybook}
              onBack={() => setView("playbooks")}
            />
          )}
        </div>
      </main>
    </div>
  );
}
