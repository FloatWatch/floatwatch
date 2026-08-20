import type { Analysis } from "./types";

export type EffectiveAnalysisStatus = Analysis["status"];

export function effectiveAnalysisStatus(status: Analysis["status"], errorCode?: Analysis["error_code"]): EffectiveAnalysisStatus {
  if (status === "completed") return "completed";
  if (status === "cancelled" || (status === "failed" && errorCode === "USER_CANCELLED")) return "cancelled";
  return status;
}

export function analysisStatusLabel(status: Analysis["status"], progress = 0, errorCode?: Analysis["error_code"]): string {
  const effective = effectiveAnalysisStatus(status, errorCode);
  return {
    queued: "대기 중",
    processing: `분석 중 ${Math.max(1, Math.min(99, Math.round(progress)))}%`,
    completed: "완료",
    failed: "시스템 실패",
    cancelled: "사용자 중단",
  }[effective];
}
