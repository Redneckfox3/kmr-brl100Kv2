import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  setDoc
} from "firebase/firestore";

export interface Refrigerant {
  id: string;
  name: string;
  gwp: number;
  current_stock_kg: number;
  reclaim_stock_kg: number; // Reclaim cylinder stock
}

export interface Cylinder {
  id: string;
  cylinder_number: string; // Barcode or unique physical ID
  type: 'nieuw' | 'reclaim' | 'recycling' | 'huur' | 'eigendom'; 
  refrigerant_id: string;
  refrigerant_name?: string;
  tare_weight_kg: number; // Empty weight
  max_capacity_kg: number; // Maximum filling capacity
  inspection_date: string; // YYYY-MM-DD
  status: 'magazijn' | 'monteur' | 'retour_leverancier' | 'leeg' | 'vermist';
  location?: string; // Optional field for mechanic name or specific van
  created_at?: string;
}

export interface Registration {
  id: string;
  installation_id: string;
  installation_type?: string;
  nominal_charge_kg?: number;
  refrigerant_id: string;
  refrigerant_name?: string; // resolved in helper
  cylinder_id?: string; // Link to the specific cylinder used
  amount_kg: number;
  mutation: 'toevoeging' | 'afrekening' | 'terugwinning' | 'afvoer' | 'inkoop'; // Dutch mutations
  reason: string; // e.g., 'nieuwbouw', 'retrofit', 'lekkage', 'onderhoud', 'buitengebruikstelling', 'inkoop'
  date: string; // YYYY-MM-DD
  co2_equivalent: number; // calculated: amount_kg * (gwp / 1000)
}

export interface AnnualBalance {
  id: string; // usually year_refrigerantId
  year: number;
  refrigerant_id: string;
  refrigerant_name?: string;
  gwp?: number;
  start_weight_kg: number;
  actual_weight_kg: number; // manually entered actual stock on Dec 31st
  end_weight_kg: number; // calculated end weight
  total_purchased: number;
  total_recovered: number;
  total_sold: number;
  total_disposed: number;
  total_co2_equivalent: number;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const STORAGE_KEY_CONFIG = "kmr_firebase_config";
const STORAGE_KEY_REFRIGERANTS = "kmr_local_refrigerants";
const STORAGE_KEY_CYLINDERS = "kmr_local_cylinders";
const STORAGE_KEY_REGISTRATIONS = "kmr_local_registrations";
const STORAGE_KEY_BALANCES = "kmr_local_balances";

// Default refrigerants
const DEFAULT_REFRIGERANTS: Refrigerant[] = [
  { id: "r32", name: "R32", gwp: 675, current_stock_kg: 50, reclaim_stock_kg: 0 },
  { id: "r410a", name: "R410A", gwp: 2088, current_stock_kg: 100, reclaim_stock_kg: 0 },
  { id: "r407c", name: "R407C", gwp: 1774, current_stock_kg: 75, reclaim_stock_kg: 0 }
];

const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyBYL4gkcT6RQPIqpmo1NpU9kutjb2uKdJw",
  authDomain: "kmr-brl100v2.firebaseapp.com",
  projectId: "kmr-brl100v2",
  storageBucket: "kmr-brl100v2.firebasestorage.app",
  messagingSenderId: "238585612467",
  appId: "1:238585612467:web:64294b7a80e3c8bb8788c6"
};

