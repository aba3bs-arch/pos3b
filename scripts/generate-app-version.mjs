/**
 * Genera public/version.json con buildId (git) y resumen de cambios recientes.
 * Se ejecuta en el build de Vite / Netlify para que las cajas detecten actualizaciones.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'version.json');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function leerPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

/** Limpia mensajes de commit para mostrarlos al usuario. */
function limpiarMensaje(msg) {
  return String(msg || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.\s*$/, '');
}

export function generarVersionApp({ maxCambios = 10 } = {}) {
  const version = leerPackageVersion();
  const buildId = sh('git rev-parse --short HEAD') || `local-${Date.now().toString(36)}`;
  const branch = sh('git rev-parse --abbrev-ref HEAD') || '';
  const rawLog = sh(`git log -${Math.max(3, maxCambios)} --pretty=format:%s`);
  const fromGit = rawLog
    .split(/\r?\n/)
    .map(limpiarMensaje)
    .filter(Boolean)
    .filter((m) => !/^merge\b/i.test(m))
    .slice(0, maxCambios);

  let notes = null;
  try {
    notes = JSON.parse(readFileSync(join(root, 'public', 'release-notes.json'), 'utf8'));
  } catch {
    notes = null;
  }
  const fromNotes = Array.isArray(notes?.changes)
    ? notes.changes.map(limpiarMensaje).filter(Boolean)
    : [];
  const changes = [...fromNotes, ...fromGit.filter((m) => !fromNotes.includes(m))].slice(0, maxCambios);

  const meta = {
    version,
    buildId,
    branch: branch || null,
    builtAt: new Date().toISOString(),
    title: String(notes?.title || 'Actualización disponible').trim(),
    summary: String(
      notes?.summary || 'Hay una nueva versión del POS. Actualiza para recibir correcciones y mejoras.',
    ).trim(),
    changes,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return meta;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const meta = generarVersionApp();
  console.log(`version.json → ${meta.buildId} (${meta.changes.length} cambios)`);
}
