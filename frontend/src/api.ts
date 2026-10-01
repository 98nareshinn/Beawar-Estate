import { tr, translations } from "./localization";
const fieldLabels: Record<string,string> = { latitude:"Latitude",longitude:"Longitude",placeType:"Type of place",startingPrice:"Starting price (₹)",scheduledDate:"Preferred date",timeSlot:"Time slot (India time)",amount:"Amount (₹)",reference:"Reference",rating:"Service rating",comment:"Public review (optional)", name: "Full name", email: "Email", mobile: "Mobile number", password: "Password", currentPassword:"Current password", newPassword:"New password", title:"Title", description:"Description", type:"Property type", purpose:"Listing for", price:"Price", area:"Area", locality:"Locality", address:"Address", bedrooms:"Bedrooms", bathrooms:"Bathrooms", amenities:"Amenities", photoIds:"Add property photos", documentIds:"Private documents", agentId:"Assigned agent", status:"Status", category:"Category", subject:"Subject", message:"Description", note:"Review note", body:"Update", role:"Role", permissions:"Permissions", sourceUrl:"Source URL (optional)", sourceName:"Source name", brandName:"Brand name", privacy:"Privacy policy", terms:"Terms of use" };
function validationMessage(issue: any): string {
  const field = tr(fieldLabels[String(issue.path?.[0])] || String(issue.path?.[0] || "Description"));
  if (translations[issue.message]) return field + ": " + tr(issue.message);
  if (issue.code === "too_small") return tr(issue.origin === "string" ? "{field}: use at least {limit} characters." : "{field}: value is too small (minimum {limit}).", {field,limit:issue.minimum});
  if (issue.code === "too_big") return tr(issue.origin === "string" ? "{field}: use no more than {limit} characters." : "{field}: value is too large (maximum {limit}).", {field,limit:issue.maximum});
  return tr("Check {field}.", {field});
}
export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      method, credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error(tr("Cannot reach the server. Check that the backend is running.")); }
  let result: any;
  try { result = await res.json(); }
  catch { throw new Error(tr("The server returned an unreadable response. Restart the app and try again.")); }
  if (!res.ok) throw new Error(result.issues?.length ? result.issues.map(validationMessage).join("\n") : tr(result.error || "Could not complete the request."));
  return result;
}
export async function upload(file: File, kind: string) {
  if (file.size > 6 * 1024 * 1024) throw new Error(tr("Each file must be 6 MB or smaller."));
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error(tr("Could not read the file.")));
    r.readAsDataURL(file);
  });
  return api<{ id: string; url: string; name: string }>("/files", "POST", {name:file.name, mime:file.type, kind, data});
}
