// Что показывать на странице «Установка приложения» (/install/).
//
// Файлы приложения лежат на нашем же сервере в /files/ (см.
// deploy/web/README.md), рядом — install.json, который пишет публикация
// новой сборки приложения. Поэтому новая версия APK или ссылка для iPhone
// появляются на странице без пересборки кабинета. Формат install.json:
//
//   {
//     "android": { "url": "/files/md-trans.apk", "version": "1.0.3" },
//     "ios": { "mode": "testflight", "url": "https://testflight.apple.com/join/…" }
//   }
//
// ios.mode — "testflight" (приглашение в TestFlight) или "adhoc" (установка
// по ссылке на зарегистрированный iPhone, url — itms-services://… или
// страница установки; registerUrl — где зарегистрировать новый iPhone).
// Любой раздел можно не указывать. Без install.json страница проверяет
// только, лежит ли на сервере /files/md-trans.apk.

export const DEFAULT_APK_URL = '/files/md-trans.apk';
export const INSTALL_PATH = '/install/';

export interface AndroidInstall {
  url: string;
  version?: string;
}

export type IosInstall =
  | { mode: 'testflight'; url: string; version?: string }
  | { mode: 'adhoc'; url: string; registerUrl?: string; version?: string };

export interface InstallInfo {
  android: AndroidInstall | null;
  ios: IosInstall | null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Ссылки из install.json — только наши файлы или https/itms-services, чтобы
// испорченный файл не превратил кнопку в javascript:-ссылку.
function safeUrl(value: unknown): string | undefined {
  const url = str(value);
  if (!url) return undefined;
  return /^(\/|https:\/\/|itms-services:\/\/)/i.test(url) ? url : undefined;
}

function parseAndroid(raw: unknown): AndroidInstall | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = safeUrl(r.url);
  return url ? { url, version: str(r.version) } : null;
}

function parseIos(raw: unknown): IosInstall | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = safeUrl(r.url);
  if (!url) return null;
  if (r.mode === 'testflight') return { mode: 'testflight', url, version: str(r.version) };
  if (r.mode === 'adhoc') return { mode: 'adhoc', url, registerUrl: safeUrl(r.registerUrl), version: str(r.version) };
  return null;
}

async function fileExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadInstallInfo(): Promise<InstallInfo> {
  let config: Record<string, unknown> | null = null;
  try {
    const res = await fetch('/files/install.json', { cache: 'no-store' });
    if (res.ok) config = (await res.json()) as Record<string, unknown>;
  } catch {
    config = null;
  }

  let android = parseAndroid(config?.android);
  if (!android && (await fileExists(DEFAULT_APK_URL))) android = { url: DEFAULT_APK_URL };
  return { android, ios: parseIos(config?.ios) };
}

export type DeviceKind = 'android' | 'ios' | 'desktop';

export function detectDevice(): DeviceKind {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPad на iPadOS 13+ представляется Mac'ом, но с сенсорным экраном.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

export function installPageUrl(): string {
  return typeof window === 'undefined' ? INSTALL_PATH : `${window.location.origin}${INSTALL_PATH}`;
}
