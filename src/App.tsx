import React, { useState, useEffect } from "react";
import {
  Settings,
  RefreshCw,
  Database,
  Sparkles,
  BookOpen,
  Terminal,
  Zap,
  Info,
  CheckCircle2,
  XCircle,
  HelpCircle
} from "lucide-react";
import { VaultNote, TelegramMessage, VaultStats, BotLog, BotConfig } from "./types";
import TelegramChat from "./components/TelegramChat";
import VaultManager from "./components/VaultManager";
import BotLogs from "./components/BotLogs";

export default function App() {
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [botConfig, setBotConfig] = useState<BotConfig>({
    tokenSet: false,
    telegramUsername: "ObsidianBot",
    botStatus: "idle",
  });

  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editedToken, setEditedToken] = useState("");
  const [showHelpDropdown, setShowHelpDropdown] = useState(false);

  // Initialize and poll data from Port 3000 Server
  const fetchNotes = async () => {
    try {
      const res = await fetch("/api/vault/files");
      const data = await res.json();
      if (Array.isArray(data)) {
        setNotes(data);
      }
    } catch (err) {
      console.error("Failed fetching vault files:", err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/vault/stats");
      const data = await res.json();
      if (data && !data.error) {
        setStats(data);
      }
    } catch (err) {
      console.error("Failed fetching vault stats:", err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/bot/logs");
      const data = await res.json();
      if (Array.isArray(data)) {
        setLogs(data);
      }
    } catch (err) {
      console.error("Failed fetching bot logs:", err);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/bot/config");
      const data = await res.json();
      if (data && !data.error) {
        setBotConfig(data);
        if (data.tokenSet && !editedToken) {
          setEditedToken("••••••••••••••••••••••••");
        }
      }
    } catch (err) {
      console.error("Failed fetching bot config:", err);
    }
  };

  // Run initial fetch on mount
  useEffect(() => {
    fetchNotes();
    fetchStats();
    fetchLogs();
    fetchConfig();

    // Trigger welcoming message from bot
    setMessages([
      {
        id: "welc",
        role: "bot",
        text: "👋 Привет! Добро пожаловать во встроенный эмулятор **Obsidian Telegram Bot**!\n\nЯ полностью подключен к локальной файловой системе и эмулирую настоящего Телеграм бота!\n\n💡 Попробуй набрать любой текст или введи командный запрос. Ты можешь вызвать список команд, введя слеш `/` в текстовое поле.\n\n📊 Вся файловая система и теги отображаются в режиме реального времени на панели справа!",
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  // Poll database logs and files continuously to show updates from real Telegram bots in real-time
  useEffect(() => {
    const timer = setInterval(() => {
      fetchLogs();
      fetchNotes();
      fetchStats();
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Handler: User sends a mock chat message
  const handleSendMessage = async (text: string) => {
    const userMsg: TelegramMessage = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await fetch("/api/bot/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();

      if (data && !data.error) {
        const botReply: TelegramMessage = {
          id: Math.random().toString(36).substring(7),
          role: "bot",
          text: data.text,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botReply]);
        
        // Sync local indices instantly
        fetchNotes();
        fetchStats();
        fetchLogs();
      }
    } catch (err) {
      console.error("Failed sending message to emulator:", err);
    }
  };

  // Handler: User submits a voice WAV recording
  const handleSendVoice = async (audioBlob: Blob) => {
    setIsTranscribing(true);

    const voiceMsg: TelegramMessage = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      text: "",
      isVoice: true,
      voiceDuration: 5, // Simulated duration placeholder
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, voiceMsg]);

    try {
      const response = await fetch("/api/bot/voice", {
        method: "POST",
        headers: {
          "Content-Type": "audio/wav",
        },
        body: audioBlob,
      });
      const data = await response.json();

      setIsTranscribing(false);

      if (data && !data.error) {
        // First show transcribed message
        const userTranscript: TelegramMessage = {
          id: Math.random().toString(36).substring(7),
          role: "user",
          text: `🎤 _Голосовой ввод:_ "${data.transcription}"`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userTranscript]);

        // Then bot reply
        const botReply: TelegramMessage = {
          id: Math.random().toString(36).substring(7),
          role: "bot",
          text: data.botReply.text,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botReply]);

        // Reload data
        fetchNotes();
        fetchStats();
        fetchLogs();
      } else {
        // Show error transcript
        const errReply: TelegramMessage = {
          id: Math.random().toString(36).substring(7),
          role: "bot",
          text: `❌ Ошибка транскрипции: ${data.error || "Убедитесь, что настроили GEMINI_API_KEY в панели secrets."}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errReply]);
      }
    } catch (err: any) {
      setIsTranscribing(false);
      const errReply: TelegramMessage = {
        id: Math.random().toString(36).substring(7),
        role: "bot",
        text: `❌ Ошибка соединения при транскрибации: ${err?.message || err}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errReply]);
    }
  };

  // Handler: Save notes directly in Obsidian Workspace Editor
  const handleSaveFile = async (path: string, content: string) => {
    try {
      const res = await fetch("/api/vault/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      const data = await res.json();
      if (data.success) {
        fetchNotes();
        fetchStats();
        fetchLogs();
      }
    } catch (err) {
      console.error("Failed saving file directly:", err);
    }
  };

  // Handler: Delete notes directly inside Explorer
  const handleDeleteFile = async (path: string) => {
    try {
      const res = await fetch("/api/vault/file", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (data.success) {
        fetchNotes();
        fetchStats();
        fetchLogs();
      }
    } catch (err) {
      console.error("Failed deleting file:", err);
    }
  };

  // Helper bridging Tag clouds inside analytics tab back as search command inside Chatbot
  const handleTagClickSearch = (tag: string) => {
    // Fill chat input or trigger immediate message send
    handleSendMessage(`/search ${tag}`);
  };

  // Handler: Set actual TG Bot configuration Settings token
  const handleConfigSubmit = async () => {
    try {
      const res = await fetch("/api/bot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: editedToken === "••••••••••••••••••••••••" ? undefined : editedToken }),
      });
      const data = await res.json();
      if (data && !data.error) {
        setBotConfig(data);
        setShowSettingsModal(false);
        fetchLogs();
      }
    } catch (err) {
      console.error("Failed registering config:", err);
    }
  };

  const handleClearLogs = () => {
    // Mock clearing visually
    setLogs([]);
  };

  return (
    <div className="min-h-screen bg-[#0F1115] text-neutral-200 p-4 md:p-6 flex flex-col font-sans relative antialiased selection:bg-purple-500/30 selection:text-neutral-100">
      
      {/* HEADER BAR PANEL */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 mb-2 border-b border-white/5 shrink-0 gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 bg-[#121418] border border-white/5 rounded flex items-center justify-center shadow-lg relative group">
            <Database className="w-6 h-6 text-purple-450 text-purple-400 group-hover:scale-110 transition duration-300" />
            <Sparkles className="w-3.5 h-3.5 text-purple-300 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-neutral-100 font-sans flex items-center space-x-2">
              <span>Obsidian Bot</span>
              <span className="text-[10px] bg-[#121418] border border-white/5 text-neutral-500 px-2 py-0.5 rounded font-mono font-medium lowercase tracking-wide scale-95 select-none">
                v1.2.0
              </span>
            </h1>
            <p className="text-xs text-neutral-400 font-medium">
              Полный интерактивный дашборд управления Obsidian-сейфом и Telegram-ботом.
            </p>
          </div>
        </div>

        {/* Status controls and indicators */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          
          {/* Real polling client indicator status */}
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#121418] border border-white/5 text-neutral-350 text-neutral-300 shadow-inner">
            {botConfig.tokenSet ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium">Телеграм поллинг: <span className="text-emerald-400">АКТИВЕН</span></span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="font-medium">Режим: <span className="text-purple-400">СИМУЛЯТОР</span></span>
              </>
            )}
          </div>

          <button
            onClick={() => setShowHelpDropdown(!showHelpDropdown)}
            className="p-2 rounded bg-[#121418] border border-white/5 text-neutral-400 hover:text-neutral-200 transition relative flex items-center space-x-1.5"
            title="Инструкция быстрого старта"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="hidden sm:inline font-medium">Инструкция</span>
          </button>

          {/* Configuration drawer settings toggler */}
          <button
            onClick={() => {
              fetchConfig();
              setShowSettingsModal(true);
            }}
            className="px-3.5 py-1.5 rounded bg-[#121418] hover:bg-[#17191E] border border-white/5 text-neutral-200 font-semibold flex items-center space-x-2 transition duration-200 shadow-md"
            title="Настройка Telegram Bot API токена"
          >
            <Settings className="w-4 h-4 text-neutral-400" />
            <span>Настройки бота</span>
          </button>
        </div>
      </header>

      {/* QUICK HELP DROPDOWN OVERVIEW */}
      {showHelpDropdown && (
        <div className="mb-6 p-5 bg-neutral-900 border border-neutral-800 rounded-2xl max-w-4xl animate-in fade-in slide-in-from-top-3 duration-250 font-sans space-y-3 shadow-2xl relative">
          <button
            onClick={() => setShowHelpDropdown(false)}
            className="absolute top-4 right-4 text-xs text-neutral-500 hover:text-neutral-300 uppercase tracking-wider font-mono font-bold"
          >
            [X] Закрыть
          </button>
          
          <h2 className="text-sm font-semibold text-neutral-100 flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Инструкция по подключению живого Телеграм-бота</span>
          </h2>

          <div className="text-xs text-neutral-400 leading-relaxed grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 font-sans">
            <div className="space-y-2">
              <p className="font-semibold text-neutral-300">1. Как создать бота в Telegram?</p>
              <p>Перейдите в Telegram к боту <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">@BotFather</a>, отправьте команду <code className="bg-neutral-950 px-1 py-0.5 rounded text-teal-400">/newbot</code> и следуйте инструкциям для получения <b>HTTP API Token</b>.</p>
              <p className="font-semibold text-neutral-300">2. Как запустить его здесь?</p>
              <p>Нажмите синюю кнопку <b>"Настройки бота"</b> выше, введите скопированный токен и нажмите Сохранить. Сервер запустит фоновое длинное прослушивание (polling).</p>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-neutral-300">3. Полная синхронизация Obsidian</p>
              <p>Теперь напишите своему боту в Телеграм команду <code className="bg-neutral-950 px-1 py-0.5 rounded text-teal-400">/start</code>. Вы увидите логи активности в панели снизу, а любые отправленные текстовые послания моментально спавнятся в вашей Obsidian Vault в правой панели!</p>
              <p className="font-semibold text-neutral-300 font-mono text-[10px] text-amber-400 uppercase tracking-wider">⚠️ Конфиденциальность</p>
              <p>Все токены и данные сохраняются на вашей изолированной защищенной виртуальной ноде Cloud Run и никогда не передаются посторонним.</p>
            </div>
          </div>
        </div>
      )}

      {/* CORE SPLIT INTERACTIVE WORKSPACE DESIRED GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        
        {/* CHAT SIMULATOR SECTION (Col span 5 of 12) */}
        <div className="lg:col-span-5 h-[calc(100vh-180px)] lg:h-[calc(100vh-140px)] flex flex-col min-h-[460px]">
          <TelegramChat
            messages={messages}
            onSendMessage={handleSendMessage}
            onSendVoice={handleSendVoice}
            onClearHistory={() => setMessages([])}
            botStatus={botConfig.botStatus}
            onCallbackClick={handleSendMessage}
            isTranscribing={isTranscribing}
          />
        </div>

        {/* VAULT EXPLORER AND EDITOR AND METRICS SECTION (Col span 7 of 12) */}
        <div className="lg:col-span-7 h-[calc(100vh-180px)] lg:h-[calc(100vh-140px)] flex flex-col min-h-[460px] space-y-4 justify-between">
          
          <div className="flex-1 min-h-0 bg-neutral-950">
            <VaultManager
              notes={notes}
              stats={stats}
              onRefresh={() => {
                fetchNotes();
                fetchStats();
              }}
              onSaveFile={handleSaveFile}
              onDeleteFile={handleDeleteFile}
              onTagClickSearch={handleTagClickSearch}
            />
          </div>

          {/* COLLAPSIBLE STREAM TELEMETRY EVENTS LOGGER PANEL */}
          <div className="shrink-0 bg-neutral-950">
            <BotLogs logs={logs} onClear={handleClearLogs} />
          </div>

        </div>

      </div>

      {/* SETTINGS DIALOG DRAWER MODAL POPUP */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-6 relative space-y-4">
            <div className="flex items-center space-x-3 text-indigo-400">
              <Settings className="w-5 h-5" />
              <h3 className="text-base font-semibold text-neutral-100 font-sans">Параметры Telegram Bot API</h3>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              Введите HTTP API токен вашего бота для подключения к реальному Telegram. Чтобы отключить поллинг и вернуть эмулируемый режим, просто оставьте поле пустым и сохраните.
            </p>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider font-mono">
                TELEGRAM_BOT_TOKEN
              </label>
              <input
                type="password"
                value={editedToken}
                onChange={(e) => setEditedToken(e.target.value)}
                placeholder="Вставьте токен формата 123456789:ABCdefGhI..."
                className="w-full text-xs font-mono bg-neutral-950 border border-neutral-800 text-neutral-200 p-3 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder-neutral-750"
              />
            </div>

            {/* Simulated username indicator details */}
            <div className="p-3 bg-neutral-950/40 border border-neutral-850/60 rounded-xl space-y-1.5 text-xs text-neutral-400 font-sans">
              <div className="flex items-center justify-between">
                <span>Статус службы:</span>
                <span className="font-semibold text-neutral-300 flex items-center space-x-1">
                  {botConfig.tokenSet ? (
                    <>
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse" />
                      <span className="text-emerald-400 font-mono">АКТИВИРОВАН</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full inline-block" />
                      <span className="text-indigo-400 font-mono">ЭМУЛЯЦИЯ</span>
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Телеграм Тэг:</span>
                <span className="font-mono text-neutral-300">@ObsidianBot</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-3">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl text-xs bg-neutral-800 hover:bg-neutral-750 text-neutral-300 font-semibold"
              >
                Отмена
              </button>
              <button
                onClick={handleConfigSubmit}
                className="px-4 py-2 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center space-x-1.5 transition duration-150"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Сохранить и запустить</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
