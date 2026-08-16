import { execFileSync } from 'node:child_process';
import type { ConnectedDevice, TargetAbi } from '../types/index.js';

export function getConnectedDevices(): ConnectedDevice[] {
  try {
    const raw = execFileSync('adb', ['devices', '-l'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const lines = raw.split('\n');
    const devices: ConnectedDevice[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('List of devices')) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;

      const [id, state] = parts;
      if (state !== 'device') continue;

      let model = 'Unknown Device';
      const modelMatch = trimmed.match(/model:(\S+)/);
      if (modelMatch && modelMatch[1]) {
        model = modelMatch[1];
      }

      const isEmulator = id.startsWith('emulator-') || trimmed.includes('emulator');
      const abi = getDeviceAbi(id) || (isEmulator ? 'arm64-v8a' : 'arm64-v8a');

      devices.push({
        id,
        model,
        abi,
        isEmulator,
        state: 'device',
      });
    }

    return devices;
  } catch {
    return [];
  }
}

export function getDeviceAbi(deviceId: string): TargetAbi | undefined {
  try {
    const abiRaw = execFileSync('adb', ['-s', deviceId, 'shell', 'getprop', 'ro.product.cpu.abi'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (abiRaw === 'arm64-v8a' || abiRaw === 'armeabi-v7a' || abiRaw === 'x86_64' || abiRaw === 'x86') {
      return abiRaw;
    }
  } catch {
    // Ignore adb error
  }
  return undefined;
}

export function detectPrimaryTargetAbi(): TargetAbi | undefined {
  const devices = getConnectedDevices();
  if (devices.length > 0) {
    return devices[0].abi;
  }
  return undefined;
}
