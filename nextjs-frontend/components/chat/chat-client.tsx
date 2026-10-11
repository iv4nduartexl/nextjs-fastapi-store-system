"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import { AlertCircle, Bot, Loader2, Send, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChatClientContext,
  ChatConversation,
  ChatErrorCode,
  ChatMessage,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  resolveAction,
  sendMessage,
} from "@/components/actions/chat-action";
import { AISettingsDialog } from "@/components/chat/ai-settings-dialog";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { ToolApprovalCard } from "@/components/chat/tool-approval-card";
import { useRouter } from "@/i18n/routing";
import { currencySymbol } from "@/lib/currency";

type ChatError = { code: ChatErrorCode; detail?: string | null } | null;

export function ChatClient() {
  const t = useTranslations("chat");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(true);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [error, setError] = useState<ChatError>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const context: ChatClientContext = useMemo(
    () => ({
      locale,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      currency_symbol: currencySymbol,
    }),
    [locale],
  );

  const selectConversation = useCallback(
    async (id: string | null, updateUrl = true) => {
      setActiveId(id);
      setError(null);
      if (updateUrl) router.replace(id ? `/chat?c=${id}` : "/chat");
      if (!id) {
        setMessages([]);
        setLoadingConversation(false);
        return;
      }
      setLoadingConversation(true);
      const detail = await getConversation(id);
      setLoadingConversation(false);
      if (detail) setMessages(detail.messages);
      else {
        setMessages([]);
        setError({ code: "generic", detail: t("loadError") });
      }
    },
    [router, t],
  );

  // Initial load: reopen the conversation in the URL, or the most recent one
  useEffect(() => {
    let cancelled = false;
    listConversations().then((list) => {
      if (cancelled) return;
      setConversations(list);
      const fromUrl = searchParams.get("c");
      const initial = fromUrl && list.some((c) => c.id === fromUrl) ? fromUrl : list[0]?.id ?? null;
      selectConversation(initial, initial !== fromUrl);
    });
    return () => {
      cancelled = true;
    };
    // Only on mount; later navigation goes through selectConversation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function applyResponse(response: Awaited<ReturnType<typeof sendMessage>>, replaceTempId?: string) {
    setMessages((prev) => {
      const byId = new Map(response.messages.map((m) => [m.id, m]));
      // Update messages we already show (e.g. an action that was approved), drop the optimistic one
      const kept = prev
        .filter((m) => m.id !== replaceTempId)
        .map((m) => byId.get(m.id) ?? m);
      const known = new Set(kept.map((m) => m.id));
      return [...kept, ...response.messages.filter((m) => !known.has(m.id))];
    });
    if (response.error) setError({ code: response.error, detail: response.error_detail });
  }

  async function refreshConversations() {
    setConversations(await listConversations());
  }

  async function submit(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setInput("");
    setError(null);
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      // Sending a new message declines any approval still waiting (the server does the same)
      ...prev.map((m) =>
        m.pending_action?.status === "pending"
          ? { ...m, pending_action: { ...m.pending_action, status: "rejected" as const } }
          : m,
      ),
      { id: tempId, role: "user", content: message, pending_action: null, created_at: new Date().toISOString() },
    ]);

    const response = await sendMessage(message, activeId, context);
    setSending(false);

    if (!response.conversation_id) {
      // Request failed before reaching the model; keep the text so it can be resent
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(message);
      setError({ code: response.error ?? "generic", detail: response.error_detail });
      return;
    }

    applyResponse(response, tempId);
    if (response.conversation_id !== activeId) {
      setActiveId(response.conversation_id);
      router.replace(`/chat?c=${response.conversation_id}`);
    }
    refreshConversations();
  }

  async function handleAction(actionId: string, approved: boolean) {
    if (!activeId) return;
    setBusyActionId(actionId);
    setError(null);
    const response = await resolveAction(activeId, actionId, approved, context);
    setBusyActionId(null);
    applyResponse(response);
    refreshConversations();
  }

  async function handleRename(id: string, title: string) {
    const updated = await renameConversation(id, title);
    if (updated) {
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
  }

  async function handleDelete(id: string) {
    if (!(await deleteConversation(id))) return;
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    if (id === activeId) selectConversation(remaining[0]?.id ?? null);
  }

  const examples = t.raw("examples") as string[];
  const errorText = error
    ? error.code === "generic" && error.detail
      ? error.detail
      : t(`errors.${error.code}`)
    : null;

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-100px)] w-full max-w-6xl mx-auto rounded-2xl border bg-white overflow-hidden">
      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => selectConversation(id)}
        onNew={() => selectConversation(null)}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      <section className="flex flex-1 flex-col min-w-0 min-h-0">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h1 className="font-semibold text-gray-800 truncate">
            {conversations.find((c) => c.id === activeId)?.title || t("title")}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            title={t("settings")}
            aria-label={t("settings")}
          >
            <Settings className="w-5 h-5" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loadingConversation ? (
            <div className="flex justify-center py-10 text-gray-400">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center h-full gap-3 px-4">
              <Bot className="w-10 h-10 text-gray-300" />
              <h2 className="text-lg font-semibold text-gray-800">{t("emptyTitle")}</h2>
              <p className="text-sm text-gray-500 max-w-md">{t("emptyHint")}</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {examples.map((example) => (
                  <button
                    key={example}
                    onClick={() => submit(example)}
                    className="rounded-full border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`rounded-2xl px-4 py-3 max-w-[90%] md:max-w-[75%] ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : m.role === "action"
                        ? "w-full md:w-[75%] p-0 bg-transparent"
                        : "bg-gray-100 text-gray-900"
                  }`}
                >
                  {m.role === "action" && m.pending_action ? (
                    <ToolApprovalCard
                      action={m.pending_action}
                      busy={busyActionId === m.id}
                      onApprove={() => handleAction(m.id, true)}
                      onReject={() => handleAction(m.id, false)}
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-table:text-xs">
                      <ReactMarkdown>{m.content ?? ""}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {(sending || busyActionId) && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-gray-100 px-4 py-3 flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          {errorText && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p>{errorText}</p>
                {error?.detail && error.code !== "generic" && (
                  <p className="mt-0.5 text-xs text-red-500 break-words">{error.detail}</p>
                )}
                {(error?.code === "no_api_key" ||
                  error?.code === "invalid_api_key" ||
                  error?.code === "model_not_found" ||
                  error?.code === "bad_request") && (
                  <button
                    onClick={() => setSettingsOpen(true)}
                    className="mt-1 text-xs font-medium underline"
                  >
                    {t("settings")}
                  </button>
                )}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex gap-2 border-t p-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("placeholder")}
            disabled={sending}
            className="flex-1"
            autoFocus
          />
          <Button type="submit" disabled={sending || !input.trim()} className="gap-1.5">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">{t("send")}</span>
          </Button>
        </form>
      </section>

      <AISettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
