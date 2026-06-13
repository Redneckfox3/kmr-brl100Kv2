import React, { useEffect, useState } from 'react';
import { dbService, Refrigerant, Registration, Cylinder } from '../firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Plus, Edit2, Trash2, X, ClipboardList, Info, 
  ArrowUpRight, ArrowDownRight, Search, Calendar, ChevronDown, Download, QrCode,
  RefreshCw
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

// Helper to determine the best back/scanning camera on launch
const findPreferredCamera = (devices: any[]) => {
  // First priority: look for a camera that is explicitly labeled back/rear but is NOT a selfie/front camera
  const explicitBack = devices.find(device => {
    const label = device.label.toLowerCase();
    const isFront = label.includes('front') || label.includes('selfie') || label.includes('user') || label.includes('camera 1');
    const isBack = label.includes('back') || label.includes('rear') || label.includes('omgeving') || label.includes('achter') || label.includes('camera 0');
    return isBack && !isFront;
  });
  if (explicitBack) return explicitBack;

  // Second priority: look for any camera that does not look like a selfie/front camera
  const nonFront = devices.find(device => {
    const label = device.label.toLowerCase();
    return !(label.includes('front') || label.includes('selfie') || label.includes('user') || label.includes('camera 1'));
  });
  if (nonFront) return nonFront;

  // Third priority: fallback to the first device listed
  return devices[0];
};

