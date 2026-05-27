import React, { useState, useEffect } from "react";
import {
  Folder,
  FileText,
  Plus,
  Trash2,
  Save,
  BarChart4,
  Tag,
  Clock,
  Database,
  CheckCircle2,
  RefreshCw,
  Search,
  Eye,
  Edit2
} from "lucide-react";
import { VaultNote, VaultStats } from "../types";

interface VaultManagerProps {
  notes: VaultNote[];
  stats: VaultStats | null;
  onRefresh: () => void;
  onSaveFile: (path: string, content: string) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onTagClickSearch: (tag: string) => void;
}

export default function VaultManager({
  notes,
  stats,
  onRefresh,
  onSaveFile,
  onDeleteFile,
  onTagClickSearch,
}: VaultManagerProps) {
  const [activeTab, setActiveTab] = useState<"workspace" | "analytics">("workspace");
  const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  
  // Note creation states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileFolder, setNewFileFolder] = useState("Inbox");

  // Sync editor content when selected note changes
  useEffect(() => {
    if (selectedNotePath) {
      const active = notes.find((n) => n.path === selectedNotePath);
      if (active) {
        setEditorContent(active.content);
      }
    } else if (notes.length > 0 && !selectedNotePath) {
      // Auto select first file
      setSelectedNotePath(notes[0].path);
      setEditorContent(notes[0].content);
    }
  }, [selectedNotePath, notes]);

  const activeNote = notes.find((n) => n.path === selectedNotePath);

  const handleSave = async () => {
    if (!selectedNotePath) return;
    await onSaveFile(selectedNotePath, editorContent);
    setIsEditMode(false);
  };

  const handleDelete = async () => {
    if (!selectedNotePath) return;
    if (window.confirm(`Вы уверены, что хотите безвозвратно удалить заметку "${activeNote?.name}.md"?`)) {
      await onDeleteFile(selectedNotePath);
      setSelectedNotePath(null);
    }
  };

  const handleCreateNoteSubmit = async () => {
    if (!newFileName.trim()) return;
    
    let cleanName = newFileName.trim().replace(/[\\/:*?"<>|]/g, "");
    if (!cleanName.endsWith(".md")) {
      cleanName += ".md";
    }

    const initialTemplate = `# ${cleanName.replace(/\.md$/, "")}\n\nНапишите содержание заметки здесь... #notes`;
    const targetPath = `${newFileFolder}/${cleanName}`;
    
    await onSaveFile(targetPath, initialTemplate);
    setSelectedNotePath(targetPath);
    setNewFileName("");
    setShowCreateDialog(false);
    setIsEditMode(true);
  };

  // Convert raw Markdown text to beautiful clean HTML
  const renderMarkdownHTML = (md: string) => {
    if (!md) return <p className="text-neutral-500 italic">Пустая заметка.</p>;

    const lines = md.split("\n");
    return lines.map((line, idx) => {
      // 1. Headers
      if (line.startsWith("# ")) {
        return (
          <h1 key={idx} className="text-2xl font-bold text-neutral-100 border-b border-neutral-800 pb-2 mt-4 mb-2">
            {line.substring(2)}
          </h1>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h2 key={idx} className="text-xl font-bold text-neutral-200 mt-4 mb-2">
            {line.substring(3)}
          </h2>
        );
      }
      if (line.startsWith("### ")) {
        return (
          <h3 key={idx} className="text-lg font-bold text-neutral-300 mt-3 mb-1.5">
            {line.substring(4)}
          </h3>
        );
      }

      // 2. Checkbox items
      if (line.trim().startsWith("- [ ]") || line.trim().startsWith("- [x]")) {
        const isChecked = line.includes("- [x]");
        const textValue = line.replace(/- \[[ xX]\]/, "").trim();
        return (
          <div key={idx} className="flex items-center space-x-2 my-1 pl-2">
            <input
              type="checkbox"
              checked={isChecked}
              readOnly
              className="rounded border-neutral-700 bg-neutral-900 text-purple-600 focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-default"
            />
            <span className={`text-sm ${isChecked ? "line-through text-neutral-500" : "text-neutral-300"}`}>
              {textValue}
            </span>
          </div>
        );
      }

      // 3. Bullets
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const textValue = line.replace(/^[-*]\s+/, "");
        return (
          <li key={idx} className="list-disc list-inside text-sm text-neutral-300 leading-relaxed pl-3 my-1">
            {textValue}
          </li>
        );
      }

      // 4. Match tags to highlight as interactive links in viewer
      const tagRegex = /#([a-zA-Zа-яА-Я0-9_-]+)/g;
      if (tagRegex.test(line)) {
        // Map word with links
        const parts: React.ReactNode[] = [];
        let curIndex = 0;
        tagRegex.lastIndex = 0; // reset
        let match;
        
        while ((match = tagRegex.exec(line)) !== null) {
          const matchIndex = match.index;
          // Segment before tag
          if (matchIndex > curIndex) {
            parts.push(line.substring(curIndex, matchIndex));
          }
          const tagName = match[1];
          parts.push(
            <button
              key={tagName + matchIndex}
              onClick={() => onTagClickSearch(`#${tagName}`)}
              className="text-xs bg-purple-500/10 border border-purple-400/20 text-purple-300 rounded px-1.5 py-0.2 mx-0.5 hover:bg-purple-600 hover:text-white transition-all cursor-pointer font-medium font-mono"
            >
              #{tagName}
            </button>
          );
          curIndex = tagRegex.lastIndex;
        }
        if (curIndex < line.length) {
          parts.push(line.substring(curIndex));
        }

        return <p key={idx} className="text-sm text-neutral-300 leading-relaxed my-2 min-h-[1.25rem]">{parts}</p>;
      }

      return (
        <p key={idx} className="text-sm text-neutral-300 leading-relaxed my-2 min-h-[1.25rem]">
          {line}
        </p>
      );
    });
  };

  // Divide notes into groupings
  const inboxNotes = notes.filter((n) => n.path.startsWith("Inbox") && n.name.toLowerCase().includes(searchFilter.toLowerCase()));
  const dailyNotes = notes.filter((n) => n.path.startsWith("Daily") && n.name.toLowerCase().includes(searchFilter.toLowerCase()));
  const otherNotes = notes.filter((n) => !n.path.startsWith("Inbox") && !n.path.startsWith("Daily") && n.name.toLowerCase().includes(searchFilter.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-[#17191E] border border-white/5 rounded-xl overflow-hidden shadow-xl [scrollbar-width:thin]">
      {/* Workspace Menu Bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#121418]">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-semibold tracking-wide text-neutral-200 uppercase font-sans">
            Obsidian Workspace
          </h2>
        </div>

        <div className="flex items-center bg-[#0F1115] p-1 rounded border border-white/5 text-xs">
          <button
            onClick={() => setActiveTab("workspace")}
            className={`px-3 py-1 rounded font-medium transition duration-150 ${
              activeTab === "workspace"
                ? "bg-[#1F2228] text-purple-400"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            📂 Заметки
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`px-3 py-1 rounded font-medium transition duration-150 ${
              activeTab === "analytics"
                ? "bg-[#1F2228] text-purple-400"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            📊 Аналитика
          </button>
        </div>
      </div>

      {activeTab === "workspace" ? (
        <div className="flex-1 flex overflow-hidden divide-x divide-white/5">
          
          {/* LEFT COLUMN: FILE EXPLORER SIDEBAR */}
          <div className="w-1/3 flex flex-col bg-[#121418]" id="obsidian-files-sidebar">
            <div className="p-3 border-b border-white/5 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Фильтр файлов..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full text-xs font-sans bg-[#0F1115] border border-white/5 rounded py-1.5 pl-8 pr-3 text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-purple-500 transition-all"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider font-mono">
                  Файлы ({notes.length})
                </span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={onRefresh}
                    className="p-1 rounded text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition"
                    title="Обновить хранилище"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowCreateDialog(true)}
                    className="p-1 rounded bg-purple-500/10 border border-purple-500/20 text-purple-350 text-purple-300 hover:bg-purple-600 hover:text-white transition flex items-center space-x-0.5 text-[10px] px-1.5 font-medium"
                    title="Создать заметку"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Создать</span>
                  </button>
                </div>
              </div>
            </div>

            {/* FOLDERS FLOW list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-3 font-sans text-xs">
              
              {/* Inbox Folder Section */}
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 px-2 py-1 text-neutral-400 font-semibold uppercase tracking-wider font-mono text-[10px]">
                  <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Inbox/</span>
                </div>
                {inboxNotes.length === 0 ? (
                  <p className="text-[10px] text-neutral-600 italic px-6">Нет файлов</p>
                ) : (
                  inboxNotes.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => {
                        setSelectedNotePath(file.path);
                        setIsEditMode(false);
                      }}
                      className={`w-full text-left px-5 py-1.5 rounded flex items-center space-x-2 transition ${
                        selectedNotePath === file.path
                          ? "bg-[#1F2228] text-purple-400 font-medium border-l-2 border-purple-550"
                          : "text-neutral-400 hover:bg-[#1F2228]/40 hover:text-neutral-200"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </button>
                  ))
                )}
              </div>

              {/* Daily Folder Section */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center space-x-1.5 px-2 py-1 text-neutral-400 font-semibold uppercase tracking-wider font-mono text-[10px]">
                  <Folder className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>Daily/</span>
                </div>
                {dailyNotes.length === 0 ? (
                  <p className="text-[10px] text-neutral-600 italic px-6">Нет файлов</p>
                ) : (
                  dailyNotes.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => {
                        setSelectedNotePath(file.path);
                        setIsEditMode(false);
                      }}
                      className={`w-full text-left px-5 py-1.5 rounded flex items-center space-x-2 transition ${
                        selectedNotePath === file.path
                          ? "bg-[#1F2228] text-purple-400 font-medium border-l border-purple-500"
                          : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </button>
                  ))
                )}
              </div>

              {/* Root / Others Folder Section */}
              {otherNotes.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center space-x-1.5 px-2 py-1 text-neutral-400 font-semibold uppercase tracking-wider font-mono text-[10px]">
                    <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Root/</span>
                  </div>
                  {otherNotes.map((file) => (
                    <button
                      key={file.path}
                      onClick={() => {
                        setSelectedNotePath(file.path);
                        setIsEditMode(false);
                      }}
                      className={`w-full text-left px-5 py-1.5 rounded flex items-center space-x-2 transition ${
                        selectedNotePath === file.path
                          ? "bg-[#1F2228] text-purple-400 font-medium border-l border-purple-500"
                          : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </button>
                  ))}
                </div>
              )}

            </div>
          </div>

          {/* RIGHT COLUMN: MAIN VAULT ACTIVE FILE EDITOR VIEW */}
          <div className="w-2/3 flex flex-col bg-[#0F1115]" id="obsidian-note-editor-wrapper">
            {activeNote ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                
                {/* File Sub-header controls */}
                <div className="px-5 py-3 border-b border-white/5 bg-[#121418] flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-200 flex items-center space-x-1.5">
                      <span>{activeNote.name}.md</span>
                    </h3>
                    <p className="text-[10px] text-neutral-500 flex items-center space-x-3 mt-0.5">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-neutral-600" />
                        <span>Изменен: {new Date(activeNote.mtime).toLocaleString("ru-RU")}</span>
                      </span>
                      <span>•</span>
                      <span>Размер: {(activeNote.size / 1024).toFixed(3)} KB</span>
                    </p>
                  </div>

                  <div className="flex items-center space-x-1.5 text-xs">
                    <button
                      onClick={() => setIsEditMode(!isEditMode)}
                      className={`px-3 py-1.5 rounded border border-white/5 font-medium flex items-center space-x-1.5 transition ${
                        isEditMode
                          ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                          : "bg-[#121418] text-neutral-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {isEditMode ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Просмотр</span>
                        </>
                      ) : (
                        <>
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Правка</span>
                        </>
                      )}
                    </button>

                    {isEditMode && (
                      <button
                        onClick={handleSave}
                        className="px-3.5 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center space-x-1.5 transition"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Сохранить</span>
                      </button>
                    )}

                    <button
                      onClick={handleDelete}
                      className="p-2 rounded border border-white/5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Удалить заметку"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sub Tags Bar list */}
                {activeNote.tags.length > 0 && (
                  <div className="px-5 py-2.5 bg-[#121418] border-b border-white/5 flex items-center flex-wrap gap-1">
                    <Tag className="w-3 h-3 text-neutral-500 mr-1" />
                    {activeNote.tags.map((tg) => (
                      <button
                        key={tg}
                        onClick={() => onTagClickSearch(`#${tg}`)}
                        className="text-[10px] font-mono bg-[#0F1115] border border-white/5 hover:border-purple-500/30 text-neutral-400 hover:text-purple-300 px-2 py-0.5 rounded transition"
                      >
                        #{tg}
                      </button>
                    ))}
                  </div>
                )}

                {/* Main View Area */}
                <div className="flex-1 overflow-y-auto p-6 [scrollbar-width:thin] select-text">
                  {isEditMode ? (
                    <textarea
                      value={editorContent}
                      onChange={(e) => setEditorContent(e.target.value)}
                      className="w-full h-full bg-[#0F1115] border border-white/5 rounded p-4 font-mono text-sm text-neutral-200 placeholder-neutral-700 outline-none focus:border-purple-500 resize-none min-h-[300px]"
                    />
                  ) : (
                    <article className="prose prose-invert max-w-none text-neutral-300 font-sans leading-relaxed">
                      {renderMarkdownHTML(activeNote.content)}
                    </article>
                  )}
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center h-full max-w-[280px] mx-auto text-neutral-500 space-y-3">
                <FileText className="w-8 h-8 text-neutral-600" />
                <p className="font-semibold text-neutral-400 text-sm">Файл не выбран</p>
                <p className="text-xs text-neutral-600 leading-relaxed">Выберите существующую заметку в левом сайдбаре или создайте новую входящую.</p>
              </div>
            )}
          </div>

        </div>
      ) : (
        /* ANALYTICS STORAGE DASHBOARD GRID TABS */
        <div className="flex-1 overflow-y-auto p-6 space-y-6 [scrollbar-width:thin]" id="vault-analytics-tab">
          
          {/* Top statistical grid indicators */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#0F1115] border border-white/5 p-4 rounded flex items-center space-x-4">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">Всего заметок</p>
                <p className="text-2xl font-bold font-sans text-neutral-100">{stats?.totalNotes || 0} шт</p>
              </div>
            </div>

            <div className="bg-[#0F1115] border border-white/5 p-4 rounded flex items-center space-x-4">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-450 text-purple-300 rounded">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">Общий размер</p>
                <p className="text-2xl font-bold font-sans text-neutral-100">
                  {stats?.totalSize ? (stats.totalSize / 1024).toFixed(2) : "0.00"} KB
                </p>
              </div>
            </div>

            <div className="bg-[#0F1115] border border-white/5 p-4 rounded flex items-center space-x-4">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">Уникальных тегов</p>
                <p className="text-2xl font-bold font-sans text-neutral-100">{stats?.tags.length || 0} шт</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* TAGS frequency list of cloud */}
            <div className="bg-[#0F1115] border border-white/5 p-5 rounded space-y-3">
              <div className="flex items-center space-x-2 border-b border-white/5 pb-2">
                <Tag className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider font-mono">
                  Облако тегов (клик для поиска)
                </h3>
              </div>
              
              {stats?.tags.length === 0 ? (
                <p className="text-neutral-500 text-xs italic">Теги не обнаружены.</p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-2">
                  {stats?.tags.map((item) => (
                    <button
                      key={item.tag}
                      onClick={() => onTagClickSearch(`#${item.tag}`)}
                      className="text-xs bg-[#121418] hover:bg-purple-600 border border-white/5 hover:border-purple-500 text-neutral-400 hover:text-white px-2.5 py-1.5 rounded flex items-center space-x-1.5 transition"
                    >
                      <span className="font-mono font-medium">#{item.tag}</span>
                      <span className="bg-[#0F1115] text-[10px] text-neutral-400 group-hover:text-white px-1.5 py-0.2 rounded">
                        {item.count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* FOLDERS counts distribution breakdown list */}
            <div className="bg-[#0F1115] border border-white/5 p-5 rounded space-y-3">
              <div className="flex items-center space-x-2 border-b border-white/5 pb-2">
                <Folder className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider font-mono">
                  Распределение по папкам
                </h3>
              </div>

              <div className="space-y-2.5 pt-2 font-sans text-xs">
                {Object.entries(stats?.folderCounts || {}).map(([folder, cnt]) => (
                  <div key={folder} className="flex items-center justify-between text-neutral-300">
                    <span className="flex items-center space-x-2 font-mono">
                      <Folder className="w-3.5 h-3.5 text-neutral-550 text-neutral-550 text-neutral-505 text-neutral-500 shrink-0" />
                      <span>{folder}/</span>
                    </span>
                    <span className="font-semibold bg-[#121418] border border-white/5 px-2 py-0.5 rounded text-neutral-200">
                      {cnt} файлов
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline of recent modifications list */}
          <div className="bg-[#0F1115] border border-white/5 p-5 rounded space-y-3">
            <div className="flex items-center space-x-2 border-b border-white/5 pb-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider font-mono">
                Таймлайн последних изменений (последние 5)
              </h3>
            </div>

            <div className="pt-2 divide-y divide-white/5 text-xs">
              {stats?.recentNotes.map((item, idx) => (
                <div
                  key={item.path}
                  onClick={() => {
                    setSelectedNotePath(item.path);
                    setActiveTab("workspace");
                    setIsEditMode(false);
                  }}
                  className="flex items-center justify-between py-2.5 px-2 hover:bg-[#121418] rounded cursor-pointer group transition"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <span className="text-neutral-500 font-mono text-[10px]">0{idx + 1}.</span>
                    <span className="text-neutral-300 font-medium group-hover:text-purple-400 transition truncate">
                      {item.name}.md
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                    {new Date(item.mtime).toLocaleString("ru-RU")}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* CREATE FILE DIALOG PANEL MODAL OVERLAY */}
      {showCreateDialog && (
        <div className="absolute inset-0 bg-neutral-950/70 backdrop-blur-sm z-30 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[#17191E] border border-white/5 p-6 rounded shadow-2xl relative space-y-4">
            <div className="flex items-center space-x-2 text-purple-400">
              <Plus className="w-5 h-5" />
              <h4 className="text-sm font-semibold text-neutral-100 font-sans">Создание новой заметки</h4>
            </div>

            <div className="space-y-3 font-sans text-xs">
              <div className="space-y-1">
                <label className="text-neutral-400">Название файла (без расширения)</label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="Идеи для проекта"
                  className="w-full bg-[#0F1115] border border-white/5 text-neutral-200 p-2.5 rounded focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-400">Папка сохранения</label>
                <select
                  value={newFileFolder}
                  onChange={(e) => setNewFileFolder(e.target.value)}
                  className="w-full bg-[#0F1115] border border-white/5 text-neutral-200 p-2.5 rounded focus:outline-none focus:border-purple-500 outline-none"
                >
                  <option value="Inbox">Inbox/</option>
                  <option value="Daily">Daily/</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowCreateDialog(false)}
                className="px-3.5 py-1.5 rounded text-xs bg-[#121418] border border-white/5 hover:bg-[#17191E] text-neutral-300 font-medium"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateNoteSubmit}
                disabled={!newFileName.trim()}
                className="px-4 py-1.5 rounded text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
