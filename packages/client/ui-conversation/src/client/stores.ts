/** Per-session Conversation store shared by the shell body and header. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ConversationStoreState } from './contract/views.ts'
import type { DraftInput, DraftSnapshot } from './contract/draft-editor.ts'
import { parseStoredDraft } from './draft.ts'

const CONVERSATION_STORE_KEY = 'dsh.conversation'
/** Shared draft slot for conversations that have not sent a first message yet. */
const DRAFT_NEW_KEY = '__pending__'

/** Declared write set for the Conversation shell. */
type ConversationActions = {
  setDraft: (draft: ConversationStoreState, text: DraftInput) => void
  setView: (draft: ConversationStoreState, view: string) => void
  openView: (draft: ConversationStoreState, view: string, focus: string) => void
  completeViewRequest: (draft: ConversationStoreState) => void
}

/**
 * Declare per-session draft persistence and View selection.
 * @returns the store handle.
 */
export function createConversationStore(): EngineStoreHandle<ConversationStoreState, ConversationActions> {
  return defineStore({
    init: (): ConversationStoreState => ({ draft: '', view: null, viewRequest: null }),
    persist: CONVERSATION_STORE_KEY,
    actions: {
      setDraft: (d, text: DraftInput) => { d.draft = text },
      setView: (d, view: string) => { d.view = view },
      openView: (d, view: string, focus: string) => {
        d.view = view
        d.viewRequest = { view, focus }
      },
      completeViewRequest: (d) => { d.viewRequest = null },
    },
  })
}

/**
 * Storage key of one conversation draft; null addresses the shared slot.
 * @param sessionId - Session ID, or null for the new-conversation slot.
 * @returns the localStorage key.
 */
function draftStorageKey(sessionId: SessionId | null): string {
  return sessionId === null
    ? `${CONVERSATION_STORE_KEY}.${DRAFT_NEW_KEY}`
    : `${CONVERSATION_STORE_KEY}.${sessionId}`
}

/**
 * Read a Session's draft before its input source is published to React.
 * @param sessionId - Session ID for existing conversations, or null for new unsaved conversations.
 * @returns saved semantic content, or an empty document when storage is absent or invalid.
 */
export function readConversationDraft(sessionId: SessionId | null): DraftSnapshot {
  const empty: DraftSnapshot = { text: '', references: [] }
  if (typeof localStorage === 'undefined') return empty
  try {
    const raw = localStorage.getItem(draftStorageKey(sessionId))
    if (raw === null) return empty
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null || !('draft' in stored)) return empty
    return parseStoredDraft(stored.draft) ?? empty
  } catch (_error: unknown) {
    // Unavailable browser storage or malformed JSON has no usable saved draft.
    return empty
  }
}

/**
 * Write a draft to localStorage.
 * @param sessionId - Session ID for existing conversations, or null for the shared
 *   new-conversation slot.
 * @param draft - The draft snapshot to save.
 */
export function writeConversationDraft(sessionId: SessionId | null, draft: DraftSnapshot): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(draftStorageKey(sessionId), JSON.stringify({ draft }))
  } catch (_error: unknown) {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Drop a saved draft. A blank Session owns no draft of its own, so its first
 * accepted message retires both that Session's slot and the shared one —
 * otherwise the next new conversation would resurrect the sent text.
 * @param sessionId - Session ID for existing conversations, or null for the shared
 *   new-conversation slot.
 */
export function clearConversationDraft(sessionId: SessionId | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(draftStorageKey(sessionId))
  } catch (_error: unknown) {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Read the persisted View preference before the Slot store is materialized.
 * @param sessionId - Session-scoped persistence suffix.
 * @returns the preferred View id, or null when storage has no usable value.
 */
export function readConversationViewPreference(sessionId: SessionId): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${CONVERSATION_STORE_KEY}.${sessionId}`)
    if (raw === null) return null
    const stored: unknown = JSON.parse(raw)
    if (typeof stored !== 'object' || stored === null || !('view' in stored)) return null
    return typeof stored.view === 'string' ? stored.view : null
  } catch {
    return null
  }
}
