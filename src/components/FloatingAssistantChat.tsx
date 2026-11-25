import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, RotateCcw, Send, X } from 'lucide-react';
import { UserRole } from '../types';

interface FloatingAssistantChatProps {
  isSignedIn: boolean;
  userRole: UserRole;
  activeTab: string;
}

interface AssistantMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export function FloatingAssistantChat({
  isSignedIn,
  userRole,
  activeTab,
}: FloatingAssistantChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const welcomeText = useMemo(() => {
    if (!isSignedIn) {
      return 'Welcome to NearCraft. Ask me how to discover nearby shops, register as a service provider, or verify KYC.';
    }
    if (userRole === 'provider') {
      return 'Hi! Ask me how to publish your shop, complete Aadhaar verification, add menu prices, or manage bookings & bills.';
    }
    return 'Hi! Ask me how to search services around your GPS location, adjust the 1–20 km radius slider, chat, or pay bills.';
  }, [isSignedIn, userRole]);

  const suggestedPrompts = useMemo(() => {
    if (!isSignedIn) {
      return [
        'How do I find local services?',
        'How do I list my shop?',
        'What is Customer vs Provider access?',
      ];
    }
    if (userRole === 'provider') {
      return [
        'How do I verify my Aadhaar KYC?',
        'How do I add service prices & photos?',
        'How do I accept bookings or view bills?',
      ];
    }
    return [
      'How do I filter by 1–20 km radius?',
      'Google Maps vs Partners difference?',
      'How do I order, pay, or schedule?',
    ];
  }, [isSignedIn, userRole]);

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [isOpen, messages, isSending]);

  useEffect(() => {
    if (isOpen) {
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? draft).trim();
    if (!text || isSending) return;

    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
    };

    const historySnapshot = messages.slice(-10).map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setDraft('');
    setErrorMsg(null);
    setIsSending(true);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historySnapshot,
          context: {
            isSignedIn,
            role: userRole,
            activeTab,
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };

      if (!response.ok || !payload.reply) {
        throw new Error(
          payload.error || 'Unable to reach NearCraft Guide right now. Please try again.'
        );
      }

      const modelMsg: AssistantMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: payload.reply,
      };
      setMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to reach NearCraft Guide right now. Please try again.';
      setErrorMsg(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setErrorMsg(null);
    setDraft('');
  };

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open NearCraft Help Guide"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xl border border-slate-700/80 transition-colors whitespace-nowrap"
        >
          <MessageCircle className="w-4 h-4 text-[#d8b66f] shrink-0" />
          <span>Help Guide</span>
        </button>
      ) : (
        <section
          aria-label="NearCraft AI Guide"
          className="w-[min(380px,calc(100vw-2rem))] h-[min(500px,calc(100vh-5.5rem))] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">
                NearCraft Guide
              </h2>
              <p className="text-[11px] text-slate-300 truncate">
                Website walkthrough & quick help
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleReset}
                  aria-label="Start new conversation"
                  title="New chat"
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close help guide"
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Thread */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/70"
          >
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed shadow-xs">
              {welcomeText}
            </div>

            {messages.length === 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-medium text-slate-500">
                  Suggested questions
                </p>
                <div className="flex flex-col gap-1.5">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void handleSend(prompt)}
                      className="text-left px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-blue-50 hover:text-blue-800 border border-slate-200 hover:border-blue-200 rounded-lg transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-700 text-white'
                      : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white text-slate-500 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs">
                  Thinking...
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {errorMsg}
              </div>
            )}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1500}
              placeholder="Ask how to use NearCraft..."
              aria-label="Ask NearCraft Guide"
              className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={isSending || !draft.trim()}
              aria-label="Send message"
              className="inline-flex items-center justify-center p-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-45 text-white transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
