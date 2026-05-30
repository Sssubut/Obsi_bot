import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import dns from "dns";

// Load environment variables
dotenv.config();

// Fix __dirname logic in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Enable JSON parser and URL-encoded body
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Mock/Real Obsidian Vault path
const VAULT_ROOT = path.join(process.cwd(), "vault");
const INBOX_DIR = path.join(VAULT_ROOT, "Inbox");
const DAILY_DIR = path.join(VAULT_ROOT, "Daily");

// Keep in-memory logs for the UI console
let systemLogs: Array<{
  id: string;
  timestamp: string;
  level: "info" | "success" | "error" | "warning";
  message: string;
}> = [];

function addLog(level: "info" | "success" | "error" | "warning", message: string) {
  const log = {
    id: Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  systemLogs.push(log);
  // Cap at 200 logs
  if (systemLogs.length > 200) {
    systemLogs.shift();
  }
  console.log(`[BOT-LOG][${level.toUpperCase()}] ${message}`);
}

// Ensure vault structure exists
function initializeVault() {
  if (!fs.existsSync(VAULT_ROOT)) {
    fs.mkdirSync(VAULT_ROOT, { recursive: true });
    addLog("info", "Created Obsidian Vault directory");
  }
  if (!fs.existsSync(INBOX_DIR)) {
    fs.mkdirSync(INBOX_DIR, { recursive: true });
  }
  if (!fs.existsSync(DAILY_DIR)) {
    fs.mkdirSync(DAILY_DIR, { recursive: true });
  }

  // Seed sample notes
  const welcomeFile = path.join(INBOX_DIR, "Welcome to Obsidian.md");
  if (!fs.existsSync(welcomeFile)) {
    const welcomeContent = `# Welcome to Obsidian 🚀

Этот файл создан вашим Telegram ботом для Obsidian.

Здесь вы можете управлять своими заметками. Этот бот позволяет отправлять текстовые файлы, вести дневник и быстро искать информацию.

## Возможности:
- Все текстовые сообщения без команд сохраняются в папку \`Inbox/\`
- Вы можете добавлять #теги к заметкам, например #obsidian, #notes, #todo.
- Бот проанализирует эти теги и построит статистику в реальном времени!

Вы также можете использовать команду /daily для ведения личного дневника. Попробуйте прямо сейчас!
`;
    fs.writeFileSync(welcomeFile, welcomeContent, "utf8");
    addLog("info", "Seeded Welcome to Obsidian.md sample note");
  }

  const ideasFile = path.join(INBOX_DIR, "Project Ideas.md");
  if (!fs.existsSync(ideasFile)) {
    const ideasContent = `# Project Ideas 💡

Список классных идей для проектов, которые можно реализовать в будущем:

- [x] Создать Telegram бота для Obsidian (#coding, #telegram)
- [ ] Сделать красивый дашборд для визуализации заметок (#obsidian, #ideas)
- [ ] Опубликовать исходный код в GitHub (#guide)

Не забывайте периодически перечитывать список!
`;
    fs.writeFileSync(ideasFile, ideasContent, "utf8");
  }

  const shoppingFile = path.join(INBOX_DIR, "Shopping List.md");
  if (!fs.existsSync(shoppingFile)) {
    const shoppingContent = `# Shopping List 🛒

Не забыть купить в магазине:
- Овсяное молоко 🥛
- Свежий хлеб 🥖
- Зеленый чай 🍵
- Кофе в зернах (#coffee)

#shopping #todo
`;
    fs.writeFileSync(shoppingFile, shoppingContent, "utf8");
  }
}

initializeVault();

// Keep a powerful, fast metadata cache to avoid heavy disk reads on rapid polling
let fileCache: Array<{
  name: string;
  path: string;
  mtime: string;
  size: number;
  content: string;
  tags: string[];
}> | null = null;
let lastCacheUpdate = 0;

// Helper to scan vault and retrieve all markdown files recursively
function scanVaultFiles(): Array<{
  name: string;
  path: string;
  mtime: string;
  size: number;
  content: string;
  tags: string[];
}> {
  const now = Date.now();
  // Return cached metadata if scanned within the last 1.5 seconds (prevents disk bottlenecks)
  if (fileCache && (now - lastCacheUpdate < 1500)) {
    return fileCache;
  }

  const results: any[] = [];

  function traverse(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      if (item.startsWith(".")) continue; // Skip hidden
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (item.endsWith(".md")) {
        const relativePath = path.relative(VAULT_ROOT, fullPath);
        const content = fs.readFileSync(fullPath, "utf8");
        
        // Extract tags
        const tags: string[] = [];
        const tagRegex = /(?:^|\s)#([a-zA-Zа-яА-Я0-9_-]+)/g;
        let match;
        // Strip code blocks and link block content to avoid matching false tags
        const cleanContentForTags = content
          .replace(/```[\s\S]*?```/g, "")
          .replace(/`[^`\n]+`/g, "");
        while ((match = tagRegex.exec(cleanContentForTags)) !== null) {
          const tag = match[1].toLowerCase();
          // Exclude pure numbers or headers or hex codes
          if (!/^\d+$/.test(tag) && !tags.includes(tag)) {
            tags.push(tag);
          }
        }

        results.push({
          name: item.replace(/\.md$/, ""),
          path: relativePath,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          content,
          tags,
        });
      }
    }
  }

  traverse(VAULT_ROOT);
  const sorted = results.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
  
  // Persist cache
  fileCache = sorted;
  lastCacheUpdate = now;

  // Persist to offline cache file
  try {
    const cacheFile = path.join(VAULT_ROOT, ".obsidian_metadata_cache.json");
    fs.writeFileSync(cacheFile, JSON.stringify(fileCache, null, 2), "utf8");
  } catch (err) {
    // Fail silently, cache is still active in memory
  }

  return sorted;
}

// Invalidate cache immediately when local operations write to files
function invalidateCache() {
  fileCache = null;
  lastCacheUpdate = 0;
}

// Help parsing content to find tags
function extractTags(text: string): string[] {
  const tags: string[] = [];
  const tagRegex = /(?:^|\s)#([a-zA-Zа-яА-Я0-9_-]+)/g;
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const tag = match[1].toLowerCase();
    if (!/^\d+$/.test(tag) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

// Handle voice message speech-to-text offline fallback
async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  addLog("info", "Voice message received. Offline playback/transcription notice triggered.");
  return "Голосовой ввод (через ИИ) временно отключен";
}

// Central command execution block matching actual TG commands
async function executeBotCommand(
  text: string,
  isVoiceText: boolean = false
): Promise<{ text: string; reply_markup?: any }> {
  const trimmed = text.trim();
  addLog("info", `Executing bot parser on message: "${trimmed.substring(0, 60)}"${isVoiceText ? " (Transcribed voice)" : ""}`);

  // 1. Check for /start
  if (trimmed.startsWith("/start")) {
    return {
      text: `👋 Привет! Я **Obsidian Bot**.\n\nПомогаю управлять твоими заметками в Obsidian прямо из Telegram!\n\n📂 **Основные команды:**\n` +
        `• Любой текст без команд — создаёт заметку в \`Inbox/\`\n` +
        `• \`/new <название> [текст]\` — создать заметку с указанным именем\n` +
        `• \`/search <текст>\` — полнотекстовый поиск по заметкам\n` +
        `• \`/find <имя>\` — поиск заметок по названию файла\n` +
        `• \`/daily [текст]\` — открыть или дополнить заметку дня\n` +
        `• \`/recent\` — показать 5 последних заметок\n` +
        `• \`/stats\` — общая статистика хранилища\n` +
        `• \`/tags\` — список всех #тегов по частоте\n` +
        `• \`/random\` — открыть случайную заметку\n` +
        `• \`/delete <название>\` — удалить заметку\n\n` +
        `🎤 Отправь мне голосовое сообщение, и я сохраню его в виде текста!`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📊 Статистика", callback_data: "cmd_stats" },
            { text: "🕒 Последние заметки", callback_data: "cmd_recent" },
          ],
          [
            { text: "🗺️ Случайная заметка", callback_data: "cmd_random" },
          ],
        ],
      },
    };
  }

  // 2. /new command
  if (trimmed.startsWith("/new")) {
    const rawArgs = trimmed.substring(4).trim();
    if (!rawArgs) {
      return { text: "⚠️ Пожалуйста, укажи название заметки. Пример:\n`/new Мои Идеи Сделать бота в субботу`" };
    }

    // Split title and content. If there is a newline or space, take first block as title or parse intelligently
    let fileName = "";
    let fileContent = "";

    const splitIndex = rawArgs.indexOf("\n");
    if (splitIndex !== -1) {
      fileName = rawArgs.substring(0, splitIndex).trim();
      fileContent = rawArgs.substring(splitIndex + 1).trim();
    } else {
      // Find space
      const spaceIndex = rawArgs.indexOf(" ");
      if (spaceIndex !== -1) {
        fileName = rawArgs.substring(0, spaceIndex).trim();
        fileContent = rawArgs.substring(spaceIndex + 1).trim();
      } else {
        fileName = rawArgs;
        fileContent = `# ${fileName}\n\nЗаметка создана автоматически.`;
      }
    }

    // Clean filename
    fileName = fileName.replace(/[\\/:*?"<>|]/g, "").trim();
    if (!fileName.endsWith(".md")) {
      fileName += ".md";
    }

    const targetPath = path.join(INBOX_DIR, fileName);
    try {
      fs.writeFileSync(targetPath, fileContent, "utf8");
      const relativePathStr = path.relative(VAULT_ROOT, targetPath);
      addLog("success", `Created note via bot command: ${relativePathStr}`);
      return {
        text: `📝 **Заметка успешно создана!**\n\n📂 Путь: \`Inbox/${fileName}\`\n📁 Размер: \`${fileContent.length} симв.\`\n\nПосмотреть или отредактировать подробности вы можете в панели справа.`,
        reply_markup: {
          inline_keyboard: [
            [{ text: "👀 Читать заметку", callback_data: `view_file:${relativePathStr.replace(/\\/g, "/")}` }]
          ]
        }
      };
    } catch (err: any) {
      addLog("error", `Failed writing note via command: ${err?.message}`);
      return { text: `❌ Не удалось создать заметку: ${err?.message}` };
    }
  }

  // 3. /search
  if (trimmed.startsWith("/search")) {
    const query = trimmed.substring(7).trim().toLowerCase();
    if (!query) {
      return { text: "⚠️ Пожалуйста, введи поисковый запрос. Пример: `/search работа`" };
    }

    const files = scanVaultFiles();
    const matches: Array<{ name: string; path: string; line: string }> = [];

    for (const f of files) {
      const idx = f.content.toLowerCase().indexOf(query);
      if (idx !== -1) {
        // Extract context line
        const start = Math.max(0, f.content.lastIndexOf("\n", idx));
        let end = f.content.indexOf("\n", idx);
        if (end === -1) end = f.content.length;
        const line = f.content.substring(start, end).trim();
        matches.push({ name: f.name, path: f.path, line });
      }
    }

    if (matches.length === 0) {
      return { text: `🔍 Поиск по запросу **"${query}"**\n\nНичего не найдено 😢` };
    }

    let reply = `🔍 Найдено совпадений: **${matches.length}**\n\n`;
    const keyboardButtons: any[] = [];
    matches.slice(0, 5).forEach((match, i) => {
      reply += `${i + 1}. **${match.name}**\n   _...${match.line.substring(0, 80)}..._\n\n`;
      keyboardButtons.push([{ text: `📄 Читать: ${match.name}`, callback_data: `view_file:${match.path.replace(/\\/g, "/")}` }]);
    });

    if (matches.length > 5) {
      reply += `_Показаны первые 5 результатов из ${matches.length}_`;
    }

    return { text: reply, reply_markup: { inline_keyboard: keyboardButtons } };
  }

  // 4. /find
  if (trimmed.startsWith("/find")) {
    const query = trimmed.substring(5).trim().toLowerCase();
    if (!query) {
      return { text: "⚠️ Укажите часть имени файла для поиска. Пример: `/find welcome`" };
    }

    const files = scanVaultFiles();
    const matches = files.filter((f) => f.name.toLowerCase().includes(query));

    if (matches.length === 0) {
      return { text: `📁 Поиск файлов содержащих **"${query}"**\n\nНичего не найдено 😢` };
    }

    let reply = `📁 Найдено подходящих файлов: **${matches.length}**\n\n`;
    const keyboardButtons: any[] = [];
    matches.slice(0, 5).forEach((match, i) => {
      reply += `${i + 1}. **${match.name}.md** (\`${match.path}\`)\n`;
      keyboardButtons.push([{ text: `📄 Открыть: ${match.name}`, callback_data: `view_file:${match.path.replace(/\\/g, "/")}` }]);
    });

    return { text: reply, reply_markup: { inline_keyboard: keyboardButtons } };
  }

  // 5. /daily
  if (trimmed.startsWith("/daily")) {
    const appendText = trimmed.substring(6).trim();

    // Get current local date in YYYY-MM-DD
    const isoString = new Date().toISOString();
    const todayStr = isoString.split("T")[0]; // "2026-05-27"
    const dailyFile = path.join(DAILY_DIR, `${todayStr}.md`);
    const relativePathStr = path.relative(VAULT_ROOT, dailyFile);

    const currentTimeStr = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

    let msgText = "";
    let actionType = "opened";

    if (appendText) {
      const bulletText = `\n- [ ] [${currentTimeStr}] ${appendText}`;
      try {
        if (fs.existsSync(dailyFile)) {
          fs.appendFileSync(dailyFile, bulletText, "utf8");
          actionType = "appended";
        } else {
          const initContent = `# Daily Note: ${todayStr} 📅\n\nЗаметка на сегодняшний день.\n\n## События:${bulletText}`;
          fs.writeFileSync(dailyFile, initContent, "utf8");
          actionType = "created";
        }
        msgText = `📅 **Ежедневная заметка дополнена!**\n\nЗаписано в \`Daily/${todayStr}.md\`:\n\`${bulletText.trim()}\``;
      } catch (err: any) {
        addLog("error", `Failed updating daily note: ${err?.message}`);
        return { text: `❌ Не удалось обновить ежедневную заметку: ${err?.message}` };
      }
    } else {
      // Return content
      try {
        if (fs.existsSync(dailyFile)) {
          const content = fs.readFileSync(dailyFile, "utf8");
          msgText = `📅 **Ежедневная заметка: ${todayStr}**\n\n\`\`\`markdown\n${content.substring(0, 300)}\n\`\`\`\n` +
            (content.length > 300 ? "..._содержимое обрезано_" : "");
          actionType = "viewed";
        } else {
          const initContent = `# Daily Note: ${todayStr} 📅\n\nЗаметка на сегодняшний день.\n\n## События:\n- [ ] Сегодняшний день начался! #journal`;
          fs.writeFileSync(dailyFile, initContent, "utf8");
          msgText = `📅 **Создана новая ежедневная заметка:** \`Daily/${todayStr}.md\``;
          actionType = "created";
        }
      } catch (err: any) {
        addLog("error", `Failed opening daily note: ${err?.message}`);
        return { text: `❌ Ошибка доступа к ежедневной заметке: ${err?.message}` };
      }
    }

    addLog("success", `Daily note activity: ${actionType} ${todayStr}.md`);
    return {
      text: msgText,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📝 Открыть в редакторе", callback_data: `view_file:${relativePathStr.replace(/\\/g, "/")}` }]
        ]
      }
    };
  }

  // 6. /recent
  if (trimmed.startsWith("/recent")) {
    const files = scanVaultFiles();
    if (files.length === 0) {
      return { text: "🤷‍♂️ В сейфе Obsidian пока нет ни одной заметки." };
    }

    let reply = "🕒 **Последние измененные заметки:**\n\n";
    const keyboardButtons: any[] = [];
    files.slice(0, 5).forEach((file, index) => {
      const dateLocal = new Date(file.mtime).toLocaleString("ru-RU");
      reply += `${index + 1}. **${file.name}**\n   _Изменена: ${dateLocal}_\n\n`;
      keyboardButtons.push([{ text: `📄 Читать: ${file.name}`, callback_data: `view_file:${file.path.replace(/\\/g, "/")}` }]);
    });

    return { text: reply, reply_markup: { inline_keyboard: keyboardButtons } };
  }

  // 7. /stats
  if (trimmed.startsWith("/stats")) {
    const files = scanVaultFiles();
    const totalCount = files.length;
    let totalSize = 0;
    const folderCounts: Record<string, number> = {};
    const tagsMap: Record<string, number> = {};

    for (const f of files) {
      totalSize += f.size;
      const folder = f.path.includes(path.sep) ? f.path.split(path.sep)[0] : "Корень";
      folderCounts[folder] = (folderCounts[folder] || 0) + 1;

      for (const t of f.tags) {
        tagsMap[t] = (tagsMap[t] || 0) + 1;
      }
    }

    const uniqueTagsCount = Object.keys(tagsMap).length;

    let reply = `📊 **Статистика хранилища (Obsidian Vault):**\n\n` +
      `📝 Всего заметок: **${totalCount}** шт\n` +
      `💾 Общий размер: **${(totalSize / 1024).toFixed(2)}** KB\n` +
      `🏷 Уникальных тегов: **${uniqueTagsCount}**\n\n` +
      `📂 **Разделы:**\n`;

    Object.entries(folderCounts).forEach(([folder, count]) => {
      reply += `• \`${folder}/\`: **${count}** шт\n`;
    });

    return {
      text: reply,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🏷 Список Тегов", callback_data: "cmd_tags" },
            { text: "🔄 Обновить", callback_data: "cmd_stats" }
          ]
        ]
      }
    };
  }

  // 8. /tags
  if (trimmed.startsWith("/tags")) {
    const files = scanVaultFiles();
    const tagsMap: Record<string, number> = {};

    for (const f of files) {
      for (const t of f.tags) {
        tagsMap[t] = (tagsMap[t] || 0) + 1;
      }
    }

    const sortedTags = Object.entries(tagsMap).sort((a, b) => b[1] - a[1]);

    if (sortedTags.length === 0) {
      return { text: "🏷 В ваших заметках пока не найдено ни одного `#тега`.\n\nПросто напишите слово со знаком решетки в любой заметке!" };
    }

    let reply = "🏷 **Все хэштеги в Obsidian по популярности:**\n\n";
    sortedTags.forEach(([tag, count], index) => {
      reply += `${index + 1}. **#${tag}** — \`${count}\` ${count === 1 ? "заметка" : "заметки"}\n`;
    });

    return { text: reply };
  }

  // 9. /random
  if (trimmed.startsWith("/random")) {
    const files = scanVaultFiles();
    if (files.length === 0) {
      return { text: "🤷‍♂️ В сейфе Obsidian пока нет ни одной заметки." };
    }

    const randomIndex = Math.floor(Math.random() * files.length);
    const chosen = files[randomIndex];

    return {
      text: `🎲 **Случайная заметка:** [${chosen.name}]\n\n\`\`\`markdown\n${chosen.content.substring(0, 350)}\n\`\`\`` +
        (chosen.content.length > 350 ? "\n..._содержимое обрезано_" : ""),
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👀 Открыть полностью", callback_data: `view_file:${chosen.path.replace(/\\/g, "/")}` },
            { text: "🎲 Еще одну!", callback_data: "cmd_random" }
          ]
        ]
      }
    };
  }

  // 10. /delete
  if (trimmed.startsWith("/delete")) {
    const targetName = trimmed.substring(7).trim();
    if (!targetName) {
      return { text: "⚠️ Пожалуйста, укажи имя удаляемой заметки. Пример: `/delete Проект`" };
    }

    const files = scanVaultFiles();
    const foundFile = files.find(
      (f) => f.name.toLowerCase() === targetName.toLowerCase() || f.path.toLowerCase() === targetName.toLowerCase()
    );

    if (!foundFile) {
      return { text: `❌ Заметка с именем **"${targetName}"** не найдена.` };
    }

    const fullDeletePath = path.join(VAULT_ROOT, foundFile.path);
    try {
      fs.unlinkSync(fullDeletePath);
      invalidateCache();
      addLog("success", `Deleted file via bot command: ${foundFile.path}`);
      return { text: `🗑 **Заметка удалена:**\n\nИмя: \`${foundFile.name}.md\`\nРаздел: \`${foundFile.path.split(/[\\/]/)[0]}\`` };
    } catch (err: any) {
      addLog("error", `Failed deleting file via command: ${err?.message}`);
      return { text: `❌ Ошибка удаления: ${err?.message}` };
    }
  }

  // CUSTOM CALLBACK TRIGGERS VIA TEXT (just in case they emulate them)
  if (trimmed.startsWith("cmd_")) {
    const subCmd = trimmed.substring(4);
    if (subCmd === "stats") return await executeBotCommand("/stats");
    if (subCmd === "recent") return await executeBotCommand("/recent");
    if (subCmd === "tags") return await executeBotCommand("/tags");
    if (subCmd === "random") return await executeBotCommand("/random");
  }

  // DEFAULT MATCH: If message is not any known command, create default Inbox note
  const lines = trimmed.split("\n");
  const firstLine = lines[0].trim();
  
  // Create a clean title based on first line
  let derivedTitle = firstLine
    .replace(/[#*\[\]\\/:*?"<>|]/g, "")
    .trim();
  
  if (derivedTitle.length > 30) {
    derivedTitle = derivedTitle.substring(0, 27) + "...";
  }

  // If title is empty or too small, use current datetime
  if (!derivedTitle || derivedTitle.length < 3) {
    const d = new Date();
    derivedTitle = `Заметка ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }

  const cleanFileName = `${derivedTitle}.md`;
  const defaultFilePath = path.join(INBOX_DIR, cleanFileName);

  try {
    const fileBody = `# ${derivedTitle}\n\n${trimmed}\n\n_Создано через Telegram Bot (авто-входящие) в ${new Date().toLocaleString("ru-RU")}_`;
    fs.writeFileSync(defaultFilePath, fileBody, "utf8");
    invalidateCache();
    const relativePathStr = path.relative(VAULT_ROOT, defaultFilePath);
    
    addLog("success", `Saved auto-inbox note: ${relativePathStr}`);
    
    return {
      text: `📥 **Создано входящее примечание!**\n\n📁 Файл: \`Inbox/${cleanFileName}\`\n📋 Название: **${derivedTitle}**\n\nТекст автоматически помещен во входящие.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 Читать в Обсидиан", callback_data: `view_file:${relativePathStr.replace(/\\/g, "/")}` }]
        ]
      }
    };
  } catch (err: any) {
    addLog("error", `Failed saving auto-inbox note: ${err?.message}`);
    return { text: `❌ Не удалось автоматически сохранить заметку во входящие: ${err?.message}` };
  }
}

// REST APIs FOR THE REACT FRONTEND
// 1. Vault Management REST endpoints
app.get("/api/vault/files", (req, res) => {
  try {
    const files = scanVaultFiles();
    res.json(files);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/vault/files", (req, res) => {
  const { path: relativePath, content } = req.body;
  if (!relativePath || content === undefined) {
    return res.status(400).json({ error: "Missing relative path or content arguments" });
  }

  // Clean elements and keep secure
  const safeRelativePath = relativePath.replace(/\.\./g, "");
  const targetPath = path.join(VAULT_ROOT, safeRelativePath);
  
  try {
    const parent = path.dirname(targetPath);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    fs.writeFileSync(targetPath, content, "utf8");
    invalidateCache();
    addLog("success", `Vault file updated directly via editor: ${safeRelativePath}`);
    res.json({ success: true, mtime: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/vault/file", (req, res) => {
  const relativePath = req.query.path as string;
  if (!relativePath) {
    return res.status(400).json({ error: "Missing file path query parameter" });
  }

  const targetPath = path.join(VAULT_ROOT, relativePath.replace(/\.\./g, ""));
  try {
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: "File not found in vault" });
    }
    const content = fs.readFileSync(targetPath, "utf8");
    res.json({ content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/vault/file", (req, res) => {
  const relativePath = req.body.path as string;
  if (!relativePath) {
    return res.status(400).json({ error: "Missing file path parameter" });
  }

  const targetPath = path.join(VAULT_ROOT, relativePath.replace(/\.\./g, ""));
  try {
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: "Note not found" });
    }
    fs.unlinkSync(targetPath);
    invalidateCache();
    addLog("success", `Vault file deleted directly via editor: ${relativePath}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/vault/stats", (req, res) => {
  try {
    const files = scanVaultFiles();
    const totalNotes = files.length;
    let totalSize = 0;
    const folderCounts: Record<string, number> = { Inbox: 0, Daily: 0 };
    const tagsMap: Record<string, number> = {};

    for (const f of files) {
      totalSize += f.size;
      const folder = f.path.includes(path.sep) ? f.path.split(path.sep)[0] : "Корень";
      folderCounts[folder] = (folderCounts[folder] || 0) + 1;

      for (const t of f.tags) {
        tagsMap[t] = (tagsMap[t] || 0) + 1;
      }
    }

    const tags = Object.entries(tagsMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    const recentNotes = files.slice(0, 5).map((f) => ({
      name: f.name,
      path: f.path,
      mtime: f.mtime,
    }));

    res.json({
      totalNotes,
      totalSize,
      tags,
      folderCounts,
      recentNotes,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Chat Simulator endpoints
app.post("/api/bot/message", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing text query parameter" });
  }
  const result = await executeBotCommand(text, false);
  res.json(result);
});

app.get("/api/bot/logs", (req, res) => {
  res.json(systemLogs);
});

app.post("/api/bot/voice", express.raw({ type: "audio/*", limit: "15mb" }), async (req, res) => {
  try {
    const mimeType = req.headers["content-type"] || "audio/wav";
    const audioBuffer = req.body as Buffer;

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: "Empty audio payload received" });
    }

    // Direct transcribe text
    const text = await transcribeAudio(audioBuffer, mimeType);
    
    // Pass it to the simulated bot parser!
    const reply = await executeBotCommand(text, true);

    res.json({
      transcription: text,
      botReply: reply,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// TELEGRAM POLLING LONG-POLL CONNECTOR
class SimpleTelegramPollingRuntime {
  private currentIdx = 0;
  private isRunning = false;
  private activeToken: string | null = null;
  private timeoutId: NodeJS.Timeout | null = null;
  private rateLimits = new Map<number, { count: number; lastReset: number }>();

  constructor() {
    this.activeToken = process.env.TELEGRAM_BOT_TOKEN || null;
  }

  // Update token or trigger
  setToken(token: string | null) {
    this.activeToken = token;
    this.restart();
  }

  getToken() {
    return this.activeToken;
  }

  getStatus(): "idle" | "polling" | "error" {
    return this.isRunning ? "polling" : "idle";
  }

  restart() {
    this.stop();
    if (this.activeToken && this.activeToken !== "MY_TELEGRAM_TOKEN") {
      this.start();
    }
  }

  start() {
    if (this.isRunning) return;
    if (!this.activeToken) return;
    this.isRunning = true;
    addLog("warning", "Starting active Telegram Bot Polling client...");
    this.pollLoop(0);
  }

  stop() {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    addLog("warning", "Telegram Bot Polling client stopped");
  }

  private async pollLoop(offset: number) {
    if (!this.isRunning || !this.activeToken) return;

    try {
      const url = `https://api.telegram.org/bot${this.activeToken}/getUpdates?offset=${offset}&timeout=30`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Telegram API returned status ${response.status}`);
      }

      const body = await response.json() as any;
      if (!body.ok) {
        throw new Error(body.description || "Unknown TG endpoint error");
      }

      const updates = body.result || [];
      let nextOffset = offset;

      for (const update of updates) {
        nextOffset = Math.max(nextOffset, update.update_id + 1);
        await this.handleTelegramUpdate(update);
      }

      // Chain next iteration instantly
      if (this.isRunning) {
        this.timeoutId = setTimeout(() => this.pollLoop(nextOffset), 500);
      }
    } catch (err: any) {
      addLog("error", `Telegram Polling error: ${err?.message || err}. Reconnecting in 10s...`);
      if (this.isRunning) {
        this.timeoutId = setTimeout(() => this.pollLoop(offset), 10000);
      }
    }
  }

  private async handleTelegramUpdate(update: any) {
    try {
      // Whitelist check helper (Disabled - everyone is allowed to use the bot)
      const isAllowedUser = (msg: any): boolean => {
        return true;
      };

      // Rate limit helper
      const isRateLimited = (chatId: number): boolean => {
        const now = Date.now();
        const limitStats = this.rateLimits.get(chatId) || { count: 0, lastReset: now };
        
        if (now - limitStats.lastReset > 60000) {
          limitStats.count = 0;
          limitStats.lastReset = now;
        }

        // Limit user message frequency (max 15 inputs per minute)
        if (limitStats.count >= 15) {
          addLog("warning", `ChatID ${chatId} exceeded speed thresholds. Ignoring update.`);
          return true;
        }

        limitStats.count++;
        this.rateLimits.set(chatId, limitStats);
        return false;
      };

      // 1. Text Message
      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const fromUser = msg.from?.username || msg.from?.first_name || "Пользователь";

        // Access enforcement Whitelist Guard
        if (!isAllowedUser(msg)) {
          const uName = msg.from?.username ? `@${msg.from.username}` : "отсутствует";
          const uId = msg.from?.id || "неизвестен";
          await this.sendTelegramMessage(
            chatId,
            `🔐 **Доступ ограничен (Приватный режим)**\n\n` +
            `Ваша учетная запись не внесена в белый список бота. Чтобы получить доступ, укажите свои данные в файле **.env** в переменной \`TELEGRAM_ALLOWED_USER\`:\n\n` +
            `• **Ваш Telegram ID:** \`${uId}\`\n` +
            `• **Ваш Username:** \`${uName}\`\n\n` +
            `**Как исправить:**\n` +
            `Откройте ваш файл \`.env\` на компьютере и замените строку \`TELEGRAM_ALLOWED_USER="..."\` на одну из следующих:\n` +
            `\`\`\`env\n` +
            `TELEGRAM_ALLOWED_USER="${uId}"\n` +
            `\`\`\`\n` +
            `или\n` +
            `\`\`\`env\n` +
            `TELEGRAM_ALLOWED_USER="${msg.from?.username || "ваш_username"}"\n` +
            `\`\`\`\n\n` +
            `После сохранения файла \`.env\` обязательно перезапустите бота!`
          );
          return;
        }

        // Protection Rate Limiter Guard
        if (isRateLimited(chatId)) {
          await this.sendTelegramMessage(chatId, "⚠️ Превышен лимит запросов (максимум 15 сообщений в минуту). Пожалуйста, подождите.");
          return;
        }

        addLog("info", `Received telegram push from @${fromUser}: ID ${msg.message_id}`);

        // Handle voice messages specifically!
        if (msg.voice) {
          addLog("info", `Voice message received from @${fromUser}. Notifying that cloud transcription is deactivated.`);
          await this.sendTelegramMessage(
            chatId, 
            "🎤 **Голосовой ввод временно отключен** в целях обеспечения 100% конфиденциальности и автономности работы вашего Obsidian-помощника.\n\nПожалуйста, задавайте вопросы `/rag ...` или создавайте новые заметки с помощью текстовых сообщений! ✍️"
          );
          return;
        }

        // Standard text text message
        if (msg.text) {
          const userTxt = msg.text;
          const botReply = await executeBotCommand(userTxt, false);
          await this.sendTelegramMessage(chatId, botReply.text, botReply.reply_markup);
        }
      }

      // 2. Callback Queries
      if (update.callback_query) {
        const cq = update.callback_query;
        const cqId = cq.id;
        const queryData = cq.data;
        const chatId = cq.message?.chat?.id;

        // Access enforcement Whitelist Guard on Callback
        if (cq.message && !isAllowedUser(cq)) {
          return;
        }

        addLog("info", `Received Telegram callback click: "${queryData}"`);

        // Answer callback first
        await fetch(`https://api.telegram.org/bot${this.activeToken}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: cqId }),
        });

        if (chatId && queryData) {
          // Direct parse if standard button command
          if (queryData.startsWith("cmd_")) {
            const parsed = await executeBotCommand(queryData, false);
            await this.sendTelegramMessage(chatId, parsed.text, parsed.reply_markup);
          } else if (queryData.startsWith("view_file:")) {
            const relPath = queryData.substring(10);
            const absoluteNotePath = path.join(VAULT_ROOT, relPath.replace(/\.\./g, ""));
            try {
              if (fs.existsSync(absoluteNotePath)) {
                const noteContent = fs.readFileSync(absoluteNotePath, "utf8");
                const preview = `📄 **Заметка:** \`${relPath}\`\n\n\`\`\`markdown\n${noteContent.substring(0, 350)}\n\`\`\`` +
                  (noteContent.length > 350 ? "\n..._содержимое обрезано_" : "");
                await this.sendTelegramMessage(chatId, preview);
              } else {
                await this.sendTelegramMessage(chatId, "⚠️ Этот файл больше не существует в хранилище.");
              }
            } catch (err: any) {
              await this.sendTelegramMessage(chatId, `❌ Ошибка открытия: ${err.message}`);
            }
          }
        }
      }
    } catch (err: any) {
      addLog("error", `Error processing TG update: ${err?.message}`);
    }
  }

  private async sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
    if (!this.activeToken) return;
    try {
      // Escape or format nicely. Standard Markdown preview
      // Telegram supports MarkdownV2 or HTML. Let's send HTML to prevent escaped character errors!
      // Simple HTML converter to preserve bold, code tags, blockquotes
      const formatHtml = text
        .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
        .replace(/\*(.*?)\*/g, "<i>$1</i>")
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/```markdown\n([\s\S]*?)```/g, "<pre>$1</pre>")
        .replace(/```([\s\S]*?)```/g, "<pre>$1</pre>");

      const payload: any = {
        chat_id: chatId,
        text: formatHtml,
        parse_mode: "HTML",
      };

      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }

      await fetch(`https://api.telegram.org/bot${this.activeToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      addLog("success", `Sent reply pushed to client chat ID: ${chatId}`);
    } catch (sendErr: any) {
      addLog("error", `Failed sending TG reply: ${sendErr?.message}`);
    }
  }
}

// Global polling coordinator instance
const tgBotService = new SimpleTelegramPollingRuntime();

// Config triggers endpoints
app.get("/api/bot/config", (req, res) => {
  const token = tgBotService.getToken();
  res.json({
    tokenSet: !!token && token !== "MY_TELEGRAM_TOKEN",
    telegramUsername: "ObsidianBot", // Simulated
    botStatus: tgBotService.getStatus(),
  });
});

app.post("/api/bot/config", (req, res) => {
  const { token } = req.body;
  if (token === undefined) {
    return res.status(400).json({ error: "No token provided" });
  }

  // Update token
  tgBotService.setToken(token || null);
  
  // Set in current env during run to preserve
  if (token) {
    process.env.TELEGRAM_BOT_TOKEN = token;
  } else {
    delete process.env.TELEGRAM_BOT_TOKEN;
  }

  addLog("success", `Bot token updated to: ${token ? "SET (Active)" : "CLEARED"}`);
  res.json({
    tokenSet: !!token,
    telegramUsername: "ObsidianBot",
    botStatus: tgBotService.getStatus(),
  });
});

// Setup dev/prod static routers
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Try auto-starting if token configured in process env initially
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== "MY_TELEGRAM_TOKEN") {
    tgBotService.restart();
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
