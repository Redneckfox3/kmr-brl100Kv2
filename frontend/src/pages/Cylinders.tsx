import React, { useEffect, useState } from 'react';
import { dbService } from '../firebase';
import type { Refrigerant, Cylinder } from '../firebase';
import { 
  Plus, Edit2, Trash2, X, ClipboardList, Info, 
  Search, Package, Save, Check
} from 'lucide-react';

export const Cylinders: React.FC = () => {
  const [cylinders, setCylinders] = useState<Cylinder[]>([]);
  const [refrigerants, setRefrigerants] = useState<Refrigerant[]>([]);
  const [loading, setLoading] = useState(true);

  // Form / Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [serialNumber, setSerialNumber] = useState('');
  const [refrigerantId, setRefrigerantId] = useState('');
  const [tareWeight, setTareWeight] = useState('');
  const [currentWeight, setCurrentWeight] = useState('');
  const [cylinderCard, setCylinderCard] = useState('');

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
      console.error("Error loading cylinders:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingId(null);
    setSerialNumber('');
    if (refrigerants.length > 0) {
      setRefrigerantId(refrigerants[0].id);
    }
    setTareWeight('');
    setCurrentWeight('');
    setCylinderCard('');
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cyl: Cylinder) => {
    setEditingId(cyl.id);
    setSerialNumber(cyl.serial_number);
    setRefrigerantId(cyl.refrigerant_id);
    setTareWeight(cyl.tare_weight.toString());
    setCurrentWeight(cyl.current_weight.toString());
    setCylinderCard(cyl.cylinder_card || '');
    setError(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Weet u zeker dat u deze cilinder wilt verwijderen uit het systeem?")) {
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
    setError(null);

    if (!serialNumber.trim()) return setError("Serienummer is verplicht.");
    if (!refrigerantId) return setError("Koudemiddel is verplicht.");
    
    const tare = parseFloat(tareWeight);
    const current = parseFloat(currentWeight);

    if (isNaN(tare) || tare < 0) return setError("Leeggewicht (tarra) moet een geldig getal zijn.");
    if (isNaN(current) || current < 0) return setError("Huidig gewicht moet een geldig getal zijn.");
    if (current < tare) return setError("Huidig gewicht kan niet minder zijn dan het leeggewicht.");

    setSubmitting(true);
    try {
      const cylData = {
        serial_number: serialNumber.trim(),
        refrigerant_id: refrigerantId,
        tare_weight: tare,
        current_weight: current,
        cylinder_card: cylinderCard.trim() || undefined
      };

      if (editingId) {
        await dbService.updateCylinder(editingId, cylData);
      } else {
        await dbService.addCylinder(cylData);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" />
            <span>Cilinderbeheer (Flessenbeheer)</span>
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Conform BRL 100 v2 cilinder- en traceerbaarheidseisen.</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Cilinder Toevoegen</span>
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-zinc-500 font-mono text-sm">
          Cilindergegevens laden...
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Serienummer</th>
                  <th className="px-6 py-4">Koudemiddel</th>
                  <th className="px-6 py-4 text-right">Leeggewicht (Tarra)</th>
                  <th className="px-6 py-4 text-right">Huidig Gewicht</th>
                  <th className="px-6 py-4 text-right">Netto Gas</th>
                  <th className="px-6 py-4">Flessenkaart Opmerking</th>
                  <th className="px-6 py-4 text-center">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-150 text-sm font-medium text-zinc-700">
                {cylinders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-400">
                      Geen cilinders geregistreerd in het systeem.
                    </td>
                  </tr>
                ) : (
                  cylinders.map((cyl) => {
                    const ref = refrigerants.find(r => r.id === cyl.refrigerant_id);
                    const netto = cyl.current_weight - cyl.tare_weight;
                    return (
                      <tr key={cyl.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-zinc-900">{cyl.serial_number}</td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">
                            {ref ? ref.name : 'Onbekend'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-zinc-600">{cyl.tare_weight.toFixed(2)} kg</td>
                        <td className="px-6 py-4 text-right font-mono text-zinc-900 font-bold">{cyl.current_weight.toFixed(2)} kg</td>
                        <td className="px-6 py-4 text-right font-mono text-emerald-600 font-black">
                          {netto.toFixed(2)} kg
                        </td>
                        <td className="px-6 py-4 text-zinc-500 max-w-xs truncate italic" title={cyl.cylinder_card}>
                          {cyl.cylinder_card || '--'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditModal(cyl)}
                              className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded transition"
                              title="Wijzigen"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(cyl.id)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                              title="Verwijderen"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-zinc-200 rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-zinc-200 flex justify-between items-center bg-zinc-50">
              <h2 className="text-lg font-bold text-zinc-900">
                {editingId ? 'Cilinder Wijzigen' : 'Nieuwe Cilinder Registreren'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-grow">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-semibold">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Serienummer (Flesnummer)</label>
                <input
                  type="text"
                  required
                  placeholder="Bijv. SN-98231-A"
                  className="w-full border border-zinc-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold font-mono"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Koudemiddel Type</label>
                <select
                  required
                  className="w-full border border-zinc-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                  value={refrigerantId}
                  onChange={(e) => setRefrigerantId(e.target.value)}
                >
                  <option value="">Selecteer koudemiddel...</option>
                  {refrigerants.map(r => (
                    <option key={r.id} value={r.id}>{r.name} (GWP: {r.gwp})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Leeggewicht (Tarra) in kg</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="Bijv. 6.50"
                    className="w-full border border-zinc-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                    value={tareWeight}
                    onChange={(e) => setTareWeight(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Huidig Gewicht (Bruto) in kg</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="Bijv. 16.50"
                    className="w-full border border-zinc-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                    value={currentWeight}
                    onChange={(e) => setCurrentWeight(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">Flessenkaart Opmerkingen (Optioneel)</label>
                <textarea
                  placeholder="Bijv. Eigendom leverancier X, keuringsdatum 2028-09"
                  className="w-full border border-zinc-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[80px]"
                  value={cylinderCard}
                  onChange={(e) => setCylinderCard(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-150">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-lg text-sm text-zinc-700 hover:bg-zinc-50 transition font-semibold"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-bold shadow disabled:opacity-50 transition"
                >
                  <Save className="h-4 w-4" />
                  <span>{submitting ? 'Opslaan...' : 'Opslaan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
