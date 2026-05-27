import React, { useState, useEffect, useRef } from "react";
import { Terminal, Shield, RefreshCw, AlertCircle, CheckCircle, Info } from "lucide-react";
import { BotLog } from "../types";

interface BotLogsProps {
  logs: BotLog[];
  onClear: () => void;
}

export default function BotLogs({ logs, onClear }: BotLogsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isOpen]);

  return (
    <div className="border border-white/5 rounded bg-[#17191E] overflow-hidden font-sans transition-all duration-300">
      {/* Collapsible header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-[#121418] border-b border-white/5 hover:bg-[#1C1F25] transition text-xs"
      >
        <div className="flex items-center space-x-2 text-neutral-400">
          <Terminal className="w-4 h-4 text-purple-400" />
          <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">Бортовой журнал событий (Логи)</span>
          <span className="bg-[#0F1115] font-mono text-[9px] px-1.5 py-0.2 rounded border border-white/5 text-neutral-500 font-bold">
            {logs.length}
          </span>
        </div>

        <div className="flex items-center space-x-2.5 text-[10px]">
          <span className="text-neutral-500 hover:text-neutral-300 font-medium">
            {isOpen ? "🔼 Свернуть" : "🔽 Развернуть"}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="p-3 space-y-2">
          {/* Controls */}
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <p className="text-[10px] text-neutral-500 flex items-center space-x-1">
              <Shield className="w-3.5 h-3.5 text-neutral-600" />
              <span>Здесь отображаются операции файловой системы Vault и Telegram соединения.</span>
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="text-[10px] font-mono text-neutral-500 hover:text-red-400 bg-[#0F1115] hover:bg-neutral-800 border border-white/5 px-2 py-0.5 rounded transition"
            >
              Очистить журнал
            </button>
          </div>

          {/* Log Stream Area */}
          <div className="max-h-48 overflow-y-auto space-y-1 p-2 bg-[#0F1115] rounded border border-white/5 font-mono text-[11px] leading-relaxed [scrollbar-width:thin]">
            {logs.length === 0 ? (
              <p className="text-neutral-600 italic py-1 pl-1">Событий пока не зарегистрировано...</p>
            ) : (
              logs.map((log) => {
                let badgeColor = "text-purple-400";
                let Icon = Info;

                if (log.level === "success") {
                  badgeColor = "text-emerald-400";
                  Icon = CheckCircle;
                } else if (log.level === "error") {
                  badgeColor = "text-rose-400";
                  Icon = AlertCircle;
                } else if (log.level === "warning") {
                  badgeColor = "text-amber-400";
                  Icon = AlertCircle;
                }

                return (
                  <div key={log.id} className="flex items-start space-x-2 py-1 select-text hover:bg-neutral-900/20 px-1 rounded transition">
                    <span className="text-neutral-600 shrink-0 select-none">
                      {new Date(log.timestamp).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className={`${badgeColor} shrink-0 uppercase tracking-widest font-bold text-[9px] border px-1 rounded-sm border-current/20 scale-95`}>
                      {log.level}
                    </span>
                    <span className="text-neutral-300 break-words flex-1">
                      {log.message}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
