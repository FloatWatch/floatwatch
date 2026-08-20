export type User = {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  auth_provider?: "password" | "kakao" | "naver" | "google";
};

export type ContentItem = {
  id: number;
  category: "free" | "bug" | "notice" | "faq";
  title: string;
  content: string;
  pinned: boolean;
  views: number;
  created_at: string;
  updated_at: string;
  author: { id: number; name: string } | null;
  attachments: { id: number; name: string; size_bytes: number; url: string }[];
  comments: { id: number; content: string; created_at: string; author: { id: number; name: string } | null }[];
};

export type Inquiry = {
  id: number;
  title: string;
  content: string;
  status: "waiting" | "answered";
  answer: string | null;
  answered_at: string | null;
  answer_read_at: string | null;
  has_new_answer: boolean;
  created_at: string;
  user: { id: number; name: string; email: string };
  attachments: { id: number; name: string; size_bytes: number; url: string }[];
};

export type AdminUser = User & { active: boolean; created_at: string };

export type AuditLog = {
  id: number;
  actor: { id: number | null; name: string };
  action: "user.update" | "analysis.delete" | "content.update" | "content.delete" | "inquiry.answer";
  target_type: "user" | "analysis" | "content" | "inquiry";
  target_id: string | null;
  target_label: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
  created_at: string;
};

export type ModelArtifact = {
  id: number;
  name: string;
  original_name: string;
  size_bytes: number;
  task: string | null;
  class_names: string[];
  quarantined?: boolean;
  quarantine_reason?: string | null;
  quarantined_at?: string | null;
  created_at: string;
};

export type VideoAsset = {
  id: number;
  name: string;
  size_bytes: number;
  duration_seconds: number | null;
  fps: number | null;
  frame_count: number | null;
  created_at: string;
  media_type: "image" | "video";
  latitude: number | null;
  longitude: number | null;
  captured_at: string | null;
  location_name: string | null;
  location_description: string | null;
  content_sha256: string | null;
  location_source: "metadata" | "manual" | "none" | null;
  location_confirmed: boolean;
  coastal_eligible: boolean | null;
  coast_distance_m: number | null;
  coastal_reason: "within_coastal_zone" | "outside_coastal_zone" | "outside_korea" | null;
};

export type ClassStat = { class_id: number; class_name: string; count: number; avg_confidence: number };
export type FrameMetric = {
  frame_number: number;
  timestamp_seconds: number;
  detection_count: number;
  avg_confidence: number;
  has_masks: boolean;
};

export type Analysis = {
  id: number;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  confidence: number;
  frame_stride: number;
  progress: number;
  total_detections: number;
  processed_frames: number;
  avg_confidence: number | null;
  processing_fps: number | null;
  error_code: "MODEL_LOAD_FAILED" | "MEDIA_READ_FAILED" | "VIDEO_CODEC_UNSUPPORTED" | "OUTPUT_CREATE_FAILED" | "INSUFFICIENT_STORAGE" | "SERVER_RESTARTED" | "RECOVERY_INPUT_MISSING" | "USER_CANCELLED" | "INFERENCE_FAILED" | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  model: ModelArtifact;
  video: VideoAsset;
  output_url: string | null;
  class_stats?: ClassStat[];
  frame_metrics?: FrameMetric[];
};