export const Registrations: React.FC = () => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [refrigerants, setRefrigerants] = useState<Refrigerant[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRef, setSelectedRef] = useState('all');
  const [selectedMutation, setSelectedMutation] = useState('all');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear());

  const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);

  // Form / Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [installationId, setInstallationId] = useState('');
  const [installationType, setInstallationType] = useState('Commerciële koeling'); // Default based on Excel
  const [nominalChargeKg, setNominalChargeKg] = useState('');
  const [refrigerantId, setRefrigerantId] = useState('');
  const [amountKg, setAmountKg] = useState('');
  const [mutation, setMutation] = useState<'toevoeging' | 'afrekening' | 'terugwinning' | 'afvoer' | 'inkoop'>('toevoeging');
  const [reason, setReason] = useState('onderhoud');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Cylinder and QR states
  const [cylinders, setCylinders] = useState<Cylinder[]>([]);
  const [cylinderId, setCylinderId] = useState('');
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [html5QrCodeInstance, setHtml5QrCodeInstance] = useState<Html5Qrcode | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Start or restart the scanner with a specific camera ID or config
  const startCamera = async (scanner: Html5Qrcode, cameraIdOrConfig: any) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setScanError(null);

    try {
      if (scanner.isScanning) {
        await scanner.stop();
        // Brief pause to allow the hardware sensor to release safely
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      await scanner.start(
        cameraIdOrConfig,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 }
        },
        (decodedText) => {
          // On success
          const foundCyl = cylinders.find(
            c => c.id === decodedText || 
                 c.cylinder_number.toLowerCase() === decodedText.toLowerCase() ||
                 decodedText.replace(/^kmr-cylinder:/i, '') === c.id ||
                 decodedText.replace(/^kmr-cylinder:/i, '').toLowerCase() === c.cylinder_number.toLowerCase()
          );

          if (foundCyl) {
            scanner.stop().then(() => {
              setIsScanModalOpen(false);
              setCylinderId(foundCyl.id);
              // Automatically pre-fill the refrigerant of the scanned cylinder!
              if (foundCyl.refrigerant_id) {
                setRefrigerantId(foundCyl.refrigerant_id);
              }
            }).catch(err => {
              console.error("Error stopping scanner:", err);
              setIsScanModalOpen(false);
              setCylinderId(foundCyl.id);
              if (foundCyl.refrigerant_id) {
                setRefrigerantId(foundCyl.refrigerant_id);
              }
            });
          } else {
            alert(`Gescande code "${decodedText}" is niet herkend als een geregistreerde cilinder.`);
          }
        },
        () => {
          // Silent frame scanning
        }
      );

      setIsTransitioning(false);

      // If started successfully, retrieve camera devices list if not already retrieved
      if (cameraDevices.length === 0) {
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCameraDevices(devices);

            if (typeof cameraIdOrConfig !== 'string') {
              const preferred = findPreferredCamera(devices);
              setSelectedCameraId(preferred.id);
            }
          }
        } catch (err) {
          console.error("Error listing cameras after start:", err);
        }
      }
    } catch (err) {
      console.error("Error starting camera inside startCamera:", err);
      setIsTransitioning(false);

      // Self-healing fallback: If starting with facingMode constraint failed,
      // let's immediately query the device list and start the preferred camera ID!
      if (typeof cameraIdOrConfig !== 'string') {
        console.log("FacingMode start failed, trying device list fallback...");
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCameraDevices(devices);

            const preferred = findPreferredCamera(devices);
            setSelectedCameraId(preferred.id);

            // Retry startCamera recursively with a brief delay
            await new Promise(resolve => setTimeout(resolve, 200));
            await startCamera(scanner, preferred.id);
            return; // Succeeded fallback!
          }
        } catch (fallbackErr) {
          console.error("Fallback camera start failed too:", fallbackErr);
        }
      }

      setScanError("Kan de geselecteerde camera niet starten. Kies eventueel een andere camera in de lijst hieronder.");
    }
  };

  const handleCameraChange = async (cameraId: string) => {
    if (isTransitioning) return;
    setSelectedCameraId(cameraId);
    if (html5QrCodeInstance) {
      setScanError(null);
      await startCamera(html5QrCodeInstance, cameraId);
    }
  };

  const handleToggleCamera = async () => {
    if (isTransitioning || cameraDevices.length <= 1) return;
    const currentIndex = cameraDevices.findIndex(d => d.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameraDevices.length;
    const nextCamera = cameraDevices[nextIndex];
    if (nextCamera) {
      await handleCameraChange(nextCamera.id);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const refs = await dbService.getRefrigerants();
      const regs = await dbService.getRegistrations();
      const cyls = await dbService.getCylinders();
      setRefrigerants(refs);
      setRegistrations(regs);
      setCylinders(cyls);
      if (refs.length > 0) {
        setRefrigerantId(refs[0].id);
      }
    } catch (e) {
      console.error("Error loading registrations data:", e);
    } finally {
      setLoading(false);
    }
  };

  // Initialize camera scanner on scan modal open
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    if (isScanModalOpen) {
      setScanError(null);
      setCameraDevices([]);
      setSelectedCameraId('');

      // Wait a tiny bit for the DOM element to mount/be ready
      const timer = setTimeout(() => {
        try {
          html5QrCode = new Html5Qrcode("reg-scanner-reader", {
            verbose: false,
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: false
            }
          });
          setHtml5QrCodeInstance(html5QrCode);

          // Get cameras first to select the absolute best hardware camera sensor immediately
          Html5Qrcode.getCameras().then(devices => {
            if (devices && devices.length > 0) {
              setCameraDevices(devices);
              const preferred = findPreferredCamera(devices);
              setSelectedCameraId(preferred.id);
              if (html5QrCode) {
                startCamera(html5QrCode, preferred.id);
              }
            } else {
              // Fallback to facingMode if no cameras returned initially
              if (html5QrCode) {
                startCamera(html5QrCode, { facingMode: "environment" });
              }
            }
          }).catch(err => {
            console.warn("Could not list cameras on startup, trying facingMode fallback:", err);
            if (html5QrCode) {
              startCamera(html5QrCode, { facingMode: "environment" });
            }
          });
        } catch (e) {
          console.error("Scanner init error:", e);
          setScanError("Fout bij het initialiseren van de camera scanner.");
        }
      }, 100);

      return () => {
        clearTimeout(timer);
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().catch(err => console.error("Error stopping scanner on cleanup", err));
        }
        setHtml5QrCodeInstance(null);
      };
    }
  }, [isScanModalOpen, cylinders]);

  const handleOpenAddModal = () => {
    setEditingId(null);
    setInstallationId('');
    setInstallationType('Commerciële koeling');
    setNominalChargeKg('');
    if (refrigerants.length > 0) {
      setRefrigerantId(refrigerants[0].id);
    }
    setAmountKg('');
    setMutation('toevoeging');
    setReason('onderhoud');
    setDate(new Date().toISOString().split('T')[0]);
    setCylinderId('');
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (reg: Registration) => {
    setEditingId(reg.id);
    setInstallationId(reg.installation_id);
    setInstallationType(reg.installation_type || 'Commerciële koeling');
    setNominalChargeKg(reg.nominal_charge_kg ? reg.nominal_charge_kg.toString() : '');
    setRefrigerantId(reg.refrigerant_id);
    setAmountKg(reg.amount_kg.toString());
    setMutation(reg.mutation);
    setReason(reg.reason);
    setDate(reg.date);
    setCylinderId(reg.cylinder_id || '');
    setError(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Weet u zeker dat u deze registratie wilt verwijderen? De cilindervoorraad wordt dienovereenkomstig gecorrigeerd.")) {
      try {
        await dbService.deleteRegistration(id);
        await loadData();
      } catch (e: any) {
        alert("Fout bij verwijderen: " + e.message);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!installationId.trim()) return setError("Vul een Installatie ID in.");
    if (!amountKg || parseFloat(amountKg) <= 0) return setError("Vul een geldige hoeveelheid in kg in (groter dan 0).");
    if (!refrigerantId) return setError("Selecteer een koudemiddel.");

    setSubmitting(true);
    setError(null);

    const data: any = {
      installation_id: installationId.trim(),
      refrigerant_id: refrigerantId,
      amount_kg: parseFloat(amountKg),
      mutation,
      reason,
      date
    };

    if (installationType) {
      data.installation_type = installationType;
    }
    if (nominalChargeKg) {
      data.nominal_charge_kg = parseFloat(nominalChargeKg);
    }
    if (cylinderId) {
      data.cylinder_id = cylinderId;
    }

    try {
      if (editingId) {
        await dbService.updateRegistration(editingId, data);
      } else {
        await dbService.addRegistration(data);
      }
      setIsModalOpen(false);
      await loadData();
    } catch (e: any) {
      setError(e.message || "Er is een fout opgetreden bij het opslaan.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter registrations
  const filteredRegistrations = registrations.filter((reg) => {
    const regYear = new Date(reg.date).getFullYear();
    const matchesYear = selectedYear === 'all' || regYear === selectedYear;
    const matchesSearch = reg.installation_id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (reg.reason && reg.reason.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRef = selectedRef === 'all' || reg.refrigerant_id === selectedRef;
    const matchesMutation = selectedMutation === 'all' || reg.mutation === selectedMutation;
    return matchesYear && matchesSearch && matchesRef && matchesMutation;
  });

  const getSelectedRefrigerantGwp = () => {
    const ref = refrigerants.find(r => r.id === refrigerantId);
    return ref ? ref.gwp : 0;
  };

  const calculateCo2Preview = () => {
    const gwp = getSelectedRefrigerantGwp();
    const kg = parseFloat(amountKg) || 0;
    return ((kg * gwp) / 1000).toFixed(2);
  };

  const handleExportPDF = () => {
    // Initialize jsPDF in landscape mode ('l')
    const doc = new jsPDF('l', 'mm', 'a4');

    doc.setFontSize(18);
    const titleText = selectedYear === 'all' 
      ? 'Installatie Registraties (Alle jaren)' 
      : `Installatie Registraties (${selectedYear})`;
    doc.text(titleText, 14, 22);

    const tableColumn = [
      "Datum", "Installatie ID", "Type", "Nominale Vulling",
      "Koudemiddel", "Mutatie", "Hoeveelheid", "CO2 eq.", "Reden"
    ];
    const tableRows: any[] = [];

    filteredRegistrations.forEach(reg => {
      const regData = [
        reg.date,
        reg.installation_id,
        reg.installation_type || '-',
        reg.nominal_charge_kg ? `${reg.nominal_charge_kg.toFixed(3)} kg` : '-',
        reg.refrigerant_name || '-',
        reg.mutation.charAt(0).toUpperCase() + reg.mutation.slice(1),
        `${reg.amount_kg.toFixed(3)} kg`,
        reg.co2_equivalent ? `${reg.co2_equivalent.toFixed(2)} Ton` : '-',
        reg.reason.charAt(0).toUpperCase() + reg.reason.slice(1)
      ];
      tableRows.push(regData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [39, 39, 42] } // zinc-800
    });

    const fileSuffix = selectedYear === 'all' ? 'alle_jaren' : selectedYear;
    doc.save(`registraties_${fileSuffix}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 tracking-tight">Installatie Registraties</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Beheer en registreer handelingen (vulling, terugwinning, etc.) op installatieniveau.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          {/* Year Picker */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="appearance-none pl-9 pr-8 py-2.5 border border-zinc-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="all">Alle jaren</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
          </div>

          <button
            onClick={handleExportPDF}
            className="inline-flex items-center gap-2 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium px-4 py-2.5 rounded-lg text-sm shadow-sm transition-all"
          >
            <Download className="h-4 w-4" />
            Exporteer PDF
          </button>
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm shadow-sm hover:shadow transition-all"
          >
            <Plus className="h-4 w-4" />
            Registratie Toevoegen
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-zinc-100 border border-zinc-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-zinc-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-zinc-600 leading-relaxed">
          <strong>Tip over cilindervoorraad:</strong> Wanneer u een <strong className="text-zinc-900">toevoeging</strong> of <strong className="text-zinc-900">afrekening</strong> registreert, wordt deze hoeveelheid automatisch van uw cylinders (voorraad) afgetrokken. Bij een <strong className="text-zinc-900">terugwinning</strong> wordt de hoeveelheid weer bij de cilindervoorraad opgeteld.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Zoek op Installatie ID of reden..."
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

        {/* Mutation Filter */}
        <div className="relative">
          <select
            value={selectedMutation}
            onChange={(e) => setSelectedMutation(e.target.value)}
            className="appearance-none pl-4 pr-10 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="all">Alle Mutaties</option>
            <option value="toevoeging">Toevoeging (Vullen)</option>
            <option value="terugwinning">Terugwinning</option>
            <option value="afrekening">Afrekening</option>
            <option value="afvoer">Afvoer</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
        </div>
      </div>

      {/* Registrations List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredRegistrations.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
          <ClipboardList className="h-12 w-12 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-500 font-medium">Geen registraties gevonden.</p>
          <p className="text-zinc-400 text-sm mt-1">Pas uw zoekfilters aan of voeg een nieuwe registratie toe.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="sticky top-0 bg-zinc-50 z-10 border-b border-zinc-200 text-2xs font-bold text-zinc-500 uppercase tracking-wider shadow-[0_1px_0_rgba(228,228,231,1)]">
                  <th className="px-4 py-3">Datum</th>
                  <th className="px-4 py-3">Installatie ID</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Nominale Vulling</th>
                  <th className="px-4 py-3">Koudemiddel</th>
                  <th className="px-4 py-3">Mutatie</th>
                  <th className="px-4 py-3">Hoeveelheid</th>
                  <th className="px-4 py-3">GWP / CO2 eq.</th>
                  <th className="px-4 py-3">Reden</th>
                  <th className="px-4 py-3 text-right">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {filteredRegistrations.map((reg) => (
                  <tr key={reg.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{reg.date}</td>
                    <td className="px-4 py-3 font-bold text-zinc-900">{reg.installation_id}</td>
                    <td className="px-4 py-3 text-zinc-600">{reg.installation_type || '-'}</td>
                    <td className="px-4 py-3 text-zinc-600 font-mono">{reg.nominal_charge_kg ? `${reg.nominal_charge_kg.toFixed(3)} kg` : '-'}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-800">{reg.refrigerant_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        reg.mutation === 'toevoeging' || reg.mutation === 'afrekening'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {reg.mutation === 'toevoeging' || reg.mutation === 'afrekening' ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5" />
                        )}
                        {reg.mutation.charAt(0).toUpperCase() + reg.mutation.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-zinc-900">{reg.amount_kg.toFixed(3)} kg</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-zinc-500 font-mono">
                        <div>GWP: {reg.co2_equivalent ? ((reg.co2_equivalent * 1000) / reg.amount_kg).toFixed(0) : 'N/B'}</div>
                        <div className="font-bold text-purple-600">{reg.co2_equivalent?.toFixed(2)} Ton CO₂</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 italic">
                      {reg.reason.charAt(0).toUpperCase() + reg.reason.slice(1)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(reg)}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-blue-600 hover:bg-zinc-100 transition-colors"
                          title="Bewerken"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(reg.id)}
                          className="p-1.5 rounded-md text-zinc-500 hover:text-red-600 hover:bg-zinc-100 transition-colors"
                          title="Verwijderen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
                {editingId ? 'Registratie Bewerken' : 'Nieuwe Registratie Toevoegen'}
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

              {/* Installatie ID */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Installatie ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Bijv. 3981MH-101-001"
                  value={installationId}
                  onChange={(e) => setInstallationId(e.target.value)}
                  className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Installatie Type */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Type installatie (IPCC-sector)
                </label>
                <select
                  value={installationType}
                  onChange={(e) => setInstallationType(e.target.value)}
                  className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="Commerciële koeling">Commerciële koeling</option>
                  <option value="Transportkoeling">Transportkoeling</option>
                  <option value="Industriële koeling">Industriële koeling</option>
                  <option value="Stationaire airco’s">Stationaire airco’s</option>
                </select>
              </div>

              {/* Nominale vulling */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Nominale vulling (kg)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Bijv. 17.500"
                  value={nominalChargeKg}
                  onChange={(e) => setNominalChargeKg(e.target.value)}
                  className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* Cylinder Selection (with QR Scan option) */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Gekoppelde Cilinder (Optioneel)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select
                      value={cylinderId}
                      onChange={(e) => {
                        setCylinderId(e.target.value);
                        const cyl = cylinders.find(c => c.id === e.target.value);
                        if (cyl && cyl.refrigerant_id && cyl.type !== 'mix') {
                          setRefrigerantId(cyl.refrigerant_id);
                        }
                      }}
                      className="appearance-none px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    >
                      <option value="">-- Geen cilinder koppelen --</option>
                      {cylinders.map((cyl) => (
                        <option key={cyl.id} value={cyl.id}>
                          {cyl.cylinder_number} ({cyl.refrigerant_name})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsScanModalOpen(true)}
                    className="inline-flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3.5 rounded-lg border border-zinc-200 text-sm font-medium transition-colors"
                    title="Scan QR-code van cilinder"
                  >
                    <QrCode className="h-4 w-4 text-zinc-600" />
                    <span>Scan QR</span>
                  </button>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Datum *
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="pl-9 pr-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
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
                    <option key={ref.id} value={ref.id}>
                      {ref.name} (GWP: {ref.gwp}, Voorraad: {(ref.current_stock_kg !== undefined && ref.current_stock_kg !== null) ? Number(ref.current_stock_kg).toFixed(3) : '0.000'} kg)
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount kg */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Hoeveelheid (kg) *
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  placeholder="Bijv. 4.5"
                  value={amountKg}
                  onChange={(e) => setAmountKg(e.target.value)}
                  className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* Mutation */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Mutatie *
                </label>
                <select
                  value={mutation}
                  onChange={(e) => setMutation(e.target.value as any)}
                  className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="toevoeging">Toevoeging (Vullen installatie, vermindert nieuw gas voorraad)</option>
                  <option value="terugwinning">Terugwinning (Uit installatie naar voorraad/reclaim cilinder)</option>
                  <option value="afrekening">Afrekening (Verbruikt, vermindert nieuw gas voorraad)</option>
                </select>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Reden *
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="onderhoud">Onderhoud / Service</option>
                  <option value="nieuwbouw">Nieuwbouw / Eerste vulling</option>
                  <option value="retrofit">Retrofit (Omschakeling)</option>
                  <option value="lekkage">Lekkage herstel</option>
                  <option value="buitengebruikstelling">Buitengebruikstelling / Sloop</option>
                  <option value="vernietiging">Afvoer t.b.v. Vernietiging (Gaat naar Reclaim Cilinder)</option>
                  <option value="recycling">Afvoer t.b.v. Recycling (Gaat naar Reclaim Cilinder)</option>
                </select>
              </div>

              {/* Live Preview CO2 Equivalent */}
              {refrigerantId && amountKg && parseFloat(amountKg) > 0 && (
                <div className="bg-purple-50 text-purple-800 p-3.5 rounded-lg border border-purple-100 text-xs flex justify-between items-center font-mono">
                  <span>Berekend CO₂-equivalent:</span>
                  <strong className="text-sm text-purple-900">{calculateCo2Preview()} Ton CO₂</strong>
                </div>
              )}

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

      {/* QR Scanner Modal */}
      <div className={`fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm items-center justify-center p-4 animate-fade-in ${isScanModalOpen ? 'flex' : 'hidden'}`}>
        <div className="bg-white rounded-xl shadow-xl border border-zinc-200 max-w-md w-full overflow-hidden animate-scale-up">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <QrCode className="h-5 w-5 text-blue-600" />
              Cilinder QR scannen
            </h2>
            <button
              onClick={() => setIsScanModalOpen(false)}
              className="text-zinc-400 hover:text-zinc-600 rounded-md p-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {scanError ? (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm border border-red-100 text-center space-y-2">
                <p>{scanError}</p>
                <button
                  onClick={() => { setScanError(null); setIsScanModalOpen(false); setTimeout(() => setIsScanModalOpen(true), 100); }}
                  className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-md font-medium hover:bg-red-700 transition-colors"
                >
                  Opnieuw proberen
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs text-zinc-500 text-center bg-zinc-50 p-2.5 rounded-lg border border-zinc-100">
                  Richt de camera van uw mobiel of tablet op de QR-code sticker van de cilinder om deze te koppelen en het koudemiddel automatisch in te vullen.
                </div>
                
                {/* Camera view element */}
                <div className="overflow-hidden rounded-xl border border-zinc-200 aspect-square bg-zinc-950 relative flex items-center justify-center min-h-[300px]">
                  <div id="reg-scanner-reader" className="w-full h-full min-h-[300px]"></div>
                  
                  {/* Visual scanner overlay target */}
                  <div className="absolute inset-0 border-2 border-dashed border-blue-500/50 m-12 pointer-events-none rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 border-t-2 border-l-2 border-blue-500 absolute top-0 left-0"></div>
                    <div className="w-4 h-4 border-t-2 border-r-2 border-blue-500 absolute top-0 right-0"></div>
                    <div className="w-4 h-4 border-b-2 border-l-2 border-blue-500 absolute bottom-0 left-0"></div>
                    <div className="w-4 h-4 border-b-2 border-r-2 border-blue-500 absolute bottom-0 right-0"></div>
                    <div className="w-full h-0.5 bg-blue-500/40 animate-pulse absolute"></div>
                  </div>

                  {/* Camera toggle floating button over video */}
                  {cameraDevices.length > 1 && (
                    <button
                      type="button"
                      disabled={isTransitioning}
                      onClick={handleToggleCamera}
                      className="absolute bottom-4 right-4 bg-zinc-900/85 hover:bg-zinc-800 text-white p-3 rounded-full shadow-lg border border-zinc-700/50 transition-all cursor-pointer z-10 flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
                      title="Wissel van camera"
                    >
                      <RefreshCw className={`h-5 w-5 ${isTransitioning ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                </div>

                {/* Camera Selector Dropdown */}
                {cameraDevices.length > 1 && (
                  <div className="space-y-1">
                    <label className="block text-2xs font-bold text-zinc-400 uppercase tracking-wider">
                      Wissel van Camera (indien zwart beeld)
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <select
                          disabled={isTransitioning}
                          value={selectedCameraId}
                          onChange={(e) => handleCameraChange(e.target.value)}
                          className="appearance-none pl-3 pr-10 py-2.5 w-full rounded-lg border border-zinc-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-zinc-700 font-medium disabled:opacity-50"
                        >
                          {cameraDevices.map((device, idx) => (
                            <option key={device.id} value={device.id}>
                              {device.label || `Camera ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                      </div>
                      <button
                        type="button"
                        disabled={isTransitioning}
                        onClick={handleToggleCamera}
                        className="flex items-center justify-center px-3.5 rounded-lg border border-zinc-200 hover:border-blue-500 hover:bg-blue-50/50 text-zinc-600 hover:text-blue-600 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
                        title="Volgende camera"
                      >
                        <RefreshCw className={`h-4 w-4 ${isTransitioning ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setIsScanModalOpen(false)}
              className="w-full px-4 py-2.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-sm font-medium rounded-lg transition-colors"
            >
              Annuleren
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};