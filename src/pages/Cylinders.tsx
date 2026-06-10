import React, { useEffect, useState } from 'react';
import { dbService, Refrigerant, Cylinder, Registration } from '../firebase';
import { 
  Plus, Edit2, Trash2, X, ClipboardList, Info, 
  Search, Calendar, ChevronDown, CheckCircle2, AlertTriangle, AlertCircle, ArrowRightLeft, QrCode,
  RefreshCw
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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

export const Cylinders: React.FC = () => {
  const [cylinders, setCylinders] = useState<Cylinder[]>([]);
  const [refrigerants, setRefrigerants] = useState<Refrigerant[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [transRefrigerantId, setTransRefrigerantId] = useState('');

  // Helper to determine dynamic gas contents of any cylinder based on audit trail
  const getCylinderContents = (cylId: string) => {
    const contents: { [refId: string]: number } = {};
    const cylRegs = registrations.filter(r => r.cylinder_id === cylId);
    
    cylRegs.forEach(reg => {
      const amount = reg.amount_kg;
      const refId = reg.refrigerant_id;
      if (!contents[refId]) contents[refId] = 0;
      
      if (reg.mutation === 'terugwinning' || reg.mutation === 'inkoop') {
        contents[refId] += amount;
      } else if (reg.mutation === 'toevoeging' || reg.mutation === 'afrekening' || reg.mutation === 'afvoer') {
        contents[refId] -= amount;
      }
    });

    const result: { refId: string; name: string; weight: number }[] = [];
    Object.keys(contents).forEach(refId => {
      const weight = contents[refId];
      if (weight > 0.001) {
        const ref = refrigerants.find(r => r.id === refId);
        result.push({
          refId,
          name: ref ? ref.name : 'Mengsel',
          weight: Number(weight.toFixed(3))
        });
      }
    });
    return result;
  };
  
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

  // QR & Scan States
  const [activeQrCylinder, setActiveQrCylinder] = useState<Cylinder | null>(null);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [html5QrCodeInstance, setHtml5QrCodeInstance] = useState<Html5Qrcode | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Start or restart the scanner with a specific camera ID
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
              handleOpenTransModal(foundCyl);
            }).catch(err => {
              console.error("Error stopping scanner:", err);
              setIsScanModalOpen(false);
              handleOpenTransModal(foundCyl);
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
          html5QrCode = new Html5Qrcode("cylinder-scanner-reader", {
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const refs = await dbService.getRefrigerants();
      const cyls = await dbService.getCylinders();
      const regs = await dbService.getRegistrations();
      setRefrigerants(refs);
      setCylinders(cyls);
      setRegistrations(regs);
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
    // Set active koudemiddel for transaction
    if (cyl.type === 'mix') {
      setTransRefrigerantId(refrigerants.length > 0 ? refrigerants[0].id : '');
    } else {
      setTransRefrigerantId(cyl.refrigerant_id);
    }
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

  const handleEmptyMixCylinder = async (cyl: Cylinder) => {
    const contents = getCylinderContents(cyl.id);
    if (contents.length === 0) {
      alert("Deze mixfles is al leeg!");
      return;
    }

    const confirmEmpty = window.confirm(
      `Weet u zeker dat u mixfles ${cyl.cylinder_number} wilt legen t.b.v. vernietiging? Dit zal automatisch afvoer-registraties aanmaken voor alle aanwezige gassen:\n${contents.map(c => `- ${c.name}: ${c.weight} kg`).join('\n')}`
    );

    if (!confirmEmpty) return;

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      for (const item of contents) {
        await dbService.addRegistration({
          date: today,
          installation_id: "AFVOER-MIX-VERNIETIGING",
          refrigerant_id: item.refId,
          amount_kg: item.weight,
          mutation: "afvoer",
          reason: "buitengebruikstelling",
          cylinder_id: cyl.id
        });
      }

      await dbService.updateCylinder(cyl.id, {
        ...cyl,
        status: 'retour_leverancier',
        location: 'Ingeleverd voor vernietiging'
      });

      await loadData();
      alert("Mixfles succesvol leeggemaakt en status bijgewerkt naar 'Retour leverancier'!");
    } catch (e: any) {
      alert("Fout bij het leegmaken van de mixfles: " + e.message);
    } finally {
      setLoading(false);
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
    const finalRefId = transCylinder.type === 'mix' ? transRefrigerantId : transCylinder.refrigerant_id;
    if (!finalRefId) return setError("Selecteer een geldig koudemiddel.");

    setSubmitting(true);
    setError(null);

    try {
      await dbService.addRegistration({
        date: transDate,
        installation_id: transInstId.trim(),
        refrigerant_id: finalRefId,
        amount_kg: parseFloat(transAmount),
        mutation: transMutation,
        reason: transReason,
        cylinder_id: transCylinder.id
      });
      setIsTransModalOpen(false);
      await loadData();
      alert("Verbruik succesvol geregistreerd!");
    } catch (e: any) {
      setError(e.message || "Er is een fout opgetreden bij het registreren van verbruik.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter cylinders
  const filteredCylinders = cylinders.filter((cyl) => {
    const cylNum = cyl.cylinder_number || '';
    const cylLoc = cyl.location || '';
    const matchesSearch = cylNum.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          cylLoc.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRef = selectedRef === 'all' || cyl.refrigerant_id === selectedRef;
    const matchesStatus = selectedStatus === 'all' || cyl.status === selectedStatus;
    return matchesSearch && matchesRef && matchesStatus;
  });

  const getInspectionStatus = (dateStr: string) => {
    if (!dateStr) {
      return { label: 'Onbekend', color: 'text-zinc-500', icon: Info };
    }
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
        <div className="flex items-center gap-3 self-start sm:self-center">
          <button
            onClick={() => setIsScanModalOpen(true)}
            className="inline-flex items-center gap-2 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium px-4 py-2.5 rounded-lg text-sm shadow-sm transition-all"
            title="Scan een cilinder QR-code om direct verbruik te registreren"
          >
            <QrCode className="h-4 w-4 text-zinc-500" />
            Cilinder Scannen
          </button>
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm shadow-sm hover:shadow transition-all"
          >
            <Plus className="h-4 w-4" />
            Cilinder Toevoegen
          </button>
        </div>
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
                        <div>Tarra: {(cyl.tare_weight_kg !== undefined && cyl.tare_weight_kg !== null) ? Number(cyl.tare_weight_kg).toFixed(3) : '0.000'} kg</div>
                        <div className="text-xs text-zinc-400 mb-1">Max: {(cyl.max_capacity_kg !== undefined && cyl.max_capacity_kg !== null) ? Number(cyl.max_capacity_kg).toFixed(3) : '0.000'} kg</div>
                        
                        {/* Dynamic gas contents listing with real-time audit weight calculation */}
                        {(() => {
                          const contents = getCylinderContents(cyl.id);
                          const totalContent = contents.reduce((acc, c) => acc + c.weight, 0);
                          const grossWeight = (cyl.tare_weight_kg || 0) + totalContent;
                          const fillPercent = cyl.max_capacity_kg > 0 ? (totalContent / cyl.max_capacity_kg) * 100 : 0;

                          return (
                            <div className="mt-2 pt-2 border-t border-dashed border-zinc-200 space-y-1">
                              {contents.length > 0 ? (
                                <>
                                  <div className="text-2xs font-bold text-zinc-500 uppercase tracking-wider">Inhoud:</div>
                                  <div className="space-y-0.5 pl-1.5 border-l-2 border-blue-500">
                                    {contents.map((c, idx) => (
                                      <div key={idx} className="text-2xs text-zinc-700 font-medium">
                                        {c.name}: <span className="font-bold text-zinc-900">{c.weight.toFixed(3)} kg</span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="text-2xs font-semibold text-purple-600 mt-1 flex items-center justify-between">
                                    <span>Bruto: <span className="font-bold">{grossWeight.toFixed(3)} kg</span></span>
                                    <span className="text-zinc-400 font-normal">{fillPercent.toFixed(0)}% gevuld</span>
                                  </div>
                                  {cyl.max_capacity_kg > 0 && (
                                    <div className="w-full bg-zinc-100 rounded-full h-1 overflow-hidden mt-1">
                                      <div 
                                        className={`h-full rounded-full transition-all ${fillPercent > 90 ? 'bg-red-500' : fillPercent > 75 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                        style={{ width: `${Math.min(fillPercent, 100)}%` }}
                                      ></div>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-2xs italic text-zinc-400">Leeg / Ongebruikt</div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <InsIcon className={`h-4 w-4 ${insStatus.color}`} />
                          <span className={`font-mono text-xs ${insStatus.color}`}>{cyl.inspection_date}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="capitalize font-medium text-zinc-800">
                          {cyl.status ? cyl.status.replace('_', ' ') : 'Onbekend'}
                        </div>
                        {cyl.location && (
                          <div className="text-xs text-zinc-500 mt-0.5">{cyl.location}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col md:flex-row items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenTransModal(cyl)}
                            className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1"
                            title="Registreer verbruik uit deze cilinder"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                            <span className="text-xs font-semibold">Verbruik</span>
                          </button>

                          {/* Quick Legen Button for Mixfles with some contents */}
                          {cyl.type === 'mix' && getCylinderContents(cyl.id).length > 0 && (
                            <button
                              onClick={() => handleEmptyMixCylinder(cyl)}
                              className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"
                              title="Mixfles leegmaken voor vernietiging"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="text-xs font-semibold">Legen</span>
                            </button>
                          )}

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setActiveQrCylinder(cyl)}
                              className="p-1.5 rounded-md text-zinc-500 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                              title="Bekijk & print QR-code van deze cilinder"
                            >
                              <QrCode className="h-4 w-4" />
                            </button>
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
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      setType(newType);
                      if (newType === 'mix') {
                        setRefrigerantId('mix');
                      } else if (refrigerantId === 'mix' && refrigerants.length > 0) {
                        setRefrigerantId(refrigerants[0].id);
                      }
                    }}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="nieuw">Nieuw Gas</option>
                    <option value="reclaim">Reclaim / Terugwin</option>
                    <option value="recycling">Recycling</option>
                    <option value="huur">Huurcilinder</option>
                    <option value="eigendom">Eigendomcilinder</option>
                    <option value="mix">Mixfles (Diverse gassen)</option>
                  </select>
                </div>

                {/* Refrigerant Selector */}
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Koudemiddel *
                  </label>
                  <select
                    disabled={type === 'mix'}
                    value={refrigerantId}
                    onChange={(e) => setRefrigerantId(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white disabled:bg-zinc-50 disabled:text-zinc-500"
                  >
                    {type === 'mix' ? (
                      <option value="mix">Mengsel (Vernietiging)</option>
                    ) : (
                      refrigerants.map((ref) => (
                        <option key={ref.id} value={ref.id}>{ref.name}</option>
                      ))
                    )}
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
                    step="0.001"
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
                    step="0.001"
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

              {/* Refrigerant Selector (Only shown if Cylinder is of type 'mix') */}
              {transCylinder.type === 'mix' && (
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Koudemiddel voor mixfles *
                  </label>
                  <select
                    value={transRefrigerantId}
                    onChange={(e) => setTransRefrigerantId(e.target.value)}
                    className="px-3 py-2 w-full rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    {refrigerants.map((ref) => (
                      <option key={ref.id} value={ref.id}>{ref.name}</option>
                    ))}
                  </select>
                </div>
              )}

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

      {/* QR View Modal */}
      {activeQrCylinder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #qr-print-section, #qr-print-section * {
                visibility: visible !important;
              }
              #qr-print-section {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                background: white !important;
                z-index: 99999 !important;
              }
            }
          `}</style>
          <div className="bg-white rounded-xl shadow-xl border border-zinc-200 max-w-sm w-full overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50 print:hidden">
              <h2 className="text-lg font-bold text-zinc-900">
                Cilinder QR-code
              </h2>
              <button
                onClick={() => setActiveQrCylinder(null)}
                className="text-zinc-400 hover:text-zinc-600 rounded-md p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-8 flex flex-col items-center justify-center text-center space-y-6">
              {/* This section will be targeted by print media CSS */}
              <div id="qr-print-section" className="flex flex-col items-center justify-center p-4 bg-white rounded-lg">
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                  <QRCodeSVG 
                    value={`kmr-cylinder:${activeQrCylinder.id}`} 
                    size={180} 
                    level="H" 
                    includeMargin={true}
                  />
                </div>
                <div className="mt-4 text-center">
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Cilindernummer</div>
                  <div className="text-lg font-mono font-bold text-zinc-950 mt-0.5">{activeQrCylinder.cylinder_number}</div>
                  <div className="text-xs font-semibold text-zinc-600 mt-1">Koudemiddel: {activeQrCylinder.refrigerant_name || "Onbekend"}</div>
                </div>
              </div>

              <div className="flex w-full gap-3 pt-4 border-t border-zinc-100 print:hidden">
                <button
                  onClick={() => setActiveQrCylinder(null)}
                  className="flex-1 px-4 py-2.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Sluiten
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
                >
                  Print Sticker
                </button>
              </div>
            </div>
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
                  Richt de camera van uw mobiel of tablet op de QR-code sticker van de cilinder om deze direct op te zoeken.
                </div>
                
                {/* Camera view element */}
                <div className="overflow-hidden rounded-xl border border-zinc-200 aspect-square bg-zinc-950 relative flex items-center justify-center min-h-[300px]">
                  <div id="cylinder-scanner-reader" className="w-full h-full min-h-[300px]"></div>
                  
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