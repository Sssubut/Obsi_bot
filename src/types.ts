export interface VaultNote {
  name: string;
  path: string; // Relative to vault root e.g. "Inbox/My Note.md"
  content: string;
  size: number;
  mtime: string;
  tags: string[];
}

export interface TelegramMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: string;
  isVoice?: boolean;
  voiceDuration?: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface VaultStats {
  totalNotes: number;
  totalSize: number;
  tags: TagCount[];
  folderCounts: Record<string, number>;
  recentNotes: { name: string; path: string; mtime: string }[];
}

export interface BotConfig {
  tokenSet: boolean;
  telegramUsername: string;
  botStatus: "idle" | "polling" | "error";
  errorMsg?: string;
}

export interface BotLog {
  id: string;
  timestamp: string;
  level: "info" | "success" | "error" | "warning";
  message: string;
}
