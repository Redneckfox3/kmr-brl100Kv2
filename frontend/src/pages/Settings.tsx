import React, { useEffect, useState } from 'react';
import { dbService } from '../firebase';
import type { Refrigerant, FirebaseConfig } from '../firebase';
import { 
  Plus, Save, Cloud, 
  HelpCircle, Trash2, Eye, EyeOff, Check, Layers, Edit2, X, PlusCircle, Calendar as CalendarIcon
} from 'lucide-react';

export const Settings: React.FC = () => {
  const [refrigerants, setRefrigerants] = useState<Refrigerant[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  // New refrigerant form
  const [refName, setRefName] = useState('');
  const [refGwp, setRefGwp] = useState('');
  const [refStock, setRefStock] = useState('');
  const [refError, setRefError] = useState<string | null>(null);
  const [refSubmitting, setRefSubmitting] = useState(false);

  // Inkoop / Purchase Form
  const [inkoopRefId, setInkoopRefId] = useState('');
  const [inkoopAmountKg, setInkoopAmountKg] = useState('');
  const [inkoopDate, setInkoopDate] = useState(new Date().toISOString().split('T')[0]);
  const [inkoopReference, setInkoopReference] = useState('');
  const [inkoopError, setInkoopError] = useState<string | null>(null);
  const [inkoopSuccess, setInkoopSuccess] = useState<string | null>(null);
  const [inkoopSubmitting, setInkoopSubmitting] = useState(false);

  // Inline editing state for refrigerant stock
  const [editingRefId, setEditingRefId] = useState<string | null>(null);
  const [editStockVal, setEditStockVal] = useState<string>('');

  // Firebase Config form
  const [apiKey, setApiKey] = useState('');
  const [authDomain, setAuthDomain] = useState('');
  const [projectId, setProjectId] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [messagingSenderId, setMessagingSenderId] = useState('');
  const [appId, setAppId] = useState('');
  
  const [showFirebaseSecret, setShowFirebaseSecret] = useState(false);
  const [firebaseStatusMessage, setFirebaseStatusMessage] = useState<string | null>(null);
  const [isFirebaseActive, setIsFirebaseActive] = useState(false);

  // Sync / Migration state
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    loadRefrigerants();
    loadFirebaseConfig();
  }, []);

  const loadRefrigerants = async () => {
    setLoadingRefs(true);
    try {
      const list = await dbService.getRefrigerants();
      setRefrigerants(list);
      if (list.length > 0 && !inkoopRefId) {
        setInkoopRefId(list[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRefs(false);
    }
  };

  const handleRegisterInkoop = async (e: React.FormEvent) => {
    e.preventDefault();
    setInkoopError(null);
    setInkoopSuccess(null);

    const amount = parseFloat(inkoopAmountKg);
    const refId = inkoopRefId || (refrigerants.length > 0 ? refrigerants[0].id : '');

    if (!refId) return setInkoopError("Selecteer een koudemiddel.");
    if (isNaN(amount) || amount <= 0) return setInkoopError("Vul een geldige hoeveelheid in (groter dan 0).");

    setInkoopSubmitting(true);
    try {
      await dbService.addRegistration({
        installation_id: inkoopReference.trim() || "CILINDER-VOORRAAD",
        refrigerant_id: refId,
        amount_kg: amount,
        mutation: 'inkoop',
        reason: 'inkoop',
        date: inkoopDate
      });
      setInkoopAmountKg('');
      setInkoopReference('');
      setInkoopSuccess("Inkoop succesvol geregistreerd! De cilindervoorraad is verhoogd.");
      await loadRefrigerants();
    } catch (err: any) {
      setInkoopError(err.message || "Fout bij opslaan inkoop.");
    } finally {
      setInkoopSubmitting(false);
    }
  };

  const handleStartEditStock = (ref: Refrigerant) => {
    setEditingRefId(ref.id);
    setEditStockVal(ref.current_stock_kg.toString());
  };

  const handleSaveStock = async (ref: Refrigerant) => {
    const stockVal = parseFloat(editStockVal);
    if (isNaN(stockVal) || stockVal < 0) {
      alert("Voer een geldige voorraad in (groter of gelijk aan 0).");
      return;
    }

    try {
      await dbService.updateRefrigerant(ref.id, { current_stock_kg: stockVal });
      setEditingRefId(null);
      await loadRefrigerants();
    } catch (err: any) {
      alert("Fout bij opslaan: " + err.message);
    }
  };

  const handleCancelEditStock = () => {
    setEditingRefId(null);
  };

  const handleDeleteRefrigerant = async (ref: Refrigerant) => {
    try {
      const registrations = await dbService.getRegistrations();
      const usages = registrations.filter(r => r.refrigerant_id === ref.id);
      
      let confirmMessage = `Weet u zeker dat u koudemiddel "${ref.name}" wilt verwijderen?`;
      if (usages.length > 0) {
        confirmMessage = `Waarschuwing: Er zijn ${usages.length} registraties gekoppeld aan "${ref.name}". \n\nAls u dit koudemiddel verwijdert, zullen deze registraties "Onbekend" tonen en klopt de jaarbalans mogelijk niet meer. \n\nWeet u zeker dat u "${ref.name}" wilt verwijderen?`;
      }
      
      if (window.confirm(confirmMessage)) {
        await dbService.deleteRefrigerant(ref.id);
        await loadRefrigerants();
      }
    } catch (err: any) {
      alert("Fout bij verwijderen: " + err.message);
    }
  };

  const handleResetReclaim = async (ref: Refrigerant) => {
    const amount = ref.reclaim_stock_kg || 0;
    if (amount <= 0) return;

    if (window.confirm(`Weet u zeker dat u de reclaim cilinder voor "${ref.name}" wilt legen (${amount.toFixed(1)} kg)? \n\nDit betekent dat het koudemiddel definitief is aangeboden voor vernietiging.`)) {
      try {
        await dbService.updateRefrigerant(ref.id, { reclaim_stock_kg: 0 });
        await loadRefrigerants();
      } catch (err: any) {
        alert("Fout bij legen reclaim cilinder: " + err.message);
      }
    }
  };

  const loadFirebaseConfig = () => {
    const config = dbService.getSavedConfig();
    setIsFirebaseActive(dbService.isUsingFirebase());
    if (config) {
      setApiKey(config.apiKey || '');
      setAuthDomain(config.authDomain || '');
      setProjectId(config.projectId || '');
      setStorageBucket(config.storageBucket || '');
      setMessagingSenderId(config.messagingSenderId || '');
      setAppId(config.appId || '');
    }
  };

  const handleAddRefrigerant = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefError(null);

    const name = refName.trim().toUpperCase();
    const gwp = parseInt(refGwp);
    const stock = parseFloat(refStock) || 0;

    if (!name) return setRefError("Vul de naam van het koudemiddel in (bijv. R32).");
    if (isNaN(gwp) || gwp <= 0) return setRefError("Vul een geldig GWP in (groter dan 0).");
    if (stock < 0) return setRefError("Cilindervoorraad mag niet negatief zijn.");

    // Check if duplicate
    if (refrigerants.some(r => r.name.toUpperCase() === name)) {
      return setRefError(`Koudemiddel ${name} bestaat al.`);
    }

    setRefSubmitting(true);
    try {
      await dbService.addRefrigerant({
        name,
        gwp,
        current_stock_kg: stock,
        reclaim_stock_kg: 0
      });
      setRefName('');
      setRefGwp('');
      setRefStock('');
      await loadRefrigerants();
    } catch (err: any) {
      setRefError(err.message || "Fout bij opslaan.");
    } finally {
      setRefSubmitting(false);
    }
  };

  const handleSaveFirebaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setFirebaseStatusMessage(null);

    if (!projectId.trim() || !apiKey.trim() || !appId.trim()) {
      setFirebaseStatusMessage("Vul ten minste Project ID, API Key en App ID in.");
      return;
    }

    const config: FirebaseConfig = {
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim(),
      projectId: projectId.trim(),
      storageBucket: storageBucket.trim(),
      messagingSenderId: messagingSenderId.trim(),
      appId: appId.trim()
    };

    try {
      dbService.saveConfig(config);
      setFirebaseStatusMessage("Firebase configuratie opgeslagen! De pagina laadt nu opnieuw om de database te verbinden...");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e: any) {
      setFirebaseStatusMessage("Fout bij opslaan config: " + e.message);
    }
  };

  const handleClearFirebaseConfig = () => {
    if (window.confirm("Weet u zeker dat u de Firebase-verbinding wilt verbreken? U schakelt dan terug naar de lokale database in uw browser.")) {
      dbService.saveConfig(null);
      setFirebaseStatusMessage("Firebase configuratie gewist. Schakelen naar lokale database...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const handleMigrateData = async () => {
    setSyncing(true);
    setSyncStatus(null);
    setSyncError(null);
    try {
      const result = await dbService.migrateLocalDataToFirebase();
      setSyncStatus(`Succesvol gesynchroniseerd! Er zijn ${result.refrigerantsMigrated} koudemiddelen en ${result.registrationsMigrated} registraties gekopieerd naar Firebase.`);
      await loadRefrigerants();
    } catch (e: any) {
      setSyncError(e.message || "Er is een fout opgetreden bij de synchronisatie.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight">Systeeminstellingen</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Beheer koudemiddelen, GWP-waarden en uw database-hostingverbinding.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Refrigerant Stock & Add New */}
        <div className="space-y-8">
          {/* Add Refrigerant Card */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2 mb-4">
              <Plus className="h-5 w-5 text-blue-600" />
              Nieuw Koudemiddel Toevoegen
            </h2>

            <form onSubmit={handleAddRefrigerant} className="space-y-4">
              {refError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                  {refError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Naam *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Bijv. R452A"
                    value={refName}
                    onChange={(e) => setRefName(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    GWP waarde *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="Bijv. 2140"
                    value={refGwp}
                    onChange={(e) => setRefGwp(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Initiële Cilindervoorraad (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Bijv. 20.0"
                  value={refStock}
                  onChange={(e) => setRefStock(e.target.value)}
                  className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={refSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm shadow-sm transition-colors disabled:opacity-50"
              >
                {refSubmitting ? "Opslaan..." : "Opslaan en Toevoegen"}
              </button>
            </form>
          </div>

          {/* Purchase Refrigerant (Inkoop) Card */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2 mb-4">
              <PlusCircle className="h-5 w-5 text-blue-600" />
              Inkoop Koudemiddel Registreren
            </h2>

            <form onSubmit={handleRegisterInkoop} className="space-y-4">
              {inkoopError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                  {inkoopError}
                </div>
              )}
              {inkoopSuccess && (
                <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm border border-emerald-100 font-medium">
                  {inkoopSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Selecteer Koudemiddel *
                  </label>
                  <select
                    value={inkoopRefId}
                    onChange={(e) => setInkoopRefId(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    {refrigerants.map((ref) => (
                      <option key={ref.id} value={ref.id}>{ref.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Ingekocht Gewicht (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Bijv. 10.0"
                    value={inkoopAmountKg}
                    onChange={(e) => setInkoopAmountKg(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Datum van Inkoop *
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      type="date"
                      required
                      value={inkoopDate}
                      onChange={(e) => setInkoopDate(e.target.value)}
                      className="pl-9 pr-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Inkoopreferentie / Leverancier
                  </label>
                  <input
                    type="text"
                    placeholder="Bijv. Factuur-2026-103"
                    value={inkoopReference}
                    onChange={(e) => setInkoopReference(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={inkoopSubmitting}
                className="w-full bg-zinc-900 hover:bg-zinc-850 text-white font-medium py-2 rounded-lg text-sm shadow-sm transition-colors disabled:opacity-50"
              >
                {inkoopSubmitting ? "Registreren..." : "Inkoop Registreren"}
              </button>
            </form>
          </div>

          {/* Refrigerant Inventory Table Card */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2 mb-4">
              <Layers className="h-5 w-5 text-blue-600" />
              Beschikbare Koudemiddelen
            </h2>

            {loadingRefs ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 text-2xs font-bold text-zinc-500 uppercase tracking-wider">
                      <th className="pb-3 text-left">Naam</th>
                      <th className="pb-3 text-center">GWP</th>
                      <th className="pb-3 text-right">Nieuw Gas Voorraad</th>
                      <th className="pb-3 text-right">Reclaim Cilinder</th>
                      <th className="pb-3 text-right">Acties</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-sm">
                    {refrigerants.map((ref) => (
                      <tr key={ref.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="py-3 font-bold text-zinc-900">{ref.name}</td>
                        <td className="py-3 text-center font-mono text-zinc-500">{ref.gwp}</td>
                        <td className="py-3 text-right font-mono font-bold text-zinc-800">
                          {editingRefId === ref.id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                step="0.1"
                                value={editStockVal}
                                onChange={(e) => setEditStockVal(e.target.value)}
                                className="px-2 py-1 border border-blue-500 rounded text-sm w-20 text-right font-mono focus:outline-none"
                              />
                              <button
                                onClick={() => handleSaveStock(ref)}
                                className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                                title="Opslaan"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={handleCancelEditStock}
                                className="p-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                                title="Annuleren"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <span>{(ref.current_stock_kg ?? 0).toFixed(1)} kg</span>
                              <button
                                onClick={() => handleStartEditStock(ref)}
                                className="p-1 rounded text-zinc-400 hover:text-blue-600 hover:bg-zinc-100 transition-all"
                                title="Bewerk voorraad"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-zinc-800">
                          <div className="flex items-center justify-end gap-2">
                            <span className={(ref.reclaim_stock_kg || 0) > 0 ? "text-red-600 font-extrabold" : "text-zinc-400"}>
                              {(ref.reclaim_stock_kg || 0).toFixed(3)} kg
                            </span>
                            <button
                              disabled={!(ref.reclaim_stock_kg > 0)}
                              onClick={() => handleResetReclaim(ref)}
                              className={`p-1 rounded transition-all ${
                                (ref.reclaim_stock_kg || 0) > 0
                                  ? "text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                                  : "text-zinc-300 cursor-not-allowed opacity-50"
                              }`}
                              title={
                                (ref.reclaim_stock_kg || 0) > 0
                                  ? "Aanbieden voor vernietiging (leegmaken reclaim)"
                                  : "Reclaim voorraad is al leeg"
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleDeleteRefrigerant(ref)}
                              className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-zinc-100 transition-all"
                              title="Verwijder koudemiddel"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Database Connection & Hosting Instructions */}
        <div className="space-y-8">
          {/* Cloud Database Integration Card */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Cloud className="h-5 w-5 text-blue-600" />
                Remote Cloud Database (Firebase)
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono border ${
                isFirebaseActive 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {isFirebaseActive ? 'Verbonden' : 'Lokaal Actief'}
              </span>
            </div>

            {firebaseStatusMessage && (
              <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm border border-blue-100 mb-4 font-medium flex items-center gap-2">
                <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span>{firebaseStatusMessage}</span>
              </div>
            )}

            <form onSubmit={handleSaveFirebaseConfig} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Project ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Bijv. kmr-registratie-8dfb"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1 flex justify-between items-center">
                    <span>API Key *</span>
                    <button 
                      type="button" 
                      onClick={() => setShowFirebaseSecret(!showFirebaseSecret)}
                      className="text-2xs text-blue-600 hover:text-blue-700"
                    >
                      {showFirebaseSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </label>
                  <input
                    type={showFirebaseSecret ? "text" : "password"}
                    required
                    placeholder="AIzaSyA8..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    App ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Bijv. 1:82046522:web:0f..."
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Auth Domain
                  </label>
                  <input
                    type="text"
                    placeholder="kmr-registratie.firebaseapp.com"
                    value={authDomain}
                    onChange={(e) => setAuthDomain(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Storage Bucket
                  </label>
                  <input
                    type="text"
                    placeholder="kmr-registratie.appspot.com"
                    value={storageBucket}
                    onChange={(e) => setStorageBucket(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Messaging Sender ID
                  </label>
                  <input
                    type="text"
                    placeholder="82046522338"
                    value={messagingSenderId}
                    onChange={(e) => setMessagingSenderId(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-zinc-900 hover:bg-zinc-850 text-white font-medium py-2 rounded-lg text-sm shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <Save className="h-4 w-4" />
                  Cloud database verbinden
                </button>
                {isFirebaseActive && (
                  <button
                    type="button"
                    onClick={handleClearFirebaseConfig}
                    className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 p-2 rounded-lg transition-colors"
                    title="Configuratie wissen / Verbinding verbreken"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Data Synchronisatie / Migratie Card */}
          {isFirebaseActive && (
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 space-y-4">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Check className="h-5 w-5 text-emerald-600 animate-pulse" />
                Data Synchroniseren naar Cloud
              </h2>
              <p className="text-sm text-zinc-600">
                Heeft u koudemiddelen of registraties ingevoerd toen u lokaal werkte? U kunt deze nu veilig kopiëren naar uw Firebase Cloud database. Dubbele regels worden automatisch overgeslagen om dubbelingen te voorkomen.
              </p>
              
              {syncStatus && (
                <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm border border-emerald-100 font-medium">
                  {syncStatus}
                </div>
              )}
              {syncError && (
                <div className="bg-red-50 text-red-650 p-3 rounded-lg text-sm border border-red-100">
                  {syncError}
                </div>
              )}

              <button
                type="button"
                disabled={syncing}
                onClick={handleMigrateData}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-lg text-sm shadow-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {syncing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Bezig met synchroniseren...
                  </>
                ) : (
                  <>
                    Kopieer Lokale Data naar Firebase
                  </>
                )}
              </button>
            </div>
          )}

          {/* Help & Setup Guide Card */}
          <div className="bg-zinc-100 border border-zinc-200 rounded-xl p-6 space-y-4">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-zinc-700" />
              Hoe zet ik een gratis Cloud database op?
            </h3>
            <ol className="list-decimal pl-5 text-sm text-zinc-600 space-y-2.5 leading-relaxed">
              <li>
                Ga naar de <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold">Firebase Console</a> en log in met een Google-account.
              </li>
              <li>
                Klik op <strong className="text-zinc-800">Project toevoegen</strong> en geef het een naam (bijv. <code className="font-mono text-xs bg-zinc-200 px-1 rounded">kmr-registratie</code>).
              </li>
              <li>
                Ga in het linkermenu naar <strong className="text-zinc-800">Firestore Database</strong> en klik op <strong className="text-zinc-800">Database maken</strong>. Kies een serverlocatie (bijv. <code className="font-mono text-xs">eur3 (europe-west)</code>) en start in <strong className="text-zinc-800">testmodus</strong>.
              </li>
              <li>
                Klik op het startscherm van uw Firebase project op het <strong className="text-zinc-800">Web-icoon (&lt;/&gt;)</strong> om een web-app te registreren.
              </li>
              <li>
                Kopieer de getoonde <code className="font-mono text-xs bg-zinc-200 px-1 rounded">firebaseConfig</code> waarden en plak ze hierboven in de velden. Sla op om direct verbinding te maken!
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};