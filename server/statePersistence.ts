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

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
  }

  async load(): Promise<T | null> {
    const { data, error } = await this.client
      .from('tournament_state')
      .select('state')
      .eq('id', 'singleton')
      .maybeSingle();

    if (error) throw new Error(`Failed to load tournament state from Supabase: ${error.message}`);
    return (data?.state as T | undefined) ?? null;
  }

  async initialize(initialState: T): Promise<T> {
    // The database function uses INSERT ... ON CONFLICT DO NOTHING, then
    // returns the stored row. Concurrent/restarting servers cannot overwrite
    // an already-saved draw with seed data.
    const { data, error } = await this.client.rpc('initialize_tournament_state', {
      initial_state: initialState,
    });
    if (error) throw new Error(`Failed to initialize tournament state in Supabase: ${error.message}`);
    if (!data) throw new Error('Supabase initialization returned no tournament state.');
    return data as T;
  }

  async save(state: T): Promise<void> {
    const { error } = await this.client.rpc('save_tournament_state', {
      next_state: state,
    });
    if (error) throw new Error(`Failed to save tournament state to Supabase: ${error.message}`);
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
