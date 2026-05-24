import React from 'react';

function TesterSetupPage({ onCreateAccount }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    const mail = e.target.newEmail.value;
    const pw = e.target.newPassword.value;
    const pwConfirm = e.target.newPasswordConfirm.value;
    
    if (pw !== pwConfirm) {
      alert("Die Passwörter stimmen nicht überein!");
      return;
    }
    if (pw.length < 6) {
      alert("Das Passwort muss mindestens 6 Zeichen lang sein!");
      return;
    }
    
    onCreateAccount(mail, pw);
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-[#1a1b1c] border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <div className="w-12 h-12 rounded-full bg-[#00ff66]/10 flex items-center justify-center text-xl mb-4 mx-auto">🔐</div>
        <h2 className="text-xl font-bold text-white text-center mb-1">Tester-Zugang aktivieren</h2>
        <p className="text-xs text-zinc-400 text-center mb-6 max-w-xs mx-auto">
          Du hast das Einlass-Tor passiert! Erstelle jetzt deinen persönlichen Account. Danach wird der Tester-Zugang für andere gesperrt.
        </p>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
              Deine echte E-Mail-Adresse
            </label>
            <input 
              type="email" 
              name="newEmail" 
              required 
              className="w-full bg-[#121314] text-zinc-200 px-4 py-2.5 rounded-xl border border-zinc-800 focus:border-zinc-700 focus:outline-none text-sm transition" 
              placeholder="jack@fromsoft.de" 
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
              Dein eigenes Passwort (min. 6 Zeichen)
            </label>
            <input 
              type="password" 
              name="newPassword" 
              required 
              className="w-full bg-[#121314] text-zinc-200 px-4 py-2.5 rounded-xl border border-zinc-800 focus:border-zinc-700 focus:outline-none text-sm transition" 
              placeholder="••••••••" 
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
              Passwort wiederholen
            </label>
            <input 
              type="password" 
              name="newPasswordConfirm" 
              required 
              className="w-full bg-[#121314] text-zinc-200 px-4 py-2.5 rounded-xl border border-zinc-800 focus:border-zinc-700 focus:outline-none text-sm transition" 
              placeholder="••••••••" 
            />
          </div>
          <button 
            type="submit" 
            className="w-full mt-2 bg-[#00ff66] text-black font-semibold text-sm py-2.5 rounded-xl hover:bg-[#00e65c] transition shadow-lg shadow-[#00ff66]/10"
          >
            Meinen Account aktivieren & starten 🚀
          </button>
        </form>
      </div>
    </div>
  );
}

export default TesterSetupPage;