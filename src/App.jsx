import { storage } from "./firebase.js";
import { useState, useMemo, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";

// ── Design tokens ─────────────────────────────────────────────────────
const T = {
  bg:       "#eef5ee",
  surface:  "#ffffff",
  border:   "#e8ede8",
  text:     "#1a1f1a",
  muted:    "#6b7b6b",
  subtle:   "#a8b8a8",
  accent:   "#2d7a4f",
  accentLt: "#e8f4ee",
  accentMd: "#4caf7d",
  warn:     "#e05c5c",
  warnLt:   "#fdf0f0",
  orange:   "#e07a2d",
  shadow:   "0 2px 12px rgba(45,122,79,.08)",
  shadowLg: "0 8px 32px rgba(45,122,79,.12)",
};

const PALETTE = ["#2d7a4f","#4caf7d","#88cba4","#1a5c3a","#6dbf90","#a8d8bc","#34936b","#b8e0ca","#0f3d28","#72c499"];

const fmt = (n) => new Intl.NumberFormat("es-AR", { style:"currency", currency:"ARS", maximumFractionDigits:0 }).format(n);
const today = () => new Date().toISOString().slice(0,10);
const monthOf = (d) => d.slice(0,7);
const currentMonth = () => today().slice(0,7);

const getWeekRange = (offset=0) => {
  const now=new Date(); const day=now.getDay()||7;
  const monday=new Date(now); monday.setDate(now.getDate()-day+1+offset*7);
  const sunday=new Date(monday); sunday.setDate(monday.getDate()+6);
  return { from:monday.toISOString().slice(0,10), to:sunday.toISOString().slice(0,10) };
};
const inRange = (date,from,to) => date>=from && date<=to;

const exportCSV = (expenses,catMap) => {
  const rows=[["Fecha","Categoría","Subcategoría","Descripción","Monto"]];
  [...expenses].sort((a,b)=>b.date.localeCompare(a.date)).forEach(e=>{
    const cat=catMap[e.catId]; const sub=cat?.subcats?.find(s=>s.id===e.subCatId);
    rows.push([e.date,cat?.name||"?",sub?.name||"",e.desc||"",e.amount]);
  });
  const csv=rows.map(r=>r.join(",")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download="mis-gastos.csv"; a.click();
  URL.revokeObjectURL(url);
};

const DEFAULT_CATS = [
  { id:1, name:"Comida",          color:PALETTE[0], icon:"🍔", subcats:[] },
  { id:2, name:"Transporte",      color:PALETTE[1], icon:"🚌", subcats:[] },
  { id:3, name:"Entretenimiento", color:PALETTE[2], icon:"🎬", subcats:[] },
  { id:4, name:"Salud",           color:PALETTE[3], icon:"💊", subcats:[] },
  { id:5, name:"Ropa",            color:PALETTE[4], icon:"👕", subcats:[] },
  { id:6, name:"Hogar",           color:PALETTE[5], icon:"🏠", subcats:[] },
];

// ── UI primitives ─────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide=false }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(26,31,26,.4)",backdropFilter:"blur(6px)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ background:T.surface,borderRadius:20,padding:32,width:wide?560:400,maxWidth:"95vw",boxShadow:T.shadowLg,maxHeight:"90vh",overflowY:"auto" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24 }}>
          <span style={{ fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:18,color:T.text }}>{title}</span>
          <button onClick={onClose} style={{ background:T.bg,border:"none",borderRadius:10,width:32,height:32,cursor:"pointer",color:T.muted,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Inp({ label, ...props }) {
  return (
    <div style={{ marginBottom:16 }}>
      {label && <label style={{ display:"block",fontSize:11,color:T.muted,marginBottom:6,fontWeight:600,letterSpacing:.8,textTransform:"uppercase" }}>{label}</label>}
      <input {...props} style={{ width:"100%",background:T.bg,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"11px 14px",color:T.text,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border-color .2s",...props.style }}
        onFocus={e=>{e.target.style.borderColor=T.accent;}} onBlur={e=>{e.target.style.borderColor=T.border;}}/>
    </div>
  );
}

function Sel({ label, children, ...props }) {
  return (
    <div style={{ marginBottom:16 }}>
      {label && <label style={{ display:"block",fontSize:11,color:T.muted,marginBottom:6,fontWeight:600,letterSpacing:.8,textTransform:"uppercase" }}>{label}</label>}
      <select {...props} style={{ width:"100%",background:T.bg,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"11px 14px",color:T.text,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit" }}>{children}</select>
    </div>
  );
}

function Btn({ children, variant="primary", style={}, ...props }) {
  const vars={
    primary:{ background:T.accent,color:"#fff" },
    ghost:  { background:"transparent",color:T.muted,border:`1.5px solid ${T.border}` },
    danger: { background:T.warnLt,color:T.warn,border:`1.5px solid #f5c6c6` },
    soft:   { background:T.accentLt,color:T.accent },
  };
  return <button {...props} style={{ padding:"11px 20px",borderRadius:12,border:"none",cursor:"pointer",fontWeight:600,fontSize:14,fontFamily:"inherit",transition:"opacity .15s,transform .1s",...vars[variant],...style }}
    onMouseEnter={e=>{e.currentTarget.style.opacity=".85"; e.currentTarget.style.transform="translateY(-1px)";}}
    onMouseLeave={e=>{e.currentTarget.style.opacity="1"; e.currentTarget.style.transform="none";}}
  >{children}</button>;
}

function Card({ children, style={} }) {
  return <div style={{ background:T.surface,borderRadius:20,padding:24,boxShadow:T.shadow,...style }}>{children}</div>;
}

function SectionLabel({ children }) {
  return <p style={{ fontSize:11,color:T.muted,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:16,margin:"0 0 16px" }}>{children}</p>;
}

function CTooltip({ active,payload,label }) {
  if(!active||!payload?.length) return null;
  return (
    <div style={{ background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"8px 14px",fontSize:13,color:T.text,boxShadow:T.shadow }}>
      {label && <p style={{ color:T.muted,marginBottom:4,fontSize:11 }}>{label}</p>}
      {payload.map((p,i)=><p key={i} style={{ color:p.fill||p.color||T.accent,fontWeight:600 }}>{fmt(p.value)}</p>)}
    </div>
  );
}

// ── Add/Edit Expense Modal ────────────────────────────────────────────
function ExpenseModal({ expense,categories,onSave,onClose }) {
  const isEdit=!!expense;
  const [form,setForm]=useState({ amount:expense?.amount||"",catId:expense?.catId||categories[0]?.id||"",subCatId:expense?.subCatId||"",desc:expense?.desc||"",date:expense?.date||today() });
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const cat=categories.find(c=>c.id===Number(form.catId));
  const subcats=cat?.subcats||[];

  const save=()=>{
    if(!form.amount||isNaN(Number(form.amount))||!form.catId) return;
    onSave({ id:expense?.id||Date.now(),amount:Number(form.amount),catId:Number(form.catId),subCatId:form.subCatId?Number(form.subCatId):null,desc:form.desc,date:form.date });
    onClose();
  };

  return (
    <Modal title={isEdit?"Editar gasto":"Nuevo gasto"} onClose={onClose}>
      <Inp label="Monto ($)" type="number" placeholder="0" value={form.amount} onChange={e=>set("amount",e.target.value)}/>
      <Sel label="Categoría" value={form.catId} onChange={e=>{ set("catId",e.target.value); set("subCatId",""); }}>
        {categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
      </Sel>
      {subcats.length>0 && (
        <Sel label="Subcategoría (opcional)" value={form.subCatId} onChange={e=>set("subCatId",e.target.value)}>
          <option value="">— Sin subcategoría —</option>
          {subcats.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </Sel>
      )}
      <Inp label="Descripción (opcional)" placeholder="ej: almuerzo, uber..." value={form.desc} onChange={e=>set("desc",e.target.value)}/>
      <Inp label="Fecha" type="date" value={form.date} onChange={e=>set("date",e.target.value)}/>
      <div style={{ display:"flex",gap:10,marginTop:8 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancelar</Btn>
        <Btn onClick={save} style={{ flex:1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

// ── Budget Modal ──────────────────────────────────────────────────────
function BudgetModal({ budgets,categories,onSave,onClose }) {
  const [vals,setVals]=useState({...budgets});
  return (
    <Modal title="Presupuesto mensual" onClose={onClose}>
      <p style={{ color:T.muted,fontSize:13,marginBottom:20 }}>Establecé límites de gasto para este mes.</p>
      <Inp label="Total mensual ($)" type="number" placeholder="0 = sin límite" value={vals.__total||""} onChange={e=>setVals(v=>({...v,__total:e.target.value}))}/>
      <p style={{ fontSize:11,color:T.muted,fontWeight:700,letterSpacing:.8,textTransform:"uppercase",marginBottom:12 }}>Por categoría</p>
      {categories.map(c=>(
        <div key={c.id} style={{ display:"flex",alignItems:"center",gap:12,marginBottom:10 }}>
          <span style={{ fontSize:20 }}>{c.icon}</span>
          <span style={{ color:T.text,fontSize:14,flex:1 }}>{c.name}</span>
          <input type="number" placeholder="0" value={vals[c.id]||""} onChange={e=>setVals(v=>({...v,[c.id]:e.target.value}))}
            style={{ width:110,background:T.bg,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"8px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit" }}/>
        </div>
      ))}
      <div style={{ display:"flex",gap:10,marginTop:20 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancelar</Btn>
        <Btn onClick={()=>{ onSave(vals); onClose(); }} style={{ flex:1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

// ── Category Manager Modal ────────────────────────────────────────────
function CatModal({ categories,onChange,onClose }) {
  const [cats,setCats]=useState(categories.map(c=>({...c,subcats:[...(c.subcats||[])]})));
  const [newName,setNewName]=useState(""); const [newIcon,setNewIcon]=useState("💰");
  const [expandedCat,setExpandedCat]=useState(null);
  const [newSubName,setNewSubName]=useState("");
  const icons=["💰","🛒","🍔","🚌","🎬","💊","👕","🏠","📚","✈️","🎮","🐾","🍕","🍺","☕","🍷","🥗","🏋️","🚗","⛽","🅿️","🚕","🚇","💈","💅","🧴","🧹","💡","🔧","🖥️","📱","🎵","🎭","⚽","🏊","🧘","🎓","📖","✏️","💼","🏦","💳","🎁","🎂","🐶","🐱","🌿","🌊","🏔️","🎪","🃏","🎯","🧃","🛍️","🧺","🪴","🕯️","🎠"];

  const addCat=()=>{
    if(!newName.trim()) return;
    const used=cats.map(c=>c.color);
    const color=PALETTE.find(p=>!used.includes(p))||PALETTE[cats.length%PALETTE.length];
    setCats(c=>[...c,{id:Date.now(),name:newName.trim(),icon:newIcon,color,subcats:[]}]);
    setNewName("");
  };
  const delCat=(id)=>setCats(c=>c.filter(x=>x.id!==id));
  const addSub=(catId)=>{
    if(!newSubName.trim()) return;
    setCats(c=>c.map(cat=>cat.id===catId?{...cat,subcats:[...cat.subcats,{id:Date.now(),name:newSubName.trim()}]}:cat));
    setNewSubName("");
  };
  const delSub=(catId,subId)=>setCats(c=>c.map(cat=>cat.id===catId?{...cat,subcats:cat.subcats.filter(s=>s.id!==subId)}:cat));

  return (
    <Modal title="Categorías" onClose={onClose} wide={true}>
      <div style={{ maxHeight:300,overflowY:"auto",marginBottom:16 }}>
        {cats.map(c=>(
          <div key={c.id} style={{ marginBottom:8 }}>
            <div style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:14,background:T.bg,border:`1px solid ${T.border}` }}>
              <span style={{ width:12,height:12,borderRadius:4,background:c.color,display:"inline-block",flexShrink:0 }}/>
              <span style={{ fontSize:18 }}>{c.icon}</span>
              <span style={{ color:T.text,flex:1,fontSize:14,fontWeight:500 }}>{c.name}</span>
              <button onClick={()=>setExpandedCat(expandedCat===c.id?null:c.id)} style={{ background:"none",border:"none",color:T.accent,cursor:"pointer",fontSize:12,fontWeight:600 }}>
                {expandedCat===c.id?"▲":"▼"} subcats ({c.subcats.length})
              </button>
              <button onClick={()=>delCat(c.id)} style={{ background:"none",border:"none",color:T.warn,cursor:"pointer",fontSize:16 }}>✕</button>
            </div>
            {expandedCat===c.id && (
              <div style={{ marginLeft:16,marginTop:4,padding:"12px 14px",background:T.accentLt,borderRadius:12 }}>
                {c.subcats.map(s=>(
                  <div key={s.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${T.border}` }}>
                    <span style={{ color:T.text,fontSize:13 }}>• {s.name}</span>
                    <button onClick={()=>delSub(c.id,s.id)} style={{ background:"none",border:"none",color:T.warn,cursor:"pointer",fontSize:12 }}>✕</button>
                  </div>
                ))}
                <div style={{ display:"flex",gap:8,marginTop:10 }}>
                  <input placeholder="Nueva subcategoría" value={newSubName} onChange={e=>setNewSubName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSub(c.id)}
                    style={{ flex:1,background:T.surface,border:`1.5px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,outline:"none",fontFamily:"inherit" }}/>
                  <Btn onClick={()=>addSub(c.id)} style={{ padding:"7px 14px",fontSize:12 }}>+</Btn>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:16 }}>
        <select value={newIcon} onChange={e=>setNewIcon(e.target.value)} style={{ background:T.bg,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px",color:T.text,fontSize:18 }}>
          {icons.map(ic=><option key={ic}>{ic}</option>)}
        </select>
        <input placeholder="Nombre de la categoría" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCat()}
          style={{ flex:1,background:T.bg,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px 14px",color:T.text,fontSize:14,outline:"none",fontFamily:"inherit" }}/>
        <Btn onClick={addCat}>+</Btn>
      </div>
      <div style={{ display:"flex",gap:10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancelar</Btn>
        <Btn onClick={()=>{ onChange(cats); onClose(); }} style={{ flex:1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

// ── Category Detail Modal ─────────────────────────────────────────────
function CatDetailModal({ cat,expenses,onClose }) {
  const catExp=useMemo(()=>[...expenses.filter(e=>e.catId===cat.id)].sort((a,b)=>b.date.localeCompare(a.date)),[expenses,cat]);
  const total=catExp.reduce((s,e)=>s+e.amount,0);
  const subData=useMemo(()=>{
    if(!cat.subcats||cat.subcats.length===0) return [];
    const acc={};
    catExp.forEach(e=>{ const key=e.subCatId||"__sin__"; acc[key]=(acc[key]||0)+e.amount; });
    return Object.entries(acc).map(([id,val],i)=>{
      const sub=cat.subcats.find(s=>s.id===Number(id));
      return { name:sub?.name||(id==="__sin__"?"General":"?"),value:val,color:PALETTE[i%PALETTE.length] };
    }).filter(d=>d.value>0);
  },[catExp,cat]);

  return (
    <Modal title={`${cat.icon} ${cat.name}`} onClose={onClose} wide={true}>
      {subData.length>1 && (
        <div style={{ marginBottom:24 }}>
          <SectionLabel>Distribución por subcategoría</SectionLabel>
          <div style={{ display:"flex",gap:20,alignItems:"center" }}>
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie data={subData} dataKey="value" cx="50%" cy="50%" outerRadius={65} paddingAngle={4}>
                  {subData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                </Pie>
                <Tooltip content={<CTooltip/>}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex:1 }}>
              {subData.map((d,i)=>(
                <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ width:10,height:10,borderRadius:3,background:d.color,display:"inline-block" }}/>
                    <span style={{ color:T.text,fontSize:13 }}>{d.name}</span>
                  </div>
                  <div>
                    <span style={{ fontSize:13,fontWeight:600,color:T.text }}>{fmt(d.value)}</span>
                    <span style={{ color:T.subtle,fontSize:11,marginLeft:8 }}>{((d.value/total)*100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <SectionLabel>Detalle de gastos</SectionLabel>
      <div style={{ maxHeight:220,overflowY:"auto" }}>
        {catExp.length===0
          ? <p style={{ color:T.muted,textAlign:"center",padding:"20px 0",fontSize:13 }}>Sin gastos en este período</p>
          : catExp.map(e=>{ const sub=cat.subcats?.find(s=>s.id===e.subCatId); return (
            <div key={e.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}` }}>
              <div>
                <p style={{ margin:0,fontSize:14,color:T.text,fontWeight:500 }}>{e.desc||cat.name}</p>
                <p style={{ margin:0,fontSize:11,color:T.muted }}>{sub?`${sub.name} · `:""}{e.date}</p>
              </div>
              <span style={{ fontSize:14,fontWeight:700,color:T.accent }}>{fmt(e.amount)}</span>
            </div>
          ); })
        }
      </div>
      <div style={{ display:"flex",justifyContent:"space-between",marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}` }}>
        <span style={{ color:T.muted,fontSize:14 }}>Total</span>
        <span style={{ fontWeight:700,fontSize:16,color:T.text }}>{fmt(total)}</span>
      </div>
    </Modal>
  );
}

// ── Category Treemap ──────────────────────────────────────────────────
function CategoryTreemap({ categories,monthExp,total,onCatClick }) {
  const [hovered,setHovered]=useState(null);
  const CONTAINER_H=200;
  const data=useMemo(()=>categories.map(c=>({...c,spent:monthExp.filter(e=>e.catId===c.id).reduce((s,e)=>s+e.amount,0)})).sort((a,b)=>b.spent-a.spent),[categories,monthExp]);
  const dataWithEff=useMemo(()=>{ const ts=data.reduce((s,d)=>s+d.spent,0); return data.map(d=>({...d,pct:ts>0?d.spent/ts:1/data.length,effectivePct:ts>0?Math.max(d.spent/ts,d.spent>0?d.spent/ts:0.015):1/data.length})); },[data]);
  const sumEff=dataWithEff.reduce((s,d)=>s+d.effectivePct,0);
  const normalized=dataWithEff.map(d=>({...d,norm:d.effectivePct/sumEff}));

  return (
    <Card style={{ marginBottom:20 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <SectionLabel>Mapa de gastos</SectionLabel>
        {total>0 && <span style={{ fontSize:11,color:T.subtle }}>Tocá para ver el detalle</span>}
      </div>
      {total===0
        ? <div style={{ height:CONTAINER_H,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8 }}>
            <span style={{ fontSize:36 }}>🌿</span>
            <span style={{ color:T.subtle,fontSize:14 }}>Agregá gastos para ver el mapa</span>
          </div>
        : <div style={{ display:"flex",flexWrap:"wrap",gap:6,height:CONTAINER_H,overflow:"hidden",alignContent:"flex-start" }}>
            {normalized.map(d=>{
              const isHov=hovered===d.id; const pctLabel=(d.pct*100).toFixed(1);
              const showLabel=d.norm>0.07; const showAmt=d.spent>0;
              return (
                <div key={d.id} onMouseEnter={()=>setHovered(d.id)} onMouseLeave={()=>setHovered(null)}
                  onClick={()=>onCatClick&&d.spent>0&&onCatClick(d)}
                  style={{ flexGrow:d.norm,flexShrink:0,flexBasis:`${Math.max(d.norm*100-1,2)}%`,minWidth:40,
                    height:d.spent>0?`${Math.max(30,Math.min(CONTAINER_H-12,Math.sqrt(d.norm)*CONTAINER_H*1.8))}px`:"32px",
                    background:isHov?d.color:`${d.color}22`,
                    border:`2px solid ${isHov?d.color:`${d.color}44`}`,
                    borderRadius:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                    cursor:d.spent>0?"pointer":"default",transition:"all .3s ease",
                    overflow:"hidden",position:"relative",padding:6,boxSizing:"border-box" }}>
                  <span style={{ fontSize:d.norm>0.15?26:d.norm>0.07?18:13,lineHeight:1,marginBottom:2 }}>{d.icon}</span>
                  {showLabel && <span style={{ fontSize:d.norm>0.15?12:10,color:isHov?"#fff":T.text,fontWeight:700,textAlign:"center",lineHeight:1.2,marginBottom:1 }}>{d.name}</span>}
                  {showAmt && <span style={{ fontSize:d.norm>0.2?13:10,color:isHov?"#ffffffcc":T.accent,fontWeight:700 }}>{fmt(d.spent)}</span>}
                  {d.norm>0.06 && <span style={{ fontSize:9,color:isHov?"#ffffff88":T.subtle,marginTop:1 }}>{pctLabel}%</span>}
                  {isHov&&!showLabel && (
                    <div style={{ position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"6px 12px",whiteSpace:"nowrap",zIndex:10,boxShadow:T.shadow }}>
                      <span style={{ fontSize:14 }}>{d.icon}</span>
                      <span style={{ fontSize:12,color:T.text,marginLeft:6,fontWeight:600 }}>{d.name}</span>
                      <span style={{ fontSize:11,color:T.accent,marginLeft:8 }}>{fmt(d.spent)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
      }
      <div style={{ display:"flex",flexWrap:"wrap",gap:"6px 16px",marginTop:14 }}>
        {normalized.filter(d=>d.spent>0).map(d=>(
          <div key={d.id} style={{ display:"flex",alignItems:"center",gap:5 }}>
            <span style={{ width:8,height:8,borderRadius:2,background:d.color,display:"inline-block" }}/>
            <span style={{ fontSize:11,color:T.muted }}>{d.icon} {d.name} {(d.pct*100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Shopping List ─────────────────────────────────────────────────────
function ShoppingList({ categories,onAddExpense }) {
  const [items,setItems]=useState([]);
  const [newItem,setNewItem]=useState({name:"",qty:1,price:""});
  const [manualTotal,setManualTotal]=useState("");
  const [useManual,setUseManual]=useState(false);
  const [catId,setCatId]=useState(categories[0]?.id||"");
  const [desc,setDesc]=useState("");
  const [done,setDone]=useState(false);

  const autoTotal=useMemo(()=>items.reduce((s,i)=>s+(i.price*i.qty),0),[items]);
  const finalTotal=useManual?Number(manualTotal)||0:autoTotal;

  const addItem=()=>{
    if(!newItem.name.trim()) return;
    setItems(prev=>[...prev,{id:Date.now(),...newItem,price:Number(newItem.price)||0,checked:false}]);
    setNewItem({name:"",qty:1,price:""});
  };
  const toggleCheck=(id)=>setItems(prev=>prev.map(i=>i.id===id?{...i,checked:!i.checked}:i));
  const delItem=(id)=>setItems(prev=>prev.filter(i=>i.id!==id));

  const finishShopping=()=>{
    if(!finalTotal||!catId) return;
    onAddExpense({id:Date.now(),amount:finalTotal,catId:Number(catId),subCatId:null,desc:desc||"Lista de compras",date:today()});
    setItems([]); setManualTotal(""); setDesc(""); setDone(true);
    setTimeout(()=>setDone(false),3000);
  };

  return (
    <div style={{ maxWidth:600,margin:"0 auto" }}>
      <Card style={{ marginBottom:16 }}>
        <SectionLabel>Agregar producto</SectionLabel>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 70px 120px auto",gap:10,alignItems:"end" }}>
          <Inp label="Producto" placeholder="ej: Carne, Leche..." value={newItem.name} onChange={e=>setNewItem(n=>({...n,name:e.target.value}))} style={{ marginBottom:0 }}/>
          <Inp label="Cant." type="number" value={newItem.qty} onChange={e=>setNewItem(n=>({...n,qty:Number(e.target.value)||1}))} style={{ marginBottom:0 }}/>
          <Inp label="Precio ($)" type="number" placeholder="0" value={newItem.price} onChange={e=>setNewItem(n=>({...n,price:e.target.value}))} style={{ marginBottom:0 }}/>
          <Btn onClick={addItem} style={{ padding:"11px 16px" }}>+</Btn>
        </div>
      </Card>

      <Card style={{ marginBottom:16 }}>
        <SectionLabel>Lista ({items.length} productos)</SectionLabel>
        {items.length===0
          ? <p style={{ color:T.subtle,fontSize:13,textAlign:"center",padding:"24px 0" }}>Agregá productos para empezar</p>
          : items.map(item=>(
            <div key={item.id} style={{ display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${T.border}` }}>
              <input type="checkbox" checked={item.checked} onChange={()=>toggleCheck(item.id)} style={{ width:18,height:18,cursor:"pointer",accentColor:T.accent }}/>
              <div style={{ flex:1 }}>
                <span style={{ fontSize:14,color:item.checked?T.subtle:T.text,textDecoration:item.checked?"line-through":"none",fontWeight:500 }}>{item.name}</span>
                <span style={{ fontSize:12,color:T.subtle,marginLeft:8 }}>×{item.qty}</span>
              </div>
              {item.price>0&&<span style={{ fontSize:14,fontWeight:600,color:T.accent }}>{fmt(item.price*item.qty)}</span>}
              <button onClick={()=>delItem(item.id)} style={{ background:"none",border:"none",color:T.subtle,cursor:"pointer",fontSize:16 }}
                onMouseEnter={e=>e.target.style.color=T.warn} onMouseLeave={e=>e.target.style.color=T.subtle}>✕</button>
            </div>
          ))
        }
        {items.length>0&&(
          <div style={{ display:"flex",justifyContent:"space-between",marginTop:14,paddingTop:12,borderTop:`1px solid ${T.border}` }}>
            <span style={{ color:T.muted,fontSize:14 }}>Subtotal</span>
            <span style={{ fontWeight:700,fontSize:16,color:T.accent }}>{fmt(autoTotal)}</span>
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>Finalizar compra</SectionLabel>
        <div style={{ display:"flex",gap:10,marginBottom:16 }}>
          <button onClick={()=>setUseManual(false)} style={{ flex:1,padding:"10px",borderRadius:12,border:`1.5px solid ${!useManual?T.accent:T.border}`,background:!useManual?T.accentLt:"transparent",color:!useManual?T.accent:T.muted,cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13 }}>🧮 Automático</button>
          <button onClick={()=>setUseManual(true)} style={{ flex:1,padding:"10px",borderRadius:12,border:`1.5px solid ${useManual?T.accent:T.border}`,background:useManual?T.accentLt:"transparent",color:useManual?T.accent:T.muted,cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13 }}>✏️ Manual</button>
        </div>
        {useManual&&<Inp label="Total gastado ($)" type="number" placeholder="0" value={manualTotal} onChange={e=>setManualTotal(e.target.value)}/>}
        <div style={{ background:T.accentLt,borderRadius:14,padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ color:T.muted,fontSize:14 }}>Total a registrar</span>
          <span style={{ fontWeight:700,fontSize:22,color:T.accent }}>{fmt(finalTotal)}</span>
        </div>
        <Sel label="Categoría del gasto" value={catId} onChange={e=>setCatId(e.target.value)}>
          {categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </Sel>
        <Inp label="Descripción (opcional)" placeholder="ej: Compra semanal" value={desc} onChange={e=>setDesc(e.target.value)}/>
        {done
          ? <div style={{ background:T.accentLt,border:`1px solid ${T.accentMd}`,borderRadius:12,padding:"14px",textAlign:"center",color:T.accent,fontWeight:700 }}>✅ ¡Compra registrada!</div>
          : <Btn onClick={finishShopping} style={{ width:"100%",padding:"13px" }}>Registrar compra</Btn>
        }
      </Card>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────
export default function App() {
  const [expenses,setExpenses]     = useState([]);
  const [categories,setCategories] = useState(DEFAULT_CATS);
  const [budgets,setBudgets]       = useState({});
  const [modal,setModal]           = useState(null);
  const [view,setView]             = useState("dashboard");
  const [filterMonth,setFilterMonth] = useState(currentMonth());
  const [filterMode,setFilterMode] = useState("month");
  const [weekOffset,setWeekOffset] = useState(0);
  const [selectedCat,setSelectedCat] = useState(null);
  const [editingExpense,setEditingExpense] = useState(null);

  useEffect(()=>{
    (async()=>{
      try {
        const e=await storage.get("expenses"); if(e) setExpenses(JSON.parse(e.value));
        const c=await storage.get("categories"); if(c) setCategories(JSON.parse(c.value));
        const b=await storage.get("budgets"); if(b) setBudgets(JSON.parse(b.value));
      } catch {}
    })();
  },[]);

  const saveExpenses=(data)=>{ setExpenses(data); storage.set("expenses",JSON.stringify(data)).catch(()=>{}); };
  const saveCats    =(data)=>{ setCategories(data); storage.set("categories",JSON.stringify(data)).catch(()=>{}); };
  const saveBudgets =(data)=>{ setBudgets(data); storage.set("budgets",JSON.stringify(data)).catch(()=>{}); };

  const addExpense =(exp)=>saveExpenses([...expenses,exp]);
  const delExpense =(id) =>saveExpenses(expenses.filter(e=>e.id!==id));
  const editExpense=(upd)=>saveExpenses(expenses.map(e=>e.id===upd.id?upd:e));

  const catMap=useMemo(()=>Object.fromEntries(categories.map(c=>[c.id,c])),[categories]);
  const weekRange=useMemo(()=>getWeekRange(weekOffset),[weekOffset]);
  const monthExp=useMemo(()=>{
    if(filterMode==="week") return expenses.filter(e=>inRange(e.date,weekRange.from,weekRange.to));
    return expenses.filter(e=>monthOf(e.date)===filterMonth);
  },[expenses,filterMonth,filterMode,weekRange]);

  const totalMonth =useMemo(()=>monthExp.reduce((s,e)=>s+e.amount,0),[monthExp]);
  const budgetTotal=Number(budgets.__total)||0;
  const overBudget =budgetTotal>0&&totalMonth>budgetTotal;
  const pctUsed    =budgetTotal>0?Math.min((totalMonth/budgetTotal)*100,100):0;

  const pieData=useMemo(()=>{ const acc={}; monthExp.forEach(e=>{ acc[e.catId]=(acc[e.catId]||0)+e.amount; }); return Object.entries(acc).map(([id,val])=>({ name:catMap[id]?.name||"?",value:val,color:catMap[id]?.color||T.accent })); },[monthExp,catMap]);
  const barData=useMemo(()=>{ const days=[]; const now=new Date(); for(let i=13;i>=0;i--){ const d=new Date(now); d.setDate(d.getDate()-i); days.push(d.toISOString().slice(0,10)); } return days.map(d=>({ day:d.slice(5),total:expenses.filter(e=>e.date===d).reduce((s,e)=>s+e.amount,0) })); },[expenses]);
  const catAlerts=useMemo(()=>categories.filter(c=>{ const limit=Number(budgets[c.id]); if(!limit) return false; const spent=monthExp.filter(e=>e.catId===c.id).reduce((s,e)=>s+e.amount,0); return spent>=limit*0.9; }),[categories,budgets,monthExp]);
  const months=useMemo(()=>{ const set=new Set(expenses.map(e=>monthOf(e.date))); set.add(currentMonth()); return [...set].sort().reverse(); },[expenses]);

  const navStyle=(v)=>({ background:"none",border:"none",borderBottom:view===v?`2px solid ${T.accent}`:"2px solid transparent",color:view===v?T.accent:T.muted,padding:"14px 18px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:13,transition:"color .2s" });

  return (
    <div style={{ minHeight:"100vh", background:`#eef5ee url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100'%3E%3Cpath d='M28 66L0 50V16L28 0l28 16v34L28 66zm0 34L0 84V50l28-16 28 16v34L28 100z' fill='none' stroke='%232d7a4f' stroke-opacity='0.08' stroke-width='1'/%3E%3C/svg%3E")`,fontFamily:"'Plus Jakarta Sans',sans-serif",color:T.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"0 28px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64,boxShadow:"0 1px 0 #e8ede8" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ width:32,height:32,borderRadius:10,background:T.accentLt,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>💸</div>
          <span style={{ fontWeight:700,fontSize:17,color:T.text,letterSpacing:"-.3px" }}>Mis Gastos</span>
        </div>
        <div style={{ display:"flex",gap:8 }}>
          <Btn variant="ghost" style={{ padding:"8px 14px",fontSize:13 }} onClick={()=>setModal("cats")}>🏷️ Categorías</Btn>
          <Btn variant="ghost" style={{ padding:"8px 14px",fontSize:13 }} onClick={()=>setModal("budget")}>🎯 Presupuesto</Btn>
          <Btn style={{ padding:"8px 16px",fontSize:13 }} onClick={()=>setModal("add")}>+ Gastos</Btn>
        </div>
      </div>

      {/* Nav */}
      <div style={{ background:T.surface,display:"flex",borderBottom:`1px solid ${T.border}`,padding:"0 28px",flexWrap:"wrap" }}>
        {[["dashboard","Dashboard"],["history","Historial"],["shopping","Lista de compras"]].map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)} style={navStyle(v)}>{l}</button>
        ))}
        {view!=="shopping" && (
          <div style={{ marginLeft:"auto",display:"flex",alignItems:"center",gap:8,padding:"10px 0" }}>
            <div style={{ display:"flex",background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden" }}>
              {[["month","Mes"],["week","Semana"]].map(([m,l])=>(
                <button key={m} onClick={()=>setFilterMode(m)} style={{ background:filterMode===m?T.accent:"transparent",color:filterMode===m?"#fff":T.muted,border:"none",padding:"5px 14px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:12,transition:"background .2s" }}>{l}</button>
              ))}
            </div>
            {filterMode==="month" && (
              <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={{ background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"6px 12px",color:T.text,fontSize:12,fontFamily:"inherit" }}>
                {months.map(m=><option key={m}>{m}</option>)}
              </select>
            )}
            {filterMode==="week" && (
              <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                <button onClick={()=>setWeekOffset(w=>w-1)} style={{ background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,padding:"4px 10px",cursor:"pointer",fontSize:14 }}>‹</button>
                <span style={{ color:T.muted,fontSize:11,minWidth:130,textAlign:"center" }}>{weekRange.from} → {weekRange.to}</span>
                <button onClick={()=>setWeekOffset(w=>Math.min(w+1,0))} style={{ background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,padding:"4px 10px",cursor:"pointer",fontSize:14 }}>›</button>
              </div>
            )}
            <Btn variant="soft" onClick={()=>exportCSV(monthExp,catMap)} style={{ padding:"6px 14px",fontSize:12 }}>↓ Excel</Btn>
          </div>
        )}
      </div>

      <div style={{ padding:"24px 28px",maxWidth:960,margin:"0 auto" }}>

        {(overBudget||catAlerts.length>0)&&view!=="shopping"&&(
          <div style={{ background:T.warnLt,border:`1px solid #f5c6c6`,borderRadius:14,padding:"12px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:12 }}>
            <span style={{ fontSize:20 }}>⚠️</span>
            <div style={{ fontSize:13 }}>
              {overBudget&&<p style={{ color:T.warn,margin:0,fontWeight:600 }}>Superaste el presupuesto mensual ({fmt(totalMonth)} / {fmt(budgetTotal)})</p>}
              {catAlerts.map(c=>{ const spent=monthExp.filter(e=>e.catId===c.id).reduce((s,e)=>s+e.amount,0); const limit=Number(budgets[c.id]); return <p key={c.id} style={{ color:T.orange,margin:"4px 0 0" }}>{c.icon} {c.name}: {fmt(spent)} / {fmt(limit)}</p>; })}
            </div>
          </div>
        )}

        {view==="shopping"&&<ShoppingList categories={categories} onAddExpense={addExpense}/>}

        {view==="dashboard"&&(
          <>
            {/* KPI cards */}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:20 }}>
              {[
                {label:"Gastado este mes",val:fmt(totalMonth),color:T.accent,bg:T.accentLt},
                {label:"Presupuesto",val:budgetTotal>0?fmt(budgetTotal):"Sin límite",color:"#1a6b8a",bg:"#e8f4f8"},
                {label:"Disponible",val:budgetTotal>0?fmt(Math.max(budgetTotal-totalMonth,0)):"—",color:overBudget?T.warn:T.accent,bg:overBudget?T.warnLt:T.accentLt},
                {label:"Transacciones",val:monthExp.length,color:"#7c4a9e",bg:"#f5eeff"},
              ].map((k,i)=>(
                <div key={i} style={{ background:T.surface,borderRadius:18,padding:"20px 22px",boxShadow:T.shadow }}>
                  <p style={{ fontSize:11,color:T.muted,fontWeight:600,letterSpacing:.6,marginBottom:10,textTransform:"uppercase" }}>{k.label}</p>
                  <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                    <div style={{ width:6,height:32,borderRadius:3,background:k.color }}/>
                    <p style={{ fontSize:22,fontWeight:700,color:k.color,margin:0 }}>{k.val}</p>
                  </div>
                </div>
              ))}
            </div>

            <CategoryTreemap categories={categories} monthExp={monthExp} total={totalMonth} onCatClick={setSelectedCat}/>

            {budgetTotal>0&&(
              <Card style={{ marginBottom:20 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:10 }}>
                  <span style={{ fontSize:13,color:T.muted,fontWeight:600 }}>Uso del presupuesto</span>
                  <span style={{ fontSize:13,color:overBudget?T.warn:T.accent,fontWeight:700 }}>{pctUsed.toFixed(0)}%</span>
                </div>
                <div style={{ height:8,background:T.bg,borderRadius:4,overflow:"hidden" }}>
                  <div style={{ height:"100%",width:`${pctUsed}%`,background:overBudget?T.warn:`linear-gradient(90deg,${T.accent},${T.accentMd})`,borderRadius:4,transition:"width .4s" }}/>
                </div>
              </Card>
            )}

            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20 }}>
              <Card>
                <SectionLabel>Por categoría</SectionLabel>
                {pieData.length===0
                  ? <div style={{ height:160,display:"flex",alignItems:"center",justifyContent:"center",color:T.subtle,fontSize:13 }}>Sin datos</div>
                  : <ResponsiveContainer width="100%" height={160}><PieChart><Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={70} paddingAngle={4}>{pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}</Pie><Tooltip content={<CTooltip/>}/></PieChart></ResponsiveContainer>
                }
                <div style={{ display:"flex",flexWrap:"wrap",gap:"5px 12px",marginTop:10 }}>
                  {pieData.map((d,i)=><div key={i} style={{ display:"flex",alignItems:"center",gap:5 }}><span style={{ width:8,height:8,borderRadius:2,background:d.color,display:"inline-block" }}/><span style={{ fontSize:11,color:T.muted }}>{d.name}</span></div>)}
                </div>
              </Card>
              <Card>
                <SectionLabel>Últimos 14 días</SectionLabel>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barData} barSize={10}>
                    <XAxis dataKey="day" tick={{ fontSize:10,fill:T.subtle }} axisLine={false} tickLine={false} interval={2}/>
                    <YAxis hide/>
                    <Tooltip content={<CTooltip/>} cursor={{ fill:`${T.accent}11` }}/>
                    <Bar dataKey="total" fill={T.accent} radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {categories.filter(c=>Number(budgets[c.id])>0).length>0&&(
              <Card style={{ marginBottom:20 }}>
                <SectionLabel>Presupuestos por categoría</SectionLabel>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12 }}>
                  {categories.filter(c=>Number(budgets[c.id])>0).map(c=>{ const limit=Number(budgets[c.id]); const spent=monthExp.filter(e=>e.catId===c.id).reduce((s,e)=>s+e.amount,0); const pct=Math.min((spent/limit)*100,100); const over=spent>limit; return (
                    <div key={c.id} style={{ padding:"14px",background:T.bg,borderRadius:14,border:`1px solid ${over?"#f5c6c6":T.border}` }}>
                      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:8 }}>
                        <span style={{ fontSize:14,fontWeight:500 }}>{c.icon} {c.name}</span>
                        <span style={{ fontSize:11,color:over?T.warn:T.muted,fontWeight:600 }}>{pct.toFixed(0)}%</span>
                      </div>
                      <div style={{ height:5,background:T.border,borderRadius:3,overflow:"hidden" }}>
                        <div style={{ height:"100%",width:`${pct}%`,background:over?T.warn:c.color,borderRadius:3,transition:"width .4s" }}/>
                      </div>
                      <div style={{ display:"flex",justifyContent:"space-between",marginTop:6 }}>
                        <span style={{ fontSize:11,color:T.muted }}>{fmt(spent)}</span>
                        <span style={{ fontSize:11,color:T.subtle }}>{fmt(limit)}</span>
                      </div>
                    </div>
                  ); })}
                </div>
              </Card>
            )}

            <Card>
              <SectionLabel>Últimos gastos</SectionLabel>
              {monthExp.length===0
                ? <p style={{ color:T.subtle,fontSize:14,textAlign:"center",padding:"24px 0" }}>No hay gastos en este mes</p>
                : [...monthExp].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(e=>{ const cat=catMap[e.catId]; return (
                  <div key={e.id} style={{ display:"flex",alignItems:"center",gap:14,padding:"12px 0",borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ width:38,height:38,borderRadius:12,background:cat?.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>{cat?.icon||"💰"}</div>
                    <div style={{ flex:1 }}>
                      <p style={{ margin:0,fontSize:14,color:T.text,fontWeight:500 }}>{e.desc||cat?.name||"Gasto"}</p>
                      <p style={{ margin:0,fontSize:11,color:T.muted }}>{e.date}</p>
                    </div>
                    <span style={{ fontSize:15,fontWeight:700,color:T.accent }}>{fmt(e.amount)}</span>
                  </div>
                ); })
              }
            </Card>
          </>
        )}

        {view==="history"&&(
          <Card>
            <SectionLabel>Historial</SectionLabel>
            {monthExp.length===0
              ? <p style={{ color:T.subtle,fontSize:14,textAlign:"center",padding:"32px 0" }}>No hay gastos en este período</p>
              : [...monthExp].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>{ const cat=catMap[e.catId]; const sub=cat?.subcats?.find(s=>s.id===e.subCatId); return (
                <div key={e.id} style={{ display:"flex",alignItems:"center",gap:14,padding:"12px 0",borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ width:38,height:38,borderRadius:12,background:cat?.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>{cat?.icon||"💰"}</div>
                  <div style={{ flex:1 }}>
                    <p style={{ margin:0,fontSize:14,color:T.text,fontWeight:500 }}>{e.desc||cat?.name||"Gasto"}</p>
                    <p style={{ margin:0,fontSize:11,color:T.muted }}>{cat?.name}{sub?` › ${sub.name}`:""} · {e.date}</p>
                  </div>
                  <span style={{ fontSize:15,fontWeight:700,color:T.accent }}>{fmt(e.amount)}</span>
                  <button onClick={()=>setEditingExpense(e)} style={{ background:"none",border:"none",color:T.subtle,cursor:"pointer",fontSize:15,padding:"0 4px",borderRadius:6 }}
                    onMouseEnter={e=>e.target.style.color=T.accent} onMouseLeave={e=>e.target.style.color=T.subtle}>✏️</button>
                  <button onClick={()=>delExpense(e.id)} style={{ background:"none",border:"none",color:T.subtle,cursor:"pointer",fontSize:16,padding:"0 4px",borderRadius:6 }}
                    onMouseEnter={e=>e.target.style.color=T.warn} onMouseLeave={e=>e.target.style.color=T.subtle}>✕</button>
                </div>
              ); })
            }
            <div style={{ display:"flex",justifyContent:"space-between",marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}` }}>
              <span style={{ color:T.muted,fontSize:14 }}>Total</span>
              <span style={{ fontWeight:700,fontSize:16,color:T.text }}>{fmt(totalMonth)}</span>
            </div>
          </Card>
        )}
      </div>

      {modal==="add"    &&<ExpenseModal categories={categories} onSave={addExpense} onClose={()=>setModal(null)}/>}
      {modal==="budget" &&<BudgetModal budgets={budgets} categories={categories} onSave={saveBudgets} onClose={()=>setModal(null)}/>}
      {modal==="cats"   &&<CatModal categories={categories} onChange={saveCats} onClose={()=>setModal(null)}/>}
      {selectedCat      &&<CatDetailModal cat={selectedCat} expenses={monthExp} onClose={()=>setSelectedCat(null)}/>}
      {editingExpense    &&<ExpenseModal expense={editingExpense} categories={categories} onSave={editExpense} onClose={()=>setEditingExpense(null)}/>}
    </div>
  );
}