export type ParcelStatus = "unknown" | "in_transit" | "out_for_delivery" | "delivered" | "exception";
export type Carrier = "dhl" | "hermes" | "dpd" | "ups" | "gls" | "amazon" | "other";

export interface ParcelEvent {
  timestamp: string | null;
  location: string | null;
  text: string | null;
}

export interface Parcel {
  id: string;
  trackingNumber: string;
  carrier: Carrier;
  label: string | null;
  createdAt: string;
  lastChecked: string | null;
  status: ParcelStatus;
  lastEvent: ParcelEvent | null;
  estimatedDelivery: string | null;
  url: string | null;
}

export interface ParcelsResponse {
  items: Parcel[];
  dhlConfigured: boolean;
}

export const CARRIERS: { id: Carrier; label: string }[] = [
  { id: "dhl", label: "DHL" },
  { id: "hermes", label: "Hermes" },
  { id: "dpd", label: "DPD" },
  { id: "ups", label: "UPS" },
  { id: "gls", label: "GLS" },
  { id: "amazon", label: "Amazon" },
  { id: "other", label: "Anderer" },
];

export async function fetchParcels(refresh = false, signal?: AbortSignal): Promise<ParcelsResponse> {
  const qs = refresh ? "?refresh=true" : "";
  const res = await fetch(`/api/parcels${qs}`, { signal });
  if (!res.ok) throw new Error(`parcels: ${res.status}`);
  return res.json();
}

export async function addParcel(input: {
  trackingNumber: string;
  carrier: Carrier;
  label: string | null;
}): Promise<Parcel> {
  const res = await fetch("/api/parcels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`parcel add: ${res.status}`);
  return res.json();
}

export async function deleteParcel(id: string): Promise<void> {
  const res = await fetch(`/api/parcels/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`parcel delete: ${res.status}`);
}

export async function refreshParcel(id: string): Promise<Parcel> {
  const res = await fetch(`/api/parcels/${id}/refresh`, { method: "POST" });
  if (!res.ok) throw new Error(`parcel refresh: ${res.status}`);
  return res.json();
}
