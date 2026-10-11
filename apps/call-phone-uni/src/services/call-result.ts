import type { ResultCode } from "@/types/mobile";

/** Native duration is evidence of connection; a hangup alone is not. */
export function suggestCallResult(observation: {
  suggested?: ResultCode;
  endedAt?: string;
  durationSeconds?: number;
}): ResultCode | undefined {
  if (observation.endedAt && (observation.durationSeconds || 0) > 0)
    return "connected";
  return observation.suggested;
}
