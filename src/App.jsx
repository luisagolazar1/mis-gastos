import { storage } from "./firebase.js";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";

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
  0%,100% { box-shadow: 0 4px 18px rgba(26,188,156,.5); }
  50%      { box-shadow: 0 4px 28px rgba(26,188,156,.8); }
}
`;

function GlobalStyles() { return <style>{ANIM_STYLES}</style>; }

const T = {
  bg: "#c8e6c8", surface: "#e8f5e8", border: "#a5d0a5", text: "#1a3a1a",
  muted: "#4a7a4a", subtle: "#7aaa7a", accent: "#2d6a2d", accentLt: "#d4ead4",
  accentMd: "#4a9a4a", warn: "#c0392b", warnLt: "#fdecea", orange: "#d35400",
  yellow: "#f4c430", shadow: "0 2px 12px rgba(45,106,45,.12)", shadowLg: "0 8px 32px rgba(45,106,45,.18)",
};

const PALETTE = ["#e74c3c","#3498db","#f39c12","#9b59b6","#1abc9c","#e67e22","#2ecc71","#e91e63","#00bcd4","#ff5722"];

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
  const esc = (val) => {
    const s = String(val ?? "");
    return s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Fecha", "Categoría", "Subcategoría", "Descripción", "Monto"]];
  [...expenses].sort((a, b) => b.date.localeCompare(a.date)).forEach(e => {
    const cat = catMap[e.catId];
    const sub = cat?.subcats?.find(s => s.id === e.subCatId);
    const amountStr = Number(e.amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    rows.push([e.date, cat?.name || "Sin categoría", sub?.name || "", e.desc || "", amountStr]);
  });
  const csv = rows.map(r => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `mis-gastos-${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
};

const DEFAULT_CATS = [
  { id: 1, name: "Comida",          color: PALETTE[0], icon: "comida",   subcats: [] },
  { id: 2, name: "Transporte",      color: PALETTE[1], icon: "auto",     subcats: [] },
  { id: 3, name: "Entretenimiento", color: PALETTE[2], icon: "musica",   subcats: [] },
  { id: 4, name: "Salud",           color: PALETTE[3], icon: "salud",    subcats: [] },
  { id: 5, name: "Ropa",            color: PALETTE[4], icon: "ropa",     subcats: [] },
  { id: 6, name: "Hogar",           color: PALETTE[5], icon: "hogar",    subcats: [] },
];

