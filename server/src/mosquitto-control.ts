import fs from 'node:fs';
import path from 'node:path';

function parsePidFile(pidFile: string): number | null {
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = Number(raw);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return pid;
  } catch {
    return null;
  }
}

function linuxProcessLooksLikeMosquitto(pid: number): boolean {
  const procDir = `/proc/${pid}`;
  if (!fs.existsSync(procDir)) return false;

  try {
    const comm = fs.readFileSync(path.join(procDir, 'comm'), 'utf8').trim().toLowerCase();
    if (comm === 'mosquitto') return true;
  } catch {
    // Fall through to cmdline-based detection.
  }

  try {
    const cmdline = fs.readFileSync(path.join(procDir, 'cmdline'), 'utf8');
    const argv0 = cmdline.split('\u0000')[0]?.trim();
    if (!argv0) return false;
    const execName = path.basename(argv0).toLowerCase();
    return execName === 'mosquitto';
  } catch {
    return false;
  }
}

export function embeddedMosquittoControlPath(sqlitePath: string): string {
  const dir = path.dirname(sqlitePath);
  return path.join(dir, '.run_embedded_mosquitto');
}

/** Writes 1/0 for mqtt-supervisor.sh (runs as root alongside Node). */
export function syncEmbeddedMosquittoControlFile(
  sqlitePath: string,
  enabled: boolean
): void {
  const p = embeddedMosquittoControlPath(sqlitePath);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, enabled ? '1' : '0', { mode: 0o644 });
  } catch (e) {
    console.warn('mosquitto-control: failed to write control file', p, e);
  }
}

export function isEmbeddedMosquittoProcessRunning(pidFile: string): boolean {
  const pid = parsePidFile(pidFile);
  if (pid == null) return false;

  // Mosquitto often runs as root while Node drops to PUID; avoid process.kill(pid, 0) (EPERM).
  if (process.platform === 'linux') {
    return linuxProcessLooksLikeMosquitto(pid);
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
