export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
  timestamp: string;
}
