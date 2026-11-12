export type Id = string;
export type Scope = "today" | "recent" | "all";
export type ResultCode =
  | "connected"
  | "no_answer"
  | "busy"
  | "rejected"
  | "invalid_number"
  | "other";
export type Source = "customer_list" | "customer_detail" | "pc_dispatch";
export type BeginCallRequest =
  | {
      source: "pc_dispatch";
      dispatch_id: Id;
      device_event_id: string;
    }
  | {
      source: "customer_list" | "customer_detail";
      customer_id: Id;
      device_event_id: string;
    };
export interface CallRecord {
  id: Id;
  result_code?: ResultCode;
  status?: string;
  started_at: string;
  duration_seconds: number;
  has_recording?: boolean;
  recording_state?: "ready" | "pending" | "none";
}
export interface Customer {
  id: Id;
  name: string;
  phone_display: string;
  phone_dialable?: string | null;
  avatar_initial: string;
  stage?: string;
  last_call_at?: string;
  last_call_result?: ResultCode;
  last_call_duration_seconds?: number;
  calls?: CallRecord[];
}
export interface Page<T> {
  items: T[];
  total?: number;
  next_cursor?: string;
}
export interface Dispatch {
  id: Id;
  customer_id?: Id | null;
  lead_id?: Id | null;
  customer_name: string;
  phone_display: string;
  request_note?: string;
  requested_by?: string;
  expires_at: string;
  status:
    | "queued"
    | "pending"
    | "accepted"
    | "declined"
    | "expired"
    | "cancelled";
}
export interface Bootstrap {
  user?: { id: Id; name: string };
  workspace?: { id: Id; name: string };
  device?: { id: Id; paired: boolean; paired_computer?: string };
  license?: {
    edition?: string;
    status: "active" | "grace" | "expired" | "unavailable";
    expires_at?: string;
    last_verified_at?: string;
  };
}
export interface Device {
  name?: string;
  platform?: string;
  paired: boolean;
  paired_computer?: string;
  last_sync_at?: string;
}
export interface Diagnostics {
  data_service?: "available" | "unavailable" | "simulated";
  license_check?:
    | "active"
    | "expired"
    | "suspended"
    | "not_configured"
    | "unavailable"
    | "simulated";
  paired?: boolean;
}
export interface BeginCall {
  call_id: Id;
  phone_number: string;
  dispatch_id?: Id;
}
export interface CompleteCall {
  device_event_id: string;
  result_code: ResultCode;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  recording_available?: boolean;
  note?: string;
}
export interface ApiError extends Error {
  code: string;
  status?: number;
}
