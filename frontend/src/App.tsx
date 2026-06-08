import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { Registrations } from './pages/Registrations';
import { Jaarbalans } from './pages/Jaarbalans';
import { Settings } from './pages/Settings';
import { Cylinders } from './pages/Cylinders';

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-zinc-50">
        <Navbar />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/registraties" element={<Registrations />} />
            <Route path="/jaarbalans" element={<Jaarbalans />} />
            <Route path="/cilinders" element={<Cylinders />} />
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