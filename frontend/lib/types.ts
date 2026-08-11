export type User = { id: number; name: string; email: string; role: "user" | "admin" };

export type ContentItem = {
  id: number;
  category: "free" | "notice" | "faq";
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
  created_at: string;
  user: { id: number; name: string; email: string };
  attachments: { id: number; name: string; size_bytes: number; url: string }[];
};

export type AdminUser = User & { active: boolean; created_at: string };

export type ModelArtifact = {
  id: number;
  name: string;
  original_name: string;
  size_bytes: number;
  task: string | null;
  class_names: string[];
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
  status: "queued" | "processing" | "completed" | "failed";
  confidence: number;
  frame_stride: number;
  progress: number;
  total_detections: number;
  processed_frames: number;
  avg_confidence: number | null;
  processing_fps: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  model: ModelArtifact;
  video: VideoAsset;
  output_url: string | null;
  class_stats?: ClassStat[];
  frame_metrics?: FrameMetric[];
};
