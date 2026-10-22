/** Chat shapes shared by the assistant panel and /api/assistant (Gemini's generateContent format). */
import type { Tab } from './hooks';

export interface FunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface ChatPart {
  text?: string;
  functionCall?: FunctionCall;
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  /** Gemini's reasoning signature: sent back untouched with the part it came on. */
  thoughtSignature?: string;
  thought?: boolean;
}

export interface ChatContent {
  role: 'user' | 'model';
  parts: ChatPart[];
}

export type AssistantReply = { ok: true; content: ChatContent } | { ok: false; error: string };

/** Tools that change data: the person confirms each one before it runs. */
export const WRITE_TOOLS = ['add_material', 'create_product', 'add_recipe_lines', 'add_team_member'] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];

export const PAGES: Record<Tab, string> = {
  home: 'Dashboard',
  stock: 'Stock',
  plan: 'Production plan',
  orders: 'Purchase orders',
  setup: 'Setup',
  team: 'Team',
};
