import { getPreferences, type Language } from "./preferences.ts";
import hi from "./hi.json";
export const translations = hi as Record<string, string>;
export function tr(text: string | number | null | undefined, variables: Record<string, string | number> = {}, language: Language = getPreferences().language): string {
  const source = String(text ?? "");
  const key = source.trim().replace(/\s+/g, " ");
  const translated = language === "hi" ? translations[key] ?? source : source;
  return translated.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(variables, name) ? String(variables[name]) : match);
}
export const locale = () => getPreferences().language === "hi" ? "hi-IN" : "en-IN";
export function actionLabel(action: string) {
  return action.split(".").map(part => tr(part.replaceAll("_", " "))).join(" · ");
}
