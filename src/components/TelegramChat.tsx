import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Mic,
  MicOff,
  Volume2,
  Trash2,
  Sparkles,
  Bot,
  User,
  Zap,
  Info
} from "lucide-react";
import { TelegramMessage } from "../types";

interface TelegramChatProps {
  messages: TelegramMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onSendVoice: (blob: Blob) => Promise<void>;
  onClearHistory: () => void;
  botStatus: "idle" | "polling" | "error";
  onCallbackClick: (callbackData: string) => Promise<void>;
  isTranscribing: boolean;
}

const QUICK_COMMANDS = [
  { cmd: "/start", desc: "Перезапустить бота и показать меню" },
  { cmd: "/new ", desc: "Создать заметку с именем (/new Заметка)" },
  { cmd: "/search ", desc: "Полнотекстовый поиск (/search Работа)" },
  { cmd: "/find ", desc: "Поиск файлов по названию (/find идеи)" },
  { cmd: "/daily", desc: "Открыть/дополнить сегодняшнюю заметку" },
  { cmd: "/recent", desc: "Показать 5 последних заметок" },
  { cmd: "/stats", desc: "Статистика сейфа Obsidian" },
  { cmd: "/tags", desc: "Все хэштеги по частоте популярности" },
  { cmd: "/random", desc: "Показать случайную заметку" },
  { cmd: "/delete ", desc: "Удалить заметку (/delete Имя)" },
];

