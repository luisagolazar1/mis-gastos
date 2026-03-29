import { storage } from "./storage.js";
import { useState, useMemo, useEffect } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

// ── Palette & helpers ────────────────────────────────────────────────
const PALETTE = ["#34d399","#60a5fa","#f472b6","#fb923c","#a78bfa","#facc15","#2dd4bf","#f87171"];

const fmt = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const today = () => new Date().toISOString().slice(0, 10);
const monthOf = (d) => d.slice(0, 7);
const currentMonth = () => today().slice(0, 7);

const DEFAULT_Categorías = [
  { id: 1, name: "Comida", color: PALETTE[0], icon: "🍔" },
  { id: 2, name: "Transporte", color: PALETTE[1], icon: "🚌" },
  { id: 3, name: "Entretenimiento", color: PALETTE[2], icon: "🎬" },
  { id: 4, name: "Salud", color: PALETTE[3], icon: "💊" },
  { id: 5, name: "Ropa", color: PALETTE[4], icon: "👕" },
  { id: 6, name: "Hogar", color: PALETTE[5], icon: "🏠" },
];

const SEED_EXPENSES = [];

// ── Subcomponents ─────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.65)", backdropFilter:"blur(4px)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#1a1f2e", border:"1px solid #2d3650", borderRadius:16, padding:28, width:420, maxWidth:"95vw", boxShadow:"0 24px 60px rgba(0,0,0,.5)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontFamily:"'DM Sans',sans-serif", fontWeight:700, fontSize:17, color:"#e2e8f0" }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:20, cursor:"pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={{ display:"block", fontSize:12, color:"#64748b", marginBottom:5, fontWeight:600, letterSpacing:.5 }}>{label}</label>}
      <input {...props} style={{ width:"100%", background:"#0f1420", border:"1px solid #2d3650", borderRadius:8, padding:"10px 12px", color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit", ...props.style }} />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={{ display:"block", fontSize:12, color:"#64748b", marginBottom:5, fontWeight:600, letterSpacing:.5 }}>{label}</label>}
      <select {...props} style={{ width:"100%", background:"#0f1420", border:"1px solid #2d3650", borderRadius:8, padding:"10px 12px", color:"#e2e8f0", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}>
        {children}
      </select>
    </div>
  );
}

function Btn({ children, variant="primary", style={}, ...props }) {
  const base = { padding:"10px 20px", borderRadius:8, border:"none", cursor:"pointer", fontWeight:700, fontSize:14, fontFamily:"inherit", transition:"opacity .15s" };
  const vars = {
    primary: { background:"#34d399", color:"#0f1420" },
    ghost:   { background:"transparent", color:"#64748b", border:"1px solid #2d3650" },
    danger:  { background:"#f87171", color:"#fff" },
  };
  return <button {...props} style={{ ...base, ...vars[variant], ...style }}>{children}</button>;
}

// ── Add Expense Modal ──────────────────────────────────────────────────
function AddExpenseModal({ categories, onSave, onClose }) {
  const [form, setForm] = useState({ amount:"", catId: categories[0]?.id || "", desc:"", date: today() });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const save = () => {
    if (!form.amount || isNaN(Number(form.amount)) || !form.catId) return;
    onSave({ id: Date.now(), amount: Number(form.amount), catId: Number(form.catId), desc: form.desc, date: form.date });
    onClose();
  };

  return (
    <Modal title="➕ Nuevo gasto" onClose={onClose}>
      <Input label="MONTO ($)" type="number" placeholder="0" value={form.amount} onChange={e=>set("amount",e.target.value)} />
      <Select label="CATEGORÍA" value={form.catId} onChange={e=>set("catId",e.target.value)}>
        {categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
      </Select>
      <Input label="DESCRIPCIÓN (opcional)" placeholder="ej: almuerzo, uber..." value={form.desc} onChange={e=>set("desc",e.target.value)} />
      <Input label="FECHA" type="date" value={form.date} onChange={e=>set("date",e.target.value)} />
      <div style={{ display:"flex", gap:10, marginTop:4 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancelar</Btn>
        <Btn onClick={save} style={{ flex:1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

// ── Budget Modal ───────────────────────────────────────────────────────
function BudgetModal({ budgets, categories, onSave, onClose }) {
  const [vals, setVals] = useState({...budgets});
  return (
    <Modal title="🎯 Presupuesto mensual" onClose={onClose}>
      <p style={{ color:"#64748b", fontSize:13, marginBottom:16 }}>Definí el límite mensual total o por categoría.</p>
      <Input label="TOTAL MENSUAL ($)" type="number" placeholder="0 = sin límite" value={vals.__total||""} onChange={e=>setVals(v=>({...v,__total:e.target.value}))} />
      <div style={{ borderTop:"1px solid #2d3650", marginBottom:14, paddingTop:14 }}>
        <p style={{ color:"#64748b", fontSize:11, marginBottom:10, fontWeight:600 }}>POR CATEGORÍA (opcional)</p>
        {categories.map(c=>(
          <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <span style={{ width:30, textAlign:"center" }}>{c.icon}</span>
            <span style={{ color:"#94a3b8", fontSize:13, flex:1 }}>{c.name}</span>
            <input type="number" placeholder="0" value={vals[c.id]||""} onChange={e=>setVals(v=>({...v,[c.id]:e.target.value}))}
              style={{ width:110, background:"#0f1420", border:"1px solid #2d3650", borderRadius:8, padding:"7px 10px", color:"#e2e8f0", fontSize:13, outline:"none", fontFamily:"inherit" }} />
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancelar</Btn>
        <Btn onClick={()=>{ onSave(vals); onClose(); }} style={{ flex:1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

// ── Category Manager Modal ─────────────────────────────────────────────
function CatModal({ categories, onChange, onClose }) {
  const [Categorías, setCategorías] = useState(categories);
  const [newName, setNewName] = useState(""); const [newIcon, setNewIcon] = useState("💰");
  const icons = ["💰","🛒","🍔","🚌","🎬","💊","👕","🏠","📚","✈️","🎮","🐾"];
  const add = () => {
    if (!newName.trim()) return;
    const used = Categorías.map(c=>c.color);
    const color = PALETTE.find(p=>!used.includes(p)) || PALETTE[Categorías.length % PALETTE.length];
    setCategorías(c=>[...c,{ id: Date.now(), name: newName.trim(), icon: newIcon, color }]);
    setNewName("");
  };
  const del = (id) => setCategorías(c=>c.filter(x=>x.id!==id));
  return (
    <Modal title="🏷️ Categorías" onClose={onClose}>
      <div style={{ maxHeight:220, overflowY:"auto", marginBottom:16 }}>
        {Categorías.map(c=>(
          <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #1e2840" }}>
            <span style={{ width:20, height:20, borderRadius:4, background:c.color, display:"inline-block" }}/>
            <span style={{ fontSize:18 }}>{c.icon}</span>
            <span style={{ color:"#cbd5e1", flex:1 }}>{c.name}</span>
            <button onClick={()=>del(c.id)} style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer", fontSize:16 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:14 }}>
        <select value={newIcon} onChange={e=>setNewIcon(e.target.value)} style={{ background:"#0f1420", border:"1px solid #2d3650", borderRadius:8, padding:"9px", color:"#e2e8f0", fontSize:18 }}>
          {icons.map(ic=><option key={ic}>{ic}</option>)}
        </select>
        <input placeholder="Nombre categoría" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
          style={{ flex:1, background:"#0f1420", border:"1px solid #2d3650", borderRadius:8, padding:"9px 12px", color:"#e2e8f0", fontSize:14, outline:"none", fontFamily:"inherit" }}/>
        <Btn onClick={add}>+</Btn>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancelar</Btn>
        <Btn onClick={()=>{ onChange(Categorías); onClose(); }} style={{ flex:1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────
function CTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#1a1f2e", border:"1px solid #2d3650", borderRadius:8, padding:"8px 14px", fontSize:13, color:"#e2e8f0" }}>
      {label && <p style={{ color:"#64748b", marginBottom:4 }}>{label}</p>}
      {payload.map((p,i)=><p key={i} style={{ color: p.fill||p.color||"#34d399" }}>{fmt(p.value)}</p>)}
    </div>
  );
}

// ── Category Treemap ──────────────────────────────────────────────────
function CategoryTreemap({ categories, monthExp, catMap, total }) {
  const [hovered, setHovered] = useState(null);

  // Compute spending per category (include ALL Categorías, even $0)
  const data = useMemo(() => {
    return categories.map(c => {
      const spent = monthExp.filter(e => e.catId === c.id).reduce((s, e) => s + e.amount, 0);
      return { ...c, spent };
    }).sort((a, b) => b.spent - a.spent);
  }, [categories, monthExp]);

  const maxSpent = useMemo(() => Math.max(...data.map(d => d.spent), 1), [data]);

  // Simple treemap layout algorithm (rows-based)
  // We'll use a CSS approach: fixed-height container, tiles sized by proportion
  // Using a "squarified" feel via flex-wrap with proportional flex values
  const CONTAINER_H = 220;
  const CONTAINER_W = 900; // reference width for area calc

  // Each tile: area ∝ spent. If spent=0, give it a minimum area.
  const totalArea = CONTAINER_H * CONTAINER_W;
  const dataWithArea = useMemo(() => {
    const totalSpent = data.reduce((s, d) => s + d.spent, 0);
    return data.map(d => {
      const pct = totalSpent > 0 ? d.spent / totalSpent : 1 / data.length;
      const minPct = 0.03; // minimum 3% so empty Categorías show as tiny tile
      const effectivePct = totalSpent > 0 ? Math.max(pct, d.spent > 0 ? pct : minPct * 0.5) : 1 / data.length;
      return { ...d, pct: totalSpent > 0 ? pct : 1 / data.length, effectivePct };
    });
  }, [data]);

  // Normalize effectivePct so they sum to 1
  const sumEff = dataWithArea.reduce((s, d) => s + d.effectivePct, 0);
  const normalized = dataWithArea.map(d => ({ ...d, norm: d.effectivePct / sumEff }));

  return (
    <div style={{ background:"#0f1420", border:"1px solid #1e2840", borderRadius:14, padding:"20px", marginBottom:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <p style={{ fontSize:12, color:"#64748b", fontWeight:700, letterSpacing:.6, margin:0 }}>MAPA DE GASTOS POR CATEGORÍA</p>
        {total > 0 && <span style={{ fontSize:11, color:"#334155" }}>El tamaño = proporción del gasto</span>}
      </div>

      {total === 0 ? (
        <div style={{ height:CONTAINER_H, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
          <span style={{ fontSize:32 }}>📭</span>
          <span style={{ color:"#334155", fontSize:13 }}>Agregá gastos para ver el mapa</span>
        </div>
      ) : (
        <div style={{
          display:"flex",
          flexWrap:"wrap",
          gap:6,
          height:CONTAINER_H,
          overflow:"hidden",
          alignContent:"flex-start",
        }}>
          {normalized.map(d => {
            const isHov = hovered === d.id;
            // Width proportional to norm, height fills row naturally via flex
            // We use flex-grow so tiles share space proportionally
            const pctLabel = (d.pct * 100).toFixed(1);
            const showLabel = d.norm > 0.07;
            const showAmt   = d.norm > 0.12;

            return (
              <div
                key={d.id}
                onMouseEnter={() => setHovered(d.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  flexGrow: d.norm,
                  flexShrink: 0,
                  flexBasis: `${Math.max(d.norm * 100 - 1, 2)}%`,
                  minWidth: 40,
                  height: d.spent > 0
                    ? `${Math.max(30, Math.min(CONTAINER_H - 12, Math.sqrt(d.norm) * CONTAINER_H * 1.8))}px`
                    : "36px",
                  background: d.spent > 0
                    ? `linear-gradient(135deg, ${d.color}cc, ${d.color}66)`
                    : "#1e2840",
                  border: `1px solid ${isHov ? d.color : d.spent > 0 ? d.color + "55" : "#2d3650"}`,
                  borderRadius: 10,
                  display:"flex",
                  flexDirection:"column",
                  alignItems:"center",
                  justifyContent:"center",
                  cursor:"default",
                  transition:"all .4s cubic-bezier(.34,1.56,.64,1)",
                  transform: isHov ? "scale(1.03)" : "scale(1)",
                  boxShadow: isHov ? `0 0 20px ${d.color}44` : "none",
                  overflow:"hidden",
                  position:"relative",
                  padding: 6,
                  boxSizing:"border-box",
                }}
              >
                {/* Glow overlay on hover */}
                {isHov && (
                  <div style={{ position:"absolute", inset:0, background:`radial-gradient(circle at center, ${d.color}22, transparent 70%)`, pointerEvents:"none" }}/>
                )}

                <span style={{ fontSize: d.norm > 0.15 ? 28 : d.norm > 0.07 ? 20 : 14, lineHeight:1, marginBottom:2 }}>{d.icon}</span>

                {showLabel && (
                  <span style={{ fontSize: d.norm > 0.15 ? 12 : 10, color:"#fff", fontWeight:700, textAlign:"center", lineHeight:1.2, marginBottom:2, textShadow:"0 1px 3px rgba(0,0,0,.6)" }}>
                    {d.name}
                  </span>
                )}

                {showAmt && d.spent > 0 && (
                  <span style={{ fontFamily:"'Space Mono',monospace", fontSize: d.norm > 0.2 ? 13 : 10, color:"#ffffffcc", fontWeight:700, textShadow:"0 1px 3px rgba(0,0,0,.6)" }}>
                    {fmt(d.spent)}
                  </span>
                )}

                {d.norm > 0.06 && (
                  <span style={{ fontSize:9, color:"#ffffff88", marginTop:2 }}>{pctLabel}%</span>
                )}

                {/* Tooltip on hover for small tiles */}
                {isHov && !showLabel && (
                  <div style={{
                    position:"absolute", bottom:"calc(100% + 6px)", left:"50%", transform:"translateX(-50%)",
                    background:"#1a1f2e", border:`1px solid ${d.color}`, borderRadius:8, padding:"6px 10px",
                    whiteSpace:"nowrap", zIndex:10, pointerEvents:"none",
                    boxShadow:"0 4px 16px rgba(0,0,0,.4)"
                  }}>
                    <span style={{ fontSize:14 }}>{d.icon}</span>
                    <span style={{ fontSize:12, color:"#e2e8f0", marginLeft:6 }}>{d.name}</span>
                    <span style={{ fontSize:11, color:d.color, marginLeft:8, fontFamily:"'Space Mono',monospace" }}>{fmt(d.spent)}</span>
                    <span style={{ fontSize:10, color:"#64748b", marginLeft:6 }}>{pctLabel}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Mini legend */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 16px", marginTop:12 }}>
        {normalized.filter(d=>d.spent>0).map(d=>(
          <div key={d.id} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:8, height:8, borderRadius:2, background:d.color, display:"inline-block" }}/>
            <span style={{ fontSize:11, color:"#64748b" }}>{d.icon} {d.name}</span>
            <span style={{ fontSize:11, color:"#475569", fontFamily:"'Space Mono',monospace" }}>{(d.pct*100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────
export default function App() {
  const [expenses, setExpenses]   = useState(SEED_EXPENSES);
  const [categories, setCategories] = useState(DEFAULT_Categorías);
  const [budgets, setBudgets]     = useState({});
  const [modal, setModal]         = useState(null); // "add"|"budget"|"Categorías"
  const [view, setView]           = useState("dashboard"); // "dashboard"|"history"
  const [filterMonth, setFilterMonth] = useState(currentMonth());

  // Load from storage
  useEffect(()=>{
    (async()=>{
      try {
        const e = await storage.get("expenses"); if(e) setExpenses(JSON.parse(e.value));
        const c = await storage.get("categories"); if(c) setCategories(JSON.parse(c.value));
        const b = await storage.get("budgets"); if(b) setBudgets(JSON.parse(b.value));
      } catch {}
    })();
  },[]);

  const saveExpenses = (data) => { setExpenses(data); storage.set("expenses", JSON.stringify(data)).catch(()=>{}); };
  const saveCategorías     = (data) => { setCategories(data); storage.set("categories", JSON.stringify(data)).catch(()=>{}); };
  const saveBudgets  = (data) => { setBudgets(data); storage.set("budgets", JSON.stringify(data)).catch(()=>{}); };

  const addExpense = (exp) => saveExpenses([...expenses, exp]);
  const delExpense = (id) => saveExpenses(expenses.filter(e=>e.id!==id));

  const monthExp = useMemo(()=>expenses.filter(e=>monthOf(e.date)===filterMonth),[expenses,filterMonth]);
  const totalMonth = useMemo(()=>monthExp.reduce((s,e)=>s+e.amount,0),[monthExp]);
  const budgetTotal = Number(budgets.__total)||0;
  const overBudget = budgetTotal>0 && totalMonth>budgetTotal;
  const pctUsed = budgetTotal>0 ? Math.min((totalMonth/budgetTotal)*100,100) : 0;

  const catMap = useMemo(()=>Object.fromEntries(categories.map(c=>[c.id,c])),[categories]);

  // Pie data
  const pieData = useMemo(()=>{
    const acc={};
    monthExp.forEach(e=>{ acc[e.catId]=(acc[e.catId]||0)+e.amount; });
    return Object.entries(acc).map(([id,val])=>({ name: catMap[id]?.name||"?", value:val, color: catMap[id]?.color||"#64748b" }));
  },[monthExp,catMap]);

  // Bar data (by day last 14 days)
  const barData = useMemo(()=>{
    const days=[]; const now=new Date();
    for(let i=13;i>=0;i--){ const d=new Date(now); d.setDate(d.getDate()-i); days.push(d.toISOString().slice(0,10)); }
    return days.map(d=>({ day: d.slice(5), total: expenses.filter(e=>e.date===d).reduce((s,e)=>s+e.amount,0) }));
  },[expenses]);

  // Cat budget warnings
  const catAlerts = useMemo(()=>{
    return categories.filter(c=>{
      const limit = Number(budgets[c.id]);
      if(!limit) return false;
      const spent = monthExp.filter(e=>e.catId===c.id).reduce((s,e)=>s+e.amount,0);
      return spent>=limit*0.9;
    });
  },[categories,budgets,monthExp]);

  const months = useMemo(()=>{
    const set = new Set(expenses.map(e=>monthOf(e.date)));
    set.add(currentMonth());
    return [...set].sort().reverse();
  },[expenses]);

  return (
    <div style={{ minHeight:"100vh", background:"#0a0e1a", fontFamily:"'DM Sans',sans-serif", color:"#e2e8f0" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Mono:wght@700&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ background:"#0f1420", borderBottom:"1px solid #1e2840", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:64 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:24 }}>💸</span>
          <span style={{ fontFamily:"'Space Mono',monospace", fontWeight:700, fontSize:16, color:"#34d399" }}>MIS GASTOS</span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="ghost" style={{ padding:"7px 14px", fontSize:13 }} onClick={()=>setModal("Categorías")}>🏷️ Categorías</Btn>
          <Btn variant="ghost" style={{ padding:"7px 14px", fontSize:13 }} onClick={()=>setModal("budget")}>🎯 Ppto</Btn>
          <Btn style={{ padding:"7px 16px", fontSize:13 }} onClick={()=>setModal("add")}>+ Gasto</Btn>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display:"flex", gap:0, borderBottom:"1px solid #1e2840", padding:"0 24px" }}>
        {[["dashboard","📊 Dashboard"],["history","📋 Historial"]].map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)} style={{ background:"none", border:"none", borderBottom: view===v?"2px solid #34d399":"2px solid transparent", color: view===v?"#34d399":"#64748b", padding:"14px 18px", cursor:"pointer", fontFamily:"inherit", fontWeight:600, fontSize:13, letterSpacing:.3 }}>{l}</button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)}
            style={{ background:"#0f1420", border:"1px solid #2d3650", borderRadius:6, padding:"5px 10px", color:"#94a3b8", fontSize:12, fontFamily:"inherit" }}>
            {months.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding:"24px", maxWidth:960, margin:"0 auto" }}>

        {/* Alerts */}
        {(overBudget || catAlerts.length>0) && (
          <div style={{ background:"rgba(248,113,113,.1)", border:"1px solid rgba(248,113,113,.3)", borderRadius:12, padding:"12px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:20 }}>⚠️</span>
            <div style={{ fontSize:13 }}>
              {overBudget && <p style={{ color:"#f87171", margin:0 }}>Superaste el presupuesto mensual total ({fmt(totalMonth)} / {fmt(budgetTotal)})</p>}
              {catAlerts.map(c=>{
                const spent=monthExp.filter(e=>e.catId===c.id).reduce((s,e)=>s+e.amount,0);
                const limit=Number(budgets[c.id]);
                return <p key={c.id} style={{ color:"#fb923c", margin:"4px 0 0" }}>{c.icon} {c.name}: {fmt(spent)} / {fmt(limit)}</p>;
              })}
            </div>
          </div>
        )}

        {/* Dashboard */}
        {view==="dashboard" && (
          <>
            {/* KPI cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:16, marginBottom:24 }}>
              {[
                { label:"Gastado este mes", val: fmt(totalMonth), color:"#34d399" },
                { label:"Presupuesto", val: budgetTotal>0?fmt(budgetTotal):"Sin límite", color:"#60a5fa" },
                { label:"Disponible", val: budgetTotal>0?fmt(Math.max(budgetTotal-totalMonth,0)):"—", color: overBudget?"#f87171":"#2dd4bf" },
                { label:"Transacciones", val: monthExp.length, color:"#a78bfa" },
              ].map((k,i)=>(
                <div key={i} style={{ background:"#0f1420", border:"1px solid #1e2840", borderRadius:14, padding:"20px 22px" }}>
                  <p style={{ fontSize:11, color:"#475569", fontWeight:600, letterSpacing:.8, marginBottom:8 }}>{k.label.toUpperCase()}</p>
                  <p style={{ fontFamily:"'Space Mono',monospace", fontSize:22, fontWeight:700, color:k.color, margin:0 }}>{k.val}</p>
                </div>
              ))}
            </div>

            {/* Category Treemap */}
            <CategoryTreemap categories={categories} monthExp={monthExp} catMap={catMap} total={totalMonth} />

            {/* Budget bar */}
            {budgetTotal>0 && (
              <div style={{ background:"#0f1420", border:"1px solid #1e2840", borderRadius:14, padding:"18px 22px", marginBottom:24 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                  <span style={{ fontSize:13, color:"#64748b", fontWeight:600 }}>Uso del presupuesto</span>
                  <span style={{ fontSize:13, color: overBudget?"#f87171":"#34d399", fontWeight:700 }}>{pctUsed.toFixed(0)}%</span>
                </div>
                <div style={{ height:8, background:"#1e2840", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pctUsed}%`, background: overBudget?"#f87171":"linear-gradient(90deg,#34d399,#60a5fa)", borderRadius:4, transition:"width .4s" }}/>
                </div>
              </div>
            )}

            {/* Charts row */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:24 }}>
              {/* Pie */}
              <div style={{ background:"#0f1420", border:"1px solid #1e2840", borderRadius:14, padding:"20px" }}>
                <p style={{ fontSize:12, color:"#64748b", fontWeight:700, letterSpacing:.6, marginBottom:16 }}>POR CATEGORÍA</p>
                {pieData.length===0
                  ? <div style={{ height:180, display:"flex", alignItems:"center", justifyContent:"center", color:"#334155", fontSize:13 }}>Sin datos</div>
                  : (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={75} paddingAngle={3}>
                          {pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                        </Pie>
                        <Tooltip content={<CTooltip/>} />
                      </PieChart>
                    </ResponsiveContainer>
                  )
                }
                {/* Legend */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", marginTop:10 }}>
                  {pieData.map((d,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ width:8, height:8, borderRadius:2, background:d.color, display:"inline-block" }}/>
                      <span style={{ fontSize:11, color:"#94a3b8" }}>{d.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bar (14 days) */}
              <div style={{ background:"#0f1420", border:"1px solid #1e2840", borderRadius:14, padding:"20px" }}>
                <p style={{ fontSize:12, color:"#64748b", fontWeight:700, letterSpacing:.6, marginBottom:16 }}>ÚLTIMOS 14 DÍAS</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData} barSize={12}>
                    <XAxis dataKey="day" tick={{ fontSize:10, fill:"#475569" }} axisLine={false} tickLine={false} interval={2}/>
                    <YAxis hide/>
                    <Tooltip content={<CTooltip/>} cursor={{ fill:"rgba(255,255,255,.04)" }}/>
                    <Bar dataKey="total" fill="#34d399" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cat budgets grid */}
            {categories.filter(c=>Number(budgets[c.id])>0).length>0 && (
              <div style={{ background:"#0f1420", border:"1px solid #1e2840", borderRadius:14, padding:"20px", marginBottom:24 }}>
                <p style={{ fontSize:12, color:"#64748b", fontWeight:700, letterSpacing:.6, marginBottom:16 }}>PRESUPUESTOS POR CATEGORÍA</p>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
                  {categories.filter(c=>Number(budgets[c.id])>0).map(c=>{
                    const limit=Number(budgets[c.id]);
                    const spent=monthExp.filter(e=>e.catId===c.id).reduce((s,e)=>s+e.amount,0);
                    const pct=Math.min((spent/limit)*100,100);
                    const over=spent>limit;
                    return (
                      <div key={c.id} style={{ padding:"14px 16px", background:"#0a0e1a", borderRadius:10, border:`1px solid ${over?"rgba(248,113,113,.3)":"#1e2840"}` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                          <span style={{ fontSize:14 }}>{c.icon} <span style={{ color:"#cbd5e1", fontSize:13 }}>{c.name}</span></span>
                          <span style={{ fontSize:11, color: over?"#f87171":"#64748b" }}>{pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ height:5, background:"#1e2840", borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background: over?"#f87171":c.color, borderRadius:3 }}/>
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
                          <span style={{ fontSize:11, color:"#475569" }}>{fmt(spent)}</span>
                          <span style={{ fontSize:11, color:"#475569" }}>{fmt(limit)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent */}
            <div style={{ background:"#0f1420", border:"1px solid #1e2840", borderRadius:14, padding:"20px" }}>
              <p style={{ fontSize:12, color:"#64748b", fontWeight:700, letterSpacing:.6, marginBottom:16 }}>ÚLTIMOS GASTOS</p>
              {monthExp.length===0
                ? <p style={{ color:"#334155", fontSize:13, textAlign:"center", padding:"24px 0" }}>No hay gastos en este mes.</p>
                : [...monthExp].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(e=>{
                    const cat=catMap[e.catId];
                    return (
                      <div key={e.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"10px 0", borderBottom:"1px solid #0f1420" }}>
                        <span style={{ fontSize:22 }}>{cat?.icon||"💰"}</span>
                        <div style={{ flex:1 }}>
                          <p style={{ margin:0, fontSize:13, color:"#cbd5e1" }}>{e.desc||cat?.name||"Gasto"}</p>
                          <p style={{ margin:0, fontSize:11, color:"#475569" }}>{e.date}</p>
                        </div>
                        <span style={{ fontFamily:"'Space Mono',monospace", fontWeight:700, color:"#34d399", fontSize:14 }}>{fmt(e.amount)}</span>
                      </div>
                    );
                  })
              }
            </div>
          </>
        )}

        {/* History view */}
        {view==="history" && (
          <div style={{ background:"#0f1420", border:"1px solid #1e2840", borderRadius:14, padding:"20px" }}>
            <p style={{ fontSize:12, color:"#64748b", fontWeight:700, letterSpacing:.6, marginBottom:16 }}>HISTORIAL · {filterMonth}</p>
            {monthExp.length===0
              ? <p style={{ color:"#334155", fontSize:13, textAlign:"center", padding:"32px 0" }}>No hay gastos en este período.</p>
              : [...monthExp].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>{
                  const cat=catMap[e.catId];
                  return (
                    <div key={e.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 0", borderBottom:"1px solid #0a0e1a" }}>
                      <div style={{ width:36, height:36, borderRadius:10, background: cat?.color+"22", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                        {cat?.icon||"💰"}
                      </div>
                      <div style={{ flex:1 }}>
                        <p style={{ margin:0, fontSize:13, color:"#e2e8f0", fontWeight:500 }}>{e.desc||cat?.name||"Gasto"}</p>
                        <p style={{ margin:0, fontSize:11, color:"#475569" }}>{cat?.name} · {e.date}</p>
                      </div>
                      <span style={{ fontFamily:"'Space Mono',monospace", fontWeight:700, color:"#34d399", fontSize:15 }}>{fmt(e.amount)}</span>
                      <button onClick={()=>delExpense(e.id)} style={{ background:"none", border:"none", color:"#334155", cursor:"pointer", fontSize:16, padding:"0 4px" }}
                        onMouseEnter={ev=>ev.target.style.color="#f87171"} onMouseLeave={ev=>ev.target.style.color="#334155"}>✕</button>
                    </div>
                  );
                })
            }
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:16, paddingTop:14, borderTop:"1px solid #1e2840" }}>
              <span style={{ color:"#64748b", fontSize:13 }}>Total</span>
              <span style={{ fontFamily:"'Space Mono',monospace", fontWeight:700, color:"#e2e8f0", fontSize:16 }}>{fmt(totalMonth)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal==="add"    && <AddExpenseModal categories={categories} onSave={addExpense} onClose={()=>setModal(null)}/>}
      {modal==="budget" && <BudgetModal budgets={budgets} categories={categories} onSave={saveBudgets} onClose={()=>setModal(null)}/>}
      {modal==="Categorías"   && <CatModal categories={categories} onChange={saveCategorías} onClose={()=>setModal(null)}/>}
    </div>
  );
}