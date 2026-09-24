import { DrawApiState } from './types';

/**
 * Client for the authoritative draw API.
 * Reads are public; every write requires the existing admin token.
 */

export interface DrawMutationResponse {
  success: boolean;
  state: DrawApiState;
  result?: { drawOrder: number; pairId: string; assignedGroup: string };
  error?: string;
}

export async function fetchDraw(): Promise<DrawApiState> {
  const res = await fetch('/api/draw');
  if (!res.ok) throw new Error(`Failed to load draw (HTTP ${res.status}).`);
  return res.json();
}

async function post(token: string, path: string, body?: unknown): Promise<DrawMutationResponse> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (HTTP ${res.status}).`);
  }
  return data as DrawMutationResponse;
}

export function adminSaveDrawPairs(
  token: string,
  pairs: { player1: string; player2: string }[]
) {
  return post(token, '/api/admin/draw/pairs', { pairs });
}

export function adminInitializeDraw(token: string) {
  return post(token, '/api/admin/draw/initialize');
}

export function adminSpinDraw(token: string) {
  return post(token, '/api/admin/draw/spin');
}

export function adminUndoDraw(token: string) {
  return post(token, '/api/admin/draw/undo');
}

export function adminResetDraw(token: string) {
  return post(token, '/api/admin/draw/reset');
}
