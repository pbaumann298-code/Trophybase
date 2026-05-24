import React from 'react';

function LoginPage({ onLogin }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    onLogin(email, password);
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <h2 className="text-xl font-bold text-white text-center mb-1">TrophyBase Login</h2>
        <p className="text-xs text-zinc-500 text-center mb-6">Trage deine Zugangsdaten ein</p>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
              E-Mail-Adresse
            </label>
            <input 
              type="email" 
              name="email" 
              required 
              className="w-full bg-[#121314] text-zinc-200 px-4 py-2.5 rounded-xl border border-zinc-800 focus:border-zinc-700 focus:outline-none text-sm transition" 
              placeholder="deine@mail.de" 
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
              Passwort
            </label>
            <input 
              type="password" 
              name="password" 
              required 
              className="w-full bg-[#121314] text-zinc-200 px-4 py-2.5 rounded-xl border border-zinc-800 focus:border-zinc-700 focus:outline-none text-sm transition" 
              placeholder="••••••••" 
            />
          </div>
          <button 
            type="submit" 
            className="w-full mt-2 bg-[#00ff66] text-black font-semibold text-sm py-2.5 rounded-xl hover:bg-[#00e65c] transition shadow-lg shadow-[#00ff66]/10"
          >
            Anmelden
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;