import { storage } from "./firebase.js";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";

// ── Global CSS animations ─────────────────────────────────────────────
const ANIM_STYLES = `
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(.92) translateY(12px); }
  to   { opacity: 1; transform: scale(1)  translateY(0); }
}
@keyframes ripple {
  from { transform: scale(0); opacity: .5; }
  to   { transform: scale(3); opacity: 0; }
}
@keyframes countUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fabPulse {
  0%,100% { box-shadow: 0 4px 18px rgba(244,196,48,.5); }
  50%      { box-shadow: 0 4px 28px rgba(244,196,48,.8); }
}
`;

function GlobalStyles() {
  return <style>{ANIM_STYLES}</style>;
}

// ── useAnimatedMount: returns animation style with stagger ────────────
function useAnimatedMount(delay = 0) {
  return { animation: `fadeSlideUp .45s cubic-bezier(.22,.68,0,1.2) ${delay}ms both` };
}

// ── Design tokens ─────────────────────────────────────────────────────
const T = {
  bg:       "#c8e6c8",
  surface:  "#e8f5e8",
  border:   "#a5d0a5",
  text:     "#1a3a1a",
  muted:    "#4a7a4a",
  subtle:   "#7aaa7a",
  accent:   "#2d6a2d",
  accentLt: "#d4ead4",
  accentMd: "#4a9a4a",
  warn:     "#c0392b",
  warnLt:   "#fdecea",
  orange:   "#d35400",
  yellow:   "#f4c430",
  shadow:   "0 2px 12px rgba(45,106,45,.12)",
  shadowLg: "0 8px 32px rgba(45,106,45,.18)",
};

const PALETTE = ["#e74c3c","#3498db","#f39c12","#9b59b6","#1abc9c","#e67e22","#2ecc71","#e91e63","#00bcd4","#ff5722"];

// ── Currencies ────────────────────────────────────────────────────────
const CURRENCIES = [
  { code:"ARS", name:"Peso Argentino",      symbol:"$",   locale:"es-AR" },
  { code:"UYU", name:"Peso Uruguayo",        symbol:"$U",  locale:"es-UY" },
  { code:"CLP", name:"Peso Chileno",         symbol:"$",   locale:"es-CL" },
  { code:"PYG", name:"Guaraní Paraguayo",    symbol:"₲",   locale:"es-PY" },
  { code:"BRL", name:"Real Brasileño",       symbol:"R$",  locale:"pt-BR" },
  { code:"PEN", name:"Sol Peruano",          symbol:"S/",  locale:"es-PE" },
  { code:"COP", name:"Peso Colombiano",      symbol:"$",   locale:"es-CO" },
  { code:"VES", name:"Bolívar Venezolano",   symbol:"Bs.", locale:"es-VE" },
  { code:"USD", name:"Dólar Americano",      symbol:"US$", locale:"en-US" },
  { code:"EUR", name:"Euro",                 symbol:"€",   locale:"de-DE" },
  { code:"GBP", name:"Libra Esterlina",      symbol:"£",   locale:"en-GB" },
  { code:"MXN", name:"Peso Mexicano",        symbol:"$",   locale:"es-MX" },
  { code:"BOB", name:"Boliviano",            symbol:"Bs.", locale:"es-BO" },
  { code:"GTQ", name:"Quetzal Guatemalteco", symbol:"Q",   locale:"es-GT" },
  { code:"HNL", name:"Lempira Hondureño",    symbol:"L",   locale:"es-HN" },
  { code:"NIO", name:"Córdoba Nicaragüense", symbol:"C$",  locale:"es-NI" },
  { code:"CRC", name:"Colón Costarricense",  symbol:"₡",   locale:"es-CR" },
  { code:"DOP", name:"Peso Dominicano",      symbol:"RD$", locale:"es-DO" },
  { code:"JPY", name:"Yen Japonés",          symbol:"¥",   locale:"ja-JP" },
  { code:"CNY", name:"Yuan Chino",           symbol:"¥",   locale:"zh-CN" },
];

const makeFmt = (currencyCode = "ARS") => {
  const cur = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];
  return (n) => new Intl.NumberFormat(cur.locale, {
    style: "currency", currency: cur.code,
    minimumFractionDigits: cur.code === "PYG" || cur.code === "JPY" ? 0 : 2,
    maximumFractionDigits: cur.code === "PYG" || cur.code === "JPY" ? 0 : 2,
  }).format(n);
};

let fmt = makeFmt("ARS");

const today = () => new Date().toISOString().slice(0, 10);
const monthOf = (d) => d.slice(0, 7);
const currentMonth = () => today().slice(0, 7);

const getWeekRange = (offset = 0) => {
  const now = new Date(); const day = now.getDay() || 7;
  const monday = new Date(now); monday.setDate(now.getDate() - day + 1 + offset * 7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
};
const inRange = (date, from, to) => date >= from && date <= to;
const currentYear = () => new Date().getFullYear().toString();
const currentDay = () => today();

const getBudgetPeriodRange = (period = "month") => {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (period === "month") {
    const from = todayStr.slice(0, 7) + "-01";
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const to = todayStr.slice(0, 7) + "-" + String(last).padStart(2, "0");
    return { from, to, label: "este mes" };
  }
  if (period === "week") {
    const day = now.getDay() || 7;
    const monday = new Date(now); monday.setDate(now.getDate() - day + 1);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10), label: "esta semana" };
  }
  if (period === "biweekly") {
    const day = now.getDate();
    let from, to;
    if (day <= 15) {
      from = todayStr.slice(0, 7) + "-01";
      to = todayStr.slice(0, 7) + "-15";
    } else {
      from = todayStr.slice(0, 7) + "-16";
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      to = todayStr.slice(0, 7) + "-" + String(last).padStart(2, "0");
    }
    return { from, to, label: "esta quincena" };
  }
  return { from: todayStr, to: todayStr, label: "hoy" };
};