class DatabaseService {
  private db: any = null;
  private isFirebase = false;

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number = 3500): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Firebase verbindingstimeout (database offline of onjuiste config)")), timeoutMs)
      )
    ]);
  }

  constructor() {
    this.init();
  }

  public init() {
    let config: FirebaseConfig | null = null;
    const configStr = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (configStr) {
      try {
        const parsed = JSON.parse(configStr);
        // Self-healing: if the saved config in localStorage is the old invalid one, delete it
        if (parsed && parsed.apiKey && parsed.apiKey.startsWith("AQ.Ab8R")) {
          localStorage.removeItem(STORAGE_KEY_CONFIG);
          console.log("Self-healed: removed invalid config from localStorage.");
        } else {
          config = parsed;
        }
      } catch (e) {
        console.error("Failed to parse stored config:", e);
      }
    }

    // Default fallback to the hardcoded production Firebase database config
    if (!config) {
      config = DEFAULT_FIREBASE_CONFIG;
    }

    if (config && config.projectId && config.apiKey) {
      try {
        if (getApps().length === 0) {
          const app = initializeApp(config);
          this.db = getFirestore(app);
        } else {
          this.db = getFirestore(getApp());
        }
        this.isFirebase = true;
        console.log("Firebase initialized successfully.");
        return;
      } catch (e) {
        console.error("Failed to initialize Firebase:", e);
      }
    }

    // Fallback to local storage if both fail
    this.db = null;
    this.isFirebase = false;
    console.log("Using LocalStorage fallback database.");
    this.seedLocalStorageIfNeeded();
  }

  private seedLocalStorageIfNeeded() {
    if (!localStorage.getItem(STORAGE_KEY_REFRIGERANTS)) {
      localStorage.setItem(STORAGE_KEY_REFRIGERANTS, JSON.stringify(DEFAULT_REFRIGERANTS));
    }
    if (!localStorage.getItem(STORAGE_KEY_REGISTRATIONS)) {
      localStorage.setItem(STORAGE_KEY_REGISTRATIONS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEY_BALANCES)) {
      localStorage.setItem(STORAGE_KEY_BALANCES, JSON.stringify([]));
    }
  }

  public isUsingFirebase(): boolean {
    return this.isFirebase;
  }

  public getSavedConfig(): FirebaseConfig | null {
    const configStr = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (configStr) {
      try {
        return JSON.parse(configStr);
      } catch {
        return null;
      }
    }
    return null;
  }

  public saveConfig(config: FirebaseConfig | null) {
    if (config) {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    } else {
      localStorage.removeItem(STORAGE_KEY_CONFIG);
    }
    this.init();
  }

  // --- Refrigerant (Koudemiddelen) CRUD ---

  public async getRefrigerants(): Promise<Refrigerant[]> {
    if (this.isFirebase && this.db) {
      try {
        const snap = await this.withTimeout(getDocs(collection(this.db, "refrigerants")), 3500);
        const list: Refrigerant[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Refrigerant);
        });
        // If Firestore is empty, we seed it with defaults
        if (list.length === 0) {
          for (const ref of DEFAULT_REFRIGERANTS) {
            const { id: _, ...data } = ref;
            const docRef = await this.withTimeout(addDoc(collection(this.db, "refrigerants"), data), 3500);
            list.push({ id: docRef.id, ...data });
          }
        }
        return list;
      } catch (e) {
        console.error("Firebase error, falling back to LocalStorage:", e);
      }
    }

    // LocalStorage fallback
    this.seedLocalStorageIfNeeded();
    return JSON.parse(localStorage.getItem(STORAGE_KEY_REFRIGERANTS) || "[]");
  }

  public async addRefrigerant(ref: Omit<Refrigerant, "id">): Promise<Refrigerant> {
    if (this.isFirebase && this.db) {
      try {
        const docRef = await addDoc(collection(this.db, "refrigerants"), ref);
        return { id: docRef.id, ...ref };
      } catch (e) {
        console.error("Firebase add error:", e);
        throw new Error("Fout bij opslaan koudemiddel in Firebase: " + (e as Error).message);
      }
    }

    // LocalStorage
    const list = await this.getRefrigerants();
    const newRef: Refrigerant = {
      id: "ref_" + Date.now(),
      ...ref
    };
    list.push(newRef);
    localStorage.setItem(STORAGE_KEY_REFRIGERANTS, JSON.stringify(list));
    return newRef;
  }

  public async updateRefrigerant(id: string, updates: Partial<Refrigerant>): Promise<void> {
    if (this.isFirebase && this.db) {
      try {
        await updateDoc(doc(this.db, "refrigerants", id), updates);
        return;
      } catch (e) {
        console.error("Firebase update error:", e);
        throw new Error("Fout bij bijwerken koudemiddel in Firebase: " + (e as Error).message);
      }
    }

    // LocalStorage
    const list = await this.getRefrigerants();
    const index = list.findIndex(r => r.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      localStorage.setItem(STORAGE_KEY_REFRIGERANTS, JSON.stringify(list));
    }
  }

  public async deleteRefrigerant(id: string): Promise<void> {
    if (this.isFirebase && this.db) {
      try {
        await deleteDoc(doc(this.db, "refrigerants", id));
        return;
      } catch (e) {
        console.error("Firebase delete refrigerant error:", e);
        throw new Error("Fout bij verwijderen koudemiddel in Firebase: " + (e as Error).message);
      }
    }

    // LocalStorage
    const list = await this.getRefrigerants();
    const filtered = list.filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY_REFRIGERANTS, JSON.stringify(filtered));
  }

  // --- Cylinders (Flessen) CRUD ---

  public async getCylinders(): Promise<Cylinder[]> {
    const refrigerants = await this.getRefrigerants();
    const refMap = new Map(refrigerants.map(r => [r.id, r]));

    if (this.isFirebase && this.db) {
      try {
        const snap = await this.withTimeout(getDocs(collection(this.db, "cylinders")), 3500);
        const list: Cylinder[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const ref = refMap.get(data.refrigerant_id);
          list.push({ 
            id: docSnap.id, 
            ...data,
            refrigerant_name: ref ? ref.name : "Onbekend"
          } as Cylinder);
        });
        return list.sort((a, b) => new Date(a.inspection_date).getTime() - new Date(b.inspection_date).getTime());
      } catch (e) {
        console.error("Firebase error, falling back to LocalStorage:", e);
      }
    }

    // LocalStorage fallback
    if (!localStorage.getItem(STORAGE_KEY_CYLINDERS)) {
      localStorage.setItem(STORAGE_KEY_CYLINDERS, JSON.stringify([]));
    }
    const list: Cylinder[] = JSON.parse(localStorage.getItem(STORAGE_KEY_CYLINDERS) || "[]");
    return list.map(cyl => {
      const ref = refMap.get(cyl.refrigerant_id);
      return {
        ...cyl,
        refrigerant_name: ref ? ref.name : "Onbekend"
      };
    }).sort((a, b) => new Date(a.inspection_date).getTime() - new Date(b.inspection_date).getTime());
  }

  public async addCylinder(cyl: Omit<Cylinder, "id" | "refrigerant_name">): Promise<Cylinder> {
    const refrigerants = await this.getRefrigerants();
    const ref = refrigerants.find(r => r.id === cyl.refrigerant_id);
    if (!ref) throw new Error("Koudemiddel niet gevonden");

    const fullCylData = { ...cyl, created_at: new Date().toISOString() };

    if (this.isFirebase && this.db) {
      try {
        const docRef = await addDoc(collection(this.db, "cylinders"), fullCylData);
        return { id: docRef.id, ...fullCylData, refrigerant_name: ref.name };
      } catch (e) {
        console.error("Firebase add error:", e);
        throw new Error("Fout bij opslaan cilinder in Firebase: " + (e as Error).message);
      }
    }

    // LocalStorage
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_CYLINDERS) || "[]");
    const newCyl: Cylinder = {
      id: "cyl_" + Date.now(),
      ...fullCylData
    };
    list.push(newCyl);
    localStorage.setItem(STORAGE_KEY_CYLINDERS, JSON.stringify(list));
    return { ...newCyl, refrigerant_name: ref.name };
  }

  public async updateCylinder(id: string, updates: Partial<Cylinder>): Promise<void> {
    if (this.isFirebase && this.db) {
      try {
        await updateDoc(doc(this.db, "cylinders", id), updates);
        return;
      } catch (e) {
        console.error("Firebase update error:", e);
        throw new Error("Fout bij bijwerken cilinder in Firebase: " + (e as Error).message);
      }
    }

    // LocalStorage
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_CYLINDERS) || "[]");
    const index = list.findIndex((c: any) => c.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      localStorage.setItem(STORAGE_KEY_CYLINDERS, JSON.stringify(list));
    }
  }

  public async deleteCylinder(id: string): Promise<void> {
    if (this.isFirebase && this.db) {
      try {
        await deleteDoc(doc(this.db, "cylinders", id));
        return;
      } catch (e) {
        console.error("Firebase delete error:", e);
        throw new Error("Fout bij verwijderen cilinder in Firebase: " + (e as Error).message);
      }
    }

    // LocalStorage
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_CYLINDERS) || "[]");
    const filtered = list.filter((c: any) => c.id !== id);
    localStorage.setItem(STORAGE_KEY_CYLINDERS, JSON.stringify(filtered));
  }

  // --- Registration (Installatie Niveau) CRUD ---

  public async getRegistrations(): Promise<Registration[]> {
    const refrigerants = await this.getRefrigerants();
    const refMap = new Map(refrigerants.map(r => [r.id, r]));

    if (this.isFirebase && this.db) {
      try {
        const snap = await this.withTimeout(getDocs(collection(this.db, "registrations")), 3500);
        const list: Registration[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const ref = refMap.get(data.refrigerant_id);
          list.push({ 
            id: docSnap.id, 
            ...data,
            refrigerant_name: ref ? ref.name : "Onbekend",
          } as Registration);
        });
        return list.sort((a, b) => b.date.localeCompare(a.date));
      } catch (e) {
        console.error("Firebase error, falling back to LocalStorage:", e);
      }
    }

    // LocalStorage fallback
    this.seedLocalStorageIfNeeded();
    const list: Registration[] = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRATIONS) || "[]");
    return list.map(reg => {
      const ref = refMap.get(reg.refrigerant_id);
      return {
        ...reg,
        refrigerant_name: ref ? ref.name : "Onbekend"
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }

  private calculateStockImpact(reg: { mutation: string; reason: string; amount_kg: number }) {
    let stockDiff = 0;
    let reclaimDiff = 0;

    if (reg.reason === "vernietiging") {
      if (reg.mutation === "terugwinning") {
        reclaimDiff = reg.amount_kg;
      }
    } else {
      if (reg.mutation === "toevoeging" || reg.mutation === "afrekening") {
        stockDiff = -reg.amount_kg;
      } else if (reg.mutation === "terugwinning") {
        stockDiff = reg.amount_kg;
      } else if (reg.mutation === "inkoop") {
        stockDiff = reg.amount_kg;
      }
    }

    return { stockDiff, reclaimDiff };
  }

  public async addRegistration(reg: Omit<Registration, "id" | "refrigerant_name" | "co2_equivalent">): Promise<Registration> {
    const refrigerants = await this.getRefrigerants();
    const ref = refrigerants.find(r => r.id === reg.refrigerant_id);
    if (!ref) throw new Error("Koudemiddel niet gevonden");

    // Calculate CO2 equivalent: (amount * GWP) / 1000 to convert to tonnes of CO2
    const co2_equivalent = parseFloat(((reg.amount_kg * ref.gwp) / 1000).toFixed(2));
    
    const fullRegData: any = {
      installation_id: reg.installation_id,
      refrigerant_id: reg.refrigerant_id,
      amount_kg: reg.amount_kg,
      mutation: reg.mutation,
      reason: reg.reason,
      date: reg.date,
      co2_equivalent
    };

    if (reg.installation_type !== undefined) {
      fullRegData.installation_type = reg.installation_type;
    }
    if (reg.nominal_charge_kg !== undefined) {
      fullRegData.nominal_charge_kg = reg.nominal_charge_kg;
    }
    if (reg.cylinder_id !== undefined) {
      fullRegData.cylinder_id = reg.cylinder_id;
    }

    // Adjust stock based on mutation & reason:
    const { stockDiff, reclaimDiff } = this.calculateStockImpact(reg);

    const currentReclaim = ref.reclaim_stock_kg || 0;
    const newStock = Math.max(0, ref.current_stock_kg + stockDiff);
    const newReclaim = Math.max(0, currentReclaim + reclaimDiff);

    await this.updateRefrigerant(ref.id, { 
      current_stock_kg: parseFloat(newStock.toFixed(2)),
      reclaim_stock_kg: parseFloat(newReclaim.toFixed(2))
    });

    if (this.isFirebase && this.db) {
      try {
        const docRef = await addDoc(collection(this.db, "registrations"), fullRegData);
        return { id: docRef.id, ...fullRegData, refrigerant_name: ref.name };
      } catch (e) {
        console.error("Firebase add registration error:", e);
        throw new Error("Fout bij opslaan registratie in Firebase: " + (e as Error).message);
      }
    }

    // LocalStorage
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRATIONS) || "[]");
    const newReg: Registration = {
      id: "reg_" + Date.now(),
      ...fullRegData
    };
    list.push(newReg);
    localStorage.setItem(STORAGE_KEY_REGISTRATIONS, JSON.stringify(list));
    return { ...newReg, refrigerant_name: ref.name };
  }

  public async updateRegistration(id: string, updates: Partial<Registration>): Promise<void> {
    // To update correctly, we first revert the previous stock impact, then apply the new stock impact.
    const oldRegistrations = await this.getRegistrations();
    const oldReg = oldRegistrations.find(r => r.id === id);
    if (!oldReg) throw new Error("Registratie niet gevonden");

    const refrigerants = await this.getRefrigerants();
    const oldRef = refrigerants.find(r => r.id === oldReg.refrigerant_id);

    // Revert old impact
    if (oldRef) {
      const { stockDiff: oldStockDiff, reclaimDiff: oldReclaimDiff } = this.calculateStockImpact(oldReg);
      const currentReclaim = oldRef.reclaim_stock_kg || 0;
      await this.updateRefrigerant(oldRef.id, { 
        current_stock_kg: parseFloat(Math.max(0, oldRef.current_stock_kg - oldStockDiff).toFixed(2)),
        reclaim_stock_kg: parseFloat(Math.max(0, currentReclaim - oldReclaimDiff).toFixed(2))
      });
    }

    // Refresh refrigerants list to get latest stocks before applying new changes
    const refreshedRefrigerants = await this.getRefrigerants();

    // Now calculate new impact
    const activeRefId = updates.refrigerant_id || oldReg.refrigerant_id;
    const activeRef = refreshedRefrigerants.find(r => r.id === activeRefId);
    if (!activeRef) throw new Error("Nieuw koudemiddel niet gevonden");

    const amount = updates.amount_kg !== undefined ? updates.amount_kg : oldReg.amount_kg;
    const mutation = updates.mutation || oldReg.mutation;
    const reason = updates.reason || oldReg.reason;
    const installation_id = updates.installation_id || oldReg.installation_id;
    const date = updates.date || oldReg.date;

    const co2_equivalent = parseFloat(((amount * activeRef.gwp) / 1000).toFixed(2));

    const tempRegForImpact = { mutation, reason, amount_kg: amount };
    const { stockDiff: newStockDiff, reclaimDiff: newReclaimDiff } = this.calculateStockImpact(tempRegForImpact);

    const activeReclaim = activeRef.reclaim_stock_kg || 0;
    await this.updateRefrigerant(activeRef.id, { 
      current_stock_kg: parseFloat(Math.max(0, activeRef.current_stock_kg + newStockDiff).toFixed(2)),
      reclaim_stock_kg: parseFloat(Math.max(0, activeReclaim + newReclaimDiff).toFixed(2))
    });

    const finalUpdates: any = {
      installation_id,
      refrigerant_id: activeRefId,
      amount_kg: amount,
      mutation,
      reason,
      date,
      co2_equivalent
    };

    if (updates.installation_type !== undefined) {
      finalUpdates.installation_type = updates.installation_type;
    } else if (oldReg.installation_type) {
      finalUpdates.installation_type = oldReg.installation_type;
    }

    if (updates.nominal_charge_kg !== undefined) {
      finalUpdates.nominal_charge_kg = updates.nominal_charge_kg;
    } else if (oldReg.nominal_charge_kg) {
      finalUpdates.nominal_charge_kg = oldReg.nominal_charge_kg;
    }

    if (updates.cylinder_id !== undefined) {
      finalUpdates.cylinder_id = updates.cylinder_id;
    } else if (oldReg.cylinder_id) {
      finalUpdates.cylinder_id = oldReg.cylinder_id;
    }

    if (this.isFirebase && this.db) {
      try {
        await updateDoc(doc(this.db, "registrations", id), finalUpdates);
        return;
      } catch (e) {
        console.error("Firebase update registration error:", e);
        throw new Error("Fout bij bijwerken registratie in Firebase: " + (e as Error).message);
      }
    }

    // LocalStorage
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRATIONS) || "[]");
    const index = list.findIndex((r: any) => r.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...finalUpdates };
      localStorage.setItem(STORAGE_KEY_REGISTRATIONS, JSON.stringify(list));
    }
  }

  public async deleteRegistration(id: string): Promise<void> {
    const registrations = await this.getRegistrations();
    const reg = registrations.find(r => r.id === id);
    if (!reg) throw new Error("Registratie niet gevonden");

    const refrigerants = await this.getRefrigerants();
    const ref = refrigerants.find(r => r.id === reg.refrigerant_id);

    // Revert stock impact
    if (ref) {
      const { stockDiff, reclaimDiff } = this.calculateStockImpact(reg);
      const currentReclaim = ref.reclaim_stock_kg || 0;
      await this.updateRefrigerant(ref.id, { 
        current_stock_kg: parseFloat(Math.max(0, ref.current_stock_kg - stockDiff).toFixed(2)),
        reclaim_stock_kg: parseFloat(Math.max(0, currentReclaim - reclaimDiff).toFixed(2))
      });
    }

    if (this.isFirebase && this.db) {
      try {
        await deleteDoc(doc(this.db, "registrations", id));
        return;
      } catch (e) {
        console.error("Firebase delete registration error:", e);
        throw new Error("Fout bij verwijderen registratie in Firebase: " + (e as Error).message);
      }
    }

    // LocalStorage
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_REGISTRATIONS) || "[]");
    const filtered = list.filter((r: any) => r.id !== id);
    localStorage.setItem(STORAGE_KEY_REGISTRATIONS, JSON.stringify(filtered));
  }

  // --- Annual Balances (Koudemiddel Jaarbalans) ---

  public async getAnnualBalances(year: number): Promise<AnnualBalance[]> {
    const refrigerants = await this.getRefrigerants();
    const registrations = await this.getRegistrations();

    // Filter registrations for the selected year
    const yearRegs = registrations.filter(r => new Date(r.date).getFullYear() === year);

    let prevYearBalances: AnnualBalance[] = [];

    if (this.isFirebase && this.db) {
      try {
        const snap = await this.withTimeout(getDocs(query(collection(this.db, "annual_balances"), where("year", "==", year))), 3500);
        const savedBalances: AnnualBalance[] = [];
        snap.forEach((docSnap) => {
          savedBalances.push({ id: docSnap.id, ...docSnap.data() } as AnnualBalance);
        });

        // Also fetch previous year's balances to carry over ending stands
        try {
          const prevSnap = await this.withTimeout(getDocs(query(collection(this.db, "annual_balances"), where("year", "==", year - 1))), 3500);
          prevSnap.forEach((docSnap) => {
            prevYearBalances.push({ id: docSnap.id, ...docSnap.data() } as AnnualBalance);
          });
        } catch (prevErr) {
          console.error("Firebase error fetching previous year balances, skipping carry-over default:", prevErr);
        }

        // Generate combined structure (saved override + dynamic math)
        return this.compileBalances(year, refrigerants, yearRegs, savedBalances, prevYearBalances);
      } catch (e) {
        console.error("Firebase fetch balances error:", e);
      }
    }

    // LocalStorage fallback
    this.seedLocalStorageIfNeeded();
    const savedBalances: AnnualBalance[] = JSON.parse(localStorage.getItem(STORAGE_KEY_BALANCES) || "[]")
      .filter((b: any) => b.year === year);
    const localPrevBalances: AnnualBalance[] = JSON.parse(localStorage.getItem(STORAGE_KEY_BALANCES) || "[]")
      .filter((b: any) => b.year === year - 1);

    return this.compileBalances(year, refrigerants, yearRegs, savedBalances, localPrevBalances);
  }

  private compileBalances(
    year: number, 
    refrigerants: Refrigerant[], 
    yearRegs: Registration[], 
    savedBalances: AnnualBalance[],
    prevYearBalances: AnnualBalance[] = []
  ): AnnualBalance[] {
    const savedMap = new Map(savedBalances.map(b => [b.refrigerant_id, b]));
    const prevMap = new Map(prevYearBalances.map(b => [b.refrigerant_id, b]));

    return refrigerants.map(ref => {
      const refRegs = yearRegs.filter(r => r.refrigerant_id === ref.id);

      // Summarize mutations for this refrigerant in this year:
      let total_purchased = 0;
      let total_recovered = 0;
      let total_sold = 0;
      let total_disposed = 0;

      refRegs.forEach(reg => {
        if (reg.mutation === "toevoeging" || reg.mutation === "afrekening") {
          total_sold += reg.amount_kg;
        } else if (reg.mutation === "terugwinning") {
          if (reg.reason === "vernietiging") {
            total_recovered += reg.amount_kg; // Came into reclaim cylinders
            total_disposed += reg.amount_kg; // And is disposed / offered for destruction
          } else {
            total_recovered += reg.amount_kg; // Normal reusable recovery
          }
        } else if (reg.mutation === "afvoer") {
          total_disposed += reg.amount_kg;
        } else if (reg.mutation === "inkoop") {
          total_purchased += reg.amount_kg; // sum all registered purchases!
        }
      });

      const saved = savedMap.get(ref.id);
      const prevSaved = prevMap.get(ref.id);
      
      // Starting weight defaults to:
      // 1. Explicitly saved start weight for this year
      // 2. Otherwise, the previous year's actual_weight_kg (if saved)
      // 3. Otherwise, the current cylinder stock of the koudemiddel minus the net year impact of mutations (as a fallback)
      let start_weight_kg = 0;
      if (saved && saved.start_weight_kg !== undefined) {
        start_weight_kg = saved.start_weight_kg;
      } else if (prevSaved && prevSaved.actual_weight_kg !== undefined) {
        start_weight_kg = prevSaved.actual_weight_kg;
      } else {
        // Fallback: Current stock today minus the net impact of the current year's mutations
        const net_year_impact = total_purchased + total_recovered - total_sold - total_disposed;
        start_weight_kg = parseFloat((ref.current_stock_kg - net_year_impact).toFixed(2));
      }
      
      // Calculate End Weight: Start Weight + Purchased + Recovered - Sold - Disposed
      const end_weight_kg = parseFloat((start_weight_kg + total_purchased + total_recovered - total_sold - total_disposed).toFixed(2));
      const total_co2_equivalent = parseFloat(((total_sold * ref.gwp) / 1000).toFixed(2));

      // Actual weight defaults to saved actual weight or calculated end weight if not set
      const actual_weight_kg = (saved && saved.actual_weight_kg !== undefined) ? saved.actual_weight_kg : end_weight_kg;

      return {
        id: saved ? saved.id : `${year}_${ref.id}`,
        year,
        refrigerant_id: ref.id,
        refrigerant_name: ref.name,
        gwp: ref.gwp,
        start_weight_kg,
        actual_weight_kg,
        end_weight_kg,
        total_purchased: parseFloat(total_purchased.toFixed(2)),
        total_recovered: parseFloat(total_recovered.toFixed(2)),
        total_sold: parseFloat(total_sold.toFixed(2)),
        total_disposed: parseFloat(total_disposed.toFixed(2)),
        total_co2_equivalent
      };
    });
  }

  public async saveAnnualBalance(balance: Omit<AnnualBalance, "refrigerant_name" | "gwp" | "end_weight_kg" | "total_co2_equivalent">): Promise<void> {
    const refrigerants = await dbService.getRefrigerants();
    const ref = refrigerants.find(r => r.id === balance.refrigerant_id);
    if (!ref) throw new Error("Koudemiddel niet gevonden");

    // The start_weight_kg and actual_weight_kg are editable, so we save them
    const id = balance.id || `${balance.year}_${balance.refrigerant_id}`;
    const cleanBalance = {
      id,
      year: balance.year,
      refrigerant_id: balance.refrigerant_id,
      start_weight_kg: balance.start_weight_kg,
      actual_weight_kg: balance.actual_weight_kg,
      total_purchased: balance.total_purchased,
      total_recovered: balance.total_recovered,
      total_sold: balance.total_sold,
      total_disposed: balance.total_disposed
    };

    if (this.isFirebase && this.db) {
      try {
        await setDoc(doc(this.db, "annual_balances", id), cleanBalance);
        return;
      } catch (e) {
        console.error("Firebase save balance error:", e);
        throw new Error("Fout bij opslaan jaarbalans in Firebase: " + (e as Error).message);
      }
    }

    // LocalStorage
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_BALANCES) || "[]");
    const index = list.findIndex((b: any) => b.id === id);
    if (index !== -1) {
      list[index] = cleanBalance;
    } else {
      list.push(cleanBalance);
    }
    localStorage.setItem(STORAGE_KEY_BALANCES, JSON.stringify(list));
  }

  public async migrateLocalDataToFirebase(): Promise<{ refrigerantsMigrated: number; registrationsMigrated: number }> {
    if (!this.isFirebase || !this.db) {
      throw new Error("Firebase is niet verbonden. Verbind eerst Firebase via Instellingen.");
    }

    // 1. Get all local refrigerants
    const localRefsJson = localStorage.getItem(STORAGE_KEY_REFRIGERANTS);
    const localRefs: Refrigerant[] = localRefsJson ? JSON.parse(localRefsJson) : [];

    // 2. Get all local registrations
    const localRegsJson = localStorage.getItem(STORAGE_KEY_REGISTRATIONS);
    const localRegs: Registration[] = localRegsJson ? JSON.parse(localRegsJson) : [];

    let refrigerantsMigrated = 0;
    let registrationsMigrated = 0;

    // We'll need a mapping from local refrigerant ID to the new Firestore ID (if it changes)
    const refIdMapping = new Map<string, string>();

    // 3. Migrate refrigerants
    // First, let's see what is already in Firebase to avoid duplicates
    const firebaseRefsSnap = await getDocs(collection(this.db, "refrigerants"));
    const firebaseRefs = new Map<string, string>(); // name lowercased -> id
    firebaseRefsSnap.forEach(docSnap => {
      firebaseRefs.set(docSnap.data().name.toLowerCase(), docSnap.id);
    });

    for (const ref of localRefs) {
      const existingFirebaseId = firebaseRefs.get(ref.name.toLowerCase());
      if (existingFirebaseId) {
        // Already exists in Firebase, just map it
        refIdMapping.set(ref.id, existingFirebaseId);
      } else {
        // Doesn't exist, add it to Firebase
        const { id: _, ...data } = ref;
        const docRef = await addDoc(collection(this.db, "refrigerants"), data);
        refIdMapping.set(ref.id, docRef.id);
        refrigerantsMigrated++;
      }
    }

    // 4. Migrate registrations
    // First, let's see what is already in Firebase registrations to avoid duplicates
    const firebaseRegsSnap = await getDocs(collection(this.db, "registrations"));
    const firebaseRegsSet = new Set<string>(); // unique key of registration to avoid duplicates
    firebaseRegsSnap.forEach(docSnap => {
      const data = docSnap.data();
      const key = `${data.installation_id}_${data.refrigerant_id}_${data.amount_kg}_${data.date}_${data.mutation}`;
      firebaseRegsSet.add(key);
    });

    for (const reg of localRegs) {
      // Map to new refrigerant id if it changed during migration
      const firebaseRefId = refIdMapping.get(reg.refrigerant_id) || reg.refrigerant_id;
      
      const key = `${reg.installation_id}_${firebaseRefId}_${reg.amount_kg}_${reg.date}_${reg.mutation}`;
      if (!firebaseRegsSet.has(key)) {
        const cleanReg: any = {
          installation_id: reg.installation_id,
          installation_type: reg.installation_type,
          nominal_charge_kg: reg.nominal_charge_kg,
          refrigerant_id: firebaseRefId,
          amount_kg: reg.amount_kg,
          mutation: reg.mutation,
          reason: reg.reason || "",
          date: reg.date,
          co2_equivalent: reg.co2_equivalent
        };
        if (reg.cylinder_id) {
          cleanReg.cylinder_id = reg.cylinder_id;
        }
        await addDoc(collection(this.db, "registrations"), cleanReg);
        registrationsMigrated++;
      }
    }

    return { refrigerantsMigrated, registrationsMigrated };
  }
}

export const dbService = new DatabaseService();