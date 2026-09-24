/**
 * Server-only storage adapters for the existing tournament state shape.
 * Local development uses ./data/tournament_state.json. Production can use
 * Supabase JSONB storage without changing the TournamentStore state model.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface StatePersistence<T> {
  load(): Promise<T | null>;
  /** Atomically create initial state only if no state is saved yet. */
  initialize(initialState: T): Promise<T>;
  save(state: T): Promise<void>;
}

class JsonFileStatePersistence<T> implements StatePersistence<T> {
  private readonly dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  private readonly stateFile = path.join(this.dataDir, 'tournament_state.json');

  async load(): Promise<T | null> {
    if (!fs.existsSync(this.stateFile)) return null;

    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf-8')) as T;
    } catch (error) {
      throw new Error(
        `Unable to parse tournament state at ${this.stateFile}; refusing to replace the existing file.`,
        { cause: error }
      );
    }
  }

  async initialize(initialState: T): Promise<T> {
    const existing = await this.load();
    if (existing) return existing;
    await this.save(initialState);
    return initialState;
  }

  async save(state: T): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true });

    // A sibling temp file plus atomic rename prevents a process interruption
    // from leaving tournament_state.json half-written.
    const temporaryFile = `${this.stateFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      fs.renameSync(temporaryFile, this.stateFile);
    } catch (error) {
      try {
        if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
      } catch {
        // Preserve the original persistence error.
      }
      throw new Error(`Unable to persist tournament state in ${this.dataDir}.`, { cause: error });
    }
  }
}

class SupabaseStatePersistence<T> implements StatePersistence<T> {
  private readonly client: SupabaseClient;
  private readonly hostname: string;
  private readonly serviceRoleKey: string;

  constructor(url: string, serviceRoleKey: string) {
    try {
      this.hostname = new URL(url).hostname;
    } catch {
      throw new Error('SUPABASE_URL is invalid; expected a valid HTTPS project URL.');
    }
    this.serviceRoleKey = serviceRoleKey;
    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }

  /** Log nested fetch causes without ever logging the configured service key. */
  private reportRequestFailure(operation: string, rootError: unknown): Error {
    const causes: Array<{ name: string; code: string | null; message: string }> = [];
    const pending: unknown[] = [rootError];
    const visited = new Set<object>();

    const redact = (value: unknown): string => {
      let text = typeof value === 'string' ? value : String(value ?? '');
      if (this.serviceRoleKey) text = text.split(this.serviceRoleKey).join('[REDACTED]');
      text = text.replace(/(authorization|apikey)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
      return text.slice(0, 1000);
    };

    while (pending.length && causes.length < 10) {
      const current = pending.shift();
      if (!current || typeof current !== 'object' || visited.has(current)) continue;
      visited.add(current);

      const error = current as {
        name?: unknown;
        code?: unknown;
        message?: unknown;
        cause?: unknown;
        errors?: unknown;
      };
      causes.push({
        name: redact(
          (typeof error.message === 'string' && error.message.match(/^([A-Za-z]+Error)\s*:/)?.[1]) ||
            error.name ||
            'Error'
        ),
        code: error.code == null || error.code === '' ? null : redact(error.code),
        message: redact(error.message || current),
      });

      if (error.cause) pending.push(error.cause);
      if (Array.isArray(error.errors)) pending.push(...error.errors);

      // postgrest-js normalizes a rejected fetch into its API error object and
      // serializes the original cause into `details`. Recover that cause line
      // so TypeError: fetch failed still includes the underlying DNS/socket
      // error name, code, and message in Render logs.
      if (typeof (error as any).details === 'string') {
        for (const line of (error as any).details.split(/\r?\n/)) {
          const match = line.match(/^\s*Caused by:\s*([^:]+):\s*(.*)$/);
          if (!match) continue;
          const codeMatch = match[2].match(/\s+\(([A-Z][A-Z0-9_-]+)\)$/);
          const message = codeMatch ? match[2].slice(0, codeMatch.index).trim() : match[2].trim();
          causes.push({
            name: redact(match[1]),
            code: codeMatch ? redact(codeMatch[1]) : null,
            message: redact(message),
          });
        }
      }
    }

    console.error(
      `[Supabase] ${operation} request failed`,
      JSON.stringify({ hostname: this.hostname, causes })
    );

    // Do not attach the raw fetch error as Error.cause: startup error handlers
    // may log it, which could accidentally print headers or credential data.
    return new Error(`Supabase ${operation} failed for host ${this.hostname}; see redacted cause details above.`);
  }

  async load(): Promise<T | null> {
    try {
      const { data, error } = await this.client
        .from('tournament_state')
        .select('state')
        .eq('id', 'singleton')
        .maybeSingle();

      if (error) throw error;
      return (data?.state as T | undefined) ?? null;
    } catch (error) {
      throw this.reportRequestFailure('load', error);
    }
  }

  async initialize(initialState: T): Promise<T> {
    // The database function uses INSERT ... ON CONFLICT DO NOTHING, then
    // returns the stored row. Concurrent/restarting servers cannot overwrite
    // an already-saved draw with seed data.
    try {
      const { data, error } = await this.client.rpc('initialize_tournament_state', {
        initial_state: initialState,
      });
      if (error) throw error;
      if (!data) throw new Error('Supabase initialization returned no tournament state.');
      return data as T;
    } catch (error) {
      throw this.reportRequestFailure('initialize', error);
    }
  }

  async save(state: T): Promise<void> {
    try {
      const { error } = await this.client.rpc('save_tournament_state', {
        next_state: state,
      });
      if (error) throw error;
    } catch (error) {
      throw this.reportRequestFailure('save', error);
    }
  }
}

export function createStatePersistence<T>(): StatePersistence<T> {
  const driver = process.env.TOURNAMENT_STORAGE ||
    (process.env.NODE_ENV === 'production' ? 'supabase' : 'file');

  if (driver === 'file') return new JsonFileStatePersistence<T>();
  if (driver === 'supabase') {
    const url = process.env.SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase storage.');
    }
    return new SupabaseStatePersistence<T>(url, serviceRoleKey);
  }

  throw new Error('TOURNAMENT_STORAGE must be either "file" or "supabase".');
}
