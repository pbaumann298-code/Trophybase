import React, { useState } from 'react';
import { normalizeEmail } from '../../lib/maintenanceAccess';

function AdminLoginForm({ onLogin, loading, errorMessage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(normalizeEmail(email), password.trim());
  };

  return (
    <div className="w-full max-w-md mx-auto bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-8 shadow-2xl">
      <div className="text-center mb-8">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-2">
          Geheimer Bereich
        </p>
        <h1 className="text-xl font-bold text-white">
          TrophyBase <span className="text-[#00ff66]">Admin</span>
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">E-Mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-[#00ff66]/40"
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Passwort</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-[#121314] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-[#00ff66]/40"
            autoComplete="current-password"
          />
        </label>
        {errorMessage && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
            {errorMessage}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 bg-[#00ff66] hover:bg-[#00dd55] disabled:opacity-50 text-[#121314] font-bold text-sm py-2.5 rounded-xl transition"
        >
          {loading ? 'Anmelden…' : 'Admin-Login'}
        </button>
      </form>
    </div>
  );
}

export default AdminLoginForm;
