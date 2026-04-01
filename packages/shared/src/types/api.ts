export interface ApiError {
  error: {
    code: string;
    message: string;
    status: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  latest_version: string;
  agent_types: string[];
  author: { username: string; avatar_url: string | null };
  downloads: number;
  likes: number;
  is_verified: boolean;
  deprecated: boolean;
  created_at: string;
}

export interface SkillDetail extends SkillSummary {
  readme: string | null;
  keywords: string[];
  license: string;
  versions: { version: string; changelog: string | null; created_at: string }[];
  updated_at: string;
}

export interface SkillDownload {
  name: string;
  version: string;
  agent_types: string[];
  is_verified: boolean;
  deprecated: boolean;
  type?: string;
  files: { path: string; content: string }[];
}

export interface HealthResponse {
  status: 'ok' | 'error';
  db: 'connected' | 'disconnected';
  version: string;
  timestamp: string;
}
