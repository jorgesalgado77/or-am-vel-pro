/**
 * VendaZap Conversation History Manager
 * Persists full conversation sessions per client in localStorage.
 * Each session stores: messages, settings used, links generated, scores, DISC profile, etc.
 */

export interface HistoricoEntry {
  remetente_tipo: "cliente" | "ia";
  mensagem: string;
  intent?: string;
  score?: number;
  timestamp?: string;
}

export interface ConversationSession {
  id: string;
  clientId: string;
  clientName: string;
  entries: HistoricoEntry[];
  settings: {
    tipoCopy: string;
    tom: string;
    discProfile?: string | null;
    closingScore?: number | null;
  };
  dealRoomLinks: string[];
  createdAt: string;
  updatedAt: string;
  lastScore: number | null;
  totalMessages: number;
}

const STORAGE_KEY = "vendazap-conversation-history";
const MAX_SESSIONS = 100;

function loadAll(): ConversationSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(sessions: ConversationSession[]) {
  // Keep only the most recent MAX_SESSIONS
  const trimmed = sessions.slice(0, MAX_SESSIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

/**
 * Get the active session for a client (the most recent one)
 */
export function getActiveSession(clientId: string): ConversationSession | null {
  const all = loadAll();
  return all.find((s) => s.clientId === clientId) || null;
}

/**
 * Get all sessions, most recent first
 */
export function getAllSessions(): ConversationSession[] {
  return loadAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Get all sessions grouped by client
 */
export function getSessionsByClient(): Record<string, ConversationSession[]> {
  const all = loadAll();
  const grouped: Record<string, ConversationSession[]> = {};
  for (const session of all) {
    if (!grouped[session.clientId]) grouped[session.clientId] = [];
    grouped[session.clientId].push(session);
  }
  // Sort each group by updatedAt desc
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return grouped;
}

/**
 * Save or update a conversation session for a client.
 * If a session exists for this client, updates it. Otherwise creates a new one.
 */
export function saveSession(
  clientId: string,
  clientName: string,
  entries: HistoricoEntry[],
  settings: ConversationSession["settings"],
  dealRoomLinks: string[] = [],
): ConversationSession {
  const all = loadAll();
  const now = new Date().toISOString();

  // Find existing session for this client
  const existingIdx = all.findIndex((s) => s.clientId === clientId);

  const scored = entries.filter((e) => e.score !== undefined);
  const lastScore = scored.length > 0 ? scored[scored.length - 1].score ?? null : null;

  // Add timestamps to entries that don't have them
  const stamped = entries.map((e) => ({
    ...e,
    timestamp: e.timestamp || now,
  }));

  if (existingIdx >= 0) {
    // Update existing
    all[existingIdx] = {
      ...all[existingIdx],
      entries: stamped,
      settings,
      dealRoomLinks: [...new Set([...all[existingIdx].dealRoomLinks, ...dealRoomLinks])],
      updatedAt: now,
      lastScore,
      totalMessages: stamped.length,
      clientName, // Update in case it changed
    };
    // Move to front
    const updated = all.splice(existingIdx, 1)[0];
    all.unshift(updated);
    saveAll(all);
    return updated;
  } else {
    // Create new
    const session: ConversationSession = {
      id: `session-${clientId}-${Date.now()}`,
      clientId,
      clientName,
      entries: stamped,
      settings,
      dealRoomLinks,
      createdAt: now,
      updatedAt: now,
      lastScore,
      totalMessages: stamped.length,
    };
    all.unshift(session);
    saveAll(all);
    return session;
  }
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string) {
  const all = loadAll().filter((s) => s.id !== sessionId);
  saveAll(all);
}

/**
 * Delete all sessions for a client
 */
export function deleteClientSessions(clientId: string) {
  const all = loadAll().filter((s) => s.clientId !== clientId);
  saveAll(all);
}

/**
 * Clear all history
 */
export function clearAllHistory() {
  localStorage.removeItem(STORAGE_KEY);
}
