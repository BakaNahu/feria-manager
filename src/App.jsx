import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, 
  Store, 
  Users, 
  DollarSign, 
  XCircle, 
  Save, 
  Trash2,
  MapPin,
  Link as LinkIcon,
  Maximize,
  AlignLeft,
  Info,
  Pin,
  Database,
  RefreshCw
} from 'lucide-react';

export default function FeriaApp() {
  // --- CONFIGURACIÓN INICIAL ---
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedStall, setSelectedStall] = useState(null);
  const [occupyCount, setOccupyCount] = useState(1);
  const [stalls, setStalls] = useState([]);
  
  // Referencia de seguridad para sincronización
  const loadedDateRef = useRef(null);

  // --- GENERADOR DE ESTRUCTURA ---
  const generateStructure = () => {
    let newStalls = [];
    let idCounter = 1;

    const addStalls = (count, category, colorKey, rowName) => {
      for (let i = 0; i < count; i++) {
        newStalls.push({
          id: idCounter++,
          indexByCategory: i,
          number: `${category.charAt(0).toUpperCase()}-${i + 1}`,
          categoryName: category,
          colorKey: colorKey,
          rowName: rowName,
          status: 'free',
          vendorName: '',
          description: '',
          groupId: null,
          groupSize: 1,
          hasPaid: false,
          attended: false,
          isFixed: false, 
          notes: ''
        });
      }
    };

    addStalls(36, 'Verde', 'green', 'Fila 1 - Sector General');
    addStalls(26, 'Amarillo', 'yellow', 'Fila 2 - Sector Central');
    addStalls(9,  'Rojo', 'red', 'Fila 2.5 - Sector Premium');
    addStalls(6,  'Rosa', 'pink', 'Fila 3 - Sector Exclusivo');

    return newStalls;
  };

  // --- LÓGICA DE CALENDARIO (SINCRÓNICA) ---

  // 1. CARGA INMEDIATA AL CAMBIAR FECHA
  useEffect(() => {
    const key = `feria_data_${selectedDate}`;
    const savedData = localStorage.getItem(key);
    
    let dataToSet = [];

    if (savedData) {
      dataToSet = JSON.parse(savedData);
    } else {
      // Si es una fecha NUEVA, generamos limpio + fijos
      const cleanStalls = generateStructure();
      const masterFixed = localStorage.getItem('feria_master_fixed');

      if (masterFixed) {
        const fixedIds = JSON.parse(masterFixed);
        // Fusionamos solo los que son FIJOS
        dataToSet = cleanStalls.map(s => {
          const fixedData = fixedIds.find(f => f.id === s.id);
          if (fixedData) {
            return { 
              ...s, 
              ...fixedData, 
              // Reseteamos estados diarios, pero MANTENEMOS la estructura del grupo
              hasPaid: false, 
              attended: false,
              status: 'occupied',
              // Aseguramos que el ID sea el original de la estructura, no el del guardado por si acaso
              id: s.id,
              number: s.number 
            }; 
          }
          return s;
        });
      } else {
        dataToSet = cleanStalls;
      }
    }

    loadedDateRef.current = selectedDate;
    setStalls(dataToSet);

  }, [selectedDate]);

  // 2. GUARDADO AUTOMÁTICO
  useEffect(() => {
    if (stalls.length > 0 && loadedDateRef.current === selectedDate) {
      
      // Guardar el día actual
      localStorage.setItem(`feria_data_${selectedDate}`, JSON.stringify(stalls));
      
      // Actualizar la lista maestra de fijos
      const fixedStalls = stalls
        .filter(s => s.isFixed)
        .map(s => ({
          // Guardamos datos esenciales
          id: s.id,
          status: 'occupied',
          vendorName: s.vendorName,
          description: s.description,
          isFixed: true,
          groupId: s.groupId,
          groupSize: s.groupSize,
          notes: s.notes
        }));
      
      localStorage.setItem('feria_master_fixed', JSON.stringify(fixedStalls));
    }
  }, [stalls, selectedDate]);


  // --- MANEJADORES ---

  const handleStallClick = (clickedStall) => {
    setOccupyCount(clickedStall.groupSize || 1);
    setSelectedStall({ ...clickedStall });
  };

  const getMaxAvailableSlots = (currentStall) => {
    if (currentStall.groupId) return currentStall.groupSize;
    let count = 1;
    for (let i = 1; i < 4; i++) {
      const nextStall = stalls.find(s => 
        s.categoryName === currentStall.categoryName && 
        s.indexByCategory === currentStall.indexByCategory + i
      );
      if (nextStall && nextStall.status === 'free') count++;
      else break; 
    }
    return count;
  };

  const handleSaveStall = (e) => {
    e.preventDefault();
    const newGroupId = selectedStall.groupId || (occupyCount > 1 ? `g-${Date.now()}` : null);
    
    // CORRECCIÓN CRÍTICA: Objeto con solo los datos a actualizar
    // NO incluimos 'id', 'number', 'indexByCategory' para no sobrescribir la identidad de los vecinos
    const updates = {
      status: selectedStall.status,
      vendorName: selectedStall.vendorName,
      description: selectedStall.description,
      hasPaid: selectedStall.hasPaid,
      attended: selectedStall.attended,
      isFixed: selectedStall.isFixed,
      notes: selectedStall.notes,
      groupId: selectedStall.groupId || newGroupId,
      groupSize: selectedStall.groupId ? selectedStall.groupSize : occupyCount
    };

    let updatedStalls = [...stalls];
    
    if (selectedStall.groupId) {
       // Editar grupo existente
       updatedStalls = updatedStalls.map(s => {
         if (s.groupId === selectedStall.groupId) {
             // Fusionamos manteniendo el ID y Número originales del puesto 's'
             return { ...s, ...updates };
         }
         return s;
       });
    } else {
      // Crear nueva ocupación
      const targetIndices = [];
      for(let i=0; i < occupyCount; i++) targetIndices.push(selectedStall.indexByCategory + i);

      updatedStalls = updatedStalls.map(s => {
        if (s.categoryName === selectedStall.categoryName && targetIndices.includes(s.indexByCategory)) {
           // Fusionamos manteniendo identidad
           return { ...s, ...updates };
        }
        return s;
      });
    }
    setStalls(updatedStalls);
    setSelectedStall(null);
  };

  const handleVacateStall = () => {
    if (!selectedStall) return;
    const updatedStalls = stalls.map(s => {
      if ((selectedStall.groupId && s.groupId === selectedStall.groupId) || s.id === selectedStall.id) {
        return {
          ...s, status: 'free', vendorName: '', description: '', hasPaid: false, attended: false, isFixed: false, groupId: null, groupSize: 1, notes: ''
        };
      }
      return s;
    });
    setStalls(updatedStalls);
    setSelectedStall(null);
  };

  const updateSelectedField = (field, value) => {
    setSelectedStall(prev => ({ ...prev, [field]: value }));
  };

  const handleHardReset = () => {
    if(confirm("¿BORRAR TODO? Esto eliminará todos los datos guardados y reiniciará la app.")) {
      localStorage.clear();
      window.location.reload();
    }
  }

  // Estadísticas
  const totalOccupied = stalls.filter(s => s.status === 'occupied').length;
  const totalFixed = stalls.filter(s => s.isFixed).length;
  const totalRevenue = stalls.filter(s => s.hasPaid).length * 1500; 
  const attendanceCount = stalls.filter(s => s.attended).length;
  const attendanceRate = totalOccupied > 0 ? Math.round((attendanceCount / totalOccupied) * 100) : 0;

  // Render Row
  const renderRowSection = (rowTitle, categoryFilter, gridCols) => {
    const rowStalls = stalls.filter(s => s.categoryName === categoryFilter);
    if(rowStalls.length === 0) return null;
    
    const colorKey = rowStalls[0]?.colorKey || 'gray';
    const titleColors = {
      green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      yellow: 'bg-amber-100 text-amber-800 border-amber-200',
      red: 'bg-rose-100 text-rose-800 border-rose-200',
      pink: 'bg-pink-100 text-pink-800 border-pink-200',
    }[colorKey];

    return (
      <div className="mb-10">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-px bg-slate-200 flex-1"></div>
          <h3 className={`font-bold uppercase text-xs tracking-widest px-4 py-1.5 rounded-full border ${titleColors}`}>
            {rowTitle}
          </h3>
          <div className="h-px bg-slate-200 flex-1"></div>
        </div>
        <div className={`grid gap-y-4 gap-x-2 justify-center ${gridCols}`}>
          {rowStalls.map((stall, index) => {
             const nextStall = rowStalls[index + 1];
             const isConnectedRight = stall.groupId && nextStall && nextStall.groupId === stall.groupId;
             const prevStall = rowStalls[index - 1];
             const isConnectedLeft = stall.groupId && prevStall && prevStall.groupId === stall.groupId;
             return <Seat key={stall.id} stall={stall} isConnectedRight={isConnectedRight} isConnectedLeft={isConnectedLeft} onClick={() => handleStallClick(stall)} />;
          })}
        </div>
      </div>
    );
  };

  if (stalls.length === 0) return <div className="min-h-screen flex items-center justify-center text-slate-400">Iniciando sistema...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700 font-sans pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="bg-sky-600 h-1.5 w-full"></div>
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-sky-100 p-2.5 rounded-xl text-sky-700 shadow-sm">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                Feria Manager 
              </h1>
              <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <Database className="h-3 w-3" /> Sistema Local
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
              <div className="px-3 text-slate-400">
                <Calendar className="h-5 w-5" />
              </div>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent border-none text-sm text-slate-700 font-semibold focus:ring-0 cursor-pointer"
              />
            </div>
            <button 
              onClick={handleHardReset} 
              className="bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 text-xs px-3 py-2 rounded-lg font-bold border border-red-200 transition" 
              title="Borrar todos los datos y reiniciar"
            >
              Reset DB
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard title="Ocupación" value={`${totalOccupied} / ${stalls.length}`} subtext="Total ocupados" icon={MapPin} colorClass="bg-blue-50 text-blue-600 border-blue-100" />
          <StatCard title="Fijos" value={`${totalFixed}`} subtext="Se repiten autom." icon={Pin} colorClass="bg-amber-50 text-amber-600 border-amber-100" />
          <StatCard title="Caja Estimada" value={`$${totalRevenue.toLocaleString()}`} subtext="Según pagos marcados" icon={DollarSign} colorClass="bg-emerald-50 text-emerald-600 border-emerald-100" />
          <StatCard title="Asistencia" value={`${attendanceRate}%`} subtext="Presentismo hoy" icon={Users} colorClass="bg-violet-50 text-violet-600 border-violet-100" />
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 relative overflow-hidden">
          <div className="flex flex-col items-center justify-center mb-10 opacity-60">
             <div className="w-2/3 h-2 bg-slate-200 rounded-full mb-2"></div>
             <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Entrada Principal</span>
          </div>

          {renderRowSection('Fila 1 - Sector Verdes (36)', 'Verde', 'grid-cols-6 sm:grid-cols-9 md:grid-cols-12')}
          {renderRowSection('Fila 2 - Sector Amarillos (26)', 'Amarillo', 'grid-cols-6 sm:grid-cols-8 md:grid-cols-10')}
          <div className="grid md:grid-cols-2 gap-12 md:gap-8 border-t border-slate-100 pt-8 mt-4">
             <div>{renderRowSection('Fila 2.5 - Rojos (9)', 'Rojo', 'grid-cols-3 sm:grid-cols-5')}</div>
             <div>{renderRowSection('Fila 3 - Rosas (6)', 'Rosa', 'grid-cols-3')}</div>
          </div>
        </div>
      </main>

      {selectedStall && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 max-h-[90vh] overflow-y-auto">
            <div className={`h-3 w-full ${getCategoryColor(selectedStall.colorKey).headerBg}`}></div>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                   <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${getCategoryColor(selectedStall.colorKey).badge}`}>
                      {selectedStall.categoryName}
                   </span>
                   <h2 className="text-3xl font-bold text-slate-800 mt-1">{selectedStall.number}</h2>
                </div>
                <button onClick={() => setSelectedStall(null)} className="text-slate-400 hover:text-slate-600 transition hover:bg-slate-100 rounded-full p-1"><XCircle className="h-8 w-8" /></button>
              </div>

              <form onSubmit={handleSaveStall} className="space-y-5">
                <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-xl">
                  <button type="button" onClick={() => updateSelectedField('status', 'free')} className={`py-2 rounded-lg text-sm font-bold transition shadow-sm ${selectedStall.status === 'free' ? 'bg-white text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>Libre</button>
                  <button type="button" onClick={() => updateSelectedField('status', 'occupied')} className={`py-2 rounded-lg text-sm font-bold transition shadow-sm ${selectedStall.status === 'occupied' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>Ocupado</button>
                </div>

                {selectedStall.status === 'occupied' && !selectedStall.groupId && (
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 animate-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-blue-800 uppercase mb-2 block flex items-center gap-2"><Maximize className="h-4 w-4" /> Cantidad de Puestos</label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4].map(num => {
                        const maxAvailable = getMaxAvailableSlots(selectedStall);
                        const isDisabled = num > maxAvailable;
                        return (
                          <button key={num} type="button" disabled={isDisabled} onClick={() => setOccupyCount(num)} className={`flex-1 py-2 rounded-lg border text-sm font-bold transition ${occupyCount === num ? 'bg-blue-600 text-white border-blue-600 shadow-md' : isDisabled ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed opacity-60' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>{num === 1 ? 'Uno' : `x${num}`}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedStall.status === 'occupied' && (
                  <div className="space-y-4 animate-in slide-in-from-top-4 fade-in duration-300">
                    <div onClick={() => updateSelectedField('isFixed', !selectedStall.isFixed)} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${selectedStall.isFixed ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${selectedStall.isFixed ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-400'}`}><Pin className="h-4 w-4 fill-current" /></div>
                            <div>
                                <p className={`text-sm font-bold ${selectedStall.isFixed ? 'text-amber-800' : 'text-slate-500'}`}>{selectedStall.isFixed ? 'Puesto Fijo' : 'Eventual'}</p>
                                <p className="text-[10px] text-slate-400">{selectedStall.isFixed ? 'Se mantiene al cambiar fecha.' : 'Se borra al cambiar fecha.'}</p>
                            </div>
                        </div>
                        <div className={`w-10 h-5 rounded-full relative transition-colors ${selectedStall.isFixed ? 'bg-amber-500' : 'bg-slate-300'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${selectedStall.isFixed ? 'left-6' : 'left-1'}`}></div></div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase ml-1">Puestero</label>
                      <input type="text" required value={selectedStall.vendorName} onChange={(e) => updateSelectedField('vendorName', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-medium focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition" placeholder="Nombre completo..." />
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 uppercase ml-1 flex items-center gap-1"><AlignLeft className="h-3 w-3" /> Descripción</label>
                      <textarea rows="2" value={selectedStall.description} onChange={(e) => updateSelectedField('description', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition resize-none" placeholder="Rubro o productos..." />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <label className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedStall.hasPaid ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                        <DollarSign className={`h-6 w-6 mb-1 ${selectedStall.hasPaid ? 'text-emerald-600' : 'text-slate-300'}`} />
                        <span className={`text-xs font-bold ${selectedStall.hasPaid ? 'text-emerald-700' : 'text-slate-400'}`}>Pagado</span>
                        <input type="checkbox" className="hidden" checked={selectedStall.hasPaid} onChange={(e) => updateSelectedField('hasPaid', e.target.checked)} />
                      </label>
                      <label className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedStall.attended ? 'bg-sky-50 border-sky-500' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                        <Users className={`h-6 w-6 mb-1 ${selectedStall.attended ? 'text-sky-600' : 'text-slate-300'}`} />
                        <span className={`text-xs font-bold ${selectedStall.attended ? 'text-sky-700' : 'text-slate-400'}`}>Asistió</span>
                        <input type="checkbox" className="hidden" checked={selectedStall.attended} onChange={(e) => updateSelectedField('attended', e.target.checked)} />
                      </label>
                    </div>
                  </div>
                )}

                <div className="pt-6 flex gap-3 border-t border-slate-100 mt-2">
                  {selectedStall.status === 'occupied' && (
                    <button type="button" onClick={handleVacateStall} className="px-4 py-2.5 text-rose-500 hover:bg-rose-50 rounded-xl text-sm font-bold transition flex items-center gap-2"><Trash2 className="h-4 w-4" /> Liberar</button>
                  )}
                  <button type="submit" className="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-3 rounded-xl font-bold transition shadow-lg shadow-sky-200 flex items-center justify-center gap-2"><Save className="h-4 w-4" /> Guardar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// UI COMPONENTS
function StatCard({ title, value, subtext, icon: Icon, colorClass }) {
  return (
    <div className={`p-5 rounded-2xl border ${colorClass} bg-opacity-30 relative overflow-hidden`}>
       <div className="relative z-10">
         <div className="flex justify-between items-start mb-2"><h3 className="text-sm font-bold opacity-80 uppercase tracking-wide">{title}</h3><Icon className="h-5 w-5 opacity-70" /></div>
         <p className="text-3xl font-bold mb-1">{value}</p><p className="text-xs font-medium opacity-70">{subtext}</p>
       </div>
    </div>
  );
}

function Seat({ stall, onClick, isConnectedRight, isConnectedLeft }) {
  const colors = getCategoryColor(stall.colorKey);
  const isOccupied = stall.status === 'occupied';
  const hasIssue = isOccupied && (!stall.hasPaid || !stall.attended);

  return (
    <div className="flex items-center relative group">
       {isConnectedLeft && <div className={`absolute -left-2 w-4 h-6 z-0 ${colors.connection} transition-colors`}></div>}
      <button onClick={onClick} className={`relative w-12 h-10 md:w-14 md:h-12 rounded-t-2xl rounded-b-lg transition-all duration-200 transform flex items-center justify-center z-10 hover:-translate-y-1 hover:shadow-md ${isOccupied ? `bg-gradient-to-br ${colors.occupiedBg} text-white shadow-sm border-transparent` : `bg-white border-2 ${colors.border} ${colors.text} hover:bg-slate-50`}`}>
        <span className={`text-[10px] md:text-xs font-bold z-10 ${!isOccupied && 'opacity-80'}`}>{stall.number.split('-')[1]}</span>
        {isOccupied && stall.isFixed && <div className="absolute top-1 right-1"><Pin className="h-3 w-3 text-white fill-amber-300 drop-shadow-md" /></div>}
        {hasIssue && <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-sm border-2 border-white animate-bounce">!</div>}
        {isOccupied && stall.description && <div className="absolute bottom-1 right-1 opacity-50"><Info className="h-2 w-2 text-white" /></div>}
      </button>
      {isConnectedRight && <div className={`absolute -right-2 w-4 h-6 z-0 ${colors.connection} transition-colors`}></div>}
      {isOccupied && (
        <div className="absolute top-full mt-2 w-32 bg-slate-800 text-white text-[10px] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-30 pointer-events-none left-1/2 -translate-x-1/2 shadow-xl">
          <div className="flex items-center gap-1 mb-1">{stall.isFixed && <Pin className="h-2 w-2 text-amber-400 fill-current" />}<p className="font-bold truncate">{stall.vendorName || 'Sin Nombre'}</p></div>
          <p className="text-slate-300 italic truncate">{stall.description || 'Sin descripción'}</p>
        </div>
      )}
    </div>
  );
}

function getCategoryColor(key) {
  switch (key) {
    case 'green': return { occupiedBg: 'from-emerald-500 to-emerald-600', border: 'border-emerald-200', text: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-600 border-emerald-200', headerBg: 'bg-emerald-500', connection: 'bg-emerald-500' };
    case 'yellow': return { occupiedBg: 'from-amber-400 to-amber-500', border: 'border-amber-200', text: 'text-amber-600', badge: 'bg-amber-50 text-amber-600 border-amber-200', headerBg: 'bg-amber-400', connection: 'bg-amber-400' };
    case 'red': return { occupiedBg: 'from-rose-500 to-rose-600', border: 'border-rose-200', text: 'text-rose-600', badge: 'bg-rose-50 text-rose-600 border-rose-200', headerBg: 'bg-rose-500', connection: 'bg-rose-500' };
    case 'pink': return { occupiedBg: 'from-pink-500 to-pink-600', border: 'border-pink-200', text: 'text-pink-600', badge: 'bg-pink-50 text-pink-600 border-pink-200', headerBg: 'bg-pink-500', connection: 'bg-pink-500' };
    default: return { occupiedBg: 'from-slate-500 to-slate-600', border: 'border-slate-200', text: 'text-slate-500', connection: 'bg-slate-400' };
  }
}