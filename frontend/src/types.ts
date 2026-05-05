export interface Work {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  status: string;
  updated_at: string;
  source: string;
}

export interface Stats {
  total_works: number;
  open_count: number;
  closing_count: number;
  soon_count: number;
  closed_count: number;
  last_haropa_sync: string | null;
  total_events_24h: number;
}

export interface HistoryEntry {
  id: string;
  work_id: string;
  work_name: string;
  status: string;
  source: string;
  changed_at: string;
}

export interface AuthUser {
  user_id?: string;
  email: string;
  name?: string;
  picture?: string;
  is_admin?: boolean;
  [key: string]: any;
}

export type VehicleMode = "voiture" | "camion";
