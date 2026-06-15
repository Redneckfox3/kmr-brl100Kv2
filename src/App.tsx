import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { Cylinders } from './pages/Cylinders';
import { Registrations } from './pages/Registrations';
import { Jaarbalans } from './pages/Jaarbalans';
import { Settings } from './pages/Settings';
import { LockScreen } from './components/LockScreen';
import { dbService } from './firebase';

function App() {
  const [isLocked, setIsLocked] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // 1. Immediate sync check of local cache to prevent flashing
    const cachedPassword = localStorage.getItem('kmr_app_password');
    if (cachedPassword) {
      setIsLocked(true);
      setCheckingAuth(false);
    }

    // 2. Fetch fresh password from cloud database and update cache
    const checkFreshPassword = async () => {
      try {
        const freshPassword = await dbService.getAppPassword();
        if (freshPassword) {
          setIsLocked(true);
        } else {
          // If no password is set in cloud, unlock immediately
          setIsLocked(false);
        }
      } catch (e) {
        console.error("Failed to fetch fresh password on load:", e);
      } finally {
        setCheckingAuth(false);
      }
    };
    checkFreshPassword();
  }, []);

  const handleUnlock = (password: string) => {
    const savedPassword = localStorage.getItem('kmr_app_password');
    if (savedPassword && password === savedPassword) {
      setIsLocked(false);
      return true;
    }
    return false;
  };

  if (checkingAuth) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-zinc-950 text-white font-sans">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-sm text-zinc-400 font-mono">Beveiliging controleren...</p>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-zinc-50">
        <Navbar />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cilinders" element={<Cylinders />} />
            <Route path="/registraties" element={<Registrations />} />
            <Route path="/jaarbalans" element={<Jaarbalans />} />
            <Route path="/instellingen" element={<Settings />} />
            {/* Fallback to Dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        
        {/* Footer */}
        <footer className="bg-white border-t border-zinc-200 py-6 text-center text-xs text-zinc-400 font-mono">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p>© {new Date().getFullYear()} KMR Registratiesysteem BRL100 v2. Alle rechten voorbehouden.</p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;