const exportCSV = (expenses, catMap) => {
  // Escape cell: wrap in quotes if contains separator, quote or newline
  const esc = (val) => {
    const s = String(val ?? "");
    return s.includes(";") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ["Fecha", "Categoría", "Subcategoría", "Descripción", "Monto"],
  ];
  [...expenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach(e => {
      const cat = catMap[e.catId];
      const sub = cat?.subcats?.find(s => s.id === e.subCatId);
      // Format amount as local number string (comma decimal, no currency symbol)
      const amountStr = Number(e.amount).toLocaleString("es-AR", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
      rows.push([
        e.date,
        cat?.name || "Sin categoría",
        sub?.name || "",
        e.desc || "",
        amountStr,
      ]);
    });
  // Use semicolon separator — standard for Spanish-locale Excel
  const csv = rows.map(r => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mis-gastos-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const DEFAULT_CATS = [
  { id: 1, name: "Comida",          color: PALETTE[0], icon: "🍔", subcats: [] },
  { id: 2, name: "Transporte",      color: PALETTE[1], icon: "🚌", subcats: [] },
  { id: 3, name: "Entretenimiento", color: PALETTE[2], icon: "🎬", subcats: [] },
  { id: 4, name: "Salud",           color: PALETTE[3], icon: "💊", subcats: [] },
  { id: 5, name: "Ropa",            color: PALETTE[4], icon: "👕", subcats: [] },
  { id: 6, name: "Hogar",           color: PALETTE[5], icon: "🏠", subcats: [] },
];

// ── UI primitives ─────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide = false }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,31,26,.4)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "fadeIn .2s ease both" }}>
      <div style={{ background: T.surface, borderRadius: 20, padding: 28, width: wide ? 560 : 400, maxWidth: "95vw", boxShadow: T.shadowLg, maxHeight: "90vh", overflowY: "auto", animation: "scaleIn .3s cubic-bezier(.22,.68,0,1.2) both" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 17, color: T.text }}>{title}</span>
          <button onClick={onClose} style={{ background: T.bg, border: "none", borderRadius: 10, width: 32, height: 32, cursor: "pointer", color: T.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Inp({ label, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: "block", fontSize: 11, color: T.muted, marginBottom: 5, fontWeight: 600, letterSpacing: .8, textTransform: "uppercase" }}>{label}</label>}
      <input {...props} style={{ width: "100%", background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "10px 13px", color: T.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color .2s", ...props.style }}
        onFocus={e => { e.target.style.borderColor = T.accent; props.onFocus?.(e); }}
        onBlur={e => { e.target.style.borderColor = T.border; props.onBlur?.(e); }} />
    </div>
  );
}

// ── Accounting format input ───────────────────────────────────────────
function AmountInp({ label, value, onChange, placeholder = "0,00", style = {}, inputStyle = {} }) {
  const [display, setDisplay] = useState("");
  const [focused, setFocused] = useState(false);

  // Sync display when value changes externally and not focused
  useEffect(() => {
    if (!focused) {
      if (value !== "" && value !== undefined && !isNaN(Number(value)) && Number(value) > 0) {
        setDisplay(fmt(Number(value)));
      } else {
        setDisplay("");
      }
    }
  }, [value, focused]);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^0-9.]/g, "");
    setDisplay(raw);
    onChange(raw);
  };

  const handleFocus = () => {
    setFocused(true);
    // Show raw number when editing
    setDisplay(value ? String(value) : "");
  };

  const handleBlur = () => {
    setFocused(false);
    if (value && !isNaN(Number(value)) && Number(value) > 0) {
      setDisplay(fmt(Number(value)));
    } else {
      setDisplay("");
    }
  };

  return (
    <div style={{ marginBottom: 14, ...style }}>
      {label && <label style={{ display: "block", fontSize: 11, color: T.muted, marginBottom: 5, fontWeight: 600, letterSpacing: .8, textTransform: "uppercase" }}>{label}</label>}
      <input
        value={display}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        inputMode="decimal"
        style={{ width: "100%", background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "10px 13px", color: T.text, fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color .2s", ...inputStyle }}
        onFocus={e => { e.target.style.borderColor = T.accent; handleFocus(); }}
        onBlur={e => { e.target.style.borderColor = T.border; handleBlur(); }}
      />
    </div>
  );
}

function Sel({ label, children, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: "block", fontSize: 11, color: T.muted, marginBottom: 5, fontWeight: 600, letterSpacing: .8, textTransform: "uppercase" }}>{label}</label>}
      <select {...props} style={{ width: "100%", background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "10px 13px", color: T.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}>{children}</select>
    </div>
  );
}

function Btn({ children, variant = "primary", style = {}, ...props }) {
  const vars = {
    primary: { background: T.accent, color: "#fff" },
    ghost: { background: "transparent", color: T.muted, border: `1.5px solid ${T.border}` },
    danger: { background: T.warnLt, color: T.warn, border: `1.5px solid #f5c6c6` },
    soft: { background: T.accentLt, color: T.accent },
  };
  const handleClick = (e) => {
    const btn = e.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(btn.clientWidth, btn.clientHeight);
    const radius = diameter / 2;
    const rect = btn.getBoundingClientRect();
    circle.style.cssText = `width:${diameter}px;height:${diameter}px;left:${e.clientX - rect.left - radius}px;top:${e.clientY - rect.top - radius}px;position:absolute;border-radius:50%;background:rgba(255,255,255,.35);animation:ripple .5s linear;pointer-events:none`;
    btn.style.position = "relative";
    btn.style.overflow = "hidden";
    btn.appendChild(circle);
    setTimeout(() => circle.remove(), 500);
    props.onClick?.(e);
  };
  return <button {...props} onClick={handleClick} style={{ padding: "10px 18px", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit", transition: "opacity .15s,transform .1s,box-shadow .15s", position: "relative", overflow: "hidden", ...vars[variant], ...style }}
    onMouseEnter={e => { e.currentTarget.style.opacity = ".88"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = T.shadow; }}
    onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
    onMouseDown={e => { e.currentTarget.style.transform = "scale(.97)"; }}
    onMouseUp={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
  >{children}</button>;
}

function Card({ children, style = {}, animate = false, delay = 0 }) {
  const animStyle = animate ? { animation: `fadeSlideUp .45s cubic-bezier(.22,.68,0,1.2) ${delay}ms both` } : {};
  return <div style={{ background: T.surface, borderRadius: 20, padding: 22, boxShadow: T.shadow, transition: "box-shadow .2s, transform .2s", ...animStyle, ...style }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = T.shadowLg; e.currentTarget.style.transform = "translateY(-2px)"; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = T.shadow; e.currentTarget.style.transform = "none"; }}
  >{children}</div>;
}

function SectionLabel({ children }) {
  return <p style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14, margin: "0 0 14px" }}>{children}</p>;
}

function CTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "8px 14px", fontSize: 13, color: T.text, boxShadow: T.shadow }}>
      {label && <p style={{ color: T.muted, marginBottom: 4, fontSize: 11 }}>{label}</p>}
      {payload.map((p, i) => <p key={i} style={{ color: p.fill || p.color || T.accent, fontWeight: 600 }}>{fmt(p.value)}</p>)}
    </div>
  );
}

