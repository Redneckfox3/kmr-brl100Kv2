import React, { useEffect, useState } from 'react';
import { dbService, AnnualBalance, Refrigerant, Registration } from '../firebase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FileDown, Calendar, Edit2, Check, X, 
  TrendingUp, TrendingDown, ClipboardList, Layers
} from 'lucide-react';

interface KIReportRow {
  refrigerant_name: string;
  gwp: number;
  rec_retrofit: number;
  rec_onderhoud: number;
  rec_ontmanteling: number;
  fill_nieuwbouw: number;
  fill_retrofit: number;
  fill_lekkage: number;
  disp_vernietiging: number;
  disp_recycling: number;
}

export const Jaarbalans: React.FC = () => {
  const [balances, setBalances] = useState<AnnualBalance[]>([]);
  const [refrigerants, setRefrigerants] = useState<Refrigerant[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
  // Tab state: 'balans' = Sheet 3, 'ki' = Sheet 4
  const [activeTab, setActiveTab] = useState<'balans' | 'ki'>('balans');

  // Inline row editing state for Sheet 3
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartWeight, setEditStartWeight] = useState<string>('');
  const [editActualWeight, setEditActualWeight] = useState<string>('');

  const renderCellWithCo2 = (val: number, gwp: number) => {
    if (val <= 0) return <span className="text-zinc-400">0</span>;
    const co2 = ((val * gwp) / 1000).toFixed(2);
    return (
      <div className="text-center font-mono">
        <div className="text-zinc-800 font-bold">{val.toFixed(3)} kg</div>
        <div className="text-3xs text-purple-600 font-normal mt-0.5">({co2} t CO2-eq)</div>
      </div>
    );
  };

  useEffect(() => {
    loadData();
  }, [selectedYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      const bData = await dbService.getAnnualBalances(selectedYear);
      const refList = await dbService.getRefrigerants();
      const regList = await dbService.getRegistrations();
      
      setBalances(bData);
      setRefrigerants(refList);
      setRegistrations(regList);
    } catch (e) {
      console.error("Error loading jaarbalans data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (bal: AnnualBalance) => {
    setEditingId(bal.id);
    setEditStartWeight(bal.start_weight_kg.toString());
    setEditActualWeight(bal.actual_weight_kg.toString());
  };

  const handleSaveRow = async (bal: AnnualBalance) => {
    const startWeight = parseFloat(editStartWeight);
    const actualWeight = parseFloat(editActualWeight);
    
    if (isNaN(startWeight) || startWeight < 0) {
      alert("Voer een geldig startgewicht in (groter of gelijk aan 0).");
      return;
    }
    if (isNaN(actualWeight) || actualWeight < 0) {
      alert("Voer een geldige werkelijke eindstand in (groter of gelijk aan 0).");
      return;
    }

    try {
      await dbService.saveAnnualBalance({
        id: bal.id,
        year: bal.year,
        refrigerant_id: bal.refrigerant_id,
        start_weight_kg: startWeight,
        actual_weight_kg: actualWeight,
        total_purchased: bal.total_purchased,
        total_recovered: bal.total_recovered,
        total_sold: bal.total_sold,
        total_disposed: bal.total_disposed
      });
      setEditingId(null);
      await loadData();
    } catch (e: any) {
      alert("Fout bij opslaan: " + e.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  // Compile Sheet 4 dynamic data for the current year
  const compileKIReport = (): KIReportRow[] => {
    const yearRegs = registrations.filter(r => new Date(r.date).getFullYear() === selectedYear);
    
    return refrigerants.map(ref => {
      const refRegs = yearRegs.filter(r => r.refrigerant_id === ref.id);
      
      let rec_retrofit = 0;
      let rec_onderhoud = 0;
      let rec_ontmanteling = 0;
      
      let fill_nieuwbouw = 0;
      let fill_retrofit = 0;
      let fill_lekkage = 0;
      
      let disp_vernietiging = 0;
      let disp_recycling = 0;

      refRegs.forEach(reg => {
        if (reg.mutation === 'terugwinning') {
          if (reg.reason === 'retrofit') rec_retrofit += reg.amount_kg;
          else if (reg.reason === 'onderhoud') rec_onderhoud += reg.amount_kg;
          else if (reg.reason === 'buitengebruikstelling') rec_ontmanteling += reg.amount_kg;
        } else if (reg.mutation === 'toevoeging' || reg.mutation === 'afrekening') {
          if (reg.reason === 'nieuwbouw') fill_nieuwbouw += reg.amount_kg;
          else if (reg.reason === 'retrofit') fill_retrofit += reg.amount_kg;
          else if (reg.reason === 'lekkage') fill_lekkage += reg.amount_kg;
        }

        // Totaal afgevoerd (vernietiging & recycling) baseert zich op de reden,
        // onafhankelijk of het mutatietype 'afvoer' (historisch) of 'terugwinning' (nieuw wegens reclaim) is.
        if (reg.reason === 'vernietiging') {
          disp_vernietiging += reg.amount_kg;
        } else if (reg.reason === 'recycling') {
          disp_recycling += reg.amount_kg;
        }
      });

      return {
        refrigerant_name: ref.name,
        gwp: ref.gwp,
        rec_retrofit: parseFloat(rec_retrofit.toFixed(2)),
        rec_onderhoud: parseFloat(rec_onderhoud.toFixed(2)),
        rec_ontmanteling: parseFloat(rec_ontmanteling.toFixed(2)),
        fill_nieuwbouw: parseFloat(fill_nieuwbouw.toFixed(2)),
        fill_retrofit: parseFloat(fill_retrofit.toFixed(2)),
        fill_lekkage: parseFloat(fill_lekkage.toFixed(2)),
        disp_vernietiging: parseFloat(disp_vernietiging.toFixed(2)),
        disp_recycling: parseFloat(disp_recycling.toFixed(2))
      };
    });
  };

  // Export Sheet 3 (Koudemiddelbalans)
  const handleExportBalansPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`3. KOUDEMIDDELBALANS (${selectedYear})`, 14, 20);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Status: Definitief`, 14, 26);
    
    doc.line(14, 30, 283, 30);

    const tableData = balances.map((bal) => {
      const gwp = bal.gwp || 0;
      const startCo2 = ((bal.start_weight_kg * gwp) / 1000).toFixed(2);
      const calcEndCo2 = ((bal.end_weight_kg * gwp) / 1000).toFixed(2);
      const actualEndCo2 = ((bal.actual_weight_kg * gwp) / 1000).toFixed(2);
      const diffVal = parseFloat((bal.actual_weight_kg - bal.end_weight_kg).toFixed(3));
      const diffText = diffVal === 0 ? "0.000 kg" : `${diffVal > 0 ? "+" : ""}${diffVal.toFixed(3)} kg`;
      
      return [
        bal.refrigerant_name || 'N/B',
        gwp.toString() || 'N/B',
        `${bal.start_weight_kg.toFixed(3)} kg\n(${startCo2} t CO2-eq)`,
        `${bal.total_purchased.toFixed(3)} kg`,
        `${bal.total_recovered.toFixed(3)} kg`,
        `${bal.total_sold.toFixed(3)} kg`,
        `${bal.total_disposed.toFixed(3)} kg`,
        `${bal.end_weight_kg.toFixed(3)} kg\n(${calcEndCo2} t CO2-eq)`,
        `${bal.actual_weight_kg.toFixed(3)} kg\n(${actualEndCo2} t CO2-eq)`,
        diffText
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [[
        'Koudemiddel', 'GWP', 'Beginstand\n1 jan', 'Ingekocht\n(+)', 
        'Teruggewon\n(+)', 'Verkocht\n(-)', 'Afgevoerd\n(-)', 
        'Berekende\nEindstand', 'Werkelijke\nEindstand', 'Verschil\n(Act-Calc)'
      ]],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right', fontStyle: 'bold' },
        9: { halign: 'center', fontStyle: 'bold' }
      },
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.setFont("Helvetica", "bold");
    doc.text("Handtekening verantwoordelijke technicus:", 14, finalY);
    doc.line(14, finalY + 15, 80, finalY + 15);
    doc.text("Handtekening en datum", 14, finalY + 20);

    doc.save(`KMR_Sheet3_Balans_${selectedYear}.pdf`);
  };

  // Export Sheet 4 (Aanleveren van gegevens aan Keuringsinstantie)
  const handleExportKIPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const kiRows = compileKIReport();
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`4. AANLEVEREN GEGEVENS AAN KEURINGINSTANTIE (${selectedYear})`, 14, 20);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Conform de officiële richtlijnen en Sheet 4 van de koudemiddelenregistratie XLS`, 14, 26);
    doc.text(`Gegenereerd door KMR registratiesysteem conform BRL 100 v2`, 14, 31);
    
    doc.line(14, 35, 283, 35);

    const formatKIValPDF = (val: number, gwp: number) => {
      if (val <= 0) return '0';
      const co2 = ((val * gwp) / 1000).toFixed(2);
      return `${val.toFixed(1)} kg\n(${co2} t CO2-eq)`;
    };

    const tableData = kiRows.map((row) => [
      row.refrigerant_name,
      formatKIValPDF(row.rec_retrofit, row.gwp),
      formatKIValPDF(row.rec_onderhoud, row.gwp),
      formatKIValPDF(row.rec_ontmanteling, row.gwp),
      formatKIValPDF(row.fill_nieuwbouw, row.gwp),
      formatKIValPDF(row.fill_retrofit, row.gwp),
      formatKIValPDF(row.fill_lekkage, row.gwp),
      formatKIValPDF(row.disp_vernietiging, row.gwp),
      formatKIValPDF(row.disp_recycling, row.gwp)
    ]);

    autoTable(doc, {
      startY: 40,
      head: [
        [
          { content: 'Koudemiddel', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
          { content: 'Totaal KM teruggewonnen uit installaties\nt.b.v. of a.g.v. (in kg)', colSpan: 3, styles: { halign: 'center' } },
          { content: 'Totaal (bij)gevuld / verkocht t.b.v. of\na.g.v. (in kg)', colSpan: 3, styles: { halign: 'center' } },
          { content: 'Totaal afgevoerd\nt.b.v. (in kg)', colSpan: 2, styles: { halign: 'center' } }
        ],
        [
          '• Retrofit', '• Onderhoud', '• Ontmanteling',
          '• Nieuwbouw', '• Retrofit', '• Lekkage',
          '• Vernietiging', '• Recycling'
        ]
      ],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'left' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' }
      },
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.setFont("Helvetica", "bold");
    doc.text("Voor akkoord conform BRL 100 audit-eisen:", 14, finalY);
    doc.line(14, finalY + 15, 80, finalY + 15);
    doc.text("Verantwoordelijke audit-inspecteur", 14, finalY + 20);

    doc.save(`KMR_Sheet4_Aanleveren_KI_${selectedYear}.pdf`);
  };

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);

  return (
    <div className="space-y-6 max-w-none w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight">Koudemiddel Jaarbalans</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Jaarlijks overzicht en auditspecificatie voor de keuringsinstantie (KI).
          </p>
        </div>

        <div className="flex gap-3 self-start sm:self-center">
          {/* Year Picker */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="appearance-none pl-9 pr-8 py-2 border border-zinc-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Tab Conditional PDF Export Button */}
          {activeTab === 'balans' ? (
            <button
              onClick={handleExportBalansPDF}
              className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-850 text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm transition-colors"
            >
              <FileDown className="h-4 w-4" />
              Exporteer Balans (Sheet 3)
            </button>
          ) : (
            <button
              onClick={handleExportKIPDF}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm shadow-sm transition-colors"
            >
              <FileDown className="h-4 w-4" />
              Exporteer Gegevens KI (Sheet 4)
            </button>
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="border-b border-zinc-200">
        <nav className="flex space-x-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('balans')}
            className={`pb-4 px-1 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'balans'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300'
            }`}
          >
            <Layers className="h-4 w-4" />
            1. Koudemiddelbalans (Sheet 3)
          </button>
          <button
            onClick={() => setActiveTab('ki')}
            className={`pb-4 px-1 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'ki'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            2. Aanleveren Gegevens KI (Sheet 4)
          </button>
        </nav>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : activeTab === 'balans' ? (
        /* TAB 1: SHEET 3 KOUDEMIDDELBALANS */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-5 border border-zinc-200 rounded-xl flex items-center gap-4 shadow-sm">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500">Totaal Ingekocht ({selectedYear})</p>
                <h3 className="text-xl font-bold font-mono text-zinc-900">
                  {balances.reduce((sum, b) => sum + b.total_purchased, 0).toFixed(3)} kg
                </h3>
              </div>
            </div>

            <div className="bg-white p-5 border border-zinc-200 rounded-xl flex items-center gap-4 shadow-sm">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                <TrendingDown className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500">Totaal Verkocht / Toegevoegd</p>
                <h3 className="text-xl font-bold font-mono text-zinc-900">
                  {balances.reduce((sum, b) => sum + b.total_sold, 0).toFixed(3)} kg
                </h3>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-2xs font-bold text-zinc-500 uppercase tracking-wider">
                    <th className="px-2 py-3">Koudemiddel</th>
                    <th className="px-2 py-3 text-center">GWP</th>
                    <th className="px-2 py-3">Beginstand (1 Jan) *</th>
                    <th className="px-2 py-3">Ingekocht (+)</th>
                    <th className="px-2 py-3">Teruggewonnen (+)</th>
                    <th className="px-2 py-3">Verkocht (-)</th>
                    <th className="px-2 py-3">Afgevoerd (-)</th>
                    <th className="px-2 py-3">Berekende Eindstand</th>
                    <th className="px-2 py-3">Werkelijke Eindstand *</th>
                    <th className="px-2 py-3 text-center">Verschil</th>
                    <th className="px-2 py-3 text-right">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-xs font-medium">
                  {balances.map((bal) => {
                    const diffVal = parseFloat((bal.actual_weight_kg - bal.end_weight_kg).toFixed(3));
                    
                    return (
                      <tr key={bal.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-2 py-3 font-bold text-zinc-900">{bal.refrigerant_name}</td>
                        <td className="px-2 py-3 text-center text-zinc-500 font-mono">{bal.gwp}</td>
                        
                        {/* Start weight (Editable in Row Edit Mode) */}
                        <td className="px-2 py-3">
                          {editingId === bal.id ? (
                            <div className="space-y-1">
                              <span className="block text-3xs font-bold text-zinc-400">BEGINSTAND</span>
                              <input
                                type="number"
                                step="0.001"
                                value={editStartWeight}
                                onChange={(e) => setEditStartWeight(e.target.value)}
                                className="px-2 py-1 border border-blue-500 rounded text-xs w-20 text-right font-mono focus:outline-none bg-blue-50/20"
                              />
                            </div>
                          ) : (
                            <div>
                              <div className="font-mono text-zinc-800">{bal.start_weight_kg.toFixed(3)} kg</div>
                              <div className="text-3xs text-purple-600 font-mono font-normal mt-0.5">
                                {((bal.start_weight_kg * (bal.gwp || 0)) / 1000).toFixed(2)} Ton CO₂
                              </div>
                            </div>
                          )}
                        </td>
                        
                        {/* Constants */}
                        <td className="px-2 py-3 text-zinc-600 font-mono">{bal.total_purchased.toFixed(3)} kg</td>
                        <td className="px-2 py-3 text-zinc-600 font-mono">{bal.total_recovered.toFixed(3)} kg</td>
                        <td className="px-2 py-3 text-zinc-600 font-mono">{bal.total_sold.toFixed(3)} kg</td>
                        <td className="px-2 py-3 text-zinc-600 font-mono">{bal.total_disposed.toFixed(3)} kg</td>
                        
                        {/* Calculated end weight (Berekende voorraad, read-only) */}
                        <td className="px-2 py-3 font-mono bg-zinc-50/50">
                          <div className="font-semibold text-zinc-600">{bal.end_weight_kg.toFixed(3)} kg</div>
                          <div className="text-3xs text-zinc-400 font-mono font-normal mt-0.5">
                            {((bal.end_weight_kg * (bal.gwp || 0)) / 1000).toFixed(2)} Ton CO₂
                          </div>
                        </td>

                        {/* Actual weight (Werkelijke voorraad, Editable in Row Edit Mode) */}
                        <td className="px-2 py-3">
                          {editingId === bal.id ? (
                            <div className="space-y-1">
                              <span className="block text-3xs font-bold text-zinc-400">WERKELIJK</span>
                              <input
                                type="number"
                                step="0.001"
                                value={editActualWeight}
                                onChange={(e) => setEditActualWeight(e.target.value)}
                                className="px-2 py-1 border border-blue-500 rounded text-xs w-20 text-right font-mono focus:outline-none bg-blue-50/20"
                              />
                            </div>
                          ) : (
                            <div>
                              <div className="font-mono text-zinc-800 font-bold">{bal.actual_weight_kg.toFixed(3)} kg</div>
                              <div className="text-3xs text-purple-600 font-mono font-normal mt-0.5">
                                {((bal.actual_weight_kg * (bal.gwp || 0)) / 1000).toFixed(2)} Ton CO₂
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Difference (Verschil) */}
                        <td className="px-2 py-3 text-center">
                          {diffVal === 0 ? (
                            <span className="inline-flex px-2 py-0.5 rounded text-3xs font-mono font-bold bg-zinc-100 text-zinc-500 border border-zinc-200">
                              Kloppend
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className={`inline-flex px-2 py-0.5 rounded text-3xs font-mono font-bold border ${
                                diffVal > 0 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}>
                                {diffVal > 0 ? "+" : ""}{diffVal.toFixed(3)} kg
                              </span>
                              <div className="text-3xs text-zinc-400 font-mono">
                                {((diffVal * (bal.gwp || 0)) / 1000).toFixed(2)} Ton CO₂
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Row Actions */}
                        <td className="px-2 py-3 text-right">
                          {editingId === bal.id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleSaveRow(bal)}
                                className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                                title="Rij opslaan"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                                title="Annuleren"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleStartEdit(bal)}
                              className="p-1.5 rounded text-zinc-400 hover:text-blue-600 hover:bg-zinc-100 transition-all"
                              title="Rij bewerken (Beginstand & Werkelijke stand)"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* TAB 2: SHEET 4 AANLEVEREN GEGEVENS AAN KEURINGINSTANTIE */
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border-b border-zinc-200">
              <thead>
                {/* Dual-layer header corresponding exactly to BRL100 Sheet 4 */}
                <tr className="bg-zinc-950 text-white text-2xs uppercase tracking-wider text-center font-bold">
                  <th className="px-2 py-2.5 border-r border-zinc-800 text-left font-sans font-bold" rowSpan={2}>Koudemiddel</th>
                  <th className="px-2 py-2.5 border-r border-zinc-800" colSpan={3}>Totaal KM teruggewonnen uit installaties t.b.v. of a.g.v. (in kg)</th>
                  <th className="px-2 py-2.5 border-r border-zinc-800" colSpan={3}>Totaal (bij)gevuld / verkocht t.b.v. of a.g.v. (in kg)</th>
                  <th className="px-2 py-2.5" colSpan={2}>Totaal afgevoerd (in kg)</th>
                </tr>
                <tr className="bg-zinc-900 text-zinc-300 text-2xs border-b border-zinc-200 text-center font-bold font-mono">
                  <th className="px-2 py-1.5 border-r border-zinc-800">• Retrofit</th>
                  <th className="px-2 py-1.5 border-r border-zinc-800">• Onderhoud</th>
                  <th className="px-2 py-1.5 border-r border-zinc-800">• Ontmanteling</th>
                  <th className="px-2 py-1.5 border-r border-zinc-800">• Nieuwbouw</th>
                  <th className="px-2 py-1.5 border-r border-zinc-800">• Retrofit</th>
                  <th className="px-2 py-1.5 border-r border-zinc-800">• Lekkage</th>
                  <th className="px-2 py-1.5 border-r border-zinc-800">• Vernietiging</th>
                  <th className="px-2 py-1.5">• Recycling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-xs font-semibold">
                {compileKIReport().map((row, idx) => (
                  <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-2 py-2.5 font-bold text-zinc-900 border-r border-zinc-100">{row.refrigerant_name}</td>
                    
                    {/* Recovered retrofit, service, decommissioning */}
                    <td className="px-2 py-2.5 text-center border-r border-zinc-100">{renderCellWithCo2(row.rec_retrofit, row.gwp)}</td>
                    <td className="px-2 py-2.5 text-center border-r border-zinc-100">{renderCellWithCo2(row.rec_onderhoud, row.gwp)}</td>
                    <td className="px-2 py-2.5 text-center border-r border-zinc-100">{renderCellWithCo2(row.rec_ontmanteling, row.gwp)}</td>
                    
                    {/* Filled new-build, retrofit, leak */}
                    <td className="px-2 py-2.5 text-center border-r border-zinc-100">{renderCellWithCo2(row.fill_nieuwbouw, row.gwp)}</td>
                    <td className="px-2 py-2.5 text-center border-r border-zinc-100">{renderCellWithCo2(row.fill_retrofit, row.gwp)}</td>
                    <td className="px-2 py-2.5 text-center border-r border-zinc-100">{renderCellWithCo2(row.fill_lekkage, row.gwp)}</td>
                    
                    {/* Disposed destruction, recycling */}
                    <td className="px-2 py-2.5 text-center border-r border-zinc-100">{renderCellWithCo2(row.disp_vernietiging, row.gwp)}</td>
                    <td className="px-2 py-2.5 text-center">{renderCellWithCo2(row.disp_recycling, row.gwp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};