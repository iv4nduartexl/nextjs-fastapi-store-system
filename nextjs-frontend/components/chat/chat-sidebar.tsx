"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ChatConversation } from "@/components/actions/chat-action";

interface ChatSidebarProps {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: ChatSidebarProps) {
  const t = useTranslations("chat");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  function startEditing(conversation: ChatConversation) {
    setEditingId(conversation.id);
    setDraftTitle(conversation.title);
  }

  function commitRename() {
    if (editingId && draftTitle.trim()) onRename(editingId, draftTitle.trim());
    setEditingId(null);
  }

  return (
    <aside className="flex flex-col w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r bg-gray-50/60">
      <div className="p-3">
        <Button onClick={onNew} variant="outline" className="w-full gap-2 justify-start">
          <Plus size={16} />
          {t("newChat")}
        </Button>
      </div>
      <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {t("conversations")}
      </p>
      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5 max-h-40 md:max-h-none">
        {conversations.length === 0 && (
          <p className="px-2 py-3 text-xs text-gray-400">{t("noConversations")}</p>
        )}
        {conversations.map((c) => {
          const active = c.id === activeId;
          if (editingId === c.id) {
            return (
              <div key={c.id} className="flex items-center gap-1 px-1">
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  maxLength={120}
                  className="flex-1 min-w-0 rounded-md border px-2 py-1 text-sm"
                />
                <button onClick={commitRename} className="p-1 text-gray-500 hover:text-gray-900" aria-label={t("rename")}>
                  <Check size={14} />
                </button>
                <button onClick={() => setEditingId(null)} className="p-1 text-gray-500 hover:text-gray-900" aria-label={t("reject")}>
                  <X size={14} />
                </button>
              </div>
            );
          }
          return (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-lg pr-1 ${
                active ? "bg-white shadow-sm border" : "hover:bg-white/80"
              }`}
            >
              <button
                onClick={() => onSelect(c.id)}
                title={c.title}
                className="flex flex-1 min-w-0 items-center gap-2 px-2 py-2 text-left text-sm text-gray-700"
              >
                <MessageSquare size={14} className="shrink-0 text-gray-400" />
                <span className="truncate">{c.title || t("untitled")}</span>
              </button>
              <button
                onClick={() => startEditing(c)}
                className="p-1 text-gray-400 hover:text-gray-800 md:opacity-0 md:group-hover:opacity-100"
                aria-label={t("rename")}
                title={t("rename")}
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => {
                  if (confirm(t("confirmDelete"))) onDelete(c.id);
                }}
                className="p-1 text-gray-400 hover:text-red-600 md:opacity-0 md:group-hover:opacity-100"
                aria-label={t("delete")}
                title={t("delete")}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
