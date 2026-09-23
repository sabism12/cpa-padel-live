import React, { useState } from 'react';
import { X, Lock, ShieldCheck, ClipboardEdit, AlertCircle, KeyRound } from 'lucide-react';
import { login } from '../api';
import { AuthSession } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (session: AuthSession) => void;
  defaultRole?: 'scorekeeper' | 'admin';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultRole = 'scorekeeper',
}) => {
  const [role, setRole] = useState<'scorekeeper' | 'admin'>(defaultRole);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await login(role, password, name.trim() || undefined);
      const session: AuthSession = {
        token: res.token,
        role: res.role,
        name: res.name,
        expiresAt: Date.now() + 48 * 60 * 60 * 1000,
      };
      localStorage.setItem('cpa_auth_session', JSON.stringify(session));
      onSuccess(session);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="auth-modal-dialog"
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-7 relative overflow-hidden"
      >
        {/* Decorative subtle glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-lime-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-lime-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-display">Staff Authentication</h2>
              <p className="text-xs text-slate-400">Scorekeeper terminal &amp; tournament admin</p>
            </div>
          </div>
          <button
            id="btn-close-auth-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role toggle tabs */}
        <div className="grid grid-cols-2 gap-2 mt-5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            type="button"
            id="role-tab-scorekeeper"
            onClick={() => {
              setRole('scorekeeper');
              setError(null);
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              role === 'scorekeeper'
                ? 'bg-lime-400 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ClipboardEdit className="w-4 h-4" />
            <span>Scorekeeper</span>
          </button>
          <button
            type="button"
            id="role-tab-admin"
            onClick={() => {
              setRole('admin');
              setError(null);
            }}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              role === 'admin'
                ? 'bg-purple-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Admin</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div
              id="auth-error-banner"
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Operator / Official Name
            </label>
            <input
              type="text"
              id="auth-input-name"
              placeholder={role === 'scorekeeper' ? 'e.g. Court 1 Scorekeeper' : 'e.g. Chief Referee'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-lime-400/50 focus:border-lime-400 transition-colors placeholder:text-slate-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {role === 'scorekeeper' ? 'Scorekeeper PIN / Passcode' : 'Administrator Password'}
            </label>
            <div className="relative">
              <input
                type="password"
                id="auth-input-password"
                placeholder={role === 'scorekeeper' ? 'Enter Scorekeeper PIN' : 'Enter Administrator Password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-lime-400/50 focus:border-lime-400 transition-colors placeholder:text-slate-600 pr-10"
              />
              <KeyRound className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
            </div>
          </div>

          <button
            type="submit"
            id="btn-auth-submit"
            disabled={loading}
            className={`w-full mt-4 py-2.5 px-4 rounded-xl font-bold text-sm tracking-wide transition-all shadow-lg flex items-center justify-center gap-2 ${
              role === 'scorekeeper'
                ? 'bg-lime-400 hover:bg-lime-300 text-slate-950 shadow-lime-500/20'
                : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20'
            }`}
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Sign In as {role === 'scorekeeper' ? 'Scorekeeper' : 'Administrator'}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
