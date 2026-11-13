// @ts-nocheck
/**
 * Edge Function: corte de caja general de Abarrotes (CGA-00001…) a medianoche, sin depender de la app.
 *
 * ARCHIVO GENERADO por scripts/build-edge-corte-general.mjs. No lo edites a mano:
 * cambia src/lib/corteAbarrotesDiario.js y vuelve a generar.
 *
 * La invoca pg_cron (supabase/cron_corte_general_abarrotes.sql) con el header x-cron-secret.
 * Secrets en Supabase → Edge Functions → Secrets:
 *   CRON_SECRET   (el mismo valor que guardas en Vault; ver el SQL)
 *   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (automáticos en hosted)
 *
 * Es idempotente: si el corte de un día ya existe, no hace nada. Se puede invocar a mano con
 * body JSON opcional { "sucursal": "3B5", "desde": "2026-11-13", "hasta": "2026-11-20" }.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

var corteGeneral = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var define_import_meta_env_default;
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
      define_import_meta_env_default = {};
    }
  });

  // src/constants/sucursales.js
  var sucursales_exports = {};
  __export(sucursales_exports, {
    ALMACEN_CENTRAL: () => ALMACEN_CENTRAL,
    CENTRAL_ADMIN: () => CENTRAL_ADMIN,
    LS_SUCURSAL: () => LS_SUCURSAL,
    SUCURSALES_BASE: () => SUCURSALES_BASE,
    SUCURSAL_RUTA: () => SUCURSAL_RUTA,
    UBICACION_SUCURSALES: () => UBICACION_SUCURSALES,
    agregarSucursalExtra: () => agregarSucursalExtra,
    bloquearTiendaEnEsteEquipo: () => bloquearTiendaEnEsteEquipo,
    codigoSucursalEnEntorno: () => codigoSucursalEnEntorno,
    codigoTiendaBloqueadaLocal: () => codigoTiendaBloqueadaLocal,
    codigoTiendaValido: () => codigoTiendaValido,
    desbloquearTiendaEnEsteEquipo: () => desbloquearTiendaEnEsteEquipo,
    equivalentesCodigoTienda: () => equivalentesCodigoTienda,
    esAlmacenCentral: () => esAlmacenCentral,
    esCentralAdmin: () => esCentralAdmin,
    esSucursalNoVenta: () => esSucursalNoVenta,
    esSucursalRuta: () => esSucursalRuta,
    etiquetaTienda: () => etiquetaTienda,
    etiquetaTiendaUbicacion: () => etiquetaTiendaUbicacion,
    guardarSucursalLocal: () => guardarSucursalLocal,
    leerSucursalGuardada: () => leerSucursalGuardada,
    listarSucursales: () => listarSucursales,
    listarSucursalesOperativas: () => listarSucursalesOperativas,
    listarSucursalesParaUI: () => listarSucursalesParaUI,
    nombreUbicacionSucursal: () => nombreUbicacionSucursal,
    normalizarCodigoTienda: () => normalizarCodigoTienda,
    quitarSucursalExtra: () => quitarSucursalExtra,
    sinAcentosTexto: () => sinAcentosTexto,
    sucursalFijaEsCajaFisica: () => sucursalFijaEsCajaFisica,
    sucursalFijaPorEntorno: () => sucursalFijaPorEntorno,
    sucursalInicial: () => sucursalInicial,
    tiendaBloqueadaEnEsteEquipo: () => tiendaBloqueadaEnEsteEquipo,
    tokenFolioSucursal: () => tokenFolioSucursal,
    ubicacionSucursal: () => ubicacionSucursal,
    urlGoogleMapsSucursal: () => urlGoogleMapsSucursal
  });
  function sinAcentosTexto(s) {
    return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function normalizarCodigoTienda(s) {
    const c = sinAcentosTexto(s).trim().toUpperCase().replace(/\s+/g, "_");
    if (!c) return "";
    if (ALIAS_A_CODIGO[c]) return ALIAS_A_CODIGO[c];
    const m = c.match(/^(3B\d+)/);
    if (m) return m[1];
    return c;
  }
  function equivalentesCodigoTienda(codigo) {
    const c = normalizarCodigoTienda(codigo);
    if (!c) return [];
    const out = new Set([c, String(codigo || "").trim()].filter(Boolean));
    if (c === "FUSION") {
      out.add("Fusi\xF3n");
      out.add("FUSI\xD3N");
      out.add("Fusion");
      out.add("fusion");
    }
    if (c === "3B7") {
      out.add("Del Valle");
      out.add("DEL_VALLE");
      out.add("DELVALLE");
      out.add("3B7 Del Valle");
      out.add("3B7_DEL_VALLE");
    }
    return [...out];
  }
  function esCentralAdmin(codigo) {
    return normalizarCodigoTienda(codigo) === CENTRAL_ADMIN;
  }
  function esAlmacenCentral(codigo) {
    return normalizarCodigoTienda(codigo) === ALMACEN_CENTRAL;
  }
  function esSucursalRuta(codigo) {
    return normalizarCodigoTienda(codigo) === SUCURSAL_RUTA;
  }
  function esSucursalNoVenta(codigo) {
    return esCentralAdmin(codigo) || esAlmacenCentral(codigo);
  }
  function listarSucursalesOperativas() {
    return listarSucursales().filter((s) => !esSucursalNoVenta(s));
  }
  function codigoSucursalEnEntorno() {
    try {
      const v = normalizarCodigoTienda(define_import_meta_env_default?.VITE_SUCURSAL_FIJA);
      return v || null;
    } catch {
      return null;
    }
  }
  function leerExtras() {
    try {
      const raw = localStorage.getItem(LS_EXTRA);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map((x) => normalizarCodigoTienda(x)).filter(Boolean);
    } catch {
      return [];
    }
  }
  function listarSucursales() {
    const seen = new Set(SUCURSALES_BASE);
    const out = [...SUCURSALES_BASE];
    for (const x of leerExtras()) {
      if (!seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  }
  function codigoTiendaValido(codigo) {
    const c = normalizarCodigoTienda(codigo);
    if (!c) return false;
    const env = codigoSucursalEnEntorno();
    if (env && c === env && /^[A-Z0-9._-]{1,32}$/.test(env)) return true;
    return listarSucursales().includes(c);
  }
  function ubicacionSucursal(codigo) {
    const c = normalizarCodigoTienda(codigo);
    if (!c) return null;
    return UBICACION_SUCURSALES[c] || null;
  }
  function nombreUbicacionSucursal(codigo) {
    const u = ubicacionSucursal(codigo);
    return String(u?.nombre || "").trim();
  }
  function etiquetaTienda(codigo) {
    const s = normalizarCodigoTienda(codigo);
    if (esCentralAdmin(s)) return "Central de administraci\xF3n (MAIN)";
    if (esAlmacenCentral(s)) return "CEDIS \xB7 centro de distribuci\xF3n";
    if (esSucursalRuta(s)) return "Venta en ruta";
    if (s === "FUSION") {
      return nombreUbicacionSucursal(s) || "Fusi\xF3n";
    }
    if (/^CE-/i.test(s)) {
      const slug = s.slice(3);
      return slug ? `Socio 3B \xB7 ${slug}` : "Socio 3B";
    }
    if (/^3B\d+$/i.test(s)) {
      const nombre = nombreUbicacionSucursal(s);
      return nombre ? `${s} ${nombre}` : s;
    }
    return s || String(codigo || "");
  }
  function etiquetaTiendaUbicacion(codigo) {
    return etiquetaTienda(codigo);
  }
  function urlGoogleMapsSucursal(codigo) {
    const u = ubicacionSucursal(codigo);
    if (!u || !Number.isFinite(Number(u.lat)) || !Number.isFinite(Number(u.lon))) return null;
    return `https://www.google.com/maps?q=${Number(u.lat)},${Number(u.lon)}`;
  }
  function agregarSucursalExtra(codigo) {
    const c = normalizarCodigoTienda(codigo);
    if (!c || c.length > 32) return { ok: false, error: "C\xF3digo vac\xEDo o demasiado largo (m\xE1x. 32)." };
    if (!/^[A-Z0-9._-]+$/.test(c)) return { ok: false, error: "Solo letras, n\xFAmeros, punto, guion y guion bajo." };
    if (listarSucursales().includes(c)) {
      return { ok: false, error: "Esa tienda ya est\xE1 en la lista." };
    }
    const extras = leerExtras().filter((x) => !SUCURSALES_BASE.includes(x));
    extras.push(c);
    try {
      localStorage.setItem(LS_EXTRA, JSON.stringify(extras));
    } catch {
      return { ok: false, error: "No se pudo guardar en el navegador." };
    }
    return { ok: true, codigo: c };
  }
  function quitarSucursalExtra(codigo) {
    const c = normalizarCodigoTienda(codigo);
    if (!c || SUCURSALES_BASE.includes(c)) return { ok: false, error: "No se puede quitar una tienda base." };
    const next = leerExtras().filter((x) => x !== c);
    try {
      localStorage.setItem(LS_EXTRA, JSON.stringify(next));
    } catch {
      return { ok: false, error: "No se pudo actualizar." };
    }
    return { ok: true };
  }
  function sucursalFijaPorEntorno() {
    const v = codigoSucursalEnEntorno();
    if (!v) return null;
    if (listarSucursales().includes(v)) return v;
    if (SUCURSALES_BASE.includes(v)) return v;
    if (/^[A-Z0-9._-]{1,32}$/.test(v)) return v;
    return null;
  }
  function leerSucursalGuardada() {
    try {
      const v = localStorage.getItem(LS_SUCURSAL);
      if (v && codigoTiendaValido(v)) return normalizarCodigoTienda(v);
    } catch {
    }
    return CENTRAL_ADMIN;
  }
  function guardarSucursalLocal(codigo) {
    try {
      const c = normalizarCodigoTienda(codigo);
      if (codigoTiendaValido(c)) localStorage.setItem(LS_SUCURSAL, c);
    } catch {
    }
  }
  function tiendaBloqueadaEnEsteEquipo() {
    try {
      if (localStorage.getItem(LS_TIENDA_BLOQUEADA) !== "1") return false;
      const c = localStorage.getItem(LS_SUCURSAL);
      return Boolean(c && codigoTiendaValido(c));
    } catch {
      return false;
    }
  }
  function codigoTiendaBloqueadaLocal() {
    if (!tiendaBloqueadaEnEsteEquipo()) return null;
    try {
      const c = normalizarCodigoTienda(localStorage.getItem(LS_SUCURSAL));
      if (!codigoTiendaValido(c)) return null;
      if (esCentralAdmin(c)) {
        desbloquearTiendaEnEsteEquipo();
        return null;
      }
      return c;
    } catch {
      return null;
    }
  }
  function sucursalFijaEsCajaFisica() {
    const env = sucursalFijaPorEntorno();
    return Boolean(env && !esCentralAdmin(env));
  }
  function bloquearTiendaEnEsteEquipo(codigo) {
    const c = normalizarCodigoTienda(codigo);
    if (!codigoTiendaValido(c)) return;
    if (esCentralAdmin(c)) return;
    try {
      localStorage.setItem(LS_SUCURSAL, c);
      localStorage.setItem(LS_TIENDA_BLOQUEADA, "1");
    } catch {
    }
  }
  function desbloquearTiendaEnEsteEquipo() {
    try {
      localStorage.removeItem(LS_TIENDA_BLOQUEADA);
    } catch {
    }
  }
  function listarSucursalesParaUI() {
    const inner = listarSucursales();
    const env = sucursalFijaPorEntorno();
    if (env && !inner.includes(env)) return [env, ...inner];
    return inner;
  }
  function sucursalInicial() {
    const env = sucursalFijaPorEntorno();
    if (env) return env;
    const loc = codigoTiendaBloqueadaLocal();
    if (loc) return loc;
    return leerSucursalGuardada();
  }
  function tokenFolioSucursal(codigo) {
    const c = normalizarCodigoTienda(codigo);
    if (!c) return "X";
    const m3b = c.match(/^3B(\d+)$/i);
    if (m3b) return m3b[1];
    if (c === "FUSION") return "FUS";
    if (c === "CEDIS") return "CED";
    if (c === "MAIN") return "M";
    const compacto = c.replace(/[^A-Z0-9]/g, "").slice(0, 8);
    return compacto || "X";
  }
  var SUCURSALES_BASE, CENTRAL_ADMIN, ALMACEN_CENTRAL, SUCURSAL_RUTA, ALIAS_A_CODIGO, LS_SUCURSAL, LS_EXTRA, LS_TIENDA_BLOQUEADA, UBICACION_SUCURSALES;
  var init_sucursales = __esm({
    "src/constants/sucursales.js"() {
      init_define_import_meta_env();
      SUCURSALES_BASE = ["MAIN", "CEDIS", "FUSION", "3B2", "3B3", "3B5", "3B6", "3B7", "3B9", "3B10"];
      CENTRAL_ADMIN = "MAIN";
      ALMACEN_CENTRAL = "CEDIS";
      SUCURSAL_RUTA = "RUTA";
      ALIAS_A_CODIGO = {
        CEDIS_CENTRAL: "CEDIS",
        ALMACEN_CENTRAL: "CEDIS",
        ALMACEN: "CEDIS",
        CENTRAL: "MAIN",
        CENTRAL_ADMIN: "MAIN",
        ADMINISTRACION: "MAIN",
        // Histórico: recolecciones guardaban "Fusión" / "FUSIÓN" y no cuadraban con FUSION.
        FUSION: "FUSION",
        // Colonias → código (altas / CT a veces guardan el nombre en vez de 3Bn).
        DEL_VALLE: "3B7",
        DELVALLE: "3B7",
        PUEBLO_NUEVO: "3B2",
        PUEBLONUEVO: "3B2",
        PETROLEOS: "3B3",
        LOMAS_DOS: "3B5",
        LOMASDOS: "3B5",
        SOLIDARIDAD: "3B6",
        BUENOS_AIRES: "3B9",
        BUENOSAIRES: "3B9",
        EL_MEZQUITE: "3B10",
        ELMEZQUITE: "3B10",
        MEZQUITE: "3B10"
      };
      LS_SUCURSAL = "pos3b_sucursal";
      LS_EXTRA = "pos3b_sucursales_extra";
      LS_TIENDA_BLOQUEADA = "pos3b_tienda_bloqueada";
      UBICACION_SUCURSALES = {
        FUSION: { nombre: "Fusi\xF3n", lat: 31.320189, lon: -110.943909 },
        "3B2": { nombre: "Pueblo Nuevo", lat: 31.300544, lon: -110.923907 },
        "3B3": { nombre: "Petr\xF3leos", lat: 31.300544, lon: -110.936193 },
        "3B5": { nombre: "Lomas Dos", lat: 31.289624, lon: -110.931254 },
        "3B6": { nombre: "Solidaridad", lat: 31.294967, lon: -110.915074 },
        "3B7": { nombre: "Del Valle", lat: 31.309213, lon: -110.930617 },
        "3B9": { nombre: "Buenos Aires", lat: 31.329842, lon: -110.943361 },
        "3B10": { nombre: "El Mezquite", lat: 31.30125, lon: -110.937966 }
      };
    }
  });

  // src/lib/ventasQuery.js
  function errorFaltaCreatedAt(error) {
    const msg = String(error?.message || error || "").toLowerCase();
    return msg.includes("created_at") && (msg.includes("does not exist") || msg.includes("column"));
  }
  function aplicarFiltroSucursalVentas(q, sucursal) {
    if (!sucursal) return q;
    const suc = normalizarCodigoTienda(sucursal) || sucursal;
    const vars = equivalentesCodigoTienda(suc);
    return vars.length > 1 ? q.in("sucursal_id", vars) : q.eq("sucursal_id", suc);
  }
  async function consultarVentas(supabase, opts = {}) {
    if (!supabase) return { data: [], error: "Sin conexi\xF3n a Supabase", sinFecha: false };
    const {
      columns = VENTAS_SELECT_FULL,
      desde = null,
      hasta = null,
      sucursal = null,
      limit = 500,
      orderAsc = false
    } = opts;
    const build = (cols) => {
      let q = supabase.from("ventas").select(cols);
      q = aplicarFiltroSucursalVentas(q, sucursal);
      const usaFecha = cols.includes("created_at");
      if (usaFecha && desde) q = q.gte("created_at", desde.toISOString());
      if (usaFecha && hasta) q = q.lte("created_at", hasta.toISOString());
      if (usaFecha) q = q.order("created_at", { ascending: orderAsc });
      else q = q.order("id", { ascending: false });
      return q.limit(limit);
    };
    const { data, error } = await build(columns);
    if (!error) return { data: data || [], error: null, sinFecha: false };
    if (!errorFaltaCreatedAt(error)) {
      return { data: [], error: error.message, sinFecha: false };
    }
    const colsSin = columns.split(",").map((c) => c.trim()).filter((c) => c && c !== "created_at").join(",");
    const { data: d2, error: e2 } = await build(colsSin || VENTAS_SELECT_BASE);
    if (e2) return { data: [], error: e2.message, sinFecha: true };
    let list = d2 || [];
    if (desde || hasta) {
      list = list.filter((v) => {
        const t = v.created_at ? new Date(v.created_at) : null;
        if (!t) return true;
        if (desde && t < desde) return false;
        if (hasta && t > hasta) return false;
        return true;
      });
    }
    return {
      data: list,
      error: null,
      sinFecha: true,
      aviso: AVISO_SIN_CREATED_AT
    };
  }
  var VENTAS_SELECT_BASE, VENTAS_SELECT_FULL, AVISO_SIN_CREATED_AT;
  var init_ventasQuery = __esm({
    "src/lib/ventasQuery.js"() {
      init_define_import_meta_env();
      init_sucursales();
      VENTAS_SELECT_BASE = "id,total,metodo_pago,vendedor,sucursal_id,articulos";
      VENTAS_SELECT_FULL = `${VENTAS_SELECT_BASE},created_at`;
      AVISO_SIN_CREATED_AT = "Falta la columna created_at en la tabla ventas. En Supabase \u2192 SQL Editor ejecuta: alter table public.ventas add column if not exists created_at timestamptz default now();";
    }
  });

  // src/lib/corteCajaRecargasMp.js
  function normalizarTextoRecarga(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }
  function textoEsRecarga(s) {
    const t = normalizarTextoRecarga(s);
    if (!t) return false;
    if (t.includes("recarga")) return true;
    if (t.includes("tiempo aire") || t.includes("tiempoaire")) return true;
    if (/\btae\b/.test(t)) return true;
    return false;
  }
  var init_corteCajaRecargasMp = __esm({
    "src/lib/corteCajaRecargasMp.js"() {
      init_define_import_meta_env();
      init_sucursales();
    }
  });

  // src/lib/corteCaja.js
  function ymdNogalesFromDate(date = /* @__PURE__ */ new Date()) {
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return "";
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: TZ_CAJA,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(d);
      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const day = parts.find((p) => p.type === "day")?.value;
      if (y && m && day) return `${y}-${m}-${day}`;
      return d.toLocaleDateString("en-CA", { timeZone: TZ_CAJA });
    } catch {
      try {
        const d = date instanceof Date ? date : new Date(date);
        const ms = d.getTime() - OFFSET_HORAS_NOGALES * 3600 * 1e3;
        return new Date(ms).toISOString().slice(0, 10);
      } catch {
        return "";
      }
    }
  }
  function ymdNegocioDesdeIso(isoOrDate) {
    if (!isoOrDate) return "";
    const s = String(isoOrDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return ymdNogalesFromDate(isoOrDate);
  }
  function hoyYmdNogales(now = /* @__PURE__ */ new Date()) {
    return ymdNogalesFromDate(now);
  }
  function dateFromNogales(ymd, hour = 0, minute = 0, second = 0, ms = 0) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return /* @__PURE__ */ new Date(NaN);
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(Date.UTC(y, mo - 1, d, hour + OFFSET_HORAS_NOGALES, minute, second, ms));
  }
  function addDaysYmd(ymd, days) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return hoyYmdNogales();
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days || 0)));
    return dt.toISOString().slice(0, 10);
  }
  function inicioDia(isoDate) {
    const ymd = isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : hoyYmdNogales();
    return dateFromNogales(ymd, 0, 0, 0, 0);
  }
  function finDia(isoDate) {
    const ymd = isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : hoyYmdNogales();
    return dateFromNogales(ymd, 23, 59, 59, 999);
  }
  function minutosHora(hora) {
    const n = String(hora || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!n) return 0;
    return Number(n[1]) * 60 + Number(n[2]);
  }
  function turnoCruzaMedianoche(turno) {
    if (!turno?.hora_inicio || !turno?.hora_fin) return false;
    const ini = minutosHora(turno.hora_inicio);
    const fin = minutosHora(turno.hora_fin);
    return ini !== fin && ini > fin;
  }
  function rangoConsultaCorte(fecha, turno = null) {
    const ymd = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyYmdNogales();
    if (turno && turnoCruzaMedianoche(turno)) {
      const [hi, mi] = String(turno.hora_inicio).split(":").map(Number);
      const [hf, mf] = String(turno.hora_fin).split(":").map(Number);
      const ini = dateFromNogales(ymd, hi, mi || 0, 0, 0);
      const fin = new Date(dateFromNogales(addDaysYmd(ymd, 1), hf, mf || 0, 0, 0).getTime() - 1);
      return { ini, fin, modo: "turno_nocturno" };
    }
    return { ini: inicioDia(ymd), fin: finDia(ymd), modo: "dia" };
  }
  function clasificarPago(metodoPago) {
    const m = String(metodoPago || "").toLowerCase();
    if (m.startsWith("efectivo")) return "efectivo";
    if (textoEsRecarga(m)) return "efectivo";
    if (m.includes("tarjeta")) return "tarjeta";
    if (m.includes("transfer")) return "transferencia";
    if (m.includes("qr")) return "qr";
    return "otros";
  }
  function resumirVentas(ventas) {
    const porMetodo = {};
    const grupos = { efectivo: 0, tarjeta: 0, transferencia: 0, qr: 0, otros: 0 };
    let total = 0;
    let tickets = 0;
    for (const v of ventas || []) {
      const t = Number(v.total) || 0;
      total += t;
      tickets += 1;
      const mp = String(v.metodo_pago || "Sin m\xE9todo");
      porMetodo[mp] = (porMetodo[mp] || 0) + t;
      const g = clasificarPago(mp);
      grupos[g] = (grupos[g] || 0) + t;
    }
    const detalleMetodos = Object.entries(porMetodo).map(([metodo, monto]) => ({ metodo, monto })).sort((a, b) => b.monto - a.monto);
    return {
      total,
      tickets,
      grupos,
      efectivoEsperado: grupos.efectivo,
      electronico: grupos.tarjeta + grupos.transferencia + grupos.qr + grupos.otros,
      detalleMetodos
    };
  }
  var TZ_CAJA, OFFSET_HORAS_NOGALES;
  var init_corteCaja = __esm({
    "src/lib/corteCaja.js"() {
      init_define_import_meta_env();
      init_ventasQuery();
      init_sucursales();
      init_corteCajaRecargasMp();
      TZ_CAJA = "America/Hermosillo";
      OFFSET_HORAS_NOGALES = 7;
    }
  });

  // src/lib/corteContabilidad/calc.js
  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }
  function valorManual(estado, key, calculado) {
    const raw = estado?.[key];
    if (raw != null && raw !== "") return round2(raw);
    return calculado;
  }
  function totalGastos(gastos = []) {
    return round2(
      (gastos || []).filter((g) => {
        const est = g?.estado_aprobacion || "aprobado";
        return est === "aprobado";
      }).reduce((a, g) => a + (Number(g.monto) || 0), 0)
    );
  }
  function calcularAbarrotes(estado, gastos = []) {
    const gastosTotal = totalGastos(gastos);
    const venta = round2(estado.venta);
    const tarjeta = round2(estado.tarjeta);
    const recoleccion = round2(estado.recoleccion);
    const cajaAnterior = round2(estado.caja_anterior);
    const subtotalCalc = round2(venta - gastosTotal - tarjeta);
    const subtotal = valorManual(estado, "subtotal_manual", subtotalCalc);
    const cajaActualCalc = round2(venta + cajaAnterior - gastosTotal - recoleccion - tarjeta);
    const cajaActual = valorManual(estado, "caja_actual_manual", cajaActualCalc);
    return { venta, gastosTotal, subtotal, cajaActual };
  }
  function maquinasGarageDefault() {
    const m = {};
    for (let i = 1; i <= 7; i += 1) m[`M${i}`] = 0;
    return m;
  }
  var ESTADO_GARAGE_DEFAULT;
  var init_calc = __esm({
    "src/lib/corteContabilidad/calc.js"() {
      init_define_import_meta_env();
      init_corteCaja();
      ESTADO_GARAGE_DEFAULT = {
        maquinas: maquinasGarageDefault(),
        pin1: 0,
        pin2: 0,
        dsch: 0,
        recoleccion: 0,
        /** Recolecciones hechas sin reiniciar máquinas; se arrastra hasta ceros. */
        recoleccion_anterior: 0,
        comentarios: ""
      };
    }
  });

  // src/lib/valesCategorias.js
  var init_valesCategorias = __esm({
    "src/lib/valesCategorias.js"() {
      init_define_import_meta_env();
    }
  });

  // src/lib/contabilidadConstants.js
  var APROBADORES_RECOLECCION_IE, ADMINISTRADORES_IE_MOVIMIENTOS, HORA_LIMITE_VALE_DEFAULT_MINUTOS;
  var init_contabilidadConstants = __esm({
    "src/lib/contabilidadConstants.js"() {
      init_define_import_meta_env();
      init_valesCategorias();
      APROBADORES_RECOLECCION_IE = [
        { id: "abb", etiqueta: "ABB", patrones: ["abb", "antonio"] },
        { id: "fjbb", etiqueta: "FJBB", patrones: ["fjbb", "francisco"] },
        { id: "jlbb", etiqueta: "JLBB", patrones: ["jlbb", "jose luis", "jos\xE9 luis"] },
        { id: "cheche", etiqueta: "Cheche", patrones: ["cheche"] }
      ];
      ADMINISTRADORES_IE_MOVIMIENTOS = APROBADORES_RECOLECCION_IE.filter(
        (s) => s.id === "abb" || s.id === "fjbb" || s.id === "jlbb"
      );
      HORA_LIMITE_VALE_DEFAULT_MINUTOS = 9 * 60;
    }
  });

  // src/lib/branding.js
  var init_branding = __esm({
    "src/lib/branding.js"() {
      init_define_import_meta_env();
    }
  });

  // src/lib/privilegios.js
  var MODULOS_IDS, VALIDOS;
  var init_privilegios = __esm({
    "src/lib/privilegios.js"() {
      init_define_import_meta_env();
      MODULOS_IDS = [
        "Inicio",
        "Mensajes",
        "Incidencias",
        "Ventas",
        "Esc\xE1ner caja",
        "Corte de caja",
        "Liquidaci\xF3n recolecciones",
        "Tesorer\xEDa",
        "Conciliaciones",
        "Consolidaci\xF3n",
        "Compras vs inventario",
        "Revisi\xF3n de compras",
        "Registro de gastos",
        "Socio 3B",
        "Corte Virtual",
        "Corte Abarrotes",
        "Corte Garage",
        "Productos",
        "Venta en Ruta",
        "Compras",
        "Checador",
        "Check List",
        "Evaluaci\xF3n operativa",
        "Proveedores",
        "Clientes",
        "Usuarios",
        "Consultas",
        "Resumen operativo",
        "Reportes",
        "Vales y Pr\xE9stamos",
        "N\xF3mina",
        "Panel RT",
        "RC Virtual",
        "RC Garage",
        "RC Abarrotes",
        "IE VIRTUAL",
        "IE ABARROTES",
        "Libro diario",
        "Auto Fin",
        "Cr\xE9dito",
        "Cobranza",
        "RH ABA3B",
        "Contrataci\xF3n",
        "Archivo",
        "Estad\xEDsticas Abarrotes",
        "Estad\xEDsticas Virtual",
        "Estad\xEDsticas Garage",
        "Configuracion",
        "Tutorial",
        "Ayuda"
      ];
      VALIDOS = new Set(MODULOS_IDS);
    }
  });

  // src/lib/posConfig.js
  var ACCIONES_PRIVILEGIO, ACCIONES_PRIVILEGIO_PANEL_RT, ACCIONES_PRIVILEGIO_VENTA_RUTA, ACCIONES_PRIVILEGIO_PRODUCTOS, ACCIONES_PRIVILEGIO_CHECADOR;
  var init_posConfig = __esm({
    "src/lib/posConfig.js"() {
      init_define_import_meta_env();
      init_privilegios();
      ACCIONES_PRIVILEGIO = [
        { id: "recoleccion_cortes", label: "Recolecci\xF3n en cortes (Virtual / Abarrotes / Garage)" },
        { id: "recol_ctb_reporte", label: "Panel RT \u2014 Reporte por tienda" },
        { id: "recol_ctb_servicios", label: "Panel RT \u2014 Servicios" },
        { id: "recol_ctb_recolectores", label: "Panel RT \u2014 Recolectores" },
        { id: "recol_ctb_eliminar", label: "Panel RT \u2014 Eliminar registros" },
        { id: "recol_ctb_gastos", label: "Panel RT \u2014 Gastos / liberar efectivo" },
        { id: "recol_ctb_cuentas", label: "Panel RT \u2014 Cuentas Francisco / Andr\xE9s" },
        { id: "ruta_camiones", label: "Venta en Ruta \u2014 Camiones" },
        { id: "ruta_carga", label: "Venta en Ruta \u2014 Carga de cami\xF3n" },
        { id: "ruta_precios", label: "Venta en Ruta \u2014 Precios de ruta" },
        { id: "ruta_clientes", label: "Venta en Ruta \u2014 Clientes externos" },
        { id: "ruta_consultas", label: "Venta en Ruta \u2014 Consultas" },
        { id: "ruta_limpiar_consultas", label: "Venta en Ruta \u2014 Limpiar consultas" },
        { id: "ruta_pos", label: "Venta en Ruta \u2014 POS venta en ruta" },
        { id: "ruta_corte", label: "Venta en Ruta \u2014 Corte de caja" },
        { id: "ruta_preinventario", label: "Venta en Ruta \u2014 Preinventario" },
        { id: "ruta_auditorias", label: "Venta en Ruta \u2014 Inv-op / Auditor\xEDas" },
        { id: "ruta_creditos", label: "Venta en Ruta \u2014 Cr\xE9ditos por pagar" },
        { id: "ruta_servicios", label: "Venta en Ruta \u2014 Cobro servicios" },
        { id: "ruta_gastos", label: "Venta en Ruta \u2014 Gastos (foto ticket \u2192 RC)" },
        { id: "ruta_cancelacion", label: "Venta en Ruta \u2014 Cancelaci\xF3n / Devoluci\xF3n" },
        { id: "ruta_liquidacion", label: "Venta en Ruta \u2014 RC/VentaRuta" },
        { id: "prod_alta", label: "Productos \u2014 Nuevo producto" },
        { id: "prod_ajuste", label: "Productos \u2014 Ajuste de inventario" },
        { id: "prod_traspaso", label: "Productos \u2014 Traspasos" },
        { id: "prod_preinventario", label: "Productos \u2014 Preinventario" },
        { id: "prod_mover", label: "Productos \u2014 Mover productos (proveedor / depto)" },
        { id: "prod_etiquetas", label: "Productos \u2014 Imprimir etiquetas" },
        { id: "prod_importar", label: "Productos \u2014 Importar archivo .xls" },
        { id: "prod_exportar", label: "Productos \u2014 Exportar productos" },
        { id: "prod_fotos", label: "Productos \u2014 Jalar fotos de internet" },
        { id: "prod_vaciar", label: "Productos \u2014 Vaciar inventario" },
        { id: "prod_precios", label: "Productos \u2014 Administrador de precios" },
        { id: "prod_consolidar", label: "Productos \u2014 Inventario vs ventas del d\xEDa" },
        { id: "prod_negativos", label: "Productos \u2014 Ver inventario negativo" },
        { id: "prod_eliminar", label: "Productos \u2014 Eliminar productos" },
        { id: "chec_plan_horario", label: "Checador \u2014 Plan horario (calendario)" }
      ];
      ACCIONES_PRIVILEGIO_PANEL_RT = ACCIONES_PRIVILEGIO.filter(
        (a) => a.id === "recoleccion_cortes" || a.id.startsWith("recol_ctb_")
      );
      ACCIONES_PRIVILEGIO_VENTA_RUTA = ACCIONES_PRIVILEGIO.filter((a) => a.id.startsWith("ruta_"));
      ACCIONES_PRIVILEGIO_PRODUCTOS = ACCIONES_PRIVILEGIO.filter((a) => a.id.startsWith("prod_"));
      ACCIONES_PRIVILEGIO_CHECADOR = ACCIONES_PRIVILEGIO.filter((a) => a.id.startsWith("chec_"));
    }
  });

  // src/lib/incidenciasCatalogo.js
  var init_incidenciasCatalogo = __esm({
    "src/lib/incidenciasCatalogo.js"() {
      init_define_import_meta_env();
    }
  });

  // src/lib/incidenciasPos.js
  var init_incidenciasPos = __esm({
    "src/lib/incidenciasPos.js"() {
      init_define_import_meta_env();
      init_contabilidadNotificaciones();
      init_incidenciasCatalogo();
      init_incidenciasCatalogo();
    }
  });

  // src/lib/incidenciasPrivilegios.js
  var ACCIONES_INCIDENCIAS_PRIVILEGIO, IDS_ACCIONES_INCIDENCIAS, ACCIONES_CENTRAL_INCIDENCIAS, ACCIONES_DEFAULT_INCIDENCIAS_POR_ROL;
  var init_incidenciasPrivilegios = __esm({
    "src/lib/incidenciasPrivilegios.js"() {
      init_define_import_meta_env();
      init_posConfig();
      init_incidenciasPos();
      ACCIONES_INCIDENCIAS_PRIVILEGIO = [
        {
          id: "inc_bandeja_pendientes",
          label: "Bandeja de pendientes",
          desc: "Ver la pesta\xF1a Pendientes con avisos de incidencias reportadas desde el formulario (todas las tiendas en central MAIN)."
        },
        {
          id: "inc_ver_todas_tiendas",
          label: "Ver incidencias de todas las sucursales",
          desc: "Listar reportes de 3B2, 3B5, FUSION, etc. Sin esto solo ve la tienda activa en la sesi\xF3n."
        },
        {
          id: "inc_resolver_asignadas",
          label: "Resolver incidencias asignadas a m\xED",
          desc: "Marcar en revisi\xF3n, resolver y cerrar reportes donde el empleado aparece como responsable."
        },
        {
          id: "inc_resolver_todas",
          label: "Resolver cualquier incidencia",
          desc: "Atender reportes de cualquier responsable (auditor\xEDa y supervisi\xF3n desde central MAIN)."
        },
        {
          id: "inc_redirigir",
          label: "Redirigir a otro responsable",
          desc: "Reasignar un reporte a otro miembro del personal de central."
        },
        {
          id: "inc_historial_notif",
          label: "Historial de notificaciones",
          desc: "Consultar notificaciones ya atendidas (administraci\xF3n central)."
        }
      ];
      IDS_ACCIONES_INCIDENCIAS = new Set(ACCIONES_INCIDENCIAS_PRIVILEGIO.map((a) => a.id));
      ACCIONES_CENTRAL_INCIDENCIAS = [
        "inc_bandeja_pendientes",
        "inc_ver_todas_tiendas",
        "inc_resolver_todas",
        "inc_redirigir",
        "inc_historial_notif"
      ];
      ACCIONES_DEFAULT_INCIDENCIAS_POR_ROL = {
        T\u00E9cnico: [...ACCIONES_CENTRAL_INCIDENCIAS],
        Repartidor: [...ACCIONES_CENTRAL_INCIDENCIAS],
        Auditor: [...ACCIONES_CENTRAL_INCIDENCIAS],
        Gerente: [...ACCIONES_CENTRAL_INCIDENCIAS]
      };
    }
  });

  // src/lib/roles.js
  var ROLES, ROLES_SISTEMA, SUBMODULOS_CONTABILIDAD, SUBMODULOS_ESTADISTICAS, MODULOS_AGRUPADOS_CONTABILIDAD, MODULOS_AGRUPADOS_ESTADISTICAS, MODULOS_ORDEN, MODULOS_SOLO_OFICINA, MODULOS_PRIVILEGIOS_GENERAL, ACCESO_POR_ROL, MODULOS_BLOQUEADOS_REPARTIDOR;
  var init_roles = __esm({
    "src/lib/roles.js"() {
      init_define_import_meta_env();
      init_posConfig();
      init_privilegios();
      init_privilegios();
      init_incidenciasPrivilegios();
      ROLES = ["Cajero", "Auditor", "Repartidor", "Supervisor", "Gerente", "T\xE9cnico", "Administrador", "Cliente"];
      ROLES_SISTEMA = [...ROLES];
      SUBMODULOS_CONTABILIDAD = [
        "N\xF3mina",
        "Panel RT",
        "Liquidaci\xF3n recolecciones",
        "Tesorer\xEDa",
        "Conciliaciones",
        "Consolidaci\xF3n",
        "Compras vs inventario",
        "Revisi\xF3n de compras",
        "Registro de gastos",
        "Socio 3B",
        "RC Virtual",
        "RC Garage",
        "RC Abarrotes",
        "IE VIRTUAL",
        "IE ABARROTES",
        "Libro diario",
        "Auto Fin",
        "Cr\xE9dito",
        "Cobranza",
        "RH ABA3B",
        "Contrataci\xF3n",
        "Archivo"
      ];
      SUBMODULOS_ESTADISTICAS = [
        "Estad\xEDsticas Abarrotes",
        "Estad\xEDsticas Virtual",
        "Estad\xEDsticas Garage"
      ];
      MODULOS_AGRUPADOS_CONTABILIDAD = new Set(SUBMODULOS_CONTABILIDAD);
      MODULOS_AGRUPADOS_ESTADISTICAS = new Set(SUBMODULOS_ESTADISTICAS);
      MODULOS_ORDEN = [
        "Inicio",
        "Mensajes",
        "Incidencias",
        "Ventas",
        "Esc\xE1ner caja",
        "Corte de caja",
        "Corte Virtual",
        "Corte Abarrotes",
        "Corte Garage",
        "Productos",
        "Venta en Ruta",
        "Compras",
        "Checador",
        "Check List",
        "Evaluaci\xF3n operativa",
        "Proveedores",
        "Clientes",
        "Usuarios",
        "Consultas",
        "Resumen operativo",
        "Reportes",
        "Auditor\xEDa",
        "Vales y Pr\xE9stamos",
        "Configuracion",
        "Tutorial",
        "Ayuda"
      ];
      MODULOS_SOLO_OFICINA = /* @__PURE__ */ new Set([]);
      MODULOS_PRIVILEGIOS_GENERAL = MODULOS_ORDEN.filter(
        (m) => !MODULOS_AGRUPADOS_CONTABILIDAD.has(m) && !MODULOS_AGRUPADOS_ESTADISTICAS.has(m) && !MODULOS_SOLO_OFICINA.has(m)
      );
      ACCESO_POR_ROL = {
        Cajero: [
          "Inicio",
          "Mensajes",
          "Incidencias",
          "Ventas",
          "Esc\xE1ner caja",
          "Corte de caja",
          "Corte Virtual",
          "Corte Abarrotes",
          "Corte Garage",
          "Productos",
          "Compras",
          "Proveedores",
          "Consultas",
          "Reportes",
          "Vales y Pr\xE9stamos",
          "Cobranza",
          "Checador",
          "Check List",
          "Tutorial",
          "Ayuda"
        ],
        Repartidor: ["Inicio", "Mensajes", "Incidencias", "Productos", "Venta en Ruta", "Vales y Pr\xE9stamos", "Tutorial", "Ayuda"],
        Auditor: [
          "Inicio",
          "Mensajes",
          "Incidencias",
          "Corte de caja",
          "Productos",
          "Venta en Ruta",
          "Compras",
          "Checador",
          "Check List",
          "Evaluaci\xF3n operativa",
          "Proveedores",
          "Clientes",
          "Consultas",
          "Estad\xEDsticas Abarrotes",
          "Estad\xEDsticas Virtual",
          "Estad\xEDsticas Garage",
          "Reportes",
          "Vales y Pr\xE9stamos",
          "Tutorial",
          "Ayuda"
        ],
        Supervisor: [
          "Inicio",
          "Mensajes",
          "Incidencias",
          "Ventas",
          "Esc\xE1ner caja",
          "Corte de caja",
          "Corte Virtual",
          "Corte Abarrotes",
          "Corte Garage",
          "Productos",
          "Venta en Ruta",
          "Compras",
          "Checador",
          "Check List",
          "Evaluaci\xF3n operativa",
          "Proveedores",
          "Clientes",
          "Consultas",
          "Estad\xEDsticas Abarrotes",
          "Estad\xEDsticas Virtual",
          "Estad\xEDsticas Garage",
          "Reportes",
          "Vales y Pr\xE9stamos",
          "Tutorial",
          "Ayuda"
        ],
        Gerente: [
          "Inicio",
          "Mensajes",
          "Incidencias",
          "Ventas",
          "Esc\xE1ner caja",
          "Corte de caja",
          "Corte Virtual",
          "Corte Abarrotes",
          "Corte Garage",
          "Productos",
          "Venta en Ruta",
          "Compras",
          "Checador",
          "Check List",
          "Evaluaci\xF3n operativa",
          "Proveedores",
          "Clientes",
          "Consultas",
          "Estad\xEDsticas Abarrotes",
          "Estad\xEDsticas Virtual",
          "Estad\xEDsticas Garage",
          "Reportes",
          "Vales y Pr\xE9stamos",
          "Configuracion",
          "Tutorial",
          "Ayuda"
        ],
        T\u00E9cnico: ["Inicio", "Mensajes", "Incidencias", "Checador", "Check List", "Tutorial", "Ayuda"],
        Administrador: [...MODULOS_ORDEN],
        /** Externos de Contabilidad → Socio 3B: solo su módulo (cortes V/G dentro). */
        Cliente: ["Socio 3B"]
      };
      MODULOS_BLOQUEADOS_REPARTIDOR = /* @__PURE__ */ new Set([
        "Ventas",
        "Esc\xE1ner caja",
        "Corte de caja",
        "Checador",
        "Usuarios",
        "Configuracion",
        "Cobranza",
        "Cr\xE9dito",
        ...SUBMODULOS_CONTABILIDAD.filter((m) => m !== "Cobranza" && m !== "Cr\xE9dito"),
        ...SUBMODULOS_ESTADISTICAS
      ]);
    }
  });

  // src/lib/cubreTurno.js
  function purgarCacheLocalPinCubreTurno() {
    try {
      localStorage.removeItem(LS_PIN_CUBRE_TURNO);
      localStorage.removeItem(LS_PIN_CUBRE_TURNO_AT);
    } catch {
    }
  }
  var LS_PIN_CUBRE_TURNO, LS_PIN_CUBRE_TURNO_AT;
  var init_cubreTurno = __esm({
    "src/lib/cubreTurno.js"() {
      init_define_import_meta_env();
      init_sucursales();
      LS_PIN_CUBRE_TURNO = "pos3b_pin_cubre_turno";
      LS_PIN_CUBRE_TURNO_AT = "pos3b_pin_cubre_turno_updated_at";
      purgarCacheLocalPinCubreTurno();
    }
  });

  // src/lib/usuariosAuth.js
  var init_usuariosAuth = __esm({
    "src/lib/usuariosAuth.js"() {
      init_define_import_meta_env();
      init_sucursales();
      init_roles();
    }
  });

  // src/lib/autorizacionTurnoFueraHorario.js
  var DURACION_AUTORIZACION_TURNO_MS;
  var init_autorizacionTurnoFueraHorario = __esm({
    "src/lib/autorizacionTurnoFueraHorario.js"() {
      init_define_import_meta_env();
      init_sucursales();
      init_roles();
      init_cubreTurno();
      init_usuariosAuth();
      DURACION_AUTORIZACION_TURNO_MS = 8 * 60 * 60 * 1e3;
    }
  });

  // src/lib/adminPrincipal.js
  var init_adminPrincipal = __esm({
    "src/lib/adminPrincipal.js"() {
      init_define_import_meta_env();
      init_roles();
      init_autorizacionTurnoFueraHorario();
    }
  });

  // src/lib/buzonUsuario.js
  var init_buzonUsuario = __esm({
    "src/lib/buzonUsuario.js"() {
      init_define_import_meta_env();
      init_contabilidadConstants();
      init_incidenciasPos();
      init_roles();
      init_adminPrincipal();
    }
  });

  // src/lib/extensionSesionTurno.js
  var init_extensionSesionTurno = __esm({
    "src/lib/extensionSesionTurno.js"() {
      init_define_import_meta_env();
      init_sucursales();
    }
  });

  // src/lib/turnos.js
  function normalizarHora(h) {
    const m = String(h || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  function minutosDesdeMedianoche(hora) {
    const n = normalizarHora(hora);
    if (!n) return 0;
    const [hh, mm] = n.split(":").map(Number);
    return hh * 60 + mm;
  }
  function horaEnTurno(turno, date = /* @__PURE__ */ new Date(), opts = {}) {
    const finInclusive = opts.finInclusive === true;
    let now;
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Hermosillo",
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23"
      }).formatToParts(date);
      const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
      const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
      now = hour * 60 + minute;
    } catch {
      now = date.getHours() * 60 + date.getMinutes();
    }
    const ini = minutosDesdeMedianoche(turno.hora_inicio);
    const fin = minutosDesdeMedianoche(turno.hora_fin);
    if (ini === fin) return true;
    const enFin = finInclusive ? now <= fin : now < fin;
    if (ini < fin) return now >= ini && enFin;
    return now >= ini || enFin;
  }
  function ventaPerteneceTurno(venta, turno, dateFallback = null) {
    if (!turno) return false;
    if (venta?.turno_id && String(venta.turno_id) === String(turno.id)) return true;
    const nomV = String(venta?.turno_nombre || "").toLowerCase();
    const nomT = String(turno.nombre || "").toLowerCase();
    const idT = String(turno.id || "").toLowerCase();
    if (nomV) {
      if ((nomV.includes("nocturn") || nomV.includes("noche")) && (nomT.includes("nocturn") || nomT.includes("noche") || idT.includes("nocturn") || idT === "noche")) {
        return true;
      }
      if ((nomV.includes("diurn") || nomV.includes("ma\xF1ana") || nomV.includes("manana")) && (nomT.includes("diurn") || idT.includes("diurn") || idT === "manana" || idT === "ma\xF1ana")) {
        return true;
      }
    }
    const when = venta?.created_at ? new Date(venta.created_at) : dateFallback;
    if (when && !Number.isNaN(when.getTime()) && horaEnTurno(turno, when)) return true;
    return false;
  }
  function filtrarVentasPorTurno(ventas, turno) {
    if (!turno) return ventas || [];
    return (ventas || []).filter((v) => ventaPerteneceTurno(v, turno));
  }
  var LS_TURNOS, LS_TURNOS_SUCURSAL_PREFIX, TIPOS_HORARIO, TIPOS_HORARIO_LIST;
  var init_turnos = __esm({
    "src/lib/turnos.js"() {
      init_define_import_meta_env();
      init_roles();
      init_autorizacionTurnoFueraHorario();
      init_cubreTurno();
      init_usuariosAuth();
      init_extensionSesionTurno();
      init_sucursales();
      LS_TURNOS = "pos3b_turnos_caja";
      LS_TURNOS_SUCURSAL_PREFIX = `${LS_TURNOS}__`;
      TIPOS_HORARIO = {
        "12x12": {
          id: "12x12",
          label: "12\xD712",
          descripcion: "2 turnos de 12 horas (diurno y nocturno) cubriendo las 24 h.",
          duracion: 12,
          inicioDefault: "07:00"
        },
        "8x24": {
          id: "8x24",
          label: "8\xD724",
          descripcion: "3 turnos de 8 horas (ma\xF1ana, tarde y noche) cubriendo las 24 h.",
          duracion: 8,
          inicioDefault: "06:00"
        },
        personalizado: {
          id: "personalizado",
          label: "Personalizado",
          descripcion: "Define turnos libremente y asigna a cada empleado qu\xE9 turno trabaja cada d\xEDa (ej. 2 empleados 5 d\xEDas L\u2013V y uno rotativo 4 d\xEDas).",
          duracion: null,
          inicioDefault: "07:00"
        }
      };
      TIPOS_HORARIO_LIST = [TIPOS_HORARIO["12x12"], TIPOS_HORARIO["8x24"], TIPOS_HORARIO.personalizado];
    }
  });

  // src/lib/contVirtualCatalogo.js
  var AVISO_FALTA_CONT_VIRTUAL, DESTINOS_CATALOGO, IDS_DESTINOS;
  var init_contVirtualCatalogo = __esm({
    "src/lib/contVirtualCatalogo.js"() {
      init_define_import_meta_env();
      AVISO_FALTA_CONT_VIRTUAL = "Faltan tablas de IE / Cont Virtual. En Supabase \u2192 SQL Editor ejecuta: supabase/fix_contabilidad_completo.sql (o solo fix_cont_virtual.sql + fix_cont_virtual_detalle.sql + fix_cont_virtual_ingresos.sql).";
      DESTINOS_CATALOGO = [
        { id: "abarrotes", label: "Corte Abarrotes", corte: true },
        { id: "virtual", label: "Corte Virtual", corte: true },
        { id: "garage", label: "Corte Garage", corte: true },
        { id: "vales", label: "Vales", corte: false },
        { id: "registro_gastos", label: "Registro de gastos", corte: false }
      ];
      IDS_DESTINOS = DESTINOS_CATALOGO.map((d) => d.id);
    }
  });

  // src/lib/valesCatalogoIe.js
  var init_valesCatalogoIe = __esm({
    "src/lib/valesCatalogoIe.js"() {
      init_define_import_meta_env();
      init_contVirtualCatalogo();
      init_valesCategorias();
    }
  });

  // src/lib/pinBeneficiarioConsumo.js
  var init_pinBeneficiarioConsumo = __esm({
    "src/lib/pinBeneficiarioConsumo.js"() {
      init_define_import_meta_env();
      init_valesCatalogoIe();
      init_contabilidadConstants();
      init_usuariosAuth();
    }
  });

  // src/lib/empleadosVisibles.js
  var init_empleadosVisibles = __esm({
    "src/lib/empleadosVisibles.js"() {
      init_define_import_meta_env();
      init_sucursales();
      init_contabilidadConstants();
      init_roles();
      init_turnos();
      init_pinBeneficiarioConsumo();
    }
  });

  // src/lib/notificacionesDispositivo.js
  var init_notificacionesDispositivo = __esm({
    "src/lib/notificacionesDispositivo.js"() {
      init_define_import_meta_env();
      init_branding();
      init_roles();
      init_buzonUsuario();
      init_empleadosVisibles();
    }
  });

  // src/lib/dispositivoUsuario.js
  var init_dispositivoUsuario = __esm({
    "src/lib/dispositivoUsuario.js"() {
      init_define_import_meta_env();
      init_roles();
      init_cubreTurno();
      init_sucursales();
    }
  });

  // src/lib/supabase.js
  var init_supabase = __esm({
    "src/lib/supabase.js"() {
      init_define_import_meta_env();
    }
  });

  // src/lib/webPush.js
  var init_webPush = __esm({
    "src/lib/webPush.js"() {
      init_define_import_meta_env();
      init_dispositivoUsuario();
      init_notificacionesDispositivo();
      init_supabase();
    }
  });

  // src/lib/contabilidadNotificaciones.js
  var TIPOS_NOTIF, TIPOS_ALERTA_CT_CAJERO, TIPOS_ALERTA_FONDO_CAJERO, TIPOS_ALERTA_CANCELACION_RUTA, TIPOS_ALERTA_EXTENSION_TURNO;
  var init_contabilidadNotificaciones = __esm({
    "src/lib/contabilidadNotificaciones.js"() {
      init_define_import_meta_env();
      init_notificacionesDispositivo();
      init_webPush();
      TIPOS_NOTIF = {
        VALE_PENDIENTE: "vale_pendiente_admin",
        PRESTAMO_ADMIN: "prestamo_pendiente_admin",
        PRESTAMO_SOCIO: "prestamo_pendiente_socio",
        PRESTAMO_INTERAREA: "prestamo_interarea",
        PRESTAMO_SUCURSAL: "prestamo_sucursal",
        INCIDENCIA: "incidencia_tienda",
        CONSUMO_CORTE: "consumo_corte_pendiente",
        RECOLECCION_POST_LIQ: "recoleccion_post_liquidacion",
        RECOLECCION_CORTE_IE: "recoleccion_corte_pendiente_ie",
        RECOLECCION_REPARTIDOR: "recoleccion_repartidor",
        INVERSION_OFICINA: "inversion_oficina_proveedor",
        RIF_ABIERTO: "rif_abierto",
        RIF_LIQUIDADO: "rif_liquidado",
        RIF_VENCIDO: "rif_vencido",
        GASTO_EVIDENCIA: "gasto_evidencia_pendiente",
        CT_SOLICITUD: "ct_solicitud",
        CT_ACEPTADA: "ct_aceptada",
        CT_RECHAZADA: "ct_rechazada",
        CT_CANCELADA: "ct_cancelada",
        CT_HOLD: "ct_hold",
        CT_EVALUACION_ALERTA: "ct_evaluacion_alerta",
        CONTRATACION: "contratacion_aspirante",
        ASALTO: "asalto_en_proceso",
        FONDO_SERVICIO_PIN: "fondo_servicio_pin",
        RUTA_CANCELACION_PIN: "ruta_cancelacion_pin",
        EXTENSION_TURNO_PIN: "extension_turno_pin"
      };
      TIPOS_ALERTA_CT_CAJERO = [
        TIPOS_NOTIF.CT_RECHAZADA,
        TIPOS_NOTIF.CT_ACEPTADA,
        TIPOS_NOTIF.CT_EVALUACION_ALERTA
      ];
      TIPOS_ALERTA_FONDO_CAJERO = [
        TIPOS_NOTIF.FONDO_SERVICIO_PIN
      ];
      TIPOS_ALERTA_CANCELACION_RUTA = [
        TIPOS_NOTIF.RUTA_CANCELACION_PIN
      ];
      TIPOS_ALERTA_EXTENSION_TURNO = [
        TIPOS_NOTIF.EXTENSION_TURNO_PIN
      ];
    }
  });

  // src/lib/proveedorEntregas.js
  var init_proveedorEntregas = __esm({
    "src/lib/proveedorEntregas.js"() {
      init_define_import_meta_env();
      init_sucursales();
    }
  });

  // src/lib/inventarioMultitienda.js
  var init_inventarioMultitienda = __esm({
    "src/lib/inventarioMultitienda.js"() {
      init_define_import_meta_env();
      init_sucursales();
    }
  });

  // src/lib/departamentos.js
  var init_departamentos = __esm({
    "src/lib/departamentos.js"() {
      init_define_import_meta_env();
    }
  });

  // src/lib/buscarProductoTexto.js
  var init_buscarProductoTexto = __esm({
    "src/lib/buscarProductoTexto.js"() {
      init_define_import_meta_env();
    }
  });

  // src/lib/favoritosSucursalesPersistencia.js
  var init_favoritosSucursalesPersistencia = __esm({
    "src/lib/favoritosSucursalesPersistencia.js"() {
      init_define_import_meta_env();
      init_sucursales();
    }
  });

  // src/lib/productoForm.js
  var init_productoForm = __esm({
    "src/lib/productoForm.js"() {
      init_define_import_meta_env();
      init_inventarioMultitienda();
      init_buscarProductoTexto();
      init_sucursales();
      init_favoritosSucursalesPersistencia();
    }
  });

  // src/lib/proveedorCatalogo.js
  var init_proveedorCatalogo = __esm({
    "src/lib/proveedorCatalogo.js"() {
      init_define_import_meta_env();
      init_productoForm();
    }
  });

  // src/lib/proveedoresCostoRuta.js
  var init_proveedoresCostoRuta = __esm({
    "src/lib/proveedoresCostoRuta.js"() {
      init_define_import_meta_env();
      init_proveedorEntregas();
      init_proveedorCatalogo();
      init_productoForm();
    }
  });

  // src/lib/valorInventario.js
  var init_valorInventario = __esm({
    "src/lib/valorInventario.js"() {
      init_define_import_meta_env();
      init_departamentos();
      init_productoForm();
      init_proveedoresCostoRuta();
    }
  });

  // src/lib/foliosPago.js
  var init_foliosPago = __esm({
    "src/lib/foliosPago.js"() {
      init_define_import_meta_env();
    }
  });

  // src/lib/foliosInventario.js
  var init_foliosInventario = __esm({
    "src/lib/foliosInventario.js"() {
      init_define_import_meta_env();
      init_sucursales();
      init_corteCaja();
      init_foliosPago();
    }
  });

  // src/lib/inventarioMovimientos.js
  var init_inventarioMovimientos = __esm({
    "src/lib/inventarioMovimientos.js"() {
      init_define_import_meta_env();
      init_inventarioMultitienda();
      init_sucursales();
      init_valorInventario();
      init_proveedoresCostoRuta();
      init_productoForm();
      init_foliosInventario();
    }
  });

  // src/lib/traspasosInventario.js
  var init_traspasosInventario = __esm({
    "src/lib/traspasosInventario.js"() {
      init_define_import_meta_env();
      init_inventarioMultitienda();
      init_sucursales();
      init_inventarioMovimientos();
      init_foliosInventario();
    }
  });

  // src/lib/corteContabilidad/smokingSustentoInventario.js
  var init_smokingSustentoInventario = __esm({
    "src/lib/corteContabilidad/smokingSustentoInventario.js"() {
      init_define_import_meta_env();
      init_sucursales();
      init_inventarioMovimientos();
      init_foliosInventario();
      init_traspasosInventario();
      init_proveedorEntregas();
      init_valorInventario();
      init_proveedoresCostoRuta();
    }
  });

  // src/lib/corteContabilidad/gastoManualSinFuga.js
  var init_gastoManualSinFuga = __esm({
    "src/lib/corteContabilidad/gastoManualSinFuga.js"() {
      init_define_import_meta_env();
      init_sucursales();
    }
  });

  // src/lib/archivo.js
  var init_archivo = __esm({
    "src/lib/archivo.js"() {
      init_define_import_meta_env();
    }
  });

  // src/lib/corteContabilidad/store.js
  function lsKey(sucursal, modulo, tipo) {
    const sid = normalizarCodigoTienda(sucursal) || "MAIN";
    return `pos3b_corte_${tipo}_${modulo}_${sid}`;
  }
  function sucursalIdCorte(sucursal) {
    return normalizarCodigoTienda(sucursal) || "MAIN";
  }
  function faltaTabla(error, hint) {
    const msg = String(error?.message || error || "").toLowerCase();
    return error?.code === "42P01" || msg.includes(hint) || msg.includes("schema cache") && msg.includes(hint);
  }
  async function registrarCierreCorte(supabase, payload) {
    const rowPayload = {
      ...payload,
      sucursal_id: sucursalIdCorte(payload?.sucursal_id)
    };
    if (!supabase) {
      const key = lsKey(rowPayload.sucursal_id, rowPayload.modulo, "historial");
      let hist = [];
      try {
        hist = JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        hist = [];
      }
      const row = { ...rowPayload, id: `local-${Date.now()}`, created_at: (/* @__PURE__ */ new Date()).toISOString() };
      hist.unshift(row);
      localStorage.setItem(key, JSON.stringify(hist.slice(0, 100)));
      return { ok: true, soloLocal: true, data: row };
    }
    const { data, error } = await supabase.from("cortes_contabilidad_cierres").insert([rowPayload]).select("*").single();
    if (error && faltaTabla(error, "cortes_contabilidad_cierres")) {
      return { ok: false, error: AVISO_FALTA_CORTES };
    }
    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
  }
  var AVISO_FALTA_CORTES;
  var init_store = __esm({
    "src/lib/corteContabilidad/store.js"() {
      init_define_import_meta_env();
      init_calc();
      init_contabilidadConstants();
      init_contabilidadNotificaciones();
      init_sucursales();
      init_proveedorEntregas();
      init_smokingSustentoInventario();
      init_foliosInventario();
      init_gastoManualSinFuga();
      init_traspasosInventario();
      init_empleadosVisibles();
      init_archivo();
      AVISO_FALTA_CORTES = "Faltan tablas de cortes contabilidad. En Supabase \u2192 SQL Editor ejecuta: supabase/fix_contabilidad_completo.sql (o solo fix_cortes_contabilidad.sql).";
    }
  });

  // src/lib/ventasOffline.js
  function leerColaRaw() {
    try {
      const raw = localStorage.getItem(LS_COLA_VENTAS_OFFLINE);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function leerColaVentasOffline(sucursal = null) {
    const lista = leerColaRaw().filter((v) => v && v.estado !== "sync_ok");
    if (!sucursal) return lista;
    const sid = normalizarCodigoTienda(sucursal);
    return lista.filter((v) => normalizarCodigoTienda(v.sucursal_id) === sid);
  }
  var LS_COLA_VENTAS_OFFLINE;
  var init_ventasOffline = __esm({
    "src/lib/ventasOffline.js"() {
      init_define_import_meta_env();
      init_sucursales();
      init_inventarioMovimientos();
      init_inventarioMultitienda();
      LS_COLA_VENTAS_OFFLINE = "pos3b_ventas_offline_cola";
    }
  });

  // src/lib/movimientosCaja.js
  function faltaTablaCancelaciones(error) {
    const msg = String(error?.message || error || "").toLowerCase();
    return error?.code === "42P01" || msg.includes("schema cache") || msg.includes("relation") || msg.includes("cancelaciones") && (msg.includes("does not exist") || msg.includes("could not find"));
  }
  function leerCancelacionesLocales() {
    try {
      const raw = localStorage.getItem(LS_CANCELACIONES);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  function resumirMovimientosCaja(ventas, cancelaciones) {
    const base = resumirVentas(ventas);
    const porMetodo = {};
    for (const d of base.detalleMetodos) porMetodo[d.metodo] = d.monto;
    let totalCancelaciones = 0;
    const gruposCancel = { efectivo: 0, tarjeta: 0, transferencia: 0, qr: 0, otros: 0 };
    for (const c of cancelaciones || []) {
      const t = Number(c.total) || 0;
      totalCancelaciones += t;
      const mp = String(c.metodo_pago || "Sin m\xE9todo");
      porMetodo[mp] = (porMetodo[mp] || 0) - t;
      const g = clasificarPago(mp);
      gruposCancel[g] = (gruposCancel[g] || 0) + t;
    }
    const grupos = { ...base.grupos };
    for (const [g, m] of Object.entries(gruposCancel)) {
      grupos[g] = (grupos[g] || 0) - m;
    }
    const detalleMetodos = Object.entries(porMetodo).filter(([, m]) => Math.abs(m) >= 1e-3).map(([metodo, monto]) => ({ metodo, monto })).sort((a, b) => b.monto - a.monto);
    const totalNeto = base.total - totalCancelaciones;
    return {
      ...base,
      totalBruto: base.total,
      totalCancelaciones,
      total: totalNeto,
      ticketsBruto: base.tickets,
      cancelaciones: (cancelaciones || []).length,
      grupos,
      efectivoEsperado: grupos.efectivo,
      electronico: grupos.tarjeta + grupos.transferencia + grupos.qr + grupos.otros,
      detalleMetodos
    };
  }
  async function cargarCancelacionesDelDia(supabase, { sucursal, fecha, turno = null }) {
    const { ini, fin } = rangoConsultaCorte(fecha, turno);
    const suc = sucursal ? normalizarCodigoTienda(sucursal) : null;
    const locales = leerCancelacionesLocales().filter((c) => {
      if (suc && normalizarCodigoTienda(c.sucursal_id || c.sucursal) !== suc) return false;
      const t = new Date(c.created_at || c.hora || 0);
      return t >= ini && t <= fin;
    });
    if (!supabase) return { data: locales, soloLocal: true };
    let q = supabase.from("cancelaciones").select("*").gte("created_at", ini.toISOString()).lte("created_at", fin.toISOString()).order("created_at", { ascending: true });
    if (suc) {
      const vars = equivalentesCodigoTienda(suc);
      q = vars.length > 1 ? q.in("sucursal_id", vars) : q.eq("sucursal_id", suc);
    }
    const { data, error } = await q;
    if (error) {
      if (faltaTablaCancelaciones(error)) {
        return { data: locales, soloLocal: true, aviso: AVISO_FALTA_CANCELACIONES };
      }
      return { data: locales, error: error.message, soloLocal: false };
    }
    const nube = (data || []).map((c) => ({
      id: c.id,
      venta_id: c.venta_id,
      sucursal_id: c.sucursal_id,
      usuario: c.usuario,
      metodo_pago: c.metodo_pago,
      articulos: c.articulos || [],
      total: Number(c.total) || 0,
      motivo: c.motivo,
      created_at: c.created_at,
      origen: "nube"
    }));
    if (nube.length === 0 && locales.length > 0) return { data: locales, soloLocal: true };
    return { data: nube.length ? nube : locales, soloLocal: nube.length === 0 };
  }
  async function cargarDiaCaja(supabase, { sucursal, fecha, turno = null }) {
    const { ini, fin, modo } = rangoConsultaCorte(fecha, turno);
    const suc = sucursal ? normalizarCodigoTienda(sucursal) : null;
    const colsFull = "id,total,metodo_pago,vendedor,sucursal_id,articulos,created_at,turno_id,turno_nombre,usuario_id";
    const colsBase = "id,total,metodo_pago,vendedor,sucursal_id,articulos,created_at";
    let ventasRaw = [];
    let error = null;
    let sinFecha = false;
    let aviso = null;
    let r = await consultarVentas(supabase, {
      columns: colsFull,
      desde: ini,
      hasta: fin,
      sucursal: suc,
      limit: 2e3
    });
    if (r.error && String(r.error).includes("turno")) {
      r = await consultarVentas(supabase, {
        columns: colsBase,
        desde: ini,
        hasta: fin,
        sucursal: suc,
        limit: 2e3
      });
      aviso = "Ejecuta supabase/fix_turnos_seguridad.sql para ligar ventas al turno (turno_id en ventas).";
    }
    ventasRaw = r.data || [];
    error = r.error;
    sinFecha = r.sinFecha;
    if (r.aviso) aviso = r.aviso;
    try {
      const offline = leerColaVentasOffline(suc).filter((v) => {
        const t = v?.created_at ? new Date(v.created_at) : null;
        if (!t || Number.isNaN(t.getTime())) return false;
        return t >= ini && t <= fin;
      });
      if (offline.length) {
        const ids = new Set(ventasRaw.map((v) => String(v.id)));
        for (const v of offline) {
          if (ids.has(String(v.id))) continue;
          ventasRaw.push({
            ...v,
            articulos: Array.isArray(v.articulos) ? v.articulos : [],
            origen: v.origen || "offline"
          });
          ids.add(String(v.id));
        }
      }
    } catch {
    }
    const ventas = !turno || modo === "turno_nocturno" ? ventasRaw : filtrarVentasPorTurno(ventasRaw, turno);
    const cancel = await cargarCancelacionesDelDia(supabase, { sucursal: suc, fecha, turno });
    let ventasOtrasTiendas = null;
    if (supabase && (!ventas || ventas.length === 0)) {
      const { data: todas } = await supabase.from("ventas").select("sucursal_id").gte("created_at", ini.toISOString()).lte("created_at", fin.toISOString());
      const counts = {};
      for (const v of todas || []) {
        const s = normalizarCodigoTienda(v.sucursal_id) || "\u2014";
        if (suc && s === suc) continue;
        counts[s] = (counts[s] || 0) + 1;
      }
      if (Object.keys(counts).length) ventasOtrasTiendas = counts;
    }
    if (!aviso && modo === "turno_nocturno" && turno) {
      aviso = `Turno nocturno: mostrando ventas de ${turno.hora_inicio} (${fecha}) a ${turno.hora_fin} (d\xEDa siguiente), hora Nogales.`;
    }
    return {
      ventas: ventas || [],
      ventasDiaSinTurno: ventasRaw.length,
      cancelaciones: cancel.data || [],
      error: error || null,
      aviso: cancel.aviso || aviso || null,
      ventasOtrasTiendas
    };
  }
  var LS_CANCELACIONES, AVISO_FALTA_CANCELACIONES;
  var init_movimientosCaja = __esm({
    "src/lib/movimientosCaja.js"() {
      init_define_import_meta_env();
      init_corteCaja();
      init_ventasQuery();
      init_turnos();
      init_inventarioMovimientos();
      init_sucursales();
      init_ventasOffline();
      LS_CANCELACIONES = "pos3b_cancelaciones";
      AVISO_FALTA_CANCELACIONES = "Falta la tabla cancelaciones. En Supabase \u2192 SQL Editor ejecuta: supabase/fix_cancelaciones.sql";
    }
  });

  // src/lib/conteoDepartamento.js
  var init_conteoDepartamento = __esm({
    "src/lib/conteoDepartamento.js"() {
      init_define_import_meta_env();
      init_valorInventario();
      init_inventarioMovimientos();
      init_inventarioMultitienda();
      init_productoForm();
      init_sucursales();
    }
  });

  // src/lib/consultasInventario.js
  var init_consultasInventario = __esm({
    "src/lib/consultasInventario.js"() {
      init_define_import_meta_env();
      init_inventarioMovimientos();
      init_buscarProductoTexto();
      init_sucursales();
      init_ventasQuery();
      init_conteoDepartamento();
      init_corteCaja();
    }
  });

  // src/lib/estadisticasData.js
  var TIENDAS_FOCO_ESTADISTICAS;
  var init_estadisticasData = __esm({
    "src/lib/estadisticasData.js"() {
      init_define_import_meta_env();
      init_consultasInventario();
      init_sucursales();
      init_valorInventario();
      init_inventarioMultitienda();
      init_corteAbarrotesDiario();
      TIENDAS_FOCO_ESTADISTICAS = listarSucursalesOperativas();
    }
  });

  // src/lib/metaVentasMes.js
  var init_metaVentasMes = __esm({
    "src/lib/metaVentasMes.js"() {
      init_define_import_meta_env();
    }
  });

  // src/lib/resumenOperativoData.js
  var init_resumenOperativoData = __esm({
    "src/lib/resumenOperativoData.js"() {
      init_define_import_meta_env();
      init_ventasQuery();
      init_corteCaja();
      init_consultasInventario();
      init_valorInventario();
      init_inventarioMultitienda();
      init_sucursales();
      init_consultasInventario();
      init_estadisticasData();
      init_metaVentasMes();
    }
  });

  // src/lib/contVirtualEgresos.js
  function faltaTabla2(error) {
    const msg = String(error?.message || "").toLowerCase();
    return error?.code === "42P01" || msg.includes("cont_virtual_egresos") || msg.includes("schema cache") && msg.includes("cont_virtual");
  }
  function round23(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }
  function leerLocal() {
    try {
      const raw = localStorage.getItem(LS_EGRESOS);
      if (raw) {
        const j = JSON.parse(raw);
        if (Array.isArray(j)) return j;
      }
    } catch {
    }
    return [];
  }
  function ymdEnRango(ymd, desde, hasta) {
    const f = String(ymd || "").slice(0, 10);
    if (!f) return false;
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  }
  function normalizarCuentaIe(raw, fallback = "virtual") {
    const c = String(raw || fallback).toLowerCase();
    if (c === "garage") return "garage";
    if (c === "abarrotes") return "abarrotes";
    return "virtual";
  }
  async function listarEgresosContVirtual(supabase, { desde, hasta, sucursal, cuenta } = {}) {
    const esActivo = (e) => String(e?.fuente || "") !== "eliminado" && round23(e?.monto) > 0;
    if (!supabase) {
      let lista = leerLocal();
      lista = lista.filter((e) => ymdEnRango(e.fecha, desde, hasta));
      if (sucursal) lista = lista.filter((e) => e.sucursal_id === sucursal);
      if (cuenta) {
        const c = normalizarCuentaIe(cuenta);
        lista = lista.filter((e) => normalizarCuentaIe(e.cuenta) === c);
      }
      return { data: lista.filter(esActivo) };
    }
    let q = supabase.from("cont_virtual_egresos").select("*").order("fecha", { ascending: false }).limit(3e3);
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    if (sucursal) q = q.eq("sucursal_id", sucursal);
    if (cuenta) q = q.eq("cuenta", normalizarCuentaIe(cuenta));
    const { data, error } = await q;
    if (error && faltaTabla2(error)) {
      let lista = leerLocal().filter((e) => ymdEnRango(e.fecha, desde, hasta));
      if (sucursal) lista = lista.filter((e) => e.sucursal_id === sucursal);
      if (cuenta) {
        const c = normalizarCuentaIe(cuenta);
        lista = lista.filter((e) => normalizarCuentaIe(e.cuenta) === c);
      }
      return { data: lista.filter(esActivo), aviso: AVISO_FALTA_CONT_VIRTUAL };
    }
    if (error) {
      if (String(error.message || "").toLowerCase().includes("cuenta") && cuenta) {
        const retry = await supabase.from("cont_virtual_egresos").select("*").order("fecha", { ascending: false }).limit(3e3);
        let lista = retry.data || [];
        if (desde) lista = lista.filter((e) => ymdEnRango(e.fecha, desde, hasta));
        if (hasta) lista = lista.filter((e) => ymdEnRango(e.fecha, desde, hasta));
        if (sucursal) lista = lista.filter((e) => e.sucursal_id === sucursal);
        return { data: lista.filter(esActivo) };
      }
      return { data: [], error: error.message };
    }
    return { data: (data || []).filter(esActivo) };
  }
  var LS_EGRESOS;
  var init_contVirtualEgresos = __esm({
    "src/lib/contVirtualEgresos.js"() {
      init_define_import_meta_env();
      init_contVirtualCatalogo();
      init_contabilidadConstants();
      init_valesCategorias();
      init_valesCatalogoIe();
      init_resumenOperativoData();
      init_corteCaja();
      LS_EGRESOS = "pos3b_cont_virtual_egresos";
    }
  });

  // src/lib/catalogoEmpleadoGastos.js
  var init_catalogoEmpleadoGastos = __esm({
    "src/lib/catalogoEmpleadoGastos.js"() {
      init_define_import_meta_env();
      init_sucursales();
      init_roles();
      init_empleadosVisibles();
    }
  });

  // src/lib/corteContabilidad/catalogoGastos.js
  function textoGastoNorm(s) {
    return String(s || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function subcuentaEnNomina(sub) {
    const s = textoGastoNorm(sub);
    if (!s) return false;
    return s.includes("CONSUMO") || s.includes("RECARG") || s.includes("ANTICIPO") || s.includes("FALTANTE");
  }
  function gastoDescuentaNomina(_modulo, categoria, subcategoria = "") {
    const cat = textoGastoNorm(categoria);
    const sub = textoGastoNorm(subcategoria);
    if (cat === "VALES" && sub.includes("GASOLINA")) return false;
    if (sub.includes("GASOLINA") && (cat === "VALES" || cat.includes("VALE"))) return false;
    if (cat === "CONSUMO" || cat.includes("CONSUMO")) return true;
    if (cat === "RECARGAS" || cat === "RECARGA" || cat.includes("RECARG")) return true;
    if (cat === "ANTICIPOS" || cat === "ANTICIPO" || cat.includes("ANTICIPO")) return true;
    if (cat === "FALTANTE" || cat.includes("FALTANTE")) return true;
    if (cat === "EMPLEADO" || cat.startsWith("EMPLEADO ")) {
      if (!sub) return true;
      return subcuentaEnNomina(sub);
    }
    if (subcuentaEnNomina(sub)) return true;
    return false;
  }
  var DEFAULT_PROVEEDORES_ABARROTES, DEFAULTS;
  var init_catalogoGastos = __esm({
    "src/lib/corteContabilidad/catalogoGastos.js"() {
      init_define_import_meta_env();
      init_contVirtualCatalogo();
      init_catalogoEmpleadoGastos();
      DEFAULT_PROVEEDORES_ABARROTES = {
        categoria: "PROVEEDORES",
        subcategorias: ["PAGO", "MERCANCIA", "OTROS"],
        fuente: "proveedores"
      };
      DEFAULTS = {
        virtual: [],
        abarrotes: [{ ...DEFAULT_PROVEEDORES_ABARROTES }],
        garage: []
      };
    }
  });

  // src/lib/corteAbarrotesDiario.js
  var corteAbarrotesDiario_exports = {};
  __export(corteAbarrotesDiario_exports, {
    CUTOVER_CIERRE_DIARIO: () => CUTOVER_CIERRE_DIARIO,
    PREFIJO_CORTE_GENERAL: () => PREFIJO_CORTE_GENERAL,
    TIPO_CIERRE_DIARIO: () => TIPO_CIERRE_DIARIO,
    TIPO_CIERRE_OPERATIVO: () => TIPO_CIERRE_OPERATIVO,
    armarEstadoCorteDiario: () => armarEstadoCorteDiario,
    asegurarCorteDiarioAbarrotes: () => asegurarCorteDiarioAbarrotes,
    asegurarCortesDiariosAbarrotes: () => asegurarCortesDiariosAbarrotes,
    buscarCierreDiarioExistente: () => buscarCierreDiarioExistente,
    esCierreContableAbarrotes: () => esCierreContableAbarrotes,
    fechaNegocioCierre: () => fechaNegocioCierre,
    folioCorteDiario: () => folioCorteDiario,
    folioCorteGeneral: () => folioCorteGeneral,
    listarGastosAbarrotesDelDia: () => listarGastosAbarrotesDelDia,
    numeroFolioCorteGeneral: () => numeroFolioCorteGeneral,
    resumenEgresosDia: () => resumenEgresosDia,
    siguienteFolioCorteGeneral: () => siguienteFolioCorteGeneral,
    tipoCierreAbarrotes: () => tipoCierreAbarrotes
  });
  function fechaNegocioCierre(row) {
    const d = row?.detalle && typeof row.detalle === "object" ? row.detalle : {};
    return ymdNegocioDesdeIso(d.fecha_negocio) || ymdNegocioDesdeIso(row?.created_at) || "";
  }
  function tipoCierreAbarrotes(row) {
    return String(row?.detalle?.tipo_cierre || "").toLowerCase();
  }
  function esCierreContableAbarrotes(row) {
    const t = tipoCierreAbarrotes(row);
    if (t === TIPO_CIERRE_DIARIO) return true;
    if (t === TIPO_CIERRE_OPERATIVO) return false;
    if (t.startsWith("recoleccion") || t === "actualizacion") return false;
    const fecha = fechaNegocioCierre(row);
    if ((!t || t === "cierre") && fecha && fecha < CUTOVER_CIERRE_DIARIO) return true;
    if ((!t || t === "cierre") && !fecha) {
      const created = ymdNegocioDesdeIso(row?.created_at);
      return Boolean(created && created < CUTOVER_CIERRE_DIARIO);
    }
    return false;
  }
  function folioCorteGeneral(n) {
    return `${PREFIJO_CORTE_GENERAL}-${String(Math.max(1, Math.round(Number(n) || 1))).padStart(5, "0")}`;
  }
  function numeroFolioCorteGeneral(folio) {
    const m = String(folio || "").trim().match(/^CGA-(\d+)$/i);
    return m ? Number(m[1]) : 0;
  }
  function folioCorteDiario(fechaYmd) {
    const f = String(fechaYmd || "").slice(0, 10).replace(/-/g, "");
    return `ABD-${f || "00000000"}`;
  }
  async function siguienteFolioCorteGeneral(supabase, { sucursal } = {}) {
    const suc = normalizarCodigoTienda(sucursal);
    if (!supabase || !suc) return folioCorteGeneral(1);
    const { equivalentesCodigoTienda: equivalentesCodigoTienda2 } = await Promise.resolve().then(() => (init_sucursales(), sucursales_exports));
    const vars = equivalentesCodigoTienda2(suc);
    const { data, error } = await supabase.from("cortes_contabilidad_cierres").select("folio").eq("modulo", "abarrotes").in("sucursal_id", vars.length ? vars : [suc]).ilike("folio", `${PREFIJO_CORTE_GENERAL}-%`).limit(2e3);
    if (error) return folioCorteGeneral(1);
    const max = Math.max(0, ...(data || []).map((r) => numeroFolioCorteGeneral(r.folio)));
    return folioCorteGeneral(max + 1);
  }
  function resumenEgresosDia({ gastos = [], egresosIe = [] } = {}) {
    const gastosTotal = round2(gastos.reduce((a, g) => a + (Number(g.monto) || 0), 0));
    const consumos = gastos.filter((g) => gastoDescuentaNomina("abarrotes", g.categoria, g.subcategoria));
    const consumosTotal = round2(consumos.reduce((a, g) => a + (Number(g.monto) || 0), 0));
    const ie = egresosIe.filter((e) => e.ref_tabla !== "cortes_contabilidad_gastos" && Number(e.monto) > 0);
    const ieTotal = round2(ie.reduce((a, e) => a + (Number(e.monto) || 0), 0));
    return {
      gastos_total: gastosTotal,
      consumos_total: consumosTotal,
      egresos_ie: ie.map((e) => ({
        id: e.id,
        categoria: e.categoria_nombre || e.categoria_id || "Sin categor\xEDa",
        subcategoria: e.subcategoria_nombre || "",
        descripcion: e.descripcion || "",
        usuario_nombre: e.usuario_nombre || "",
        monto: round2(e.monto)
      })),
      egresos_ie_total: ieTotal,
      egresos_total_dia: round2(gastosTotal + ieTotal)
    };
  }
  function armarEstadoCorteDiario({
    venta = 0,
    tarjeta = 0,
    cajaAnterior = 0,
    fechaNegocio,
    folio = null
  } = {}) {
    return {
      fondo_fijo: 0,
      caja_anterior: round2(cajaAnterior),
      venta: round2(venta),
      tarjeta: round2(tarjeta),
      recoleccion: 0,
      folio: folio || folioCorteDiario(fechaNegocio),
      comentarios: `Corte diario autom\xE1tico \xB7 ${fechaNegocio}`,
      fecha_negocio: fechaNegocio,
      venta_pos_por_corte: {}
    };
  }
  async function listarGastosAbarrotesDelDia(supabase, { sucursal, fecha } = {}) {
    const suc = normalizarCodigoTienda(sucursal);
    if (!supabase || !suc || !fecha) return { data: [], error: null };
    const desdeIso = inicioDia(fecha).toISOString();
    const hastaIso = finDia(fecha).toISOString();
    const { data, error } = await supabase.from("cortes_contabilidad_gastos").select("*").eq("modulo", "abarrotes").eq("sucursal_id", suc).gte("created_at", desdeIso).lte("created_at", hastaIso).order("created_at", { ascending: true }).limit(5e3);
    if (error) {
      const { equivalentesCodigoTienda: equivalentesCodigoTienda2 } = await Promise.resolve().then(() => (init_sucursales(), sucursales_exports));
      const vars = equivalentesCodigoTienda2(suc);
      if (vars.length > 1) {
        const r2 = await supabase.from("cortes_contabilidad_gastos").select("*").eq("modulo", "abarrotes").in("sucursal_id", vars).gte("created_at", desdeIso).lte("created_at", hastaIso).order("created_at", { ascending: true }).limit(5e3);
        if (r2.error) return { data: [], error: r2.error.message };
        return {
          data: (r2.data || []).filter((g) => {
            const est = g.estado_aprobacion;
            return !est || est === "aprobado";
          }),
          error: null
        };
      }
      return { data: [], error: error.message };
    }
    return {
      data: (data || []).filter((g) => {
        const est = g.estado_aprobacion;
        return !est || est === "aprobado";
      }),
      error: null
    };
  }
  async function buscarCierreDiarioExistente(supabase, { sucursal, fecha } = {}) {
    const suc = normalizarCodigoTienda(sucursal);
    if (!supabase || !suc || !fecha) return { data: null, error: null };
    const desdeIso = inicioDia(addDaysYmd(fecha, -1)).toISOString();
    const hastaIso = finDia(addDaysYmd(fecha, 2)).toISOString();
    const { data, error } = await supabase.from("cortes_contabilidad_cierres").select("*").eq("modulo", "abarrotes").eq("sucursal_id", suc).gte("created_at", desdeIso).lte("created_at", hastaIso).order("created_at", { ascending: false }).limit(5);
    if (error) return { data: null, error: error.message };
    const hit = (data || []).find((c) => {
      if (c.deleted_at) return false;
      if (tipoCierreAbarrotes(c) !== TIPO_CIERRE_DIARIO) return false;
      return fechaNegocioCierre(c) === fecha;
    });
    return { data: hit || null, error: null };
  }
  async function cajaAnteriorDesdeDiarioPrevio(supabase, { sucursal, fecha } = {}) {
    const prevFecha = addDaysYmd(fecha, -1);
    const prev = await buscarCierreDiarioExistente(supabase, { sucursal, fecha: prevFecha });
    if (prev.data) return round2(Number(prev.data.caja_actual) || 0);
    return 0;
  }
  async function asegurarCorteDiarioAbarrotes(supabase, {
    sucursal,
    fecha,
    now = /* @__PURE__ */ new Date(),
    forzar = false
  } = {}) {
    const suc = normalizarCodigoTienda(sucursal);
    const ymd = String(fecha || "").slice(0, 10);
    const hoy = hoyYmdNogales(now);
    if (!supabase || !suc || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      return { ok: false, skipped: true, error: "Par\xE1metros inv\xE1lidos." };
    }
    if (ymd >= hoy) {
      return { ok: true, skipped: true, reason: "dia_en_curso" };
    }
    if (ymd < CUTOVER_CIERRE_DIARIO) {
      return { ok: true, skipped: true, reason: "antes_cutover" };
    }
    const existente = await buscarCierreDiarioExistente(supabase, { sucursal: suc, fecha: ymd });
    if (existente.data && !forzar) {
      return { ok: true, skipped: true, reason: "ya_existe", data: existente.data };
    }
    const dia = await cargarDiaCaja(supabase, { sucursal: suc, fecha: ymd, turno: null });
    const resumen = resumirMovimientosCaja(dia?.ventas || [], dia?.cancelaciones || []);
    const venta = round2(resumen.total || 0);
    const tarjeta = round2(Number(resumen.electronico) || 0);
    const gas = await listarGastosAbarrotesDelDia(supabase, { sucursal: suc, fecha: ymd });
    const gastos = gas.data || [];
    const cajaAnterior = await cajaAnteriorDesdeDiarioPrevio(supabase, { sucursal: suc, fecha: ymd });
    const ie = await listarEgresosContVirtual(supabase, { desde: ymd, hasta: ymd, sucursal: suc, cuenta: "abarrotes" });
    const egresosDia = resumenEgresosDia({ gastos, egresosIe: ie?.data || [] });
    const folio = existente.data?.folio && numeroFolioCorteGeneral(existente.data.folio) ? existente.data.folio : await siguienteFolioCorteGeneral(supabase, { sucursal: suc });
    const estado = armarEstadoCorteDiario({
      venta,
      tarjeta,
      cajaAnterior,
      fechaNegocio: ymd,
      folio
    });
    const calc = calcularAbarrotes(estado, gastos);
    const gastosIds = gastos.map((g) => g.id).filter(Boolean);
    const gastosTotal = round2(calc.gastosTotal);
    const createdAt = finDia(ymd).toISOString();
    const payload = {
      sucursal_id: suc,
      modulo: "abarrotes",
      folio: estado.folio,
      turno: "Corte general",
      usuario_id: null,
      usuario_nombre: "Sistema \xB7 corte general",
      caja_actual: calc.cajaActual ?? 0,
      ventas: calc.venta ?? 0,
      created_at: createdAt,
      detalle: {
        ...estado,
        gastos,
        gastos_ids: gastosIds,
        gastos_total: gastosTotal,
        subtotal: calc.subtotal,
        tipo_cierre: TIPO_CIERRE_DIARIO,
        automatico: true,
        corte_general: true,
        fecha_negocio: ymd,
        egresos_dia: egresosDia,
        origen: "medianoche",
        resumen_pos: {
          tickets: resumen.ticketsBruto || resumen.tickets || 0,
          cancelaciones: resumen.cancelaciones || 0,
          efectivo: round2(resumen.grupos?.efectivo || 0),
          electronico: tarjeta
        }
      }
    };
    const res = await registrarCierreCorte(supabase, payload);
    if (!res.ok) return { ok: false, error: res.error || "No se pudo guardar el corte diario." };
    return { ok: true, created: true, data: res.data, fecha: ymd, sucursal: suc };
  }
  async function asegurarCortesDiariosAbarrotes(supabase, {
    sucursal = null,
    desde = null,
    hasta = null,
    now = /* @__PURE__ */ new Date()
  } = {}) {
    if (!supabase) return { ok: false, error: "Sin conexi\xF3n.", creados: 0 };
    const hoy = ymdNogalesFromDate(now) || hoyYmdNogales();
    const fin = hasta && hasta < hoy ? hasta : addDaysYmd(hoy, -1);
    let ini = desde && desde >= CUTOVER_CIERRE_DIARIO ? desde : CUTOVER_CIERRE_DIARIO;
    if (ini > fin) return { ok: true, creados: 0, revisados: 0, resultados: [] };
    const minIni = addDaysYmd(fin, -44);
    if (ini < minIni) ini = minIni;
    const tiendas = sucursal ? [normalizarCodigoTienda(sucursal)].filter(Boolean) : listarSucursalesOperativas();
    const resultados = [];
    let creados = 0;
    let revisados = 0;
    for (const suc of tiendas) {
      for (let f = ini; f && f <= fin; f = addDaysYmd(f, 1)) {
        revisados += 1;
        const r = await asegurarCorteDiarioAbarrotes(supabase, {
          sucursal: suc,
          fecha: f,
          now
        });
        resultados.push({ sucursal: suc, fecha: f, ...r });
        if (r.created) creados += 1;
      }
    }
    return { ok: true, creados, revisados, resultados };
  }
  var TIPO_CIERRE_DIARIO, TIPO_CIERRE_OPERATIVO, CUTOVER_CIERRE_DIARIO, PREFIJO_CORTE_GENERAL;
  var init_corteAbarrotesDiario = __esm({
    "src/lib/corteAbarrotesDiario.js"() {
      init_define_import_meta_env();
      init_sucursales();
      init_corteCaja();
      init_calc();
      init_store();
      init_movimientosCaja();
      init_contVirtualEgresos();
      init_catalogoGastos();
      TIPO_CIERRE_DIARIO = "cierre_diario";
      TIPO_CIERRE_OPERATIVO = "cierre_operativo";
      CUTOVER_CIERRE_DIARIO = "2026-11-13";
      PREFIJO_CORTE_GENERAL = "CGA";
    }
  });
  init_corteAbarrotesDiario();
  return __toCommonJS(corteAbarrotesDiario_exports);
})();


const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const esperado = Deno.env.get('CRON_SECRET') || '';
  if (!esperado || req.headers.get('x-cron-secret') !== esperado) {
    return json({ ok: false, error: 'No autorizado.' }, 401);
  }
  const url = Deno.env.get('SUPABASE_URL') || '';
  const llave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !llave) return json({ ok: false, error: 'Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' }, 500);

  let opciones = {};
  try {
    const texto = await req.text();
    if (texto) opciones = JSON.parse(texto) || {};
  } catch {
    return json({ ok: false, error: 'Body JSON inválido.' }, 400);
  }

  const supabase = createClient(url, llave, { auth: { persistSession: false } });
  try {
    const r = await corteGeneral.asegurarCortesDiariosAbarrotes(supabase, {
      sucursal: opciones.sucursal || null,
      desde: opciones.desde || null,
      hasta: opciones.hasta || null,
      now: new Date(),
    });
    const resultados = r.resultados || [];
    const creados = resultados.filter((x) => x.created).map((x) => ({ sucursal: x.sucursal, fecha: x.fecha, folio: x.data?.folio }));
    const errores = resultados.filter((x) => x.ok === false).map((x) => ({ sucursal: x.sucursal, fecha: x.fecha, error: x.error }));
    const ok = r.ok !== false && errores.length === 0;
    return json({ ok, creados: creados.length, revisados: r.revisados || 0, detalle: creados, errores }, ok ? 200 : 500);
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
});
