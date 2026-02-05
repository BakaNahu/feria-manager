import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, Store, Users, DollarSign, XCircle, Save, Trash2, 
  MapPin, Link as LinkIcon, Maximize, AlignLeft, Info, Pin, 
  Database, RefreshCw, Loader2, List, LayoutGrid, CalendarDays,
  CheckCircle2, AlertCircle, Search, ArrowRightLeft, Sparkles, FileText, Cloud, Wifi
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, getDoc, collection, onSnapshot, getDocs 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken 
} from 'firebase/auth';

// --- CONFIGURACIÓN FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDfL8jWgw4zOb9vVDS0wlTkPZlHHLeUev0",
  authDomain: "feria-manager-final.firebaseapp.com",
  projectId: "feria-manager-final",
  storageBucket: "feria-manager-final.firebasestorage.app",
  messagingSenderId: "243453418574",
  appId: "1:243453418574:web:d9c1bd522ece03e827f71f"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- CONFIGURACIÓN GEMINI API ---
const apiKey = ""; 

const callGeminiAPI = async (prompt) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Error al generar.";
  } catch (error) { return "Error de conexión IA."; }
};

const getNextWeekends = (startDateStr, count) => {
  let dates = [];
  let currentDate = new Date(startDateStr);
  currentDate.setMinutes(currentDate.getMinutes() + currentDate.getTimezoneOffset());
  for (let i = 0; i < count; i++) {
    let nextDate = new Date(currentDate);
    nextDate.setDate(currentDate.getDate() + (7 * i));
    dates.push(nextDate.toISOString().split('T')[0]);
  }
  return dates;
};

