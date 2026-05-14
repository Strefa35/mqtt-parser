import fs from 'node:fs';
import path from 'node:path';

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
  try {
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = Number(raw);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    // Mosquitto often runs as root while Node drops to PUID; avoid process.kill(pid, 0) (EPERM).
    if (process.platform === 'linux') {
      return fs.existsSync(`/proc/${pid}`);
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}