// ── Currency Settings Modal ───────────────────────────────────────────
function CurrencyModal({ currency, onSave, onClose }) {
  const [selected, setSelected] = useState(currency);
  const cur = CURRENCIES.find(c => c.code === selected) || CURRENCIES[0];
  return (
    <Modal title="💱 Moneda" onClose={onClose}>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 18 }}>
        Elegí la moneda con la que querés registrar tus gastos. Afecta el formato de todos los montos.
      </p>
      <div style={{ maxHeight: 340, overflowY: "auto", marginBottom: 16 }}>
        {CURRENCIES.map(c => (
          <div key={c.code} onClick={() => setSelected(c.code)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, marginBottom: 6, cursor: "pointer", border: `1.5px solid ${selected === c.code ? T.accent : T.border}`, background: selected === c.code ? T.accentLt : T.bg, transition: "all .15s" }}>
            <span style={{ fontSize: 18, minWidth: 34, textAlign: "center", fontWeight: 700, color: T.accent }}>{c.symbol}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text }}>{c.code}</p>
              <p style={{ margin: 0, fontSize: 11, color: T.muted }}>{c.name}</p>
            </div>
            {selected === c.code && <span style={{ color: T.accent, fontSize: 16 }}>✓</span>}
          </div>
        ))}
      </div>
      <div style={{ background: T.accentLt, borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 12, color: T.muted }}>Vista previa</p>
        <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700, color: T.accent }}>{makeFmt(selected)(12500.5)}</p>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</Btn>
        <Btn onClick={() => { onSave(selected); onClose(); }} style={{ flex: 1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

// ── Add/Edit Expense Modal ────────────────────────────────────────────
function ExpenseModal({ expense, categories, onSave, onClose, onAddCategory }) {
  const isEdit = !!expense;
  const [form, setForm] = useState({
    amount: expense?.amount ? String(expense.amount) : "",
    catId: expense?.catId || categories[0]?.id || "",
    subCatId: expense?.subCatId || "",
    desc: expense?.desc || "",
    date: expense?.date || today()
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [showNewCat, setShowNewCat] = useState(false);
  const [showNewSub, setShowNewSub] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("💰");
  const [newSubName, setNewSubName] = useState("");

  const icons = ["💰","🛒","🍔","🚌","🎬","💊","👕","🏠","📚","✈️","🎮","🐾","🍕","🍺","☕","🍷","🥗","🏋️","🚗","⛽","💡","📱","🎵","⚽","🎓","💼","🏦","💳","🎁","🐶","🌿"];

  const cat = categories.find(c => c.id === Number(form.catId));
  const subcats = cat?.subcats || [];

  const addNewCat = () => {
    if (!newCatName.trim()) return;
    const newCat = { id: Date.now(), name: newCatName.trim(), icon: newCatIcon, color: PALETTE[categories.length % PALETTE.length], subcats: [] };
    onAddCategory(newCat);
    set("catId", newCat.id);
    setNewCatName(""); setShowNewCat(false);
  };

  const addNewSub = () => {
    if (!newSubName.trim() || !cat) return;
    const newSub = { id: Date.now(), name: newSubName.trim() };
    onAddCategory({ ...cat, subcats: [...cat.subcats, newSub] }, true);
    set("subCatId", newSub.id);
    setNewSubName(""); setShowNewSub(false);
  };

  const save = () => {
    if (!form.amount || isNaN(Number(form.amount)) || !form.catId) return;
    onSave({ id: expense?.id || Date.now(), amount: Number(form.amount), catId: Number(form.catId), subCatId: form.subCatId ? Number(form.subCatId) : null, desc: form.desc, date: form.date });
    onClose();
  };

  return (
    <Modal title={isEdit ? "Editar gasto" : "Nuevo gasto"} onClose={onClose}>
      {/* Monto con formato contable */}
      <AmountInp
        label="Monto"
        value={form.amount}
        onChange={v => set("amount", v)}
        placeholder="0,00"
        inputStyle={{ fontSize: 22 }}
      />

      {/* Categoría con opción de crear */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <label style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: .8, textTransform: "uppercase" }}>Categoría</label>
          <button onClick={() => { setShowNewCat(!showNewCat); setShowNewSub(false); }}
            style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 6px", borderRadius: 6 }}>
            {showNewCat ? "✕ Cancelar" : "+ Nueva categoría"}
          </button>
        </div>
        {showNewCat ? (
          <div style={{ background: T.accentLt, borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px", fontSize: 18, cursor: "pointer" }}>
                {icons.map(ic => <option key={ic}>{ic}</option>)}
              </select>
              <input placeholder="Nombre de la categoría" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addNewCat()}
                style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
            </div>
            <Btn onClick={addNewCat} style={{ width: "100%", padding: "8px" }}>✓ Crear categoría</Btn>
          </div>
        ) : (
          <select value={form.catId} onChange={e => { set("catId", e.target.value); set("subCatId", ""); }}
            style={{ width: "100%", background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "10px 13px", color: T.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        )}
      </div>

      {/* Subcategoría con opción de crear */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <label style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: .8, textTransform: "uppercase" }}>Subcategoría <span style={{ color: T.subtle, textTransform: "none", fontWeight: 400 }}>(opcional)</span></label>
          {cat && (
            <button onClick={() => { setShowNewSub(!showNewSub); setShowNewCat(false); }}
              style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 6px", borderRadius: 6 }}>
              {showNewSub ? "✕ Cancelar" : "+ Nueva subcategoría"}
            </button>
          )}
        </div>
        {showNewSub ? (
          <div style={{ background: T.accentLt, borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder={`ej: Almuerzo, Supermercado...`} value={newSubName} onChange={e => setNewSubName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addNewSub()}
                style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
              <Btn onClick={addNewSub} style={{ padding: "8px 14px" }}>✓ Crear</Btn>
            </div>
          </div>
        ) : subcats.length > 0 ? (
          <select value={form.subCatId} onChange={e => set("subCatId", e.target.value)}
            style={{ width: "100%", background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "10px 13px", color: T.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}>
            <option value="">— Sin subcategoría —</option>
            {subcats.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : (
          <p style={{ fontSize: 12, color: T.subtle, margin: 0, padding: "8px 0" }}>Sin subcategorías. Tocá "+ Nueva subcategoría" para agregar.</p>
        )}
      </div>

      <Inp label="Descripción (opcional)" placeholder="ej: almuerzo, uber..." value={form.desc} onChange={e => set("desc", e.target.value)} />
      <Inp label="Fecha" type="date" value={form.date} onChange={e => set("date", e.target.value)} />
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</Btn>
        <Btn onClick={save} style={{ flex: 1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

// ── Budget Modal ──────────────────────────────────────────────────────
function BudgetModal({ budgets, categories, onSave, onClose }) {
  const [vals, setVals] = useState({ ...budgets });
  return (
    <Modal title="Presupuesto" onClose={onClose}>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 18 }}>Establecé límites de gasto y el período de reinicio.</p>

      <p style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: .8, textTransform: "uppercase", marginBottom: 10 }}>Período de reinicio</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[["week", "Semanal"], ["biweekly", "Quincenal"], ["month", "Mensual"]].map(([val, label]) => (
          <button key={val} onClick={() => setVals(v => ({ ...v, __period: val }))}
            style={{ flex: 1, padding: "10px 6px", borderRadius: 12, border: `1.5px solid ${vals.__period === val ? T.accent : T.border}`, background: vals.__period === val ? T.accentLt : "transparent", color: vals.__period === val ? T.accent : T.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 }}>
            {label}
          </button>
        ))}
      </div>

      <AmountInp
        label="Límite total"
        value={vals.__total || ""}
        onChange={v => setVals(vs => ({ ...vs, __total: v }))}
        placeholder="0,00 (sin límite)"
      />

      <p style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: .8, textTransform: "uppercase", marginBottom: 10 }}>Por categoría (opcional)</p>
      {categories.map(c => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>{c.icon}</span>
          <span style={{ color: T.text, fontSize: 14, flex: 1 }}>{c.name}</span>
          <div style={{ width: 130 }}>
            <AmountInp
              value={vals[c.id] || ""}
              onChange={v => setVals(vs => ({ ...vs, [c.id]: v }))}
              placeholder="0,00"
              style={{ marginBottom: 0 }}
              inputStyle={{ fontSize: 14, fontWeight: 600 }}
            />
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</Btn>
        <Btn onClick={() => { onSave(vals); onClose(); }} style={{ flex: 1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

// ── Category Manager Modal ────────────────────────────────────────────
function CatModal({ categories, onChange, onClose }) {
  const [cats, setCats] = useState(categories.map(c => ({ ...c, subcats: [...(c.subcats || [])] })));
  const [newName, setNewName] = useState(""); const [newIcon, setNewIcon] = useState("💰");
  const [expandedCat, setExpandedCat] = useState(null);
  const [newSubName, setNewSubName] = useState("");
  const icons = ["💰","🛒","🍔","🚌","🎬","💊","👕","🏠","📚","✈️","🎮","🐾","🍕","🍺","☕","🍷","🥗","🏋️","🚗","⛽","🅿️","🚕","🚇","💈","💅","🧴","🧹","💡","🔧","🖥️","📱","🎵","🎭","⚽","🏊","🧘","🎓","📖","✏️","💼","🏦","💳","🎁","🎂","🐶","🐱","🌿","🌊","🏔️","🎪","🃏","🎯","🧃","🛍️","🧺","🪴","🕯️","🎠"];

  const addCat = () => {
    if (!newName.trim()) return;
    const used = cats.map(c => c.color);
    const color = PALETTE.find(p => !used.includes(p)) || PALETTE[cats.length % PALETTE.length];
    setCats(c => [...c, { id: Date.now(), name: newName.trim(), icon: newIcon, color, subcats: [] }]);
    setNewName("");
  };
  const delCat = (id) => setCats(c => c.filter(x => x.id !== id));
  const addSub = (catId) => {
    if (!newSubName.trim()) return;
    setCats(c => c.map(cat => cat.id === catId ? { ...cat, subcats: [...cat.subcats, { id: Date.now(), name: newSubName.trim() }] } : cat));
    setNewSubName("");
  };
  const delSub = (catId, subId) => setCats(c => c.map(cat => cat.id === catId ? { ...cat, subcats: cat.subcats.filter(s => s.id !== subId) } : cat));

  return (
    <Modal title="Categorías" onClose={onClose} wide={true}>
      <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 14 }}>
        {cats.map(c => (
          <div key={c.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 14, background: T.bg, border: `1px solid ${T.border}` }}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: c.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 18 }}>{c.icon}</span>
              <span style={{ color: T.text, flex: 1, fontSize: 14, fontWeight: 500 }}>{c.name}</span>
              <button onClick={() => setExpandedCat(expandedCat === c.id ? null : c.id)}
                style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {expandedCat === c.id ? "▲" : "▼"} subcats ({c.subcats.length})
              </button>
              <button onClick={() => delCat(c.id)} style={{ background: "none", border: "none", color: T.warn, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            {expandedCat === c.id && (
              <div style={{ marginLeft: 16, marginTop: 4, padding: "12px 14px", background: T.accentLt, borderRadius: 12 }}>
                {c.subcats.map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ color: T.text, fontSize: 13 }}>• {s.name}</span>
                    <button onClick={() => delSub(c.id, s.id)} style={{ background: "none", border: "none", color: T.warn, cursor: "pointer", fontSize: 12 }}>✕</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input placeholder="Nueva subcategoría" value={newSubName} onChange={e => setNewSubName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addSub(c.id)}
                    style={{ flex: 1, background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", color: T.text, fontSize: 12, outline: "none", fontFamily: "inherit" }} />
                  <Btn onClick={() => addSub(c.id)} style={{ padding: "7px 14px", fontSize: 12 }}>+</Btn>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <select value={newIcon} onChange={e => setNewIcon(e.target.value)}
          style={{ background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "10px", color: T.text, fontSize: 18, cursor: "pointer" }}>
          {icons.map(ic => <option key={ic}>{ic}</option>)}
        </select>
        <input placeholder="Nombre de la categoría" value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addCat()}
          style={{ flex: 1, background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
        <Btn onClick={addCat}>+</Btn>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</Btn>
        <Btn onClick={() => { onChange(cats); onClose(); }} style={{ flex: 1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

// ── Category Detail Modal ─────────────────────────────────────────────
function CatDetailModal({ cat, expenses, onClose }) {
  const catExp = useMemo(() => [...expenses.filter(e => e.catId === cat.id)].sort((a, b) => b.date.localeCompare(a.date)), [expenses, cat]);
  const total = catExp.reduce((s, e) => s + e.amount, 0);
  const subData = useMemo(() => {
    if (!cat.subcats || cat.subcats.length === 0) return [];
    const acc = {};
    catExp.forEach(e => { const key = e.subCatId || "__sin__"; acc[key] = (acc[key] || 0) + e.amount; });
    return Object.entries(acc).map(([id, val], i) => {
      const sub = cat.subcats.find(s => s.id === Number(id));
      return { name: sub?.name || (id === "__sin__" ? "General" : "?"), value: val, color: PALETTE[i % PALETTE.length] };
    }).filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value); // ← orden mayor a menor
  }, [catExp, cat]);

  return (
    <Modal title={`${cat.icon} ${cat.name}`} onClose={onClose} wide={true}>
      {subData.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Distribución por subcategoría</SectionLabel>
          {/* Gráfico centrado */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={subData} dataKey="value" cx="50%" cy="50%" outerRadius={70} paddingAngle={3}>
                  {subData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip content={<CTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Lista centrada, mayor a menor */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {subData.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 10, background: i % 2 === 0 ? T.bg : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ color: T.text, fontSize: 14, fontWeight: 500 }}>{d.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{fmt(d.value)}</span>
                  <span style={{ fontSize: 12, color: T.subtle, minWidth: 36, textAlign: "right" }}>{((d.value / total) * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
          {/* Barra de progreso por subcategoría */}
          <div style={{ marginTop: 14, height: 8, borderRadius: 6, overflow: "hidden", display: "flex", gap: 1 }}>
            {subData.map((d, i) => (
              <div key={i} style={{ flex: d.value, background: d.color, transition: "flex .4s" }} title={d.name} />
            ))}
          </div>
        </div>
      )}
      <SectionLabel>Detalle de gastos</SectionLabel>
      <div style={{ maxHeight: 240, overflowY: "auto" }}>
        {catExp.length === 0
          ? <p style={{ color: T.muted, textAlign: "center", padding: "20px 0", fontSize: 13 }}>Sin gastos en este período</p>
          : catExp.map(e => { const sub = cat.subcats?.find(s => s.id === e.subCatId); return (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, color: T.text, fontWeight: 500 }}>{e.desc || cat.name}</p>
                <p style={{ margin: 0, fontSize: 11, color: T.muted }}>{sub ? `${sub.name} · ` : ""}{e.date}</p>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{fmt(e.amount)}</span>
            </div>
          ); })
        }
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
        <span style={{ color: T.muted, fontSize: 14 }}>Total</span>
        <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{fmt(total)}</span>
      </div>
    </Modal>
  );
}

// ── Squarified treemap (Bruls et al.) ────────────────────────────────
function squarify(data, x, y, w, h) {
  const rects = [];
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total || !w || !h) return rects;

  // Normalize values to fill the area
  const area = w * h;
  const nodes = data.map(d => ({ ...d, norm: (d.value / total) * area }));

  function worst(row, width) {
    const s = row.reduce((a, n) => a + n.norm, 0);
    const rMax = Math.max(...row.map(n => n.norm));
    const rMin = Math.min(...row.map(n => n.norm));
    return Math.max((width * width * rMax) / (s * s), (s * s) / (width * width * rMin));
  }

  function layoutRow(row, x, y, w, h, horiz) {
    const rowSum = row.reduce((s, n) => s + n.norm, 0);
    const rowSize = rowSum / (horiz ? h : w);
    let pos = horiz ? y : x;
    row.forEach(n => {
      const size = (n.norm / rowSum) * (horiz ? h : w);
      if (horiz) rects.push({ ...n, x, y: pos, w: rowSize, h: size });
      else       rects.push({ ...n, x: pos, y, w: size, h: rowSize });
      pos += size;
    });
    return horiz
      ? { x: x + rowSize, y, w: w - rowSize, h }
      : { x, y: y + rowSize, w, h: h - rowSize };
  }

  function place(nodes, x, y, w, h) {
    if (!nodes.length) return;
    if (nodes.length === 1) { rects.push({ ...nodes[0], x, y, w, h }); return; }

    const horiz = w >= h;
    const short = horiz ? h : w;
    let row = [], i = 0;

    while (i < nodes.length) {
      const next = nodes[i];
      const testRow = [...row, next];
      if (row.length === 0 || worst(testRow, short) <= worst(row, short)) {
        row = testRow; i++;
      } else {
        const rem = layoutRow(row, x, y, w, h, horiz);
        place(nodes.slice(i), rem.x, rem.y, rem.w, rem.h);
        return;
      }
    }
    layoutRow(row, x, y, w, h, horiz);
  }

  place(nodes, x, y, w, h);
  return rects;
}

// Heat color: green → yellow → orange → red based on rank (0=lowest, 1=highest)
function heatColor(rank) {
  // rank 0..1 where 1 = most spending
  if (rank < 0.25) return { bg: "#27ae60", text: "#fff", border: "#1e8449" }; // green
  if (rank < 0.50) return { bg: "#f39c12", text: "#fff", border: "#d68910" }; // yellow/orange
  if (rank < 0.75) return { bg: "#e67e22", text: "#fff", border: "#ca6f1e" }; // orange
  return { bg: "#c0392b", text: "#fff", border: "#a93226" };                  // red
}

// ── Category Treemap (heatmap style) ─────────────────────────────────
function CategoryTreemap({ categories, monthExp, total, onCatClick }) {
  const [hovered, setHovered] = useState(null);
  const [dims, setDims] = useState({ w: 320, h: 260 });
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      setDims({ w, h: Math.max(220, Math.min(320, w * 0.6)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = useMemo(() =>
    categories
      .map(c => ({ ...c, value: monthExp.filter(e => e.catId === c.id).reduce((s, e) => s + e.amount, 0) }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value),
    [categories, monthExp]
  );

  const rects = useMemo(() => {
    if (!items.length || !dims.w) return [];
    return squarify(items, 0, 0, dims.w, dims.h);
  }, [items, dims]);

  const maxVal = items[0]?.value || 1;
  const minVal = items[items.length - 1]?.value || 0;

  return (
    <Card style={{ marginBottom: 18 }} animate delay={320}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionLabel>Mapa de gastos</SectionLabel>
        {total > 0 && (
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {[["#27ae60","Bajo"],["#f39c12","Medio"],["#e67e22","Alto"],["#c0392b","Crítico"]].map(([c,l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: "inline-block" }}/>
                <span style={{ fontSize: 9, color: T.muted }}>{l}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div ref={containerRef} style={{ width: "100%", position: "relative", height: dims.h, borderRadius: 12, overflow: "hidden", background: "#1a1a1a" }}>
        {total === 0 ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 36 }}>🌿</span>
            <span style={{ color: T.subtle, fontSize: 14 }}>Agregá gastos para ver el mapa</span>
          </div>
        ) : rects.map((d, i) => {
          const isHov = hovered === d.id;
          const pct = (d.value / total * 100);
          // rank 0=lowest spend, 1=highest spend
          const rank = items.length > 1
            ? (d.value - minVal) / (maxVal - minVal)
            : 1;
          const colors = heatColor(rank);
          const showName = d.w > 52 && d.h > 36;
          const showAmt  = d.w > 58 && d.h > 52;
          const showPct  = d.w > 44 && d.h > 28;
          const showIcon = d.w > 28 && d.h > 24;
          const GAP = 2;
          return (
            <div key={d.id}
              onMouseEnter={() => setHovered(d.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onCatClick && onCatClick(d)}
              title={`${d.icon} ${d.name}: ${fmt(d.value)} (${pct.toFixed(1)}%)`}
              style={{
                position: "absolute",
                left:   d.x + GAP,
                top:    d.y + GAP,
                width:  Math.max(d.w - GAP * 2, 2),
                height: Math.max(d.h - GAP * 2, 2),
                background: isHov ? colors.border : colors.bg,
                border: `2px solid ${isHov ? "#fff" : colors.border}`,
                borderRadius: 8,
                cursor: "pointer",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                overflow: "hidden", padding: 4, boxSizing: "border-box",
                transition: "all .18s ease",
                transform: isHov ? "scale(1.03)" : "scale(1)",
                zIndex: isHov ? 3 : 1,
                boxShadow: isHov ? `0 4px 20px rgba(0,0,0,.4)` : "none",
                animation: `fadeIn .35s ${i * 25}ms both`,
              }}>
              {showIcon && <span style={{ fontSize: showName ? (d.w > 90 ? 20 : 14) : 10, lineHeight: 1, marginBottom: 1 }}>{d.icon}</span>}
              {showName && <span style={{ fontSize: d.w > 90 ? 11 : 9, color: colors.text, fontWeight: 700, textAlign: "center", lineHeight: 1.2, maxWidth: "95%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>}
              {showAmt  && <span style={{ fontSize: d.w > 90 ? 10 : 8, color: "rgba(255,255,255,.9)", fontWeight: 700, marginTop: 1 }}>{fmt(d.value)}</span>}
              {showPct  && <span style={{ fontSize: 8, color: "rgba(255,255,255,.7)", marginTop: 1 }}>{pct.toFixed(0)}%</span>}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 14px", marginTop: 10 }}>
        {items.map(d => {
          const rank = items.length > 1 ? (d.value - minVal) / (maxVal - minVal) : 1;
          const colors = heatColor(rank);
          return (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colors.bg, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: T.muted }}>{d.icon} {d.name} {(d.value / total * 100).toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Shopping List ─────────────────────────────────────────────────────
function ShoppingList({ categories, onAddExpense }) {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: "", qty: 1, price: "" });
  const [manualTotal, setManualTotal] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [catId, setCatId] = useState(categories[0]?.id || "");
  const [desc, setDesc] = useState("");
  const [done, setDone] = useState(false);

  const autoTotal = useMemo(() => items.reduce((s, i) => s + (i.price * i.qty), 0), [items]);
  const finalTotal = useManual ? Number(manualTotal) || 0 : autoTotal;

  const addItem = () => {
    if (!newItem.name.trim()) return;
    setItems(prev => [...prev, { id: Date.now(), ...newItem, price: Number(newItem.price) || 0, checked: false }]);
    setNewItem({ name: "", qty: 1, price: "" });
  };
  const toggleCheck = (id) => setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  const delItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const finishShopping = () => {
    if (!finalTotal || !catId) return;
    onAddExpense({ id: Date.now(), amount: finalTotal, catId: Number(catId), subCatId: null, desc: desc || "Lista de compras", date: today() });
    setItems([]); setManualTotal(""); setDesc(""); setDone(true);
    setTimeout(() => setDone(false), 3000);
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Agregar producto</SectionLabel>
        {/* Mobile-friendly grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 60px auto", gap: 8, marginBottom: 8 }}>
          <Inp label="Producto" placeholder="ej: Carne, Leche..." value={newItem.name}
            onChange={e => setNewItem(n => ({ ...n, name: e.target.value }))}
            style={{ marginBottom: 0 }} />
          <Inp label="Cant." type="number" value={newItem.qty}
            onChange={e => setNewItem(n => ({ ...n, qty: Number(e.target.value) || 1 }))}
            style={{ marginBottom: 0 }} />
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 0 }}>
            <Btn onClick={addItem} style={{ padding: "10px 16px", height: 42 }}>+</Btn>
          </div>
        </div>
        <AmountInp
          label="Precio unitario"
          value={newItem.price}
          onChange={v => setNewItem(n => ({ ...n, price: v }))}
          placeholder="0,00"
          inputStyle={{ fontSize: 15 }}
        />
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Lista ({items.length} productos)</SectionLabel>
        {items.length === 0
          ? <p style={{ color: T.subtle, fontSize: 13, textAlign: "center", padding: "22px 0" }}>Agregá productos para empezar</p>
          : items.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
              <input type="checkbox" checked={item.checked} onChange={() => toggleCheck(item.id)}
                style={{ width: 18, height: 18, cursor: "pointer", accentColor: T.accent, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, color: item.checked ? T.subtle : T.text, textDecoration: item.checked ? "line-through" : "none", fontWeight: 500 }}>{item.name}</span>
                <span style={{ fontSize: 12, color: T.subtle, marginLeft: 6 }}>×{item.qty}</span>
              </div>
              {item.price > 0 && <span style={{ fontSize: 14, fontWeight: 600, color: T.accent, whiteSpace: "nowrap" }}>{fmt(item.price * item.qty)}</span>}
              <button onClick={() => delItem(item.id)} style={{ background: "none", border: "none", color: T.subtle, cursor: "pointer", fontSize: 16, flexShrink: 0 }}
                onMouseEnter={e => e.target.style.color = T.warn} onMouseLeave={e => e.target.style.color = T.subtle}>✕</button>
            </div>
          ))
        }
        {items.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
            <span style={{ color: T.muted, fontSize: 14 }}>Subtotal</span>
            <span style={{ fontWeight: 700, fontSize: 16, color: T.accent }}>{fmt(autoTotal)}</span>
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>Finalizar compra</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setUseManual(false)} style={{ flex: 1, padding: "10px", borderRadius: 12, border: `1.5px solid ${!useManual ? T.accent : T.border}`, background: !useManual ? T.accentLt : "transparent", color: !useManual ? T.accent : T.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13 }}>🧮 Automático</button>
          <button onClick={() => setUseManual(true)} style={{ flex: 1, padding: "10px", borderRadius: 12, border: `1.5px solid ${useManual ? T.accent : T.border}`, background: useManual ? T.accentLt : "transparent", color: useManual ? T.accent : T.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13 }}>✏️ Manual</button>
        </div>
        {useManual && (
          <AmountInp
            label="Total gastado"
            value={manualTotal}
            onChange={v => setManualTotal(v)}
            placeholder="0,00"
          />
        )}
        <div style={{ background: T.accentLt, borderRadius: 14, padding: "14px 18px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: T.muted, fontSize: 14 }}>Total a registrar</span>
          <span style={{ fontWeight: 700, fontSize: 22, color: T.accent }}>{fmt(finalTotal)}</span>
        </div>
        <Sel label="Categoría del gasto" value={catId} onChange={e => setCatId(e.target.value)}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </Sel>
        <Inp label="Descripción (opcional)" placeholder="ej: Compra semanal" value={desc} onChange={e => setDesc(e.target.value)} />
        {done
          ? <div style={{ background: T.accentLt, border: `1px solid ${T.accentMd}`, borderRadius: 12, padding: "14px", textAlign: "center", color: T.accent, fontWeight: 700 }}>✅ ¡Compra registrada!</div>
          : <Btn onClick={finishShopping} style={{ width: "100%", padding: "13px" }}>Registrar compra</Btn>
        }
      </Card>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────
export default function App() {
  const [expenses, setExpenses]       = useState([]);
  const [categories, setCategories]   = useState(DEFAULT_CATS);
  const [budgets, setBudgets]         = useState({});
  const [currency, setCurrencyState]  = useState("ARS");
  const [modal, setModal]             = useState(null);
  const [view, setView]               = useState("dashboard");
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterMode, setFilterMode]   = useState("month");
  const [weekOffset, setWeekOffset]   = useState(0);
  const [filterYear, setFilterYear]   = useState(currentYear());
  const [filterDay, setFilterDay]     = useState(currentDay());
  const [selectedCat, setSelectedCat] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const e = await storage.get("expenses");   if (e) setExpenses(JSON.parse(e.value));
        const c = await storage.get("categories"); if (c) setCategories(JSON.parse(c.value));
        const b = await storage.get("budgets");    if (b) setBudgets(JSON.parse(b.value));
        const cur = await storage.get("currency"); if (cur) { setCurrencyState(cur.value); fmt = makeFmt(cur.value); }
      } catch {}
    })();
  }, []);

  const saveCurrency = (code) => { setCurrencyState(code); fmt = makeFmt(code); storage.set("currency", code).catch(() => {}); };

  const saveExpenses = (data) => { setExpenses(data); storage.set("expenses", JSON.stringify(data)).catch(() => {}); };
  const saveCats     = (data) => { setCategories(data); storage.set("categories", JSON.stringify(data)).catch(() => {}); };
  const saveBudgets  = (data) => { setBudgets(data); storage.set("budgets", JSON.stringify(data)).catch(() => {}); };

  const addExpense  = (exp) => saveExpenses([...expenses, exp]);
  const delExpense  = (id)  => saveExpenses(expenses.filter(e => e.id !== id));
  const editExpense = (upd) => saveExpenses(expenses.map(e => e.id === upd.id ? upd : e));

  const addCategoryInline = (cat, isUpdate = false) => {
    let updated;
    if (isUpdate) updated = categories.map(c => c.id === cat.id ? cat : c);
    else updated = [...categories, cat];
    saveCats(updated);
  };

  const catMap   = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const weekRange = useMemo(() => getWeekRange(weekOffset), [weekOffset]);

  const monthExp = useMemo(() => {
    if (filterMode === "week")  return expenses.filter(e => inRange(e.date, weekRange.from, weekRange.to));
    if (filterMode === "year")  return expenses.filter(e => e.date.startsWith(filterYear));
    if (filterMode === "day")   return expenses.filter(e => e.date === filterDay);
    return expenses.filter(e => monthOf(e.date) === filterMonth);
  }, [expenses, filterMonth, filterMode, weekRange, filterYear, filterDay]);

  const totalMonth   = useMemo(() => monthExp.reduce((s, e) => s + e.amount, 0), [monthExp]);
  const budgetTotal  = Number(budgets.__total) || 0;
  const budgetPeriod = budgets.__period || "month";
  const budgetRange  = useMemo(() => getBudgetPeriodRange(budgetPeriod), [budgetPeriod]);
  const budgetExp    = useMemo(() => expenses.filter(e => inRange(e.date, budgetRange.from, budgetRange.to)), [expenses, budgetRange]);
  const budgetSpent  = useMemo(() => budgetExp.reduce((s, e) => s + e.amount, 0), [budgetExp]);
  const overBudget   = budgetTotal > 0 && budgetSpent > budgetTotal;
  const pctUsed      = budgetTotal > 0 ? Math.min((budgetSpent / budgetTotal) * 100, 100) : 0;

  // ── catAlerts (single declaration) ───────────────────────────────────
  const catAlerts = useMemo(() => categories.filter(c => {
    const limit = Number(budgets[c.id]); if (!limit) return false;
    const spent = budgetExp.filter(e => e.catId === c.id).reduce((s, e) => s + e.amount, 0);
    return spent >= limit * 0.9;
  }), [categories, budgets, budgetExp]);

  const pieData = useMemo(() => {
    const acc = {}; monthExp.forEach(e => { acc[e.catId] = (acc[e.catId] || 0) + e.amount; });
    return Object.entries(acc).map(([id, val]) => ({ name: catMap[id]?.name || "?", value: val, color: catMap[id]?.color || T.accent }));
  }, [monthExp, catMap]);

  const barData = useMemo(() => {
    if (filterMode === "day") {
      return ["00-04","04-08","08-12","12-16","16-20","20-24"].map((label, i) => ({
        day: label, total: i === 0 ? monthExp.reduce((s, e) => s + e.amount, 0) : 0
      }));
    }
    if (filterMode === "week") {
      const days = []; const start = new Date(weekRange.from);
      for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d.toISOString().slice(0, 10)); }
      return days.map(d => ({ day: d.slice(5), total: expenses.filter(e => e.date === d).reduce((s, e) => s + e.amount, 0) }));
    }
    if (filterMode === "year") {
      const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
      return meses.map((name, i) => {
        const m = `${filterYear}-${String(i + 1).padStart(2, "0")}`;
        return { day: name, total: expenses.filter(e => monthOf(e.date) === m).reduce((s, e) => s + e.amount, 0) };
      });
    }
    const [yr, mo] = filterMonth.split("-").map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = `${filterMonth}-${String(i + 1).padStart(2, "0")}`;
      return { day: String(i + 1), total: expenses.filter(e => e.date === d).reduce((s, e) => s + e.amount, 0) };
    });
  }, [expenses, filterMode, filterMonth, filterYear, filterDay, weekRange, monthExp]);

  const months = useMemo(() => { const set = new Set(expenses.map(e => monthOf(e.date))); set.add(currentMonth()); return [...set].sort().reverse(); }, [expenses]);
  const years  = useMemo(() => { const set = new Set(expenses.map(e => e.date.slice(0, 4))); set.add(currentYear()); return [...set].sort().reverse(); }, [expenses]);

  const navStyle = (v) => ({ background: "none", border: "none", borderBottom: view === v ? `2px solid ${T.accent}` : "2px solid transparent", color: view === v ? T.accent : T.muted, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13, transition: "color .2s", whiteSpace: "nowrap" });

  const curInfo = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];

  return (
    <div style={{ minHeight: "100vh", background: `#3d7a3d url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100'%3E%3Cpath d='M28 66L0 50V16L28 0l28 16v34L28 66zm0 34L0 84V50l28-16 28 16v34L28 100z' fill='none' stroke='%2368b868' stroke-opacity='0.25' stroke-width='1'/%3E%3C/svg%3E")`, fontFamily: "'Plus Jakarta Sans',sans-serif", color: T.text }}>
      <GlobalStyles />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ background: T.accent, borderBottom: `1px solid ${T.border}`, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 56, flexWrap: "wrap", gap: 6 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/logo.png" alt="Mis Gastos" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />
          <span style={{ fontWeight: 800, fontSize: 16, color: T.yellow, letterSpacing: "-.3px" }}>Mis Gastos</span>
        </div>
        {/* Actions — sin + Gasto (ahora es FAB) */}
        <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "6px 0" }}>
          <button onClick={() => setModal("currency")}
            style={{ background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 10, padding: "6px 10px", color: "#fff", fontSize: 12, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <span>{curInfo.symbol}</span><span>{curInfo.code}</span><span style={{ opacity: .7, fontSize: 10 }}>▼</span>
          </button>
          <button onClick={() => setModal("cats")} style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 10, padding: "6px 10px", color: "#fff", fontSize: 12, fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>🏷️</button>
          <button onClick={() => setModal("budget")} style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 10, padding: "6px 10px", color: "#fff", fontSize: 12, fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>🎯</button>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <div style={{ background: T.accentLt, borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "0 12px", minWidth: "max-content" }}>
          {view !== "shopping" && (
            <>
              <div style={{ display: "flex", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", margin: "6px 0" }}>
                {[["day","Día"], ["week","Semana"], ["month","Mes"], ["year","Año"]].map(([m, l]) => (
                  <button key={m} onClick={() => setFilterMode(m)}
                    style={{ background: filterMode === m ? T.accent : "transparent", color: filterMode === m ? "#fff" : T.muted, border: "none", padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12, transition: "background .2s" }}>{l}</button>
                ))}
              </div>
              {filterMode === "month" && (
                <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                  style={{ marginLeft: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "5px 10px", color: T.text, fontSize: 12, fontFamily: "inherit" }}>
                  {months.map(m => <option key={m}>{m}</option>)}
                </select>
              )}
              {filterMode === "year" && (
                <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                  style={{ marginLeft: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "5px 10px", color: T.text, fontSize: 12, fontFamily: "inherit" }}>
                  {years.map(y => <option key={y}>{y}</option>)}
                </select>
              )}
              {filterMode === "day" && (
                <input type="date" value={filterDay} onChange={e => setFilterDay(e.target.value)}
                  style={{ marginLeft: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "5px 10px", color: T.text, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
              )}
              {filterMode === "week" && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 8 }}>
                  <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, padding: "4px 10px", cursor: "pointer", fontSize: 14 }}>‹</button>
                  <span style={{ color: T.muted, fontSize: 11, minWidth: 120, textAlign: "center" }}>{weekRange.from} → {weekRange.to}</span>
                  <button onClick={() => setWeekOffset(w => Math.min(w + 1, 0))} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, padding: "4px 10px", cursor: "pointer", fontSize: 14 }}>›</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div style={{ padding: "14px 12px 100px 12px", maxWidth: 960, margin: "0 auto" }}>

        {(overBudget || catAlerts.length > 0) && view !== "shopping" && (
          <div style={{ background: T.warnLt, border: `1px solid #f5c6c6`, borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
            <div style={{ fontSize: 13 }}>
              {overBudget && <p style={{ color: T.warn, margin: 0, fontWeight: 600 }}>Superaste el presupuesto {budgetRange.label} ({fmt(budgetSpent)} / {fmt(budgetTotal)})</p>}
              {catAlerts.map(c => { const spent = budgetExp.filter(e => e.catId === c.id).reduce((s, e) => s + e.amount, 0); const limit = Number(budgets[c.id]); return <p key={c.id} style={{ color: T.orange, margin: "4px 0 0" }}>{c.icon} {c.name}: {fmt(spent)} / {fmt(limit)}</p>; })}
            </div>
          </div>
        )}

        {/* ── Shopping ────────────────────────────────────────────── */}
        {view === "shopping" && <ShoppingList categories={categories} onAddExpense={addExpense} />}

        {/* ── Dashboard ───────────────────────────────────────────── */}
        {view === "dashboard" && (
          <>
            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
              {[
                { label: budgetTotal > 0 ? `Gastado ${budgetRange.label}` : "Gastado", val: fmt(budgetTotal > 0 ? budgetSpent : totalMonth), color: T.accent },
                { label: "Presupuesto", val: budgetTotal > 0 ? fmt(budgetTotal) : "Sin límite", color: T.accent },
                { label: "Disponible", val: budgetTotal > 0 ? fmt(Math.max(budgetTotal - budgetSpent, 0)) : "—", color: overBudget ? T.warn : T.accentMd },
                { label: "Transacciones", val: monthExp.length, color: T.accent },
              ].map((k, i) => (
                <div key={i} style={{ background: T.surface, borderRadius: 18, padding: "18px 16px", boxShadow: T.shadow, animation: `fadeSlideUp .45s cubic-bezier(.22,.68,0,1.2) ${i * 80}ms both`, transition: "box-shadow .2s, transform .2s", cursor: "default", textAlign: "center" }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = T.shadowLg; e.currentTarget.style.transform = "translateY(-3px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = T.shadow; e.currentTarget.style.transform = "none"; }}>
                  <p style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: .6, marginBottom: 10, textTransform: "uppercase" }}>{k.label}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <div style={{ width: 4, height: 26, borderRadius: 3, background: k.color, flexShrink: 0 }} />
                    <p style={{ fontSize: 18, fontWeight: 700, color: k.color, margin: 0, animation: `countUp .4s cubic-bezier(.22,.68,0,1.2) ${i * 80 + 150}ms both`, lineHeight: 1.2 }}>{k.val}</p>
                  </div>
                </div>
              ))}
            </div>

            <CategoryTreemap categories={categories} monthExp={monthExp} total={totalMonth} onCatClick={setSelectedCat} />

            {budgetTotal > 0 && (
              <Card animate delay={400} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>Presupuesto {budgetRange.label}</span>
                  <span style={{ fontSize: 13, color: overBudget ? T.warn : T.accent, fontWeight: 700 }}>{pctUsed.toFixed(0)}%</span>
                </div>
                <div style={{ fontSize: 11, color: T.subtle, marginBottom: 8 }}>{budgetRange.from} → {budgetRange.to}</div>
                <div style={{ height: 8, background: T.bg, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pctUsed}%`, background: overBudget ? T.warn : `linear-gradient(90deg,${T.accent},${T.accentMd})`, borderRadius: 4, transition: "width .4s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: T.muted }}>{fmt(budgetSpent)} gastado</span>
                  <span style={{ fontSize: 11, color: T.subtle }}>{fmt(budgetTotal)} límite</span>
                </div>
              </Card>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, marginBottom: 16 }}>
              <Card animate delay={500}>
                <SectionLabel>Por categoría</SectionLabel>
                {pieData.length === 0
                  ? <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", color: T.subtle, fontSize: 13 }}>Sin datos</div>
                  : <ResponsiveContainer width="100%" height={150}><PieChart><Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={65} paddingAngle={4}>{pieData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip content={<CTooltip />} /></PieChart></ResponsiveContainer>
                }
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 8 }}>
                  {pieData.map((d, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, display: "inline-block" }} /><span style={{ fontSize: 11, color: T.muted }}>{d.name}</span></div>)}
                </div>
              </Card>
              <Card animate delay={600}>
                <SectionLabel>{filterMode === "day" ? "Total del día" : filterMode === "week" ? "Por día de semana" : filterMode === "year" ? "Por mes" : "Por día del mes"}</SectionLabel>
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={barData} barSize={filterMode === "year" ? 18 : filterMode === "month" ? 8 : 12}>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: T.subtle }} axisLine={false} tickLine={false} interval={filterMode === "month" ? 2 : 0} />
                    <YAxis hide />
                    <Tooltip content={<CTooltip />} cursor={{ fill: `${T.accent}11` }} />
                    <Bar dataKey="total" fill={T.accent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {categories.filter(c => Number(budgets[c.id]) > 0).length > 0 && (
              <Card style={{ marginBottom: 16 }}>
                <SectionLabel>Presupuestos por categoría</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
                  {categories.filter(c => Number(budgets[c.id]) > 0).map(c => {
                    const limit = Number(budgets[c.id]);
                    const spent = monthExp.filter(e => e.catId === c.id).reduce((s, e) => s + e.amount, 0);
                    const pct = Math.min((spent / limit) * 100, 100); const over = spent > limit;
                    return (
                      <div key={c.id} style={{ padding: "12px", background: T.bg, borderRadius: 14, border: `1px solid ${over ? "#f5c6c6" : T.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{c.icon} {c.name}</span>
                          <span style={{ fontSize: 11, color: over ? T.warn : T.muted, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: over ? T.warn : c.color, borderRadius: 3, transition: "width .4s" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                          <span style={{ fontSize: 11, color: T.muted }}>{fmt(spent)}</span>
                          <span style={{ fontSize: 11, color: T.subtle }}>{fmt(limit)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <Card>
              <SectionLabel>Últimos gastos</SectionLabel>
              {monthExp.length === 0
                ? <p style={{ color: T.subtle, fontSize: 14, textAlign: "center", padding: "22px 0" }}>No hay gastos en este período</p>
                : [...monthExp].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(e => { const cat = catMap[e.catId]; return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: cat?.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{cat?.icon || "💰"}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.desc || cat?.name || "Gasto"}</p>
                      <p style={{ margin: 0, fontSize: 11, color: T.muted }}>{e.date}</p>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.accent, whiteSpace: "nowrap" }}>{fmt(e.amount)}</span>
                  </div>
                ); })
              }
            </Card>
          </>
        )}

        {/* ── History ─────────────────────────────────────────────── */}
        {view === "history" && (
          <Card>
            <SectionLabel>Historial</SectionLabel>
            {monthExp.length === 0
              ? <p style={{ color: T.subtle, fontSize: 14, textAlign: "center", padding: "32px 0" }}>No hay gastos en este período</p>
              : [...monthExp].sort((a, b) => b.date.localeCompare(a.date)).map(e => {
                const cat = catMap[e.catId]; const sub = cat?.subcats?.find(s => s.id === e.subCatId);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: cat?.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{cat?.icon || "💰"}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.desc || cat?.name || "Gasto"}</p>
                      <p style={{ margin: 0, fontSize: 11, color: T.muted }}>{cat?.name}{sub ? ` › ${sub.name}` : ""} · {e.date}</p>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.accent, whiteSpace: "nowrap" }}>{fmt(e.amount)}</span>
                    <button onClick={() => setEditingExpense(e)} style={{ background: "none", border: "none", color: T.subtle, cursor: "pointer", fontSize: 15, padding: "0 4px", borderRadius: 6, flexShrink: 0 }}
                      onMouseEnter={e => e.target.style.color = T.accent} onMouseLeave={e => e.target.style.color = T.subtle}>✏️</button>
                    <button onClick={() => delExpense(e.id)} style={{ background: "none", border: "none", color: T.subtle, cursor: "pointer", fontSize: 15, padding: "0 4px", borderRadius: 6, flexShrink: 0 }}
                      onMouseEnter={e => e.target.style.color = T.warn} onMouseLeave={e => e.target.style.color = T.subtle}>✕</button>
                  </div>
                );
              })
            }
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
              <span style={{ color: T.muted, fontSize: 14 }}>Total</span>
              <span style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{fmt(totalMonth)}</span>
            </div>
          </Card>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────── */}
      {modal === "add"      && <ExpenseModal categories={categories} onSave={addExpense} onClose={() => setModal(null)} onAddCategory={addCategoryInline} />}
      {modal === "budget"   && <BudgetModal budgets={budgets} categories={categories} onSave={saveBudgets} onClose={() => setModal(null)} />}
      {modal === "cats"     && <CatModal categories={categories} onChange={saveCats} onClose={() => setModal(null)} />}
      {modal === "currency" && <CurrencyModal currency={currency} onSave={saveCurrency} onClose={() => setModal(null)} />}
      {selectedCat          && <CatDetailModal cat={selectedCat} expenses={monthExp} onClose={() => setSelectedCat(null)} />}
      {editingExpense        && <ExpenseModal expense={editingExpense} categories={categories} onSave={editExpense} onClose={() => setEditingExpense(null)} onAddCategory={addCategoryInline} />}

      {/* ── Bottom Nav + FAB ──────────────────────────────────────── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: T.surface, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "8px 0 max(8px, env(safe-area-inset-bottom))", boxShadow: "0 -4px 20px rgba(45,106,45,.12)" }}>

        {/* Dashboard */}
        <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 16px", borderRadius: 12, transition: "transform .15s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "none"}>
          <span style={{ fontSize: 20 }}>📊</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: view === "dashboard" ? T.accent : T.muted, fontFamily: "inherit" }}>Inicio</span>
          {view === "dashboard" && <div style={{ width: 4, height: 4, borderRadius: 2, background: T.accent, marginTop: -2 }} />}
        </button>

        {/* Historial */}
        <button onClick={() => setView("history")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 16px", borderRadius: 12, transition: "transform .15s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "none"}>
          <span style={{ fontSize: 20 }}>📋</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: view === "history" ? T.accent : T.muted, fontFamily: "inherit" }}>Historial</span>
          {view === "history" && <div style={{ width: 4, height: 4, borderRadius: 2, background: T.accent, marginTop: -2 }} />}
        </button>

        {/* FAB ── center */}
        <button onClick={() => setModal("add")}
          style={{ background: T.yellow, border: "none", borderRadius: "50%", width: 60, height: 60, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: T.accent, boxShadow: `0 4px 18px rgba(244,196,48,.5)`, transition: "transform .15s, box-shadow .15s", marginTop: -20, flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = `0 8px 28px rgba(244,196,48,.65)`; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = `0 4px 18px rgba(244,196,48,.5)`; }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(.95)"}
          onMouseUp={e => e.currentTarget.style.transform = "scale(1.1)"}>
          +
        </button>

        {/* Compras */}
        <button onClick={() => setView("shopping")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 16px", borderRadius: 12, transition: "transform .15s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "none"}>
          <span style={{ fontSize: 20 }}>🛒</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: view === "shopping" ? T.accent : T.muted, fontFamily: "inherit" }}>Compras</span>
          {view === "shopping" && <div style={{ width: 4, height: 4, borderRadius: 2, background: T.accent, marginTop: -2 }} />}
        </button>

        {/* Excel */}
        <button onClick={() => exportCSV(monthExp, catMap)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 16px", borderRadius: 12, transition: "transform .15s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "none"}>
          <span style={{ fontSize: 20 }}>📥</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, fontFamily: "inherit" }}>Excel</span>
        </button>

      </div>
    </div>
  );
}
