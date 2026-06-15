import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import meijerLogo from '../Meijer_logo.jpeg';

interface LockScreenProps {
  onUnlock: (password: string) => boolean;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    
    if (!password) return;

    const success = onUnlock(password);
    if (!success) {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950 text-white font-sans">
      <div className="w-full max-w-md p-8 px-6 sm:px-8 mx-4 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl relative overflow-hidden">
        
        {/* Decorative background element */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-600/5 rounded-full blur-3xl pointer-events-none"></div>

        {/* Header/Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="bg-white p-2.5 rounded-2xl shadow-lg shadow-white/5 mb-4 border border-zinc-800 flex items-center justify-center overflow-hidden w-40 h-20">
            <img src={meijerLogo} alt="Meijer Veendam Logo" className="object-contain max-w-full max-h-full" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white mb-1.5">
            KMR Registratiesysteem
          </h1>
          <p className="text-zinc-400 text-sm font-mono">
            BRL 100 v2 • Toegang Beveiligd
          </p>
        </div>

        {/* Lock Status Info */}
        <div className="text-center mb-6">
          <p className="text-zinc-300 text-sm">
            Deze applicatie is beveiligd. Voer het toegangswachtwoord in om door te gaan.
          </p>
        </div>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-955 border border-red-900/50 text-red-400 p-3 rounded-lg text-sm text-center font-medium">
              Onjuist wachtwoord. Probeer het opnieuw.
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-2xs font-bold text-zinc-400 uppercase tracking-wider">
              Wachtwoord
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                autoFocus
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(false);
                }}
                className={`pl-9 pr-10 py-3 w-full rounded-xl bg-zinc-800/80 border text-white text-base font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  error ? 'border-red-500 focus:ring-red-500' : 'border-zinc-700/80'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                title={showPassword ? "Verberg wachtwoord" : "Toon wachtwoord"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-3 rounded-xl text-base shadow-lg shadow-blue-600/20 hover:shadow-blue-600/35 transition-all flex items-center justify-center gap-2 mt-2"
          >
            <span>App Openen</span>
          </button>
        </form>

        {/* Footer info */}
        <div className="text-center mt-8 text-3xs text-zinc-500 font-mono border-t border-zinc-800/60 pt-4">
          © {new Date().getFullYear()} Meijer Veendam • BRL100 v2
        </div>
      </div>
    </div>
  );
};
