import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Snowflake, ClipboardList, BarChart3, Settings as SettingsIcon, Menu, X, Cloud, Database, Cylinder as CylinderIcon } from 'lucide-react';
import { dbService } from '../firebase';
import meijerLogo from '../Meijer_logo.jpeg';

export const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const isFirebase = dbService.isUsingFirebase();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Snowflake },
    { path: '/cilinders', label: 'Cilinders', icon: CylinderIcon },
    { path: '/registraties', label: 'Registraties', icon: ClipboardList },
    { path: '/jaarbalans', label: 'Jaarbalans', icon: BarChart3 },
    { path: '/instellingen', label: 'Instellingen', icon: SettingsIcon },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-zinc-950 text-white sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="bg-white p-1 rounded-lg flex items-center justify-center overflow-hidden w-16 h-10 border border-zinc-800">
              <img src={meijerLogo} alt="Meijer Veendam Logo" className="object-contain max-w-full max-h-full" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-wide block">KMR</span>
              <span className="text-xs text-zinc-400 font-mono">BRL100 v2</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive(item.path)
                      ? 'bg-zinc-800 text-blue-400 border border-zinc-700'
                      : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}

            {/* Database Status Indicator */}
            <div className={`ml-4 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border ${
              isFirebase 
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50' 
                : 'bg-amber-950/40 text-amber-400 border-amber-900/50'
            }`}>
              {isFirebase ? (
                <>
                  <Cloud className="h-3.5 w-3.5" />
                  <span>Cloud (Firebase)</span>
                </>
              ) : (
                <>
                  <Database className="h-3.5 w-3.5" />
                  <span>Lokaal (Browser)</span>
                </>
              )}
            </div>
          </div>

          {/* Mobile hamburger button */}
          <div className="md:hidden flex items-center gap-4">
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-mono border ${
              isFirebase 
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50' 
                : 'bg-amber-950/40 text-amber-400 border-amber-900/50'
            }`}>
              <span>{isFirebase ? 'Cloud' : 'Lokaal'}</span>
            </div>
            <button
              onClick={() => setIsOpen(!isOpen)}
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900 focus:outline-none"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-zinc-900 border-t border-zinc-800 px-2 pt-2 pb-3 space-y-1 sm:px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-all ${
                  isActive(item.path)
                    ? 'bg-zinc-800 text-blue-400'
                    : 'text-zinc-300 hover:bg-zinc-850 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
};