import { guardarPerifericos, leerPerifericos, nuevoIdConfig } from './posConfig.js';

export const EVENTO_PERIFERICOS = 'pos3b-perifericos-updated';

/** Puerto serial abierto en esta sesión (no persiste entre recargas). */
let puertoSerialActivo = null;
/** Dispositivo USB autorizado en esta sesión. */
let dispositivoUsbActivo = null;

export function soportaWebSerial() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function soportaWebUsb() {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

export function soportaWebBluetooth() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function puertoSerialConectado() {
  return Boolean(puertoSerialActivo?.readable);
}

export function dispositivoUsbConectado() {
  return Boolean(dispositivoUsbActivo?.opened);
}

function notificar() {
  window.dispatchEvent(new CustomEvent(EVENTO_PERIFERICOS));
}

function inferirTipoPorNombre(info) {
  const t = String(info?.productName || info?.nombre || '').toLowerCase();
  if (/print|epson|star|bixolon|pos|ticket|thermal|termica|térmica/.test(t)) return 'impresora';
  if (/scan|barcode|honeywell|symbol|zebra|lector/.test(t)) return 'escaner';
  if (/drawer|cajon|cajón|cash/.test(t)) return 'cajon';
  if (/pinpad|terminal|verifone|ingenico/.test(t)) return 'terminal';
  return 'otro';
}

function registrarPerifericoDetectado(meta) {
  const lista = leerPerifericos();
  const dup = lista.find(
    (p) =>
      (meta.deviceKey && p.deviceKey === meta.deviceKey) ||
      (meta.usbVendorId && p.usbVendorId === meta.usbVendorId && p.usbProductId === meta.usbProductId),
  );
  if (dup) {
    const next = lista.map((p) =>
      p.id === dup.id
        ? {
            ...p,
            ...meta,
            activo: true,
            conectado: true,
            ultimaConexion: new Date().toISOString(),
          }
        : p,
    );
    guardarPerifericos(next);
    notificar();
    return dup.id;
  }
  const id = nuevoIdConfig();
  guardarPerifericos([
    ...lista,
    {
      id,
      nombre: meta.nombre || 'Dispositivo USB/Serial',
      tipo: meta.tipo || 'otro',
      conexion: meta.conexion || 'usb',
      notas: meta.notas || '',
      activo: true,
      conectado: true,
      plugAndPlay: true,
      deviceKey: meta.deviceKey || null,
      usbVendorId: meta.usbVendorId || null,
      usbProductId: meta.usbProductId || null,
      ultimaConexion: new Date().toISOString(),
    },
  ]);
  notificar();
  return id;
}

export function marcarPerifericosDesconectados() {
  const lista = leerPerifericos().map((p) => (p.plugAndPlay ? { ...p, conectado: false } : p));
  guardarPerifericos(lista);
  notificar();
}

/** Conecta impresora / escáner serial vía Web Serial API (Chrome/Edge). */
export async function conectarPuertoSerial() {
  if (!soportaWebSerial()) {
    return { ok: false, error: 'Este navegador no soporta Web Serial. Usa Chrome o Edge en Windows.' };
  }
  try {
    if (puertoSerialActivo?.readable) {
      try {
        await puertoSerialActivo.close();
      } catch {
        /* ignore */
      }
    }
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    puertoSerialActivo = port;
    const info = port.getInfo?.() || {};
    const nombre =
      info.usbProductName ||
      (info.usbVendorId ? `USB ${info.usbVendorId?.toString(16)}:${info.usbProductId?.toString(16)}` : 'Puerto serial');
    const id = registrarPerifericoDetectado({
      nombre,
      tipo: inferirTipoPorNombre({ productName: nombre }),
      conexion: 'serial',
      deviceKey: `serial_${info.usbVendorId || 0}_${info.usbProductId || 0}`,
      usbVendorId: info.usbVendorId,
      usbProductId: info.usbProductId,
      notas: 'Conectado por Web Serial (plug and play)',
    });
    return { ok: true, id, nombre, port };
  } catch (e) {
    if (e?.name === 'NotFoundError') return { ok: false, error: 'No se eligió ningún puerto.' };
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Filtros USB comunes para impresoras térmicas POS. */
const FILTROS_USB_IMPRESORA = [
  { classCode: 7 },
  { classCode: 255 },
  { vendorId: 0x04b8 },
  { vendorId: 0x0519 },
  { vendorId: 0x154f },
  { vendorId: 0x0dd4 },
];

export async function conectarDispositivoUsb() {
  if (!soportaWebUsb()) {
    return { ok: false, error: 'Este navegador no soporta WebUSB. Usa Chrome o Edge.' };
  }
  try {
    const device = await navigator.usb.requestDevice({ filters: FILTROS_USB_IMPRESORA });
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    dispositivoUsbActivo = device;
    const nombre = device.productName || `USB ${device.vendorId?.toString(16)}:${device.productId?.toString(16)}`;
    const id = registrarPerifericoDetectado({
      nombre,
      tipo: inferirTipoPorNombre({ productName: nombre }),
      conexion: 'usb',
      usbVendorId: device.vendorId,
      usbProductId: device.productId,
      deviceKey: `usb_${device.vendorId}_${device.productId}`,
      notas: 'Conectado por WebUSB (plug and play)',
    });
    return { ok: true, id, nombre, device };
  } catch (e) {
    if (e?.name === 'NotFoundError') return { ok: false, error: 'No se eligió ningún dispositivo.' };
    return { ok: false, error: e?.message || String(e) };
  }
}

export async function desconectarPuertoSerial() {
  if (puertoSerialActivo) {
    try {
      await puertoSerialActivo.close();
    } catch {
      /* ignore */
    }
    puertoSerialActivo = null;
  }
  marcarPerifericosDesconectados();
  return { ok: true };
}

export async function enviarTextoSerial(texto) {
  if (!puertoSerialActivo?.writable) {
    return { ok: false, error: 'No hay impresora serial conectada. Conéctala en Configuración → Periféricos.' };
  }
  try {
    const encoder = new TextEncoder();
    const writer = puertoSerialActivo.writable.getWriter();
    const init = new Uint8Array([0x1b, 0x40]);
    await writer.write(init);
    await writer.write(encoder.encode(String(texto || '')));
    const cut = new Uint8Array([0x1d, 0x56, 0x00]);
    await writer.write(cut);
    writer.releaseLock();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Los escáneres HID (la mayoría USB) funcionan como teclado — no requieren driver en el navegador. */
export function registrarEscanerHid(nombre) {
  const label = (nombre || '').trim() || 'Lector de códigos (HID)';
  const id = registrarPerifericoDetectado({
    nombre: label,
    tipo: 'escaner',
    conexion: 'usb',
    deviceKey: `hid_scanner_${label.toLowerCase().replace(/\s+/g, '_')}`,
    notas: 'Plug and play: el lector escribe el código como si fuera teclado. Enfoca el campo de búsqueda en Ventas.',
  });
  return { ok: true, id, mensaje: `"${label}" registrado. Conéctalo por USB y escanea con el cursor en el campo de búsqueda.` };
}

export function resumenCompatibilidad() {
  return {
    serial: soportaWebSerial(),
    usb: soportaWebUsb(),
    bluetooth: soportaWebBluetooth(),
    escanerHid: true,
    impresionNavegador: true,
  };
}