export default function FeriaApp() {
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [currentView, setCurrentView] = useState('map'); 
  const [selectedStall, setSelectedStall] = useState(null);
  const [occupyCount, setOccupyCount] = useState(1);
  const [stalls, setStalls] = useState([]);
  const [isMonthly, setIsMonthly] = useState(false);
  const [user, setUser] = useState(null);
  const [isSyncing, setIsSyncing] = useState(true);
  const [futureBookingsList, setFutureBookingsList] = useState([]);

  // Estados IA
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState(null);

  // --- AUTENTICACIÓN FIREBASE ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // --- ESTRUCTURA ---
  const generateStructure = () => {
    let newStalls = [];
    let idCounter = 1;
    // FILA ARRIBA: 36 Verdes
    for (let i = 0; i < 36; i++) {
      newStalls.push({
        id: idCounter++, indexByCategory: i, number: `V-${i + 1}`,
        categoryName: 'Verde', colorKey: 'green', rowName: 'Norte (Verdes)',
        status: 'free', vendorName: '', description: '', groupId: null, groupSize: 1, 
        hasPaid: false, attended: false, isFixed: false, notes: ''
      });
    }
    // FILA ABAJO: 26 Amarillos + 9 Rojos
    for (let i = 0; i < 26; i++) {
      newStalls.push({
        id: idCounter++, indexByCategory: i, number: `A-${i + 1}`,
        categoryName: 'Amarillo', colorKey: 'yellow', rowName: 'Sur (Mixto)',
        status: 'free', vendorName: '', description: '', groupId: null, groupSize: 1, 
        hasPaid: false, attended: false, isFixed: false, notes: ''
      });
    }
    for (let i = 0; i < 9; i++) {
       newStalls.push({
        id: idCounter++, indexByCategory: i, number: `R-${i + 1}`,
        categoryName: 'Rojo', colorKey: 'red', rowName: 'Sur (Mixto)',
        status: 'free', vendorName: '', description: '', groupId: null, groupSize: 1, 
        hasPaid: false, attended: false, isFixed: false, notes: ''
      });
    }
    // SECTOR ROSAS
    for (let i = 0; i < 6; i++) {
       newStalls.push({
        id: idCounter++, indexByCategory: i, number: `P-${i + 1}`,
        categoryName: 'Rosa', colorKey: 'pink', rowName: 'Sector Rosas',
        status: 'free', vendorName: '', description: '', groupId: null, groupSize: 1, 
        hasPaid: false, attended: false, isFixed: false, notes: ''
      });
    }
    return newStalls;
  };

  // --- CARGA DE DATOS (REAL-TIME DATABASE) ---
  useEffect(() => {
    if (!user) return;
    setIsSyncing(true);

    const dayDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'feria_days', `day_${selectedDate}`);
    const masterDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'feria_config', 'master_fixed');

    const unsubscribe = onSnapshot(dayDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        setStalls(docSnap.data().stalls);
        setIsSyncing(false);
      } else {
        try {
          const masterSnap = await getDoc(masterDocRef);
          const cleanStalls = generateStructure();
          let dataToSet = cleanStalls;

          if (masterSnap.exists()) {
            const fixedIds = masterSnap.data().stalls;
            dataToSet = cleanStalls.map(s => {
              const fixedData = fixedIds.find(f => f.id === s.id);
              if (fixedData) {
                return { ...s, ...fixedData, hasPaid: false, attended: false, status: 'occupied', id: s.id, number: s.number }; 
              }
              return s;
            });
          }
          await setDoc(dayDocRef, { stalls: dataToSet });
        } catch (e) {
          console.error("Error iniciando día:", e);
          setStalls(generateStructure());
          setIsSyncing(false);
        }
      }
    }, (error) => {
      console.error("Error de sincronización:", error);
      setIsSyncing(false);
    });

    return () => unsubscribe();
  }, [selectedDate, user]);

  // Cargar lista de reservas futuras
  useEffect(() => {
    if (!user) return;
    const fetchFuture = async () => {
      const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'feria_days');
      const snapshot = await getDocs(colRef);
      let future = [];
      
      snapshot.forEach(doc => {
        if (doc.id.startsWith('day_')) {
          const dateStr = doc.id.replace('day_', '');
          if (dateStr > selectedDate) {
            const data = doc.data().stalls;
            const occupied = data.filter(s => s.status === 'occupied');
            const seenGroups = new Set();
            occupied.forEach(s => {
              if (!s.groupId || !seenGroups.has(s.groupId)) {
                 if(s.groupId) seenGroups.add(s.groupId);
                 future.push({ date: dateStr, ...s });
              }
            });
          }
        }
      });
      setFutureBookingsList(future.sort((a,b) => a.date.localeCompare(b.date)));
    };
    
    fetchFuture();
  }, [selectedDate, user, currentView]);

  // --- GUARDADO (DB WRITES) ---
  const saveStallsToDB = async (date, newStalls) => {
    if (!user) return;
    const dayRef = doc(db, 'artifacts', appId, 'public', 'data', 'feria_days', `day_${date}`);
    await setDoc(dayRef, { stalls: newStalls });
  };

  const updateMasterFixed = async (currentStalls) => {
    if (!user) return;
    const masterRef = doc(db, 'artifacts', appId, 'public', 'data', 'feria_config', 'master_fixed');
    const fixedStalls = currentStalls.filter(s => s.isFixed).map(s => ({
      id: s.id, status: 'occupied', vendorName: s.vendorName, 
      description: s.description, isFixed: true, 
      groupId: s.groupId, groupSize: s.groupSize, notes: s.notes
    }));
    await setDoc(masterRef, { stalls: fixedStalls });
  };

  // --- MANEJADORES ---
  const getMaxAvailableSlots = (currentStall) => {
    if (currentStall.groupId) return currentStall.groupSize;
    let count = 1;
    const rowStalls = stalls.filter(s => s.rowName === currentStall.rowName);
    const currentIndex = rowStalls.findIndex(s => s.id === currentStall.id);
    for (let i = 1; i < 4; i++) {
      const nextStall = rowStalls[currentIndex + i];
      if (nextStall && nextStall.status === 'free') count++; else break;
    }
    return count;
  };

  const handleSaveStall = async (e) => {
    e.preventDefault();
    const newGroupId = selectedStall.groupId || (occupyCount > 1 ? `g-${Date.now()}` : null);
    
    const updates = {
      status: selectedStall.status, vendorName: selectedStall.vendorName,
      description: selectedStall.description, hasPaid: selectedStall.hasPaid,
      attended: selectedStall.attended, isFixed: selectedStall.isFixed,
      notes: selectedStall.notes, groupId: selectedStall.groupId || newGroupId,
      groupSize: selectedStall.groupId ? selectedStall.groupSize : occupyCount
    };

    let updatedStalls = applyUpdatesToStalls(stalls, selectedStall, updates, occupyCount);
    setStalls(updatedStalls); 
    await saveStallsToDB(selectedDate, updatedStalls);
    
    if (selectedStall.isFixed || updates.isFixed !== selectedStall.isFixed) {
      await updateMasterFixed(updatedStalls);
    }

    if (isMonthly && selectedStall.status === 'occupied') {
      const datesToBook = getNextWeekends(selectedDate, 4); 
      const futureDates = datesToBook.filter(d => d !== selectedDate);

      Promise.all(futureDates.map(async (date) => {
        const dayRef = doc(db, 'artifacts', appId, 'public', 'data', 'feria_days', `day_${date}`);
        const snap = await getDoc(dayRef);
        
        let dayData = [];
        if (snap.exists()) {
          dayData = snap.data().stalls;
        } else {
          dayData = generateStructure(); 
        }

        const futureUpdates = { ...updates, hasPaid: false, attended: false };
        const targetStallFuture = dayData.find(s => s.id === selectedStall.id);
        
        if (targetStallFuture) {
           const updatedDayData = applyUpdatesToStalls(dayData, targetStallFuture, futureUpdates, occupyCount);
           await setDoc(dayRef, { stalls: updatedDayData });
        }
      })).then(() => alert("✅ Reserva mensual guardada en la nube."));
    }

    setSelectedStall(null);
    setIsMonthly(false);
  };

  const applyUpdatesToStalls = (currentStalls, targetStall, updates, count) => {
    let result = [...currentStalls];
    if (targetStall.groupId) {
       result = result.map(s => (s.groupId === targetStall.groupId ? { ...s, ...updates } : s));
    } else {
      const rowStalls = currentStalls.filter(s => s.rowName === targetStall.rowName);
      const startIndex = rowStalls.findIndex(s => s.id === targetStall.id);
      const idsToUpdate = [];
      for(let i=0; i<count; i++) if(rowStalls[startIndex + i]) idsToUpdate.push(rowStalls[startIndex + i].id);
      result = result.map(s => {
        if (idsToUpdate.includes(s.id)) return { ...s, ...updates };
        return s;
      });
    }
    return result;
  };

  const handleVacateStall = async () => {
    if (!selectedStall) return;
    const updatedStalls = stalls.map(s => {
      if ((selectedStall.groupId && s.groupId === selectedStall.groupId) || s.id === selectedStall.id) {
        return {
          ...s, status: 'free', vendorName: '', description: '', 
          hasPaid: false, attended: false, isFixed: false, groupId: null, groupSize: 1, notes: ''
        };
      }
      return s;
    });
    setStalls(updatedStalls);
    await saveStallsToDB(selectedDate, updatedStalls);
    if (selectedStall.isFixed) {
      await updateMasterFixed(updatedStalls);
    }
    setSelectedStall(null);
  };

  // --- IA ---
  const handleEnhanceDescription = async () => {
    if (!selectedStall.description) return;
    setIsGeneratingDesc(true);
    const prompt = `Reescribe formal y brevemente (max 10 palabras) para una feria: "${selectedStall.description}"`;
    const enhancedText = await callGeminiAPI(prompt);
    setSelectedStall(prev => ({ ...prev, description: enhancedText.replace(/"/g, '') }));
    setIsGeneratingDesc(false);
  };

  const handleGenerateReport = async () => {
    setIsAnalyzing(true);
    const occupied = stalls.filter(s => s.status === 'occupied').length;
    const revenue = stalls.filter(s => s.hasPaid).length * 1500;
    const debtors = stalls.filter(s => s.status === 'occupied' && !s.hasPaid).length;
    const prompt = `Analiza para organizador feria: Ocupación ${occupied}/${stalls.length}, Recaudación $${revenue}, Deudores ${debtors}. Breve recomendación estratégica.`;
    const report = await callGeminiAPI(prompt);
    setAiReport(report);
    setIsAnalyzing(false);
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans pb-20 selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
            <div className="w-full lg:w-auto flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-2.5 rounded-xl text-white shadow-md"><Store className="h-6 w-6" /></div>
                  <div><h1 className="text-xl font-black text-slate-800 tracking-tight">Feria Manager <span className="text-indigo-600">Pro</span></h1>
                  <p className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                    {isSyncing ? <><RefreshCw className="h-3 w-3 animate-spin"/> Sincronizando...</> : <><Cloud className="h-3 w-3"/> En Línea</>}
                  </p>
                  </div>
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-center">
              <div className="flex w-full sm:w-auto gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200/60 shadow-inner">
                {['map', 'finance', 'bookings'].map(view => (
                  <button key={view} onClick={() => setCurrentView(view)} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex justify-center items-center gap-2 ${currentView === view ? 'bg-white shadow text-indigo-600 scale-105' : 'text-slate-500 hover:text-slate-700'}`}>
                    {view === 'map' && <LayoutGrid className="h-4 w-4" />}{view === 'finance' && <DollarSign className="h-4 w-4" />}{view === 'bookings' && <CalendarDays className="h-4 w-4" />}
                    <span className="hidden sm:inline">{view.charAt(0).toUpperCase() + view.slice(1)}</span>
                  </button>
                ))}
              </div>
              <div className="w-full sm:w-auto">
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-lg p-2.5 shadow-sm outline-none cursor-pointer hover:bg-slate-50 transition" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {currentView === 'map' && (
          <>
            <div className="mb-8">
              {!aiReport ? (
                <button onClick={handleGenerateReport} disabled={isAnalyzing} className="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 text-white px-6 py-4 rounded-2xl shadow-lg flex items-center justify-center gap-3 font-bold transition-all">
                  {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} {isAnalyzing ? "Analizando..." : "Reporte Inteligente"}
                </button>
              ) : (
                <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-lg relative animate-in fade-in">
                  <button onClick={() => setAiReport(null)} className="absolute top-4 right-4 text-slate-400"><XCircle className="h-6 w-6"/></button>
                  <h3 className="text-indigo-800 font-black text-lg mb-3">✨ Análisis IA</h3>
                  <p className="text-slate-600 font-medium">{aiReport}</p>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
                 <StatCard label="Ocupación" value={`${stalls.filter(s=>s.status==='occupied').length}/${stalls.length}`} color="blue" icon={Store} />
                 <StatCard label="Recaudación" value={`$${stalls.filter(s=>s.hasPaid).length * 1500}`} color="green" icon={DollarSign} />
                 <StatCard label="Asistencia" value={`${Math.round((stalls.filter(s=>s.attended).length / (stalls.filter(s=>s.status==='occupied').length || 1)) * 100)}%`} color="purple" icon={Users} />
                 <StatCard label="Fijos" value={stalls.filter(s=>s.isFixed).length} color="amber" icon={Pin} />
            </div>

            <div className="space-y-8 pb-10">
              <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100 overflow-hidden relative">
                <div className="absolute top-0 left-0 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-bold px-4 py-1.5 rounded-br-2xl z-10 shadow-sm tracking-wider">VISTA AÉREA - PASILLO CENTRAL</div>
                <div className="overflow-x-auto pb-4 pt-10 px-2 scrollbar-thin scrollbar-thumb-indigo-100 touch-pan-x">
                   <div className="min-w-max flex flex-col gap-10">
                      <div className="flex gap-3">
                         <div className="w-8 flex items-center justify-center font-black text-emerald-200 text-xs rotate-180 tracking-[0.5em]" style={{writingMode: 'vertical-rl'}}>NORTE</div>
                         {stalls.filter(s => s.rowName === 'Norte (Verdes)').map(s => <div key={s.id} className="w-16"><Seat stall={s} onClick={() => { setSelectedStall(s); setOccupyCount(s.groupSize); }} /></div>)}
                      </div>
                      <div className="h-20 flex items-center justify-between px-10 bg-slate-50 border-y-2 border-dashed border-slate-200 rounded-xl mx-8 relative overflow-hidden">
                         <span className="text-slate-300 font-bold tracking-[1em] text-xs relative z-10">PASILLO DE CIRCULACIÓN</span>
                         <ArrowRightLeft className="text-slate-200 h-6 w-6 relative z-10" />
                      </div>
                      <div className="flex gap-3">
                         <div className="w-8 flex items-center justify-center font-black text-amber-200 text-xs rotate-180 tracking-[0.5em]" style={{writingMode: 'vertical-rl'}}>SUR</div>
                         {stalls.filter(s => s.rowName === 'Sur (Mixto)').map(s => <div key={s.id} className="w-16"><Seat stall={s} onClick={() => { setSelectedStall(s); setOccupyCount(s.groupSize); }} /></div>)}
                      </div>
                   </div>
                </div>
              </div>
              <div className="bg-gradient-to-b from-pink-50 to-white p-8 rounded-3xl shadow-lg border border-pink-100 max-w-4xl mx-auto">
                <h3 className="text-center font-bold text-pink-500 mb-6 uppercase tracking-widest text-sm flex items-center justify-center gap-2"><Sparkles className="h-4 w-4" /> Sector Rosas <Sparkles className="h-4 w-4" /></h3>
                <div className="flex justify-center gap-4 overflow-x-auto py-6 px-4 touch-pan-x">
                  {stalls.filter(s => s.rowName === 'Sector Rosas').map(s => <div key={s.id} className="w-16 flex-shrink-0"><Seat stall={s} onClick={() => { setSelectedStall(s); setOccupyCount(s.groupSize); }} /></div>)}
                </div>
              </div>
            </div>
          </>
        )}

        {currentView === 'finance' && (
          <div className="grid md:grid-cols-2 gap-6">
            <FinanceCard title="Deudores" color="red" icon={AlertCircle} items={stalls.filter(s=>s.status==='occupied' && !s.hasPaid)} onClick={s => {setSelectedStall(s); setOccupyCount(s.groupSize);}} />
            <FinanceCard title="Pagados" color="green" icon={CheckCircle2} items={stalls.filter(s=>s.status==='occupied' && s.hasPaid)} onClick={s => {setSelectedStall(s); setOccupyCount(s.groupSize);}} />
          </div>
        )}

        {currentView === 'bookings' && (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-50 to-white p-6 border-b border-slate-200"><h3 className="font-bold text-xl text-slate-800 flex items-center gap-3"><CalendarDays className="h-6 w-6 text-indigo-500" /> Agenda de Reservas Futuras (Nube)</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-600">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b"><tr><th className="px-6 py-4 font-bold">Fecha</th><th className="px-6 py-4 font-bold">Puesto</th><th className="px-6 py-4 font-bold">Nombre</th><th className="px-6 py-4 font-bold">Tipo</th></tr></thead>
                <tbody>
                  {futureBookingsList.length === 0 ? <tr><td colSpan="4" className="p-8 text-center text-slate-400 italic">No hay reservas futuras encontradas en la base de datos.</td></tr> : futureBookingsList.map((b, i) => (
                    <tr key={i} className="border-b hover:bg-slate-50"><td className="px-6 py-4 font-bold text-indigo-600">{b.date}</td><td className="px-6 py-4 font-bold">{b.number}</td><td className="px-6 py-4">{b.vendorName}</td><td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold ${b.isFixed ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{b.isFixed ? 'FIJO' : 'EVENTUAL'}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {selectedStall && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] md:h-auto">
            <div className={`h-2 w-full flex-shrink-0 ${selectedStall.categoryName==='Rosa'?'bg-pink-500':selectedStall.categoryName==='Amarillo'?'bg-amber-400':selectedStall.categoryName==='Rojo'?'bg-rose-500':'bg-emerald-500'}`}></div>
            <div className="overflow-y-auto flex-1">
              <form onSubmit={handleSaveStall} className="grid grid-cols-1 md:grid-cols-2">
                 <div className="p-6 md:p-8 space-y-6 border-r border-slate-100">
                    <div className="flex justify-between items-center">
                       <div><span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedStall.categoryName}</span><div className="flex items-center gap-2"><h2 className="text-4xl font-black text-slate-800">{selectedStall.number}</h2>{selectedStall.groupSize > 1 && <span className="bg-slate-800 text-white text-xs px-2 py-1 rounded">x{selectedStall.groupSize}</span>}</div></div>
                    </div>
                    <div className="flex bg-slate-100 p-1.5 rounded-xl">
                       <button type="button" onClick={() => setSelectedStall(p => ({...p, status: 'free'}))} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${selectedStall.status==='free'?'bg-white shadow text-slate-800':'text-slate-400'}`}>Libre</button>
                       <button type="button" onClick={() => setSelectedStall(p => ({...p, status: 'occupied'}))} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${selectedStall.status==='occupied'?'bg-indigo-600 shadow text-white':'text-slate-400'}`}>Ocupado</button>
                    </div>
                    {selectedStall.status === 'occupied' && (
                      <div className="space-y-4 animate-in slide-in-from-left-4 duration-300">
                         {!selectedStall.groupId && (
                            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100"><label className="text-xs font-bold text-blue-800 block mb-2 uppercase">Tamaño</label><div className="flex gap-2">{[1, 2, 3, 4].map(num => (<button key={num} type="button" disabled={num > getMaxAvailableSlots(selectedStall)} onClick={() => setOccupyCount(num)} className={`flex-1 py-1.5 rounded border text-sm font-bold transition ${occupyCount === num ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}>{num===1?'1':`x${num}`}</button>))}</div></div>
                         )}
                         <input required value={selectedStall.vendorName} onChange={e => setSelectedStall(p => ({...p, vendorName: e.target.value}))} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl font-bold text-slate-800 focus:bg-white outline-none" placeholder="Nombre" />
                         <div className="relative group">
                           <textarea rows="3" value={selectedStall.description} onChange={(e) => setSelectedStall(prev => ({...prev, description: e.target.value}))} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm outline-none resize-none" placeholder="Descripción..." />
                           <button type="button" onClick={handleEnhanceDescription} disabled={isGeneratingDesc || !selectedStall.description} className="absolute bottom-3 right-3 p-1.5 bg-indigo-100 text-indigo-600 rounded-lg"><Sparkles className="h-4 w-4"/></button>
                         </div>
                      </div>
                    )}
                 </div>
                 <div className="p-6 md:p-8 bg-slate-50 flex flex-col justify-between h-full relative">
                    <button type="button" onClick={() => setSelectedStall(null)} className="absolute top-4 right-4 p-2 bg-white shadow-sm hover:bg-slate-200 rounded-full z-10"><XCircle className="h-8 w-8 text-slate-400" /></button>
                    {selectedStall.status === 'occupied' ? (
                      <div className="space-y-4 mt-8 md:mt-10">
                         <p className="text-xs font-bold text-slate-400 uppercase">Administración</p>
                         <div className="grid gap-3">
                           <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer ${selectedStall.hasPaid ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-white'}`}><input type="checkbox" className="hidden" checked={selectedStall.hasPaid} onChange={e => setSelectedStall(p => ({...p, hasPaid: e.target.checked}))} /> <DollarSign className="h-5 w-5"/> <span className="font-bold">Pagado</span></label>
                           <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer ${selectedStall.attended ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white'}`}><input type="checkbox" className="hidden" checked={selectedStall.attended} onChange={e => setSelectedStall(p => ({...p, attended: e.target.checked}))} /> <Users className="h-5 w-5"/> <span className="font-bold">Asistió</span></label>
                         </div>
                         <div className="space-y-2 pt-4 border-t border-slate-200">
                            <div onClick={() => setSelectedStall(p => ({...p, isFixed: !p.isFixed}))} className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${selectedStall.isFixed ? 'bg-amber-100 text-amber-900' : 'hover:bg-slate-200 text-slate-500'}`}><span className="text-sm font-bold flex items-center gap-2"><Pin className="h-4 w-4"/> Fijo</span><div className={`w-8 h-4 rounded-full relative ${selectedStall.isFixed ? 'bg-amber-500' : 'bg-slate-300'}`}><div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${selectedStall.isFixed ? 'left-4.5' : 'left-0.5'}`}></div></div></div>
                            {!selectedStall.isFixed && <div onClick={() => setIsMonthly(!isMonthly)} className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${isMonthly ? 'bg-indigo-100 text-indigo-900' : 'hover:bg-slate-200 text-slate-500'}`}><span className="text-sm font-bold flex items-center gap-2"><CalendarDays className="h-4 w-4"/> Mensual</span><div className={`w-8 h-4 rounded-full relative ${isMonthly ? 'bg-indigo-500' : 'bg-slate-300'}`}><div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isMonthly ? 'left-4.5' : 'left-0.5'}`}></div></div></div>}
                         </div>
                      </div>
                    ) : <div className="flex items-center justify-center h-40 md:h-full text-slate-400 italic">Selecciona "Ocupado".</div>}
                    <div className="flex gap-3 mt-6 md:mt-auto pt-6 border-t md:border-0 border-slate-200">
                       {selectedStall.status === 'occupied' && <button type="button" onClick={handleVacateStall} className="px-4 py-4 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 font-bold"><Trash2 className="h-6 w-6"/></button>}
                       <button type="submit" className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-4 rounded-xl font-bold shadow-lg">Guardar</button>
                    </div>
                 </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Seat({ stall, onClick, isConnectedRight, isConnectedLeft }) {
  const isOccupied = stall.status === 'occupied';
  const hasIssue = isOccupied && (!stall.hasPaid || !stall.attended);
  let styles = "", connectionColor = "";
  if (isOccupied) {
     if (stall.categoryName === 'Verde') { styles = "bg-emerald-500 border-emerald-600 text-white shadow-emerald-200"; connectionColor = "bg-emerald-500"; }
     else if (stall.categoryName === 'Amarillo') { styles = "bg-amber-400 border-amber-500 text-white shadow-amber-200"; connectionColor = "bg-amber-400"; }
     else if (stall.categoryName === 'Rojo') { styles = "bg-rose-500 border-rose-600 text-white shadow-rose-200"; connectionColor = "bg-rose-500"; }
     else { styles = "bg-pink-500 border-pink-600 text-white shadow-pink-200"; connectionColor = "bg-pink-500"; }
  } else {
     if (stall.categoryName === 'Verde') styles = "bg-emerald-50 border-2 border-emerald-200 text-emerald-600 hover:bg-emerald-100";
     else if (stall.categoryName === 'Amarillo') styles = "bg-amber-50 border-2 border-amber-200 text-amber-600 hover:bg-amber-100";
     else if (stall.categoryName === 'Rojo') styles = "bg-rose-50 border-2 border-rose-200 text-rose-600 hover:bg-rose-100";
     else styles = "bg-pink-50 border-2 border-pink-200 text-pink-600 hover:bg-pink-100";
  }
  return (
    <div className="relative w-full group touch-action-manipulation">
      {isConnectedLeft && <div className={`absolute top-1/2 -left-3 w-6 h-8 -mt-4 z-0 ${connectionColor}`}></div>}
      <button onClick={onClick} className={`relative w-full h-14 rounded-xl flex flex-col items-center justify-center transition-all transform hover:-translate-y-1 hover:scale-105 active:scale-95 hover:shadow-lg ${styles} ${isOccupied ? 'shadow-md border-b-4 border-r' : ''} z-10`}>
        <span className="font-black text-xs tracking-tight">{stall.number}</span>
        {isOccupied && (<div className="absolute inset-0 flex items-center justify-center opacity-20">{stall.isFixed ? <Pin className="h-8 w-8" /> : <Users className="h-8 w-8" />}</div>)}
        <div className="absolute -top-1.5 -right-1.5 flex gap-1">
          {isOccupied && stall.isFixed && <div className="bg-amber-400 text-white p-0.5 rounded-full shadow-sm border border-white"><Pin className="h-2.5 w-2.5 fill-current" /></div>}
          {hasIssue && <div className="h-3 w-3 rounded-full bg-red-500 border-2 border-white animate-bounce shadow-sm" />}
        </div>
        {isOccupied && <span className="text-[10px] font-medium truncate max-w-[90%] px-1 relative z-10 mt-0.5 opacity-90">{stall.vendorName}</span>}
      </button>
      {isConnectedRight && <div className={`absolute top-1/2 -right-3 w-6 h-8 -mt-4 z-0 ${connectionColor}`}></div>}
    </div>
  )
}