// ── iOS-style category icons (69 total) ──────────────────────────────
// Each: { g:[grad1,grad2], el: JSX SVG content on 24×24 viewbox }
const I = { s:"white", w:"2.2", lc:"round", lj:"round" }; // shorthand
const CAT_ICONS = {
  // ── COMIDA Y BEBIDA (10) ──────────────────────────────────────────
  comida:      { g:["#FF6B35","#E83400"], el:<><line x1="8" y1="1" x2="8" y2="23" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><path d="M5 1v7a3 3 0 003 3v12" fill="none" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><line x1="19" y1="1" x2="19" y2="23" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><path d="M16 1v8h6V1" fill="none" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/></> },
  cafe:        { g:["#8B572A","#5C3317"], el:<><path d="M5 8h14v8a5 5 0 01-5 5H10a5 5 0 01-5-5V8z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M19 10h2a2 2 0 010 4h-2" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M9 5c0-2 1.5-3 1.5-4M13 5c0-2 1.5-3 1.5-4" fill="none" stroke={I.s} strokeWidth="1.8"/></> },
  cerveza:     { g:["#F5A623","#D4880A"], el:<><path d="M7 6h10l-1 15H8L7 6z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M17 10h3a1 1 0 010 6h-3" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M7 6c0-2 1-3 5-3s5 1 5 3" fill="none" stroke={I.s} strokeWidth={I.w}/></> },
  vino:        { g:["#9B2335","#6B0F1A"], el:<><path d="M8 2h8s2 4 2 7a6 6 0 01-12 0c0-3 2-7 2-7z" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="12" y1="15" x2="12" y2="22" stroke={I.s} strokeWidth={I.w}/><line x1="8" y1="22" x2="16" y2="22" stroke={I.s} strokeWidth={I.w}/></> },
  pizza:       { g:["#E53935","#B71C1C"], el:<><path d="M12 2L22 20H2L12 2z" fill="none" stroke={I.s} strokeWidth={I.w}/><circle cx="12" cy="14" r="2" fill={I.s} opacity=".8"/><circle cx="8" cy="16" r="1.3" fill={I.s} opacity=".8"/><circle cx="16" cy="16" r="1.3" fill={I.s} opacity=".8"/></> },
  hamburguesa: { g:["#D4880A","#9A6200"], el:<><path d="M5 8h14a5 5 0 00-14 0z" fill={I.s} opacity=".9"/><rect x="4" y="11" width="16" height="2.5" rx="1" fill={I.s} opacity=".7"/><rect x="4" y="15" width="16" height="2" rx="1" fill={I.s} opacity=".5"/><path d="M5 17h14a1 1 0 011 1v1a2 2 0 01-2 2H6a2 2 0 01-2-2v-1a1 1 0 011-1z" fill={I.s} opacity=".9"/></> },
  ensalada:    { g:["#27AE60","#1A7A40"], el:<><path d="M4 18c0-4 3-10 8-10s8 6 8 10H4z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M12 8V4M9 9L7 6M15 9l2-3" fill="none" stroke={I.s} strokeWidth="2"/><line x1="4" y1="18" x2="20" y2="18" stroke={I.s} strokeWidth={I.w}/></> },
  postre:      { g:["#E91E8C","#B5116A"], el:<><path d="M6 14h12v5a3 3 0 01-3 3H9a3 3 0 01-3-3v-5z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M6 14c0-4 6-6 6-10 0 4 6 6 6 10" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="12" y1="4" x2="12" y2="2" stroke={I.s} strokeWidth="2"/></> },
  mercado:     { g:["#16A085","#0A6B59"], el:<><path d="M4 6h16l-2 12H6L4 6z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M4 6l-1-4H1" fill="none" stroke={I.s} strokeWidth={I.w}/><circle cx="9" cy="21" r="1.5" fill={I.s}/><circle cx="16" cy="21" r="1.5" fill={I.s}/><path d="M8 10h8M8 13h6" stroke={I.s} strokeWidth="1.5"/></> },
  restaurante: { g:["#E74C3C","#B71C1C"], el:<><path d="M4 6v4a8 8 0 0016 0V6" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="12" y1="18" x2="12" y2="22" stroke={I.s} strokeWidth={I.w}/><line x1="8" y1="22" x2="16" y2="22" stroke={I.s} strokeWidth={I.w}/><line x1="4" y1="6" x2="20" y2="6" stroke={I.s} strokeWidth={I.w}/></> },
  // ── TRANSPORTE (8) ───────────────────────────────────────────────
  auto:        { g:["#3498DB","#1A6FA8"], el:<><path d="M3 12l2-5h14l2 5v5H3v-5z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M7 7l1-3h8l1 3" fill="none" stroke={I.s} strokeWidth="2"/><circle cx="7" cy="17" r="2" fill={I.s} opacity=".8"/><circle cx="17" cy="17" r="2" fill={I.s} opacity=".8"/></> },
  colectivo:   { g:["#2980B9","#1A5C80"], el:<><rect x="3" y="5" width="18" height="13" rx="3" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="3" y1="11" x2="21" y2="11" stroke={I.s} strokeWidth="2"/><circle cx="7" cy="20" r="2" fill={I.s} opacity=".8"/><circle cx="17" cy="20" r="2" fill={I.s} opacity=".8"/><rect x="6" y="7" width="4" height="3" rx="1" fill={I.s} opacity=".7"/><rect x="14" y="7" width="4" height="3" rx="1" fill={I.s} opacity=".7"/></> },
  avion:       { g:["#5C9BD6","#2962A8"], el:<><path d="M21 16l-9-5-9 5 2-8 7 4 7-4 2 8z" fill="none" stroke={I.s} strokeWidth="2"/><path d="M12 11V3" stroke={I.s} strokeWidth={I.w}/><path d="M5 19l7-3 7 3" fill="none" stroke={I.s} strokeWidth="2"/></> },
  tren:        { g:["#546E7A","#263238"], el:<><rect x="5" y="3" width="14" height="14" rx="4" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="5" y1="10" x2="19" y2="10" stroke={I.s} strokeWidth="2"/><circle cx="8.5" cy="14" r="1.5" fill={I.s} opacity=".8"/><circle cx="15.5" cy="14" r="1.5" fill={I.s} opacity=".8"/><path d="M7 20l2-3M17 20l-2-3" stroke={I.s} strokeWidth="2" strokeLinecap={I.lc}/></> },
  bicicleta:   { g:["#27AE60","#1A7A40"], el:<><circle cx="6" cy="16" r="5" fill="none" stroke={I.s} strokeWidth="2"/><circle cx="18" cy="16" r="5" fill="none" stroke={I.s} strokeWidth="2"/><path d="M6 16l5-8 2 4h4" fill="none" stroke={I.s} strokeWidth="2"/><path d="M10 16l2-8" fill="none" stroke={I.s} strokeWidth="2"/></> },
  taxi:        { g:["#F5A623","#D4880A"], el:<><path d="M3 12l2-5h14l2 5v5H3v-5z" fill="none" stroke={I.s} strokeWidth={I.w}/><rect x="7" y="5" width="10" height="2.5" rx="1" fill={I.s} opacity=".8"/><circle cx="7" cy="17" r="2" fill={I.s} opacity=".8"/><circle cx="17" cy="17" r="2" fill={I.s} opacity=".8"/></> },
  combustible: { g:["#E67E22","#A04000"], el:<><path d="M5 22V6a2 2 0 012-2h6a2 2 0 012 2v16" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="5" y1="22" x2="15" y2="22" stroke={I.s} strokeWidth={I.w}/><path d="M15 8h2a2 2 0 012 2v4l1 2v2a1 1 0 01-2 0v-2l-1-2V10h-2" fill="none" stroke={I.s} strokeWidth="2"/></> },
  barco:       { g:["#0288D1","#01579B"], el:<><path d="M4 18l8-14 8 14H4z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M2 18c2 3 4 4 10 4s8-1 10-4" fill="none" stroke={I.s} strokeWidth="2"/><line x1="12" y1="4" x2="12" y2="12" stroke={I.s} strokeWidth="2"/></> },
  // ── SALUD (7) ────────────────────────────────────────────────────
  salud:       { g:["#E74C3C","#B71C1C"], el:<><path d="M12 21s-8-5.5-8-11a5 5 0 0110 0 5 5 0 0110 0c0 5.5-8 11-8 11z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M9 10h6M12 7v6" stroke={I.s} strokeWidth="2"/></> },
  medicamento: { g:["#E91E63","#880E4F"], el:<><rect x="4.5" y="9.5" width="15" height="7" rx="3.5" fill="none" stroke={I.s} strokeWidth={I.w} transform="rotate(-45 12 13)"/><line x1="8.5" y1="8.5" x2="15.5" y2="15.5" stroke={I.s} strokeWidth="2"/></> },
  hospital:    { g:["#C62828","#8B0000"], el:<><rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M9 12h6M12 9v6" stroke={I.s} strokeWidth="2.5"/></> },
  dental:      { g:["#00BCD4","#00838F"], el:<><path d="M8 2c-2 0-5 1.5-5 6 0 3 1 7 3 9 1 1 2 1 3-1l1-3 1 3c1 2 2 2 3 1 2-2 3-6 3-9 0-4.5-3-6-5-6-1 0-2 .5-2 .5S9 2 8 2z" fill="none" stroke={I.s} strokeWidth="2"/></> },
  gimnasio:    { g:["#7B1FA2","#4A0072"], el:<><line x1="6" y1="12" x2="18" y2="12" stroke={I.s} strokeWidth="2.5"/><rect x="2" y="10" width="4" height="4" rx="2" fill={I.s} opacity=".8"/><rect x="18" y="10" width="4" height="4" rx="2" fill={I.s} opacity=".8"/></> },
  deporte:     { g:["#2ECC71","#1A8A4A"], el:<><circle cx="12" cy="12" r="9" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M12 3c0 3-2 5-5 6M12 3c0 3 2 5 5 6M3 12c3 0 5 2 6 5M21 12c-3 0-5 2-6 5" fill="none" stroke={I.s} strokeWidth="1.8"/></> },
  corrida:     { g:["#FF6B35","#E83400"], el:<><circle cx="15" cy="4" r="2" fill={I.s} opacity=".9"/><path d="M12 8l-3 8M9 16l-3 5M12 8l4 4-2 5" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M6 21h4M14 17h4" stroke={I.s} strokeWidth="2" strokeLinecap={I.lc}/></> },
  // ── ENTRETENIMIENTO (8) ──────────────────────────────────────────
  videojuego:  { g:["#9C27B0","#4A0072"], el:<><rect x="2" y="8" width="20" height="10" rx="4" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M7 12v2M6 13h2" stroke={I.s} strokeWidth="2" strokeLinecap={I.lc}/><circle cx="16" cy="12" r="1.2" fill={I.s}/><circle cx="18" cy="14" r="1.2" fill={I.s}/></> },
  musica:      { g:["#E91E63","#880E4F"], el:<><path d="M9 18V6l12-2v12" fill="none" stroke={I.s} strokeWidth={I.w}/><circle cx="7" cy="18" r="3" fill="none" stroke={I.s} strokeWidth="2"/><circle cx="19" cy="16" r="3" fill="none" stroke={I.s} strokeWidth="2"/></> },
  cine:        { g:["#37474F","#102027"], el:<><rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M2 8h20M2 16h20" stroke={I.s} strokeWidth="1.5"/><rect x="2" y="5" width="3" height="3" fill={I.s} opacity=".5"/><rect x="19" y="5" width="3" height="3" fill={I.s} opacity=".5"/><path d="M9 11l5 2.5L9 16V11z" fill={I.s} opacity=".9"/></> },
  television:  { g:["#1565C0","#0D47A1"], el:<><rect x="2" y="4" width="20" height="14" rx="2" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M8 20h8M12 18v2" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><path d="M9 10l4 2.5L9 15V10z" fill={I.s} opacity=".9"/></> },
  fotografia:  { g:["#607D8B","#263238"], el:<><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" fill="none" stroke={I.s} strokeWidth={I.w}/><circle cx="12" cy="13" r="4" fill="none" stroke={I.s} strokeWidth="2"/></> },
  libros:      { g:["#FF9800","#E65100"], el:<><path d="M4 19V5a2 2 0 012-2h12a2 2 0 012 2v14" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M4 19a2 2 0 002 2h12a2 2 0 002-2H4z" fill={I.s} opacity=".3"/><line x1="9" y1="7" x2="15" y2="7" stroke={I.s} strokeWidth="2"/><line x1="9" y1="11" x2="15" y2="11" stroke={I.s} strokeWidth="1.5"/></> },
  auriculares: { g:["#7986CB","#283593"], el:<><path d="M3 18v-6a9 9 0 0118 0v6" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M21 18a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 18a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" fill="none" stroke={I.s} strokeWidth="2"/></> },
  teatro:      { g:["#D81B60","#880E4F"], el:<><path d="M8 3s-4 1-4 7 4 9 8 9 8-3 8-9-4-7-4-7" fill="none" stroke={I.s} strokeWidth="2"/><path d="M9 10s1 2 4 2 4-2 4-2M9 7.5h.01M15 7.5h.01" stroke={I.s} strokeWidth="2"/></> },
  // ── COMPRAS (6) ──────────────────────────────────────────────────
  bolsa:       { g:["#E91E63","#880E4F"], el:<><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="3" y1="6" x2="21" y2="6" stroke={I.s} strokeWidth="2"/><path d="M16 10a4 4 0 01-8 0" fill="none" stroke={I.s} strokeWidth="2"/></> },
  ropa:        { g:["#9C27B0","#4A0072"], el:<><path d="M20.38 3.46L16 2l-4 4-4-4L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 001 .74H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 001-.74l.58-3.57a2 2 0 00-1.35-2.23z" fill="none" stroke={I.s} strokeWidth="2"/></> },
  zapatillas:  { g:["#E53935","#B71C1C"], el:<><path d="M3 14s1-2 3-2 3 1 6 0 7-4 7-4v3s-3 5-7 5-5-2-7-1l-2 4v-5z" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="9" y1="12" x2="9" y2="16" stroke={I.s} strokeWidth="1.5"/><line x1="13" y1="10" x2="13" y2="14" stroke={I.s} strokeWidth="1.5"/></> },
  regalo:      { g:["#F06292","#C2185B"], el:<><rect x="3" y="10" width="18" height="12" rx="1" fill="none" stroke={I.s} strokeWidth={I.w}/><rect x="3" y="6" width="18" height="4" rx="1" fill="none" stroke={I.s} strokeWidth="2"/><line x1="12" y1="6" x2="12" y2="22" stroke={I.s} strokeWidth="2"/><path d="M12 6s-2-3.5 0-3.5 0 3.5 0 3.5M12 6s2-3.5 0-3.5" fill="none" stroke={I.s} strokeWidth="1.8"/></> },
  joyeria:     { g:["#7B1FA2","#4A0072"], el:<><path d="M6 3h12l4 6-10 12L2 9l4-6z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M2 9h20M6 3l3 6h6l3-6" fill="none" stroke={I.s} strokeWidth="1.8"/></> },
  electronica: { g:["#0288D1","#01579B"], el:<><rect x="2" y="4" width="14" height="10" rx="2" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M16 9h3l3 3v4h-6V9z" fill="none" stroke={I.s} strokeWidth="2"/><circle cx="19" cy="16" r="1.5" fill={I.s} opacity=".8"/><line x1="2" y1="14" x2="16" y2="14" stroke={I.s} strokeWidth="1.5"/></> },
  // ── HOGAR (8) ────────────────────────────────────────────────────
  hogar:       { g:["#E67E22","#A04000"], el:<><path d="M3 12L12 3l9 9" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M5 12v9h14v-9" fill="none" stroke={I.s} strokeWidth={I.w}/><rect x="9" y="15" width="6" height="6" rx="1" fill={I.s} opacity=".7"/></> },
  herramientas:{ g:["#607D8B","#263238"], el:<><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" fill="none" stroke={I.s} strokeWidth={I.w}/></> },
  limpieza:    { g:["#00ACC1","#006064"], el:<><path d="M14 12l-8.5 8.5a2.12 2.12 0 01-3-3L11 9" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M11 9l5-5 6 4-5 5" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M21.5 5.5L18 2" stroke={I.s} strokeWidth="2"/></> },
  electricidad:{ g:["#FDD835","#F57F17"], el:<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="none" stroke={I.s} strokeWidth={I.w}/> },
  llave:       { g:["#78909C","#37474F"], el:<><circle cx="7.5" cy="15.5" r="5.5" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3M19 6l2 2" fill="none" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/></> },
  jardin:      { g:["#43A047","#1B5E20"], el:<><path d="M12 22V12M12 12S8 10 6 6c3 0 5 1 6 3M12 12s4-2 6-6c-3 0-5 1-6 3" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M12 18s-3-1-5-4c2.5 0 4 1 5 2M12 18s3-1 5-4c-2.5 0-4 1-5 2" fill="none" stroke={I.s} strokeWidth="1.8"/></> },
  internet:    { g:["#2196F3","#0D47A1"], el:<><circle cx="12" cy="12" r="10" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" fill="none" stroke={I.s} strokeWidth="1.8"/></> },
  muebles:     { g:["#A1887F","#5D4037"], el:<><path d="M2 9h20v4H2V9z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M4 13v6M20 13v6" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><path d="M2 9V6a2 2 0 012-2h16a2 2 0 012 2v3" fill="none" stroke={I.s} strokeWidth="2"/></> },
  // ── FINANZAS (7) ─────────────────────────────────────────────────
  dinero:      { g:["#2ECC71","#1A8A4A"], el:<><rect x="2" y="6" width="20" height="14" rx="2" fill="none" stroke={I.s} strokeWidth={I.w}/><circle cx="12" cy="13" r="3" fill="none" stroke={I.s} strokeWidth="2"/><path d="M2 10h3M19 10h3M2 16h3M19 16h3" stroke={I.s} strokeWidth="1.8"/></> },
  tarjeta:     { g:["#1976D2","#0D47A1"], el:<><rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="2" y1="10" x2="22" y2="10" stroke={I.s} strokeWidth="2.5"/><line x1="6" y1="15" x2="10" y2="15" stroke={I.s} strokeWidth="2"/><rect x="14" y="13.5" width="5" height="3" rx="1" fill={I.s} opacity=".5"/></> },
  banco:       { g:["#5C6BC0","#283593"], el:<><path d="M3 22h18M3 10h18M5 10V22M12 10V22M19 10V22" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><path d="M2 10L12 2l10 8H2z" fill={I.s} opacity=".3" stroke={I.s} strokeWidth="2"/></> },
  ahorro:      { g:["#FF9800","#E65100"], el:<><path d="M19 5c-1.5 0-2.8.6-3.9 1.5A5 5 0 005 10v2H2l3 3.5L2 19h8v-1a5 5 0 004.9-6c.7.1 1.4.1 2.1 0A4 4 0 0021 8V7a4 4 0 00-2-2z" fill="none" stroke={I.s} strokeWidth="2"/><circle cx="16" cy="9" r="1" fill={I.s}/></> },
  inversion:   { g:["#26C6DA","#00838F"], el:<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" fill="none" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc} strokeLinejoin={I.lj}/><polyline points="17 6 23 6 23 12" fill="none" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/></> },
  impuestos:   { g:["#78909C","#37474F"], el:<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="none" stroke={I.s} strokeWidth={I.w}/><polyline points="14 2 14 8 20 8" fill="none" stroke={I.s} strokeWidth="2"/><line x1="9" y1="13" x2="15" y2="13" stroke={I.s} strokeWidth="2"/><line x1="9" y1="17" x2="12" y2="17" stroke={I.s} strokeWidth="2"/></> },
  billetera:   { g:["#66BB6A","#2E7D32"], el:<><path d="M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M16 14h.01" stroke={I.s} strokeWidth="3" strokeLinecap={I.lc}/><path d="M22 10H17a2 2 0 000 4h5" fill="none" stroke={I.s} strokeWidth="2"/></> },
  // ── EDUCACIÓN (5) ────────────────────────────────────────────────
  educacion:   { g:["#5C9BD6","#1A3F6F"], el:<><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M6 12v5c3 3 9 3 12 0v-5" fill="none" stroke={I.s} strokeWidth={I.w}/></> },
  estudio:     { g:["#FF9800","#E65100"], el:<><path d="M4 19V5a2 2 0 012-2h12a2 2 0 012 2v14H4z" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="4" y1="19" x2="20" y2="19" stroke={I.s} strokeWidth="2"/><line x1="9" y1="8" x2="15" y2="8" stroke={I.s} strokeWidth="2"/><line x1="9" y1="12" x2="15" y2="12" stroke={I.s} strokeWidth="1.5"/></> },
  lapiz:       { g:["#FDD835","#F9A825"], el:<><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" fill="none" stroke={I.s} strokeWidth={I.w}/></> },
  diploma:     { g:["#AB47BC","#6A1B9A"], el:<><path d="M4 4h16v12H4z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M12 16v6M9 22h6" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><path d="M9 8h6M9 11h4" stroke={I.s} strokeWidth="1.8"/></> },
  laboratorio: { g:["#26A69A","#004D40"], el:<><path d="M9 3v8l-4 8h14L15 11V3M9 3h6" fill="none" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><circle cx="10" cy="16" r="1" fill={I.s}/><circle cx="13" cy="18" r="1" fill={I.s}/></> },
  // ── PERSONAL (4) ────────────────────────────────────────────────
  persona:     { g:["#5C9BD6","#2962A8"], el:<><circle cx="12" cy="7" r="4" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M4 21v-1a8 8 0 0116 0v1" fill="none" stroke={I.s} strokeWidth={I.w}/></> },
  familia:     { g:["#EF5350","#B71C1C"], el:<><circle cx="7" cy="6" r="3" fill="none" stroke={I.s} strokeWidth="2"/><circle cx="17" cy="6" r="3" fill="none" stroke={I.s} strokeWidth="2"/><circle cx="12" cy="14" r="2.5" fill="none" stroke={I.s} strokeWidth="2"/><path d="M1 21a6 6 0 0112 0M11 21a6 6 0 0112 0" fill="none" stroke={I.s} strokeWidth="1.8"/></> },
  mascota:     { g:["#8D6E63","#4E342E"], el:<><circle cx="12" cy="13" r="6" fill="none" stroke={I.s} strokeWidth={I.w}/><circle cx="6.5" cy="6.5" r="2.5" fill="none" stroke={I.s} strokeWidth="2"/><circle cx="17.5" cy="6.5" r="2.5" fill="none" stroke={I.s} strokeWidth="2"/><path d="M10 17s1 2 2 0M9 15h.01M15 15h.01" stroke={I.s} strokeWidth="2" strokeLinecap={I.lc}/></> },
  bebe:        { g:["#F48FB1","#C2185B"], el:<><circle cx="12" cy="9" r="6" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M10 10h.01M14 10h.01" stroke={I.s} strokeWidth="3" strokeLinecap={I.lc}/><path d="M10 13a3 3 0 004 0" fill="none" stroke={I.s} strokeWidth="2"/><path d="M18 18s-3 4-6 4-6-4-6-4" fill="none" stroke={I.s} strokeWidth="2"/></> },
  // ── VIAJES (6) ──────────────────────────────────────────────────
  viaje:       { g:["#00ACC1","#006064"], el:<><circle cx="12" cy="12" r="10" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="2" y1="12" x2="22" y2="12" stroke={I.s} strokeWidth="1.8"/><path d="M12 2a15 15 0 010 20M12 2a15 15 0 000 20" fill="none" stroke={I.s} strokeWidth="1.8"/></> },
  mapa:        { g:["#66BB6A","#2E7D32"], el:<><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="8" y1="2" x2="8" y2="18" stroke={I.s} strokeWidth="1.8"/><line x1="16" y1="6" x2="16" y2="22" stroke={I.s} strokeWidth="1.8"/></> },
  hotel:       { g:["#42A5F5","#0D47A1"], el:<><path d="M3 22V5a2 2 0 012-2h14a2 2 0 012 2v17M3 22h18" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><rect x="8" y="14" width="4" height="8" rx="1" fill={I.s} opacity=".7"/><rect x="5" y="8" width="4" height="4" rx="1" fill={I.s} opacity=".5"/><rect x="15" y="8" width="4" height="4" rx="1" fill={I.s} opacity=".5"/></> },
  montana:     { g:["#78909C","#37474F"], el:<><path d="M8 3L1 21h22L15 3l-4 7-3-7z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M15 3l-2 4-2-4" fill="none" stroke={I.s} strokeWidth="1.8"/></> },
  playa:       { g:["#FF7043","#BF360C"], el:<><path d="M2 20c4-8 8-8 12 0" fill="none" stroke={I.s} strokeWidth={I.w}/><circle cx="20" cy="6" r="3" fill={I.s} opacity=".8"/><line x1="20" y1="11" x2="20" y2="20" stroke={I.s} strokeWidth="2"/><line x1="16" y1="16" x2="24" y2="16" stroke={I.s} strokeWidth="2"/></> },
  camping:     { g:["#558B2F","#1B5E20"], el:<><path d="M12 2L2 22h20L12 2z" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M12 2L9 10M12 2l3 8" fill="none" stroke={I.s} strokeWidth="1.8"/><line x1="2" y1="22" x2="22" y2="22" stroke={I.s} strokeWidth="2"/></> },
  // ── MISCELÁNEOS (9) ─────────────────────────────────────────────
  estrella:    { g:["#FDD835","#F57F17"], el:<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="none" stroke={I.s} strokeWidth={I.w}/> },
  telefono:    { g:["#4CAF50","#1B5E20"], el:<><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 015.13 12.7a19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" fill="none" stroke={I.s} strokeWidth={I.w}/></> },
  correo:      { g:["#42A5F5","#0D47A1"], el:<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="none" stroke={I.s} strokeWidth={I.w}/><polyline points="22 6 12 13 2 6" fill="none" stroke={I.s} strokeWidth="2"/></> },
  reloj:       { g:["#546E7A","#263238"], el:<><circle cx="12" cy="12" r="10" fill="none" stroke={I.s} strokeWidth={I.w}/><polyline points="12 6 12 12 16 14" fill="none" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/></> },
  calendario:  { g:["#EF5350","#B71C1C"], el:<><rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke={I.s} strokeWidth={I.w}/><line x1="16" y1="2" x2="16" y2="6" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><line x1="8" y1="2" x2="8" y2="6" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><line x1="3" y1="10" x2="21" y2="10" stroke={I.s} strokeWidth="2"/><rect x="8" y="14" width="3" height="3" rx=".5" fill={I.s} opacity=".8"/></> },
  notificacion:{ g:["#FF7043","#BF360C"], el:<><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" fill="none" stroke={I.s} strokeWidth={I.w}/></> },
  suscripcion: { g:["#AB47BC","#6A1B9A"], el:<><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke={I.s} strokeWidth={I.w}/></> },
  wifi:        { g:["#2196F3","#0D47A1"], el:<><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0" fill="none" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/><circle cx="12" cy="20" r="1.5" fill={I.s}/></> },
  otros:       { g:["#90A4AE","#546E7A"], el:<><circle cx="12" cy="12" r="10" fill="none" stroke={I.s} strokeWidth={I.w}/><path d="M9 9a3 3 0 015.12 2.1c0 2-3 3-3 3M12 17h.01" stroke={I.s} strokeWidth={I.w} strokeLinecap={I.lc}/></> },
};

// ── CatIcon: renders iOS-style SVG icon or emoji fallback ─────────────
function CatIcon({ icon, size = 36, style = {} }) {
  const def = CAT_ICONS[icon];
  const r = Math.round(size * 0.22);
  if (!def) {
    // Emoji fallback in a styled container
    return (
      <div style={{ width: size, height: size, borderRadius: r, background: "linear-gradient(135deg,#9e9e9e,#757575)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, flexShrink: 0, ...style }}>
        {icon}
      </div>
    );
  }
  const gid = `cg_${icon}`;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" style={{ display: "block", flexShrink: 0, ...style }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={def.g[0]}/>
          <stop offset="100%" stopColor={def.g[1]}/>
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx={r} fill={`url(#${gid})`}/>
      <g transform="translate(6,6)" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {def.el}
      </g>
    </svg>
  );
}

// ── IconPicker: grid of iOS icons + search ────────────────────────────
function IconPicker({ selected, onSelect }) {
  const [search, setSearch] = useState("");
  const allKeys = Object.keys(CAT_ICONS);
  const filtered = search.trim()
    ? allKeys.filter(k => k.toLowerCase().includes(search.trim().toLowerCase()))
    : allKeys;
  return (
    <div>
      <input
        placeholder="🔍 Buscar ícono..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: "100%", background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "8px 12px", color: T.text, fontSize: 13, outline: "none", fontFamily: "inherit", marginBottom: 10, boxSizing: "border-box" }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(44px,1fr))", gap: 6, maxHeight: 220, overflowY: "auto", padding: "2px 0" }}>
        {filtered.map(key => (
          <div key={key} onClick={() => onSelect(key)} title={key}
            style={{ cursor: "pointer", borderRadius: 10, padding: 3, border: `2px solid ${selected === key ? T.accent : "transparent"}`, background: selected === key ? T.accentLt : "transparent", transition: "all .15s", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CatIcon icon={key} size={38}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SVG Nav Icons ─────────────────────────────────────────────────────
function IconDashboard({ active }) {
  const bg = active ? "#e74c3c" : "#dde8dd";
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect width="30" height="30" rx="8" fill={bg}/>
      <rect x="7" y="17" width="4" height="7" rx="1" fill="white"/>
      <rect x="13" y="12" width="4" height="12" rx="1" fill="white"/>
      <rect x="19" y="7" width="4" height="17" rx="1" fill="white"/>
    </svg>
  );
}

function IconHistory({ active }) {
  const bg = active ? "#1abc9c" : "#dde8dd";
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect width="30" height="30" rx="8" fill={bg}/>
      <path d="M11 8h8a1 1 0 011 1v13l-4.5-2.8L11 22V9a1 1 0 011-1z" fill="white"/>
    </svg>
  );
}

function IconShopping({ active }) {
  const bg = active ? "#2c3e50" : "#dde8dd";
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect width="30" height="30" rx="8" fill={bg}/>
      <path d="M7 9h2.5l1.5 1.5M9.5 9L11 14h9l-1.5 6h-8L9 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="22" r="1.2" fill="white"/>
      <circle cx="18" cy="22" r="1.2" fill="white"/>
    </svg>
  );
}

function IconExport() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect width="30" height="30" rx="8" fill="#1abc9c"/>
      <path d="M15 7v11" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M10 13l5 5 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="8" y="20" width="14" height="2.5" rx="1.2" fill="white"/>
    </svg>
  );
}

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

function AmountInp({ label, value, onChange, placeholder = "0,00", style = {}, inputStyle = {} }) {
  const [display, setDisplay] = useState("");
  const [focused, setFocused] = useState(false);

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
    setDisplay(raw); onChange(raw);
  };
  const handleFocus = () => { setFocused(true); setDisplay(value ? String(value) : ""); };
  const handleBlur = () => {
    setFocused(false);
    if (value && !isNaN(Number(value)) && Number(value) > 0) setDisplay(fmt(Number(value)));
    else setDisplay("");
  };

  return (
    <div style={{ marginBottom: 14, ...style }}>
      {label && <label style={{ display: "block", fontSize: 11, color: T.muted, marginBottom: 5, fontWeight: 600, letterSpacing: .8, textTransform: "uppercase" }}>{label}</label>}
      <input value={display} onChange={handleChange} placeholder={placeholder} inputMode="decimal"
        style={{ width: "100%", background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: "10px 13px", color: T.text, fontSize: 16, fontWeight: 700, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color .2s", ...inputStyle }}
        onFocus={e => { e.target.style.borderColor = T.accent; handleFocus(); }}
        onBlur={e => { e.target.style.borderColor = T.border; handleBlur(); }} />
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
    btn.style.position = "relative"; btn.style.overflow = "hidden";
    btn.appendChild(circle); setTimeout(() => circle.remove(), 500);
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

function CurrencyModal({ currency, onSave, onClose }) {
  const [selected, setSelected] = useState(currency);
  return (
    <Modal title="💱 Moneda" onClose={onClose}>
      <p style={{ color: T.muted, fontSize: 13, marginBottom: 18 }}>Elegí la moneda para registrar tus gastos.</p>
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
  const [newCatIcon, setNewCatIcon] = useState("otros");
  const [newSubName, setNewSubName] = useState("");
  const [showNewCatIconPicker, setShowNewCatIconPicker] = useState(false);
  const cat = categories.find(c => c.id === Number(form.catId));
  const subcats = cat?.subcats || [];

  const addNewCat = () => {
    if (!newCatName.trim()) return;
    const newCat = { id: Date.now(), name: newCatName.trim(), icon: newCatIcon, color: PALETTE[categories.length % PALETTE.length], subcats: [] };
    onAddCategory(newCat); set("catId", newCat.id); setNewCatName(""); setShowNewCat(false); setShowNewCatIconPicker(false);
  };
  const addNewSub = () => {
    if (!newSubName.trim() || !cat) return;
    const newSub = { id: Date.now(), name: newSubName.trim() };
    onAddCategory({ ...cat, subcats: [...cat.subcats, newSub] }, true);
    set("subCatId", newSub.id); setNewSubName(""); setShowNewSub(false);
  };
  const save = () => {
    if (!form.amount || isNaN(Number(form.amount)) || !form.catId) return;
    onSave({ id: expense?.id || Date.now(), amount: Number(form.amount), catId: Number(form.catId), subCatId: form.subCatId ? Number(form.subCatId) : null, desc: form.desc, date: form.date });
    onClose();
  };

  return (
    <Modal title={isEdit ? "Editar gasto" : "Nuevo gasto"} onClose={onClose}>
      <AmountInp label="Monto" value={form.amount} onChange={v => set("amount", v)} placeholder="0,00" inputStyle={{ fontSize: 22 }} />
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: .8, textTransform: "uppercase" }}>Categoría</label>
          <button onClick={() => { setShowNewCat(!showNewCat); setShowNewSub(false); setShowNewCatIconPicker(false); }} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 6px", borderRadius: 6 }}>
            {showNewCat ? "✕ Cancelar" : "+ Nueva"}
          </button>
        </div>
        {showNewCat ? (
          <div style={{ background: T.accentLt, borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <div onClick={() => setShowNewCatIconPicker(p => !p)} style={{ cursor: "pointer", borderRadius: 8, padding: 2, border: `2px solid ${T.border}`, background: T.surface }}>
                <CatIcon icon={newCatIcon} size={36}/>
              </div>
              <input placeholder="Nombre..." value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === "Enter" && addNewCat()}
                style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
            </div>
            {showNewCatIconPicker && (
              <div style={{ marginBottom: 8 }}>
                <IconPicker selected={newCatIcon} onSelect={k => { setNewCatIcon(k); setShowNewCatIconPicker(false); }}/>
              </div>
            )}
            <Btn onClick={addNewCat} style={{ width: "100%", padding: "8px" }}>✓ Crear categoría</Btn>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(58px,1fr))", gap: 6 }}>
            {categories.map(c => (
              <div key={c.id} onClick={() => { set("catId", c.id); set("subCatId", ""); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: "8px 4px", borderRadius: 12, border: `2px solid ${Number(form.catId) === c.id ? T.accent : "transparent"}`, background: Number(form.catId) === c.id ? T.accentLt : T.bg, transition: "all .15s" }}>
                <CatIcon icon={c.icon} size={36}/>
                <span style={{ fontSize: 9, color: Number(form.catId) === c.id ? T.accent : T.muted, fontWeight: 600, textAlign: "center", lineHeight: 1.2, maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <label style={{ fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: .8, textTransform: "uppercase" }}>Subcategoría <span style={{ color: T.subtle, textTransform: "none", fontWeight: 400 }}>(opcional)</span></label>
          {cat && <button onClick={() => { setShowNewSub(!showNewSub); setShowNewCat(false); }} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "2px 6px", borderRadius: 6 }}>
            {showNewSub ? "✕ Cancelar" : "+ Nueva subcategoría"}
          </button>}
        </div>
        {showNewSub ? (
          <div style={{ background: T.accentLt, borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="ej: Almuerzo, Supermercado..." value={newSubName} onChange={e => setNewSubName(e.target.value)} onKeyDown={e => e.key === "Enter" && addNewSub()}
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
      <AmountInp label="Límite total" value={vals.__total || ""} onChange={v => setVals(vs => ({ ...vs, __total: v }))} placeholder="0,00 (sin límite)" />
      <p style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: .8, textTransform: "uppercase", marginBottom: 10 }}>Por categoría (opcional)</p>
      {categories.map(c => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <CatIcon icon={c.icon} size={28}/>
          <span style={{ color: T.text, fontSize: 14, flex: 1 }}>{c.name}</span>
          <div style={{ width: 130 }}>
            <AmountInp value={vals[c.id] || ""} onChange={v => setVals(vs => ({ ...vs, [c.id]: v }))} placeholder="0,00" style={{ marginBottom: 0 }} inputStyle={{ fontSize: 14, fontWeight: 600 }} />
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

function CatModal({ categories, onChange, onClose }) {
  const [cats, setCats] = useState(categories.map(c => ({ ...c, subcats: [...(c.subcats || [])] })));
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("otros");
  const [expandedCat, setExpandedCat] = useState(null);
  const [newSubName, setNewSubName] = useState("");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [editingIconFor, setEditingIconFor] = useState(null); // catId | "new"
  const [dragIdx, setDragIdx] = useState(null);
  const [dragSubIdx, setDragSubIdx] = useState(null); // {catId, idx}

  const addCat = () => {
    if (!newName.trim()) return;
    const used = cats.map(c => c.color);
    const color = PALETTE.find(p => !used.includes(p)) || PALETTE[cats.length % PALETTE.length];
    setCats(c => [...c, { id: Date.now(), name: newName.trim(), icon: newIcon, color, subcats: [] }]);
    setNewName(""); setNewIcon("otros"); setShowIconPicker(false);
  };
  const delCat = (id) => setCats(c => c.filter(x => x.id !== id));
  const addSub = (catId) => {
    if (!newSubName.trim()) return;
    setCats(c => c.map(cat => cat.id === catId ? { ...cat, subcats: [...cat.subcats, { id: Date.now(), name: newSubName.trim() }] } : cat));
    setNewSubName("");
  };
  const delSub = (catId, subId) => setCats(c => c.map(cat => cat.id === catId ? { ...cat, subcats: cat.subcats.filter(s => s.id !== subId) } : cat));

  // Drag-to-reorder categories
  const onCatDragStart = (i) => setDragIdx(i);
  const onCatDrop = (i) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); return; }
    const next = [...cats];
    const [removed] = next.splice(dragIdx, 1);
    next.splice(i, 0, removed);
    setCats(next); setDragIdx(null);
  };

  // Drag-to-reorder subcategories
  const onSubDragStart = (catId, idx) => setDragSubIdx({ catId, idx });
  const onSubDrop = (catId, idx) => {
    if (!dragSubIdx || dragSubIdx.catId !== catId || dragSubIdx.idx === idx) { setDragSubIdx(null); return; }
    setCats(c => c.map(cat => {
      if (cat.id !== catId) return cat;
      const subs = [...cat.subcats];
      const [removed] = subs.splice(dragSubIdx.idx, 1);
      subs.splice(idx, 0, removed);
      return { ...cat, subcats: subs };
    }));
    setDragSubIdx(null);
  };

  return (
    <Modal title="Categorías" onClose={onClose} wide={true}>
      <p style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>Arrastrá ≡ para reordenar. Tocá el ícono para cambiarlo.</p>
      <div style={{ maxHeight: 340, overflowY: "auto", marginBottom: 14 }}>
        {cats.map((c, i) => (
          <div key={c.id} style={{ marginBottom: 6, opacity: dragIdx === i ? 0.4 : 1, transition: "opacity .15s" }}
            draggable onDragStart={() => onCatDragStart(i)} onDragOver={e => e.preventDefault()} onDrop={() => onCatDrop(i)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 14, background: T.bg, border: `1px solid ${T.border}` }}>
              {/* Drag handle */}
              <span style={{ cursor: "grab", color: T.subtle, fontSize: 16, flexShrink: 0, userSelect: "none" }}>≡</span>
              {/* Icon (clickable to change) */}
              <div onClick={() => { setEditingIconFor(c.id); setShowIconPicker(true); }} style={{ cursor: "pointer", borderRadius: 8, padding: 2 }} title="Cambiar ícono">
                <CatIcon icon={c.icon} size={32}/>
              </div>
              <span style={{ color: T.text, flex: 1, fontSize: 14, fontWeight: 500 }}>{c.name}</span>
              <button onClick={() => setExpandedCat(expandedCat === c.id ? null : c.id)} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                {expandedCat === c.id ? "▲" : "▼"} ({c.subcats.length})
              </button>
              <button onClick={() => delCat(c.id)} style={{ background: "none", border: "none", color: T.warn, cursor: "pointer", fontSize: 15 }}>✕</button>
            </div>
            {expandedCat === c.id && (
              <div style={{ marginLeft: 16, marginTop: 4, padding: "10px 12px", background: T.accentLt, borderRadius: 12 }}>
                {c.subcats.map((s, si) => (
                  <div key={s.id} draggable
                    onDragStart={() => onSubDragStart(c.id, si)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onSubDrop(c.id, si)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${T.border}`, opacity: dragSubIdx?.catId === c.id && dragSubIdx?.idx === si ? 0.4 : 1, cursor: "grab" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: T.subtle, fontSize: 13 }}>≡</span>
                      <span style={{ color: T.text, fontSize: 13 }}>• {s.name}</span>
                    </div>
                    <button onClick={() => delSub(c.id, s.id)} style={{ background: "none", border: "none", color: T.warn, cursor: "pointer", fontSize: 12 }}>✕</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input placeholder="Nueva subcategoría" value={newSubName} onChange={e => setNewSubName(e.target.value)} onKeyDown={e => e.key === "Enter" && addSub(c.id)}
                    style={{ flex: 1, background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", color: T.text, fontSize: 12, outline: "none", fontFamily: "inherit" }} />
                  <Btn onClick={() => addSub(c.id)} style={{ padding: "7px 14px", fontSize: 12 }}>+</Btn>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Nueva categoría */}
      <div style={{ background: T.accentLt, borderRadius: 14, padding: 12, marginBottom: 14 }}>
        <p style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: .8, textTransform: "uppercase", marginBottom: 10 }}>Nueva categoría</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <div onClick={() => { setEditingIconFor("new"); setShowIconPicker(true); }} style={{ cursor: "pointer", borderRadius: 10, padding: 2, border: `2px solid ${T.border}`, background: T.surface }} title="Elegir ícono">
            <CatIcon icon={newIcon} size={38}/>
          </div>
          <input placeholder="Nombre de la categoría" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCat()}
            style={{ flex: 1, background: T.surface, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", color: T.text, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
          <Btn onClick={addCat} style={{ padding: "10px 16px" }}>+</Btn>
        </div>
      </div>

      {/* Icon picker modal overlay */}
      {showIconPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: T.surface, borderRadius: 20, padding: 20, width: 360, maxWidth: "95vw", boxShadow: T.shadowLg }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: T.text }}>Elegir ícono</span>
              <button onClick={() => setShowIconPicker(false)} style={{ background: T.bg, border: "none", borderRadius: 8, width: 28, height: 28, cursor: "pointer", color: T.muted, fontSize: 14 }}>✕</button>
            </div>
            <IconPicker
              selected={editingIconFor === "new" ? newIcon : (cats.find(c => c.id === editingIconFor)?.icon || "")}
              onSelect={key => {
                if (editingIconFor === "new") {
                  setNewIcon(key);
                } else {
                  setCats(cs => cs.map(c => c.id === editingIconFor ? { ...c, icon: key } : c));
                }
                setShowIconPicker(false);
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancelar</Btn>
        <Btn onClick={() => { onChange(cats); onClose(); }} style={{ flex: 1 }}>Guardar</Btn>
      </div>
    </Modal>
  );
}

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
    }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [catExp, cat]);

  return (
    <Modal title={`${cat.icon} ${cat.name}`} onClose={onClose} wide={true}>
      {subData.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <SectionLabel>Distribución por subcategoría</SectionLabel>
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
          <div style={{ marginTop: 14, height: 8, borderRadius: 6, overflow: "hidden", display: "flex", gap: 1 }}>
            {subData.map((d, i) => <div key={i} style={{ flex: d.value, background: d.color, transition: "flex .4s" }} title={d.name} />)}
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

// ── Squarified Treemap ────────────────────────────────────────────────
function squarify(data, x, y, w, h) {
  const rects = [];
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total || !w || !h) return rects;
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
      else rects.push({ ...n, x: pos, y, w: size, h: rowSize });
      pos += size;
    });
    return horiz ? { x: x + rowSize, y, w: w - rowSize, h } : { x, y: y + rowSize, w, h: h - rowSize };
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
      if (row.length === 0 || worst(testRow, short) <= worst(row, short)) { row = testRow; i++; }
      else { const rem = layoutRow(row, x, y, w, h, horiz); place(nodes.slice(i), rem.x, rem.y, rem.w, rem.h); return; }
    }
    layoutRow(row, x, y, w, h, horiz);
  }
  place(nodes, x, y, w, h);
  return rects;
}

function heatColor(rank) {
  if (rank < 0.25) return { bg: "#27ae60", border: "#1e8449" };
  if (rank < 0.50) return { bg: "#f39c12", border: "#d68910" };
  if (rank < 0.75) return { bg: "#e67e22", border: "#ca6f1e" };
  return { bg: "#c0392b", border: "#a93226" };
}

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
    categories.map(c => ({ ...c, value: monthExp.filter(e => e.catId === c.id).reduce((s, e) => s + e.amount, 0) }))
      .filter(c => c.value > 0).sort((a, b) => b.value - a.value),
    [categories, monthExp]
  );
  const rects = useMemo(() => !items.length || !dims.w ? [] : squarify(items, 0, 0, dims.w, dims.h), [items, dims]);
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
        {total === 0
          ? <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 36 }}>🌿</span>
              <span style={{ color: T.subtle, fontSize: 14 }}>Agregá gastos para ver el mapa</span>
            </div>
          : rects.map((d, i) => {
            const isHov = hovered === d.id;
            const pct = (d.value / total * 100);
            const rank = items.length > 1 ? (d.value - minVal) / (maxVal - minVal) : 1;
            const colors = heatColor(rank);
            const showName = d.w > 52 && d.h > 36;
            const showAmt = d.w > 58 && d.h > 52;
            const showPct = d.w > 44 && d.h > 28;
            const showIcon = d.w > 28 && d.h > 24;
            const GAP = 2;
            return (
              <div key={d.id}
                onMouseEnter={() => setHovered(d.id)} onMouseLeave={() => setHovered(null)}
                onClick={() => onCatClick && onCatClick(d)}
                title={`${d.icon} ${d.name}: ${fmt(d.value)} (${pct.toFixed(1)}%)`}
                style={{ position: "absolute", left: d.x + GAP, top: d.y + GAP, width: Math.max(d.w - GAP * 2, 2), height: Math.max(d.h - GAP * 2, 2), background: isHov ? colors.border : colors.bg, border: `2px solid ${isHov ? "#fff" : colors.border}`, borderRadius: 8, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 4, boxSizing: "border-box", transition: "all .18s ease", transform: isHov ? "scale(1.03)" : "scale(1)", zIndex: isHov ? 3 : 1, boxShadow: isHov ? "0 4px 20px rgba(0,0,0,.4)" : "none", animation: `fadeIn .35s ${i * 25}ms both` }}>
                {showIcon && <span style={{ fontSize: showName ? (d.w > 90 ? 20 : 14) : 10, lineHeight: 1, marginBottom: 1 }}>{d.icon}</span>}
                {showName && <span style={{ fontSize: d.w > 90 ? 11 : 9, color: "#fff", fontWeight: 700, textAlign: "center", lineHeight: 1.2, maxWidth: "95%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>}
                {showAmt && <span style={{ fontSize: d.w > 90 ? 10 : 8, color: "rgba(255,255,255,.9)", fontWeight: 700, marginTop: 1 }}>{fmt(d.value)}</span>}
                {showPct && <span style={{ fontSize: 8, color: "rgba(255,255,255,.7)", marginTop: 1 }}>{pct.toFixed(0)}%</span>}
              </div>
            );
          })
        }
      </div>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 60px auto", gap: 8, marginBottom: 8 }}>
          <Inp label="Producto" placeholder="ej: Carne, Leche..." value={newItem.name} onChange={e => setNewItem(n => ({ ...n, name: e.target.value }))} style={{ marginBottom: 0 }} />
          <Inp label="Cant." type="number" value={newItem.qty} onChange={e => setNewItem(n => ({ ...n, qty: Number(e.target.value) || 1 }))} style={{ marginBottom: 0 }} />
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <Btn onClick={addItem} style={{ padding: "10px 16px", height: 42 }}>+</Btn>
          </div>
        </div>
        <AmountInp label="Precio unitario" value={newItem.price} onChange={v => setNewItem(n => ({ ...n, price: v }))} placeholder="0,00" inputStyle={{ fontSize: 15 }} />
      </Card>
      <Card style={{ marginBottom: 14 }}>
        <SectionLabel>Lista ({items.length} productos)</SectionLabel>
        {items.length === 0
          ? <p style={{ color: T.subtle, fontSize: 13, textAlign: "center", padding: "22px 0" }}>Agregá productos para empezar</p>
          : items.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
              <input type="checkbox" checked={item.checked} onChange={() => toggleCheck(item.id)} style={{ width: 18, height: 18, cursor: "pointer", accentColor: T.accent, flexShrink: 0 }} />
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
        {useManual && <AmountInp label="Total gastado" value={manualTotal} onChange={v => setManualTotal(v)} placeholder="0,00" />}
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

  // Protección: solo permitir guardar categorías DESPUÉS de haber cargado Firebase
  const firebaseLoaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const e = await storage.get("expenses");   if (e) setExpenses(JSON.parse(e.value));
        const c = await storage.get("categories"); if (c) setCategories(JSON.parse(c.value));
        const b = await storage.get("budgets");    if (b) setBudgets(JSON.parse(b.value));
        const cur = await storage.get("currency"); if (cur) { setCurrencyState(cur.value); fmt = makeFmt(cur.value); }
      } catch {}
      // Marcar como cargado SIEMPRE — incluso si Firebase falla
      // Esto permite guardar cambios del usuario, pero nunca sobreescribe con DEFAULT_CATS
      firebaseLoaded.current = true;
    })();
  }, []);

  const saveCurrency = (code) => { setCurrencyState(code); fmt = makeFmt(code); storage.set("currency", code).catch(() => {}); };
  const saveExpenses = (data) => { setExpenses(data); storage.set("expenses", JSON.stringify(data)).catch(() => {}); };
  // Protección: nunca sobreescribir categorías con DEFAULT_CATS por error de carga
  const saveCats = (data) => {
    if (!firebaseLoaded.current) return; // aún no cargó Firebase, no tocar
    if (!data || data.length === 0) return; // nunca guardar lista vacía
    setCategories(data); storage.set("categories", JSON.stringify(data)).catch(() => {});
  };
  const saveBudgets  = (data) => { setBudgets(data); storage.set("budgets", JSON.stringify(data)).catch(() => {}); };

  const addExpense  = (exp) => saveExpenses([...expenses, exp]);
  const delExpense  = (id)  => saveExpenses(expenses.filter(e => e.id !== id));
  const editExpense = (upd) => saveExpenses(expenses.map(e => e.id === upd.id ? upd : e));

  const addCategoryInline = (cat, isUpdate = false) => {
    const updated = isUpdate ? categories.map(c => c.id === cat.id ? cat : c) : [...categories, cat];
    saveCats(updated);
  };

  const catMap    = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const weekRange = useMemo(() => getWeekRange(weekOffset), [weekOffset]);

  const monthExp = useMemo(() => {
    if (filterMode === "week") return expenses.filter(e => inRange(e.date, weekRange.from, weekRange.to));
    if (filterMode === "year") return expenses.filter(e => e.date.startsWith(filterYear));
    if (filterMode === "day")  return expenses.filter(e => e.date === filterDay);
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
    if (filterMode === "day") return ["00-04","04-08","08-12","12-16","16-20","20-24"].map((label, i) => ({ day: label, total: i === 0 ? monthExp.reduce((s, e) => s + e.amount, 0) : 0 }));
    if (filterMode === "week") {
      const days = []; const start = new Date(weekRange.from);
      for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d.toISOString().slice(0, 10)); }
      return days.map(d => ({ day: d.slice(5), total: expenses.filter(e => e.date === d).reduce((s, e) => s + e.amount, 0) }));
    }
    if (filterMode === "year") {
      return ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"].map((name, i) => {
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

  const curInfo = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];

  return (
    <div style={{ minHeight: "100vh", background: `#3d7a3d url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100'%3E%3Cpath d='M28 66L0 50V16L28 0l28 16v34L28 66zm0 34L0 84V50l28-16 28 16v34L28 100z' fill='none' stroke='%2368b868' stroke-opacity='0.25' stroke-width='1'/%3E%3C/svg%3E")`, fontFamily: "'Plus Jakarta Sans',sans-serif", color: T.text }}>
      <GlobalStyles />
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: T.accent, borderBottom: `1px solid ${T.border}`, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 56, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/logo.png" alt="Mis Gastos" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />
          <span style={{ fontWeight: 800, fontSize: 16, color: T.yellow, letterSpacing: "-.3px" }}>Mis Gastos</span>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "6px 0" }}>
          <button onClick={() => setModal("currency")} style={{ background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 10, padding: "6px 10px", color: "#fff", fontSize: 12, fontFamily: "inherit", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <span>{curInfo.symbol}</span><span>{curInfo.code}</span><span style={{ opacity: .7, fontSize: 10 }}>▼</span>
          </button>
          <button onClick={() => setModal("cats")} style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 10, padding: "6px 10px", color: "#fff", fontSize: 12, fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>🏷️</button>
          <button onClick={() => setModal("budget")} style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.25)", borderRadius: 10, padding: "6px 10px", color: "#fff", fontSize: 12, fontFamily: "inherit", fontWeight: 600, cursor: "pointer" }}>🎯</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: T.accentLt, borderBottom: `1px solid ${T.border}`, overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "0 12px", minWidth: "max-content" }}>
          {view !== "shopping" && (
            <>
              <div style={{ display: "flex", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", margin: "6px 0" }}>
                {[["day","Día"],["week","Semana"],["month","Mes"],["year","Año"]].map(([m, l]) => (
                  <button key={m} onClick={() => setFilterMode(m)} style={{ background: filterMode === m ? T.accent : "transparent", color: filterMode === m ? "#fff" : T.muted, border: "none", padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12, transition: "background .2s" }}>{l}</button>
                ))}
              </div>
              {filterMode === "month" && <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ marginLeft: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "5px 10px", color: T.text, fontSize: 12, fontFamily: "inherit" }}>{months.map(m => <option key={m}>{m}</option>)}</select>}
              {filterMode === "year"  && <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ marginLeft: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "5px 10px", color: T.text, fontSize: 12, fontFamily: "inherit" }}>{years.map(y => <option key={y}>{y}</option>)}</select>}
              {filterMode === "day"   && <input type="date" value={filterDay} onChange={e => setFilterDay(e.target.value)} style={{ marginLeft: 8, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "5px 10px", color: T.text, fontSize: 12, fontFamily: "inherit", outline: "none" }} />}
              {filterMode === "week"  && (
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

      {/* Content */}
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

        {view === "shopping" && <ShoppingList categories={categories} onAddExpense={addExpense} />}

        {view === "dashboard" && (
          <>
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
                    <CatIcon icon={cat?.icon || "otros"} size={36}/>
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

        {view === "history" && (
          <Card>
            <SectionLabel>Historial</SectionLabel>
            {monthExp.length === 0
              ? <p style={{ color: T.subtle, fontSize: 14, textAlign: "center", padding: "32px 0" }}>No hay gastos en este período</p>
              : [...monthExp].sort((a, b) => b.date.localeCompare(a.date)).map(e => {
                const cat = catMap[e.catId]; const sub = cat?.subcats?.find(s => s.id === e.subCatId);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${T.border}` }}>
                    <CatIcon icon={cat?.icon || "otros"} size={36}/>
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

      {/* Modals */}
      {modal === "add"      && <ExpenseModal categories={categories} onSave={addExpense} onClose={() => setModal(null)} onAddCategory={addCategoryInline} />}
      {modal === "budget"   && <BudgetModal budgets={budgets} categories={categories} onSave={saveBudgets} onClose={() => setModal(null)} />}
      {modal === "cats"     && <CatModal categories={categories} onChange={saveCats} onClose={() => setModal(null)} />}
      {modal === "currency" && <CurrencyModal currency={currency} onSave={saveCurrency} onClose={() => setModal(null)} />}
      {selectedCat          && <CatDetailModal cat={selectedCat} expenses={monthExp} onClose={() => setSelectedCat(null)} />}
      {editingExpense        && <ExpenseModal expense={editingExpense} categories={categories} onSave={editExpense} onClose={() => setEditingExpense(null)} onAddCategory={addCategoryInline} />}

      {/* Bottom Nav + FAB */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: T.surface, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "8px 0 max(8px, env(safe-area-inset-bottom))", boxShadow: "0 -4px 20px rgba(45,106,45,.12)" }}>

        {/* Dashboard */}
        <button onClick={() => setView("dashboard")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 12px", borderRadius: 12, transition: "transform .15s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "none"}>
          <IconDashboard active={view === "dashboard"} />
          <span style={{ fontSize: 10, fontWeight: 600, color: view === "dashboard" ? T.accent : T.muted, fontFamily: "inherit" }}>Inicio</span>
          {view === "dashboard" && <div style={{ width: 4, height: 4, borderRadius: 2, background: T.accent, marginTop: -2 }} />}
        </button>

        {/* Historial */}
        <button onClick={() => setView("history")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 12px", borderRadius: 12, transition: "transform .15s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "none"}>
          <IconHistory active={view === "history"} />
          <span style={{ fontSize: 10, fontWeight: 600, color: view === "history" ? T.accent : T.muted, fontFamily: "inherit" }}>Historial</span>
          {view === "history" && <div style={{ width: 4, height: 4, borderRadius: 2, background: T.accent, marginTop: -2 }} />}
        </button>

        {/* FAB */}
        <button onClick={() => setModal("add")}
          style={{ background: "#1abc9c", border: "none", borderRadius: "50%", width: 60, height: 60, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 18px rgba(26,188,156,.5)", transition: "transform .15s, box-shadow .15s", marginTop: -20, flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(26,188,156,.65)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 18px rgba(26,188,156,.5)"; }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(.95)"}
          onMouseUp={e => e.currentTarget.style.transform = "scale(1.1)"}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="13" y="5" width="2" height="18" rx="1" fill="white"/>
            <rect x="5" y="13" width="18" height="2" rx="1" fill="white"/>
          </svg>
        </button>

        {/* Compras */}
        <button onClick={() => setView("shopping")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 12px", borderRadius: 12, transition: "transform .15s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "none"}>
          <IconShopping active={view === "shopping"} />
          <span style={{ fontSize: 10, fontWeight: 600, color: view === "shopping" ? T.accent : T.muted, fontFamily: "inherit" }}>Compras</span>
          {view === "shopping" && <div style={{ width: 4, height: 4, borderRadius: 2, background: T.accent, marginTop: -2 }} />}
        </button>

        {/* Exportar */}
        <button onClick={() => exportCSV(monthExp, catMap)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 12px", borderRadius: 12, transition: "transform .15s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={e => e.currentTarget.style.transform = "none"}>
          <IconExport />
          <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, fontFamily: "inherit" }}>Exportar</span>
        </button>

      </div>
    </div>
  );
}
