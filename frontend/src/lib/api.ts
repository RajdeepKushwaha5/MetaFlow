/** API client for the MetaFlow backend. */

import type { PlaybookInfo } from "./types";

const BASE = "";

export async function fetchPlaybooks(): Promise<PlaybookInfo[]> {
  const res = await fetch(`${BASE}/api/playbooks`);
  if (!res.ok) throw new Error("Failed to fetch playbooks");
  return res.json();
}

/**
 * Stream a chat message. Returns an EventSource-like reader that
 * yields parsed JSON events.
 */
export async function streamChat(
  message: string,
  threadId?: string | null,
  onEvent?: (data: Record<string, unknown>) => void
) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, thread_id: threadId }),
  });

  if (!res.ok) throw new Error("Chat request failed");

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const json = trimmed.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        onEvent?.(JSON.parse(json));
      } catch {
        // skip malformed events
      }
    }
  }
}

/**
 * Stream a playbook execution. Works the same as streamChat but
 * for the playbook endpoint.
 */
export async function streamPlaybook(
  playbookId: string,
  userInput: string,
  onEvent?: (data: Record<string, unknown>) => void
) {
  const res = await fetch(`${BASE}/api/playbooks/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playbook_id: playbookId, user_input: userInput }),
  });

  if (!res.ok) throw new Error("Playbook request failed");

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const json = trimmed.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        onEvent?.(JSON.parse(json));
      } catch {
        // skip malformed events
      }
    }
  }
}