function StatCard({ label, value, color, icon: Icon }) {
  const colors = { blue: "bg-blue-50 text-blue-700 border-blue-100 hover:shadow-blue-100", green: "bg-emerald-50 text-emerald-700 border-emerald-100 hover:shadow-emerald-100", purple: "bg-purple-50 text-purple-700 border-purple-100 hover:shadow-purple-100", amber: "bg-amber-50 text-amber-700 border-amber-100 hover:shadow-amber-100" };
  return (
    <div className={`p-3 md:p-5 rounded-2xl border transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${colors[color]}`}>
      <div className="flex justify-between items-start mb-2"><p className="text-[10px] md:text-xs uppercase font-bold opacity-70 tracking-wider">{label}</p>{Icon && <Icon className="h-4 md:h-5 w-4 md:w-5 opacity-60" />}</div>
      <p className="text-xl md:text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function FinanceCard({ title, color, icon: Icon, items, onClick }) {
  const colors = { red: "red", green: "emerald" };
  return (
    <div className={`bg-white rounded-2xl shadow-lg border border-${colors[color]}-50 overflow-hidden`}>
      <div className={`bg-gradient-to-r from-${colors[color]}-50 to-white p-4 border-b border-${colors[color]}-100 flex justify-between items-center`}>
        <h3 className={`font-bold text-${colors[color]}-700 flex gap-2`}><Icon className="h-5" /> {title}</h3>
        <span className={`bg-${colors[color]}-100 text-${colors[color]}-700 text-xs px-3 py-1 rounded-full font-bold shadow-sm`}>{items.length}</span>
      </div>
      <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
        {items.map(s => (
          <div key={s.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
            <div><p className="font-bold text-gray-800">{s.vendorName}</p><p className="text-xs text-gray-500">{s.number}</p></div>
            <button onClick={() => onClick(s)} className={`text-xs border border-${colors[color]}-200 text-${colors[color]}-600 px-4 py-1.5 rounded-lg hover:bg-${colors[color]}-600 hover:text-white transition-all font-medium`}>Ver</button>
          </div>
        ))}
      </div>
    </div>
  )
}