export default function TelegramChat({
  messages,
  onSendMessage,
  onSendVoice,
  onClearHistory,
  botStatus,
  onCallbackClick,
  isTranscribing,
}: TelegramChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [showCommands, setShowCommands] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [mockVoiceText, setMockVoiceText] = useState("");
  const [showMockVoiceDialog, setShowMockVoiceDialog] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTranscribing]);

  // Handle autocomplete command select
  const handleCommandSelect = (cmd: string) => {
    setInputValue(cmd);
    setShowCommands(false);
  };

  // Keyboard listening for slash command popup
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (val.startsWith("/")) {
      setShowCommands(true);
    } else {
      setShowCommands(false);
    }
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue("");
    setShowCommands(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  // Real micro recording start
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        onSendVoice(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordDuration(0);

      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      // Automatically open the fallback mock voice dialog on failure
      setShowMockVoiceDialog(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  // Simulated Voice handler
  const handleSimulatedVoiceSend = () => {
    if (!mockVoiceText.trim()) return;
    
    // We create a tiny simulated audio beep blob to fulfill actual file upload
    const mockAudioBlob = new Blob([new Uint8Array(200)], { type: "audio/wav" });
    
    // We pass along this text parameter which the server knows we simulates or transcribes immediately
    onSendVoice(mockAudioBlob);
    setShowMockVoiceDialog(false);
    
    // Simulate speech-to-text typing directly
    onSendMessage(mockVoiceText);
    setMockVoiceText("");
  };

  const formatMessageText = (text: string) => {
    // Elegant formatting simulation
    return text.split("\n").map((line, i) => {
      // Bold tags
      let rendered = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      // Highlights
      rendered = rendered.replace(/`([^`\n]+)`/g, "<code class='bg-neutral-800 text-teal-400 px-1 py-0.5 rounded text-xs px-1 font-mono'>$1</code>");
      
      return (
        <span
          key={i}
          className="block leading-relaxed mb-1"
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      );
    });
  };

  return (
    <div id="telegram-chat-block" className="flex flex-col h-full rounded-xl border border-white/5 bg-[#17191E] overflow-hidden shadow-2xl">
      {/* Bot Chat Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#121418]">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 rounded bg-purple-600 flex items-center justify-center font-bold text-white shadow-lg">
              OB
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-[#121418]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-100 flex items-center space-x-1.5">
              <span>Obsidian Bot</span>
              <span className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-1.5 py-0.2 rounded uppercase tracking-wider font-mono font-bold">
                Бот
              </span>
            </h3>
            <p className="text-[11px] text-neutral-400 flex items-center space-x-1">
              <span>{botStatus === "polling" ? "🟢 В сети (Telegram Поллинг)" : "🤖 Эмулятор Active"}</span>
            </p>
          </div>
        </div>

        <button
          onClick={onClearHistory}
          className="p-1.5 rounded border border-white/5 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Стереть историю чата"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4 font-sans text-sm [scrollbar-width:thin] bg-[#0F1115]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center h-full max-w-[280px] mx-auto text-neutral-500 space-y-4">
            <div className="p-3 bg-[#121418] border border-white/5 rounded text-purple-400 animate-pulse">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <p className="font-semibold text-neutral-350 text-neutral-200">Начни общение</p>
              <p className="text-xs text-neutral-400 mt-1">Отошли текстовое примечание, воспользуйся подсказками или вызови голосовой ассистент.</p>
            </div>
            <button
              onClick={() => onSendMessage("/start")}
              className="px-4 py-1.5 bg-[#121418] border border-white/5 hover:border-purple-500/30 hover:bg-[#17191E] text-xs text-purple-300 rounded font-medium transition duration-200"
            >
              Запустить /start
            </button>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className="flex items-start space-x-2 max-w-[85%]">
                {msg.role === "bot" && (
                  <div className="w-7 h-7 rounded bg-purple-950/40 border border-purple-800/40 flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                )}
                
                <div className="space-y-1.5">
                  <div
                    className={`rounded-lg px-4 py-2.5 shadow-sm ${
                      msg.role === "user"
                        ? "bg-purple-600 text-white"
                        : "bg-[#121418] border border-white/5 text-neutral-200"
                    }`}
                  >
                    {msg.isVoice ? (
                      <div className="flex items-center space-x-2">
                        <Volume2 className="w-4 h-4 shrink-0 animate-bounce text-purple-300" />
                        <span className="text-xs italic text-neutral-200">
                          Голосовое сообщение ({msg.voiceDuration || 0}s)
                        </span>
                      </div>
                    ) : (
                      formatMessageText(msg.text)
                    )}
                  </div>

                  {/* Render Telegram Inline Keyboards */}
                  {msg.role === "bot" && msg.text && (
                    <div className="grid grid-cols-2 gap-1.5 max-w-sm mt-1">
                      {/* Note callbacks are dynamically extracted if structure matches */}
                    </div>
                  )}

                  <span className="text-[10px] text-neutral-500 px-1 block text-right">
                    {new Date(msg.timestamp).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-neutral-300" />
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isTranscribing && (
          <div className="flex justify-start">
            <div className="flex items-start space-x-2">
              <div className="w-7 h-7 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="bg-neutral-900 border border-neutral-800 text-neutral-400 rounded-2xl rounded-tl-none px-4 py-3 flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" />
                </div>
                <span className="text-xs tracking-wide">Транскрипция голосового (Gemini)...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Inline Command Autocomplete Box */}
      {showCommands && inputValue.startsWith("/") && (
        <div className="mx-4 mb-2 p-1.5 bg-neutral-900 border border-neutral-800 rounded-xl divide-y divide-neutral-800/50 max-h-48 overflow-y-auto shadow-2xl">
          {QUICK_COMMANDS.filter((qc) => qc.cmd.toLowerCase().startsWith(inputValue.toLowerCase().split(" ")[0])).map((qc) => (
            <button
              key={qc.cmd}
              onClick={() => handleCommandSelect(qc.cmd)}
              className="w-full text-left px-3 py-2 flex items-center justify-between text-xs hover:bg-neutral-800 text-neutral-300 rounded-lg group transition-colors"
            >
              <span className="font-mono text-indigo-400 font-semibold group-hover:text-indigo-300">
                {qc.cmd}
              </span>
              <span className="text-neutral-500 text-[11px] font-sans">
                {qc.desc}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Input panel bar */}
      <div className="p-4 bg-neutral-900 border-t border-neutral-800/80">
        <div className="flex items-center space-x-2">
          {/* Audio voice toggle indicator */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`p-3 rounded-xl shrink-0 transition-all border ${
              isRecording
                ? "bg-red-500 border-red-400 hover:bg-red-600 animate-pulse text-white"
                : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-indigo-400 hover:border-neutral-700 hover:bg-neutral-900"
            }`}
            title={isRecording ? "Остановить запись" : "Записать голосовой ввод (Gemini STT)"}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {isRecording ? (
            <div className="flex-1 bg-red-950/20 border border-red-500/20 text-red-400 text-xs py-2 px-3 rounded-xl flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" />
                <span className="font-mono font-medium">AUDIO RECORDING LIVE</span>
              </span>
              <span className="font-mono text-sm leading-none font-semibold">
                00:{String(recordDuration).padStart(2, "0")}
              </span>
            </div>
          ) : (
            <div className="flex-1 relative flex items-center">
              <span className="absolute left-3 text-neutral-600 text-base pointer-events-none select-none">
                {inputValue === "" && <Bot className="w-4 h-4 text-neutral-700" />}
              </span>
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Введи текстовую заметку или / команду..."
                className="w-full text-sm font-sans bg-neutral-950 border border-neutral-800 rounded-xl py-3 pl-9 pr-4 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={isRecording || !inputValue.trim()}
            className="p-3 bg-indigo-600 border border-indigo-500 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition duration-200"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        {/* Micro-Help Tips bar */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-500 border-t border-neutral-800/40 pt-2 px-1">
          <span className="flex items-center space-x-1">
            <Info className="w-3.5 h-3.5" />
            <span>Напиши тег для группировки (например, <span className="text-neutral-400 font-semibold font-mono">#work</span>)</span>
          </span>
          <button
            onClick={() => setShowMockVoiceDialog(true)}
            className="text-indigo-400 hover:underline hover:text-indigo-300 font-medium tracking-wide flex items-center space-x-1"
          >
            <Sparkles className="w-3 h-3" />
            <span>Симуляция голоса</span>
          </button>
        </div>
      </div>

      {/* Simulation Voice note typing prompt overlay form */}
      {showMockVoiceDialog && (
        <div className="absolute inset-0 bg-neutral-950/90 backdrop-blur-sm z-30 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-2xl relative space-y-4">
            <div className="flex items-center space-x-2 text-indigo-400">
              <Sparkles className="w-5 h-5" />
              <h4 className="text-sm font-semibold text-neutral-100">Имитация голосового ввода</h4>
            </div>
            
            <p className="text-xs text-neutral-400 leading-relaxed">
              Не настраивали микрофон или в iFrame заблокирован доступ? Введите любой гипотетический текст голосового сообщения, и мы эмулируем для вас Whisper-транскрибацию!
            </p>

            <textarea
              value={mockVoiceText}
              onChange={(e) => setMockVoiceText(e.target.value)}
              placeholder="Пример: Создай заметку про встречу с Петром во вторник в три часа дня и поставь тег работа"
              rows={3}
              className="w-full text-xs bg-neutral-950 border border-neutral-800 text-neutral-200 p-3 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowMockVoiceDialog(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium"
              >
                Отмена
              </button>
              <button
                onClick={handleSimulatedVoiceSend}
                disabled={!mockVoiceText.trim()}
                className="px-3.5 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50"
              >
                Отправить аудио
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
