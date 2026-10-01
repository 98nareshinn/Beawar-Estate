export type Language = "hi" | "en";
export type Theme = "light" | "dark";
export interface Preferences { language: Language; theme: Theme }
const storageKey = "beawar-preferences-v1";
export const defaultPreferences: Preferences = { language: "hi", theme: "light" };
export function parsePreferences(raw: string | null): Preferences {
  try { const p = JSON.parse(raw || "{}"); return { language: p?.language === "en" ? "en" : "hi", theme: p?.theme === "dark" ? "dark" : "light" }; }
  catch { return { ...defaultPreferences }; }
}
let preferences: Preferences = { ...defaultPreferences };
try { preferences = parsePreferences(globalThis.localStorage?.getItem(storageKey)); } catch {}
const listeners = new Set<() => void>();
function apply() {
  if (typeof document !== "undefined") {
    document.documentElement.lang = preferences.language;
    document.documentElement.dataset.theme = preferences.theme;
    document.title = preferences.language === "hi" ? "ब्यावर एस्टेट · आपका अगला पता" : "Beawar Estate · Your next address";
  }
}
export const getPreferences = () => preferences;
export const subscribePreferences = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function setPreferences(patch: Partial<Preferences>) {
  preferences = { ...preferences, ...patch };
  try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(preferences)); } catch {}
  apply(); listeners.forEach(listener => listener());
}
if (typeof window !== "undefined") window.addEventListener("storage", event => {
  if (event.key === storageKey || event.key === null) { preferences = parsePreferences(event.newValue); apply(); listeners.forEach(listener => listener()); }
});
apply();
