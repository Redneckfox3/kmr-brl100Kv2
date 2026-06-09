import React, { useEffect, useState } from 'react';
import { dbService, Refrigerant, Cylinder } from '../firebase';
import { 
  Plus, Edit2, Trash2, X, ClipboardList, Info, 
  Search, Calendar, ChevronDown, CheckCircle2, AlertTriangle, AlertCircle, ArrowRightLeft
} from 'lucide-react';

export const Cylinders: React.FC = () => {
  const [cylinders, setCylinders] = useState<Cylinder[]>([]);
  const [refrigerants, setRefrigerants] = useState<Refrigerant[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRef, setSelectedRef] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Form / Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields (Cylinder)
  const [cylinderNumber, setCylinderNumber] = useState('');
  const [type, setType] = useState<Cylinder['type']>('nieuw');
  const [refrigerantId, setRefrigerantId] = useState('');
  const [tareWeight, setTareWeight] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('');
  const [inspectionDate, setInspectionDate] = useState('');
  const [status, setStatus] = useState<Cylinder['status']>('magazijn');
  const [location, setLocation] = useState('');

  // Transaction Modal State
  const [isTransModalOpen, setIsTransModalOpen] = useState(false);
  const [transCylinder, setTransCylinder] = useState<Cylinder | null>(null);
  const [transDate, setTransDate] = useState(new Date().toISOString().split('T')[0]);
  const [transInstId, setTransInstId] = useState('');
  const [transAmount, setTransAmount] = useState('');
  const [transMutation, setTransMutation] = useState<'toevoeging' | 'afrekening' | 'terugwinning' | 'afvoer'>('toevoeging');
  const [transReason, setTransReason] = useState('onderhoud');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const refs = await dbService.getRefrigerants();
      const cyls = await dbService.getCylinders();
      setRefrigerants(refs);
      setCylinders(cyls);
      if (refs.length > 0) {
        setRefrigerantId(refs[0].id);
      }
    } catch (e) {
      console.error("Error loading cylinders data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setCylinderNumber('');
    setType('nieuw');
    if (refrigerants.length > 0) {
      setRefrigerantId(refrigerants[0].id);
    }
    setTareWeight('');
    setMaxCapacity('');
    
    // Default inspection date: 10 years from today
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 10);
    setInspectionDate(futureDate.toISOString().split('T')[0]);
    
    setStatus('magazijn');
    setLocation('');
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cyl: Cylinder) => {
    setEditingId(cyl.id);
    setCylinderNumber(cyl.cylinder_number);
    setType(cyl.type);
    setRefrigerantId(cyl.refrigerant_id);
    setTareWeight(cyl.tare_weight_kg.toString());
    setMaxCapacity(cyl.max_capacity_kg.toString());
    setInspectionDate(cyl.inspection_date);
    setStatus(cyl.status);
    setLocation(cyl.location || '');
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenTransModal = (cyl: Cylinder) => {
    setTransCylinder(cyl);
    setTransDate(new Date().toISOString().split('T')[0]);
    setTransInstId('');
    setTransAmount('');
    setTransMutation('toevoeging');
    setTransReason('onderhoud');
    setError(null);
    setIsTransModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Weet u zeker dat u deze cilinder wilt verwijderen?")) {
      try {
        await dbService.deleteCylinder(id);
        await loadData();
      } catch (e: any) {
        alert("Fout bij verwijderen: " + e.message);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cylinderNumber.trim()) return setError("Vul een cilindernummer/barcode in.");
    if (!refrigerantId) return setError("Selecteer een koudemiddel.");
    if (!tareWeight || parseFloat(tareWeight) <= 0) return setError("Vul een geldig tarra gewicht in.");
    if (!maxCapacity || parseFloat(maxCapacity) <= 0) return setError("Vul een geldige maximale inhoud in.");
    if (!inspectionDate) return setError("Vul de vervaldatum/keuringsdatum in.");

    setSubmitting(true);
    setError(null);

    const data: any = {
      cylinder_number: cylinderNumber.trim(),
      type,
      refrigerant_id: refrigerantId,
      tare_weight_kg: parseFloat(tareWeight),
      max_capacity_kg: parseFloat(maxCapacity),
      inspection_date: inspectionDate,
      status
    };

    if (location.trim()) {
      data.location = location.trim();
    }

    try {
      if (editingId) {
        await dbService.updateCylinder(editingId, data);
      } else {
        await dbService.addCylinder(data);
      }
      setIsModalOpen(false);
      await loadData();
    } catch (e: any) {
      setError(e.message || "Er is een fout opgetreden bij het opslaan.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transCylinder) return;
    if (!transInstId.trim()) return setError("Vul een Installatie ID in.");
    if (!transAmount || parseFloat(transAmount) <= 0) return setError("Vul een geldige hoeveelheid in.");

    setSubmitting(true);
    setError(null);

    try {
      await dbService.addRegistration({
        date: transDate,
        installation_id: transInstId.trim(),
        refrigerant_id: transCylinder.refrigerant_id,
        amount_kg: parseFloat(transAmount),
        mutation: transMutation,
        reason: transReason,
        cylinder_id: transCylinder.id
      });
      setIsTransModalOpen(false);
      alert("Verbruik succesvol geregistreerd!");
    } catch (e: any) {
      setError(e.message || "Er is een fout opgetreden bij het registreren van verbruik.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter cylinders
  const filteredCylinders = cylinders.filter((cyl) => {
    const matchesSearch = cyl.cylinder_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (cyl.location && cyl.location.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRef = selectedRef === 'all' || cyl.refrigerant_id === selectedRef;
    const matchesStatus = selectedStatus === 'all' || cyl.status === selectedStatus;
    return matchesSearch && matchesRef && matchesStatus;
  });

  const getInspectionStatus = (dateStr: string) => {
    const inspection = new Date(dateStr);
    const today = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(today.getMonth() + 3);

    if (inspection < today) {
      return { label: 'Verlopen', color: 'text-red-600', icon: AlertCircle };
    } else if (inspection < threeMonthsFromNow) {
      return { label: 'Binnenkort (3 mnd)', color: 'text-amber-600', icon: AlertTriangle };
    }
    return { label: 'Geldig', color: 'text-emerald-600', icon: CheckCircle2 };
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight">Cilinderregistratie (Flessen)</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Beheer uw koudemiddelcilinders conform BRL 100 richtlijnen, inclusief keuringsdata en locaties.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm shadow-sm hover:shadow transition-all self-start sm:self-center"
        >
          <Plus className="h-4 w-4" />
          Cilinder Toevoegen
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-zinc-100 border border-zinc-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-zinc-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-zinc-600 leading-relaxed">
          <strong>BRL 100 Verplichting:</strong> Het is verplicht om van alle koudemiddelflessen (zowel eigendom, huur als terugwin) bij te houden waar ze zijn en tot wanneer ze gekeurd zijn. Flessen waarvan de keuringsdatum verstreken is, mogen niet meer worden gevuld.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Zoek op cilindernummer of locatie..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Refrigerant Filter */}
        <div className="relative">
          <select
            value={selectedRef}
            onChange={(e) => setSelectedRef(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="all">Alle Koudemiddelen</option>
            {refrigerants.map((ref) => (
              <option key={ref.id} value={ref.id}>{ref.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        </div>

        {/* Status Filter */}
        <div className="relative">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="all">Alle Statussen</option>
            <option value="magazijn">In Magazijn</option>
            <option value="monteur">Bij Monteur</option>
            <option value="leeg">Leeg</option>
            <option value="retour_leverancier">Retour Leverancier</option>
            <option value="vermist">Vermist</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        </div>
      </div>

      {/* Cylinders List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredCylinders.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <ClipboardList className="h-12 w-12 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-500 font-medium">Geen cilinders gevonden.</p>
          <p className="text-zinc-400 text-sm mt-1">Pas uw zoekfilters aan of voeg een nieuwe cilinder toe.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-2xs font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Cilindernummer</th>
                  <th className="px-6 py-4">Koudemiddel</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Gewicht & Capaciteit</th>
                  <th className="px-6 py-4">Keuringsdatum</th>
                  <th className="px-6 py-4">Status & Locatie</th>
                  <th className="px-6 py-4 text-right">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {filteredCylinders.map((cyl) => {
                  const insStatus = getInspectionStatus(cyl.inspection_date);
                  const InsIcon = insStatus.icon;

                  return (
                    <tr key={cyl.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-zinc-900 font-mono">{cyl.cylinder_number}</td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-zinc-800">{cyl.refrigerant_name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="capitalize text-zinc-600">{cyl.type}</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-zinc-600">
                        <div>Tarra: {cyl.tare_weight_kg.toFixed(1)} kg</div>
                        <div className="text-xs text-zinc-400">Max: {cyl.max_capacity_kg.toFixed(1)} kg</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <InsIcon className={`h-4 w-4 ${insStatus.color}`} />
                          <span className={`font-mono text-xs ${insStatus.color}`}>{cyl.inspection_date}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="capitalize font-medium text-zinc-800">
                          {cyl.status.replace('_', ' ')}
                        </div>
                        {cyl.location && (
                          <div className="text-xs text-zinc-500 mt-0.5">{cyl.location}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenTransModal(cyl)}
                            className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1"
                            title="Registreer verbruik uit deze cilinder"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                            <span className="text-xs font-medium hidden md:inline">Verbruik</span>
                          </button>
                          <div className="w-px h-4 bg-zinc-200 mx-1"></div>
                          <button
                            onClick={() => handleOpenEditModal(cyl)}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-blue-600 hover:bg-zinc-100 transition-colors"
                            title="Bewerken"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cyl.id)}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-red-600 hover:bg-zinc-100 transition-colors"
                            title="Verwijderen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-zinc-200 max-w-lg w-full overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50">
              <h2 className="text-lg font-bold text-zinc-900">
                {editingId ? 'Cilinder Bewerken' : 'Nieuwe Cilinder Registreren'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 rounded-md p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                  {error}
                </div>
              )}

              {/* Cilinder Number */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Cilindernummer / Barcode *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Bijv. CYL-12345"
                  value={cylinderNumber}
                  onChange={(e) => setCylinderNumber(e.target.value)}
                  className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Type */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Cilinder Type *
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="nieuw">Nieuw Gas</option>
                    <option value="reclaim">Reclaim / Terugwin</option>
                    <option value="recycling">Recycling</option>
                    <option value="huur">Huurcilinder</option>
                    <option value="eigendom">Eigendomcilinder</option>
                  </select>
                </div>

                {/* Refrigerant Selector */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Koudemiddel *
                  </label>
                  <select
                    value={refrigerantId}
                    onChange={(e) => setRefrigerantId(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    {refrigerants.map((ref) => (
                      <option key={ref.id} value={ref.id}>{ref.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Tare Weight */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Tarra Gewicht (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    placeholder="Leeggewicht"
                    value={tareWeight}
                    onChange={(e) => setTareWeight(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

                {/* Max Capacity */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Max. Inhoud (kg) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    required
                    placeholder="Max vulling"
                    value={maxCapacity}
                    onChange={(e) => setMaxCapacity(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              {/* Inspection Date */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Keuringsdatum / Vervaldatum *
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    type="date"
                    required
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                    className="pl-9 pr-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Status */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Status *
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="magazijn">In Magazijn</option>
                    <option value="monteur">Bij Monteur</option>
                    <option value="leeg">Leeg</option>
                    <option value="retour_leverancier">Retour Leverancier</option>
                    <option value="vermist">Vermist</option>
                  </select>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Specifieke Locatie
                  </label>
                  <input
                    type="text"
                    placeholder="Bijv. Bus 1 / Jan"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-sm rounded-lg transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {isTransModalOpen && transCylinder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-zinc-200 max-w-lg w-full overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50">
              <h2 className="text-lg font-bold text-zinc-900">
                Verbruik Registreren
              </h2>
              <button
                onClick={() => setIsTransModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 rounded-md p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleTransSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                  {error}
                </div>
              )}

              <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm border border-blue-100 flex items-start gap-2 mb-2">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>
                  Je registreert nu een handeling direct vanuit cilinder <strong>{transCylinder.cylinder_number}</strong> ({transCylinder.refrigerant_name}). 
                  Deze actie wordt opgeslagen in het algemene Installatieregistraties overzicht én gekoppeld aan deze fles.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Datum *
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    type="date"
                    required
                    value={transDate}
                    onChange={(e) => setTransDate(e.target.value)}
                    className="pl-9 pr-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Installatie ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Bijv. 1234AB-10"
                  value={transInstId}
                  onChange={(e) => setTransInstId(e.target.value)}
                  className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Mutatie soort *
                  </label>
                  <select
                    value={transMutation}
                    onChange={(e) => setTransMutation(e.target.value as any)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="toevoeging">Toevoeging (Vullen)</option>
                    <option value="terugwinning">Terugwinning (Aftappen)</option>
                    <option value="afrekening">Afrekening</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Reden *
                  </label>
                  <select
                    value={transReason}
                    onChange={(e) => setTransReason(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="onderhoud">Onderhoud</option>
                    <option value="lekkage">Lekkage</option>
                    <option value="nieuwbouw">Nieuwbouw</option>
                    <option value="retrofit">Retrofit</option>
                    <option value="buitengebruikstelling">Buitengebruikstelling</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Hoeveelheid (kg) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={transAmount}
                  onChange={(e) => setTransAmount(e.target.value)}
                  className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsTransModalOpen(false)}
                  className="px-4 py-2 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-sm rounded-lg transition-colors"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};