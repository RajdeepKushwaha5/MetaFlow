/** Shared TypeScript types. */

export interface PlaybookInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  input_label: string;
  input_placeholder: string;
  step_count: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface PlaybookStepEvent {
  type: "step_start" | "chunk" | "step_done" | "playbook_done" | "error";
  step?: number;
  description?: string;
  content?: string;
  message?: string;
}
