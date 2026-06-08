import React, { useEffect, useState } from 'react';
import { dbService } from '../firebase';
import type { Refrigerant, Registration } from '../firebase';
import { Snowflake, ClipboardList, Thermometer, ShieldAlert, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const [refrigerants, setRefrigerants] = useState<Refrigerant[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const refs = await dbService.getRefrigerants();
        const regs = await dbService.getRegistrations();
        setRefrigerants(refs);
        setRegistrations(regs);
      } catch (e) {
        console.error("Error loading dashboard data:", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Calculate stats
  const totalStockKg = refrigerants.reduce((sum, r) => sum + r.current_stock_kg, 0);
  const totalRegistrations = registrations.length;
  const totalCo2EquivalentTonnes = registrations.reduce((sum, reg) => sum + (reg.co2_equivalent || 0), 0);

  // Latest registrations (max 5)
  const latestRegistrations = registrations.slice(0, 5);

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight">Koudemiddel Registratie Overzicht</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          Actuele status van uw f-gassen administratie conform de Nederlandse BRL100 versie 2 richtlijn.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Stock */}
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex items-start gap-4 hover:shadow-md transition-shadow">
          <div className="bg-blue-50 text-blue-600 p-3 rounded-lg">
            <Snowflake className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Totale Cilindervoorraad</p>
            <h3 className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{totalStockKg.toFixed(1)} kg</h3>
            <p className="text-xs text-zinc-400 mt-1">Gereserveerd in gasflessen</p>
          </div>
        </div>

        {/* KPI 2: Registrations */}
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex items-start gap-4 hover:shadow-md transition-shadow">
          <div className="bg-emerald-50 text-emerald-600 p-3 rounded-lg">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Mutaties (Installatieniveau)</p>
            <h3 className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{totalRegistrations}</h3>
            <p className="text-xs text-zinc-400 mt-1">Aantal geregistreerde handelingen</p>
          </div>
        </div>

        {/* KPI 3: CO2 Equivalent */}
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-6 flex items-start gap-4 hover:shadow-md transition-shadow">
          <div className="bg-purple-50 text-purple-600 p-3 rounded-lg">
            <Thermometer className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Totaal CO2-equivalent</p>
            <h3 className="text-2xl font-bold text-zinc-900 mt-1 font-mono">{totalCo2EquivalentTonnes.toFixed(2)} Ton</h3>
            <p className="text-xs text-zinc-400 mt-1">Gebaseerd op geregistreerde vullingen</p>
          </div>
        </div>
      </div>

      {/* Stock Levels & Latest Registrations Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Stock Breakdown */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-zinc-900">Actuele Voorraad per Koudemiddel</h2>
            <Link to="/instellingen" className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              + Toevoegen
            </Link>
          </div>
          <div className="space-y-6">
            {refrigerants.map((ref) => {
              // Calculate percentage of cylinder capacity (assume 120kg max for display bar)
              const percentage = Math.min(100, (((ref.current_stock_kg ?? 0)) / 120) * 100);
              return (
                <div key={ref.id} className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-800">{ref.name}</span>
                      <span className="text-xs font-mono bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded">GWP: {ref.gwp}</span>
                      {(ref.reclaim_stock_kg || 0) > 0 && (
                        <span className="text-2xs font-extrabold bg-red-50 text-red-700 px-1.5 py-0.5 rounded border border-red-200">
                          Reclaim: {(ref.reclaim_stock_kg ?? 0).toFixed(1)} kg
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-zinc-900">{(ref.current_stock_kg ?? 0).toFixed(1)} kg</span>
                  </div>
                  <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Latest Registrations */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900">Laatste Registraties</h2>
            <Link to="/registraties" className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              Bekijk alles
            </Link>
          </div>

          {latestRegistrations.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
              <ShieldAlert className="h-8 w-8 text-zinc-400 mb-2" />
              <p className="text-sm text-zinc-500">Nog geen registraties aanwezig.</p>
              <Link to="/registraties" className="mt-3 text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-850">
                Eerste toevoegen
              </Link>
            </div>
          ) : (
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-100 text-2xs text-zinc-400 uppercase font-bold tracking-wider">
                    <th className="pb-3">Datum</th>
                    <th className="pb-3">Installatie ID</th>
                    <th className="pb-3">Middel</th>
                    <th className="pb-3">Mutatie</th>
                    <th className="pb-3 text-right">Aantal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 text-sm">
                  {latestRegistrations.map((reg) => (
                    <tr key={reg.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="py-3 text-zinc-500 font-mono text-xs">{reg.date}</td>
                      <td className="py-3 font-medium text-zinc-900">{reg.installation_id}</td>
                      <td className="py-3 text-zinc-600">{reg.refrigerant_name}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          reg.mutation === 'toevoeging' || reg.mutation === 'afrekening'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {reg.mutation === 'toevoeging' || reg.mutation === 'afrekening' ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {reg.mutation.charAt(0).toUpperCase() + reg.mutation.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-zinc-800">{(reg.amount_kg ?? 0).toFixed(1)} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};