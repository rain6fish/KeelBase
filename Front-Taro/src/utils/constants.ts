 /** Application-wide constants aligned with backend */
 export const APP_NAME = 'App'
 export const API_BASE_URL = 'http://localhost:3000/api/v1'
 export const API_TIMEOUT = 30000
 
 // Storage keys
 export const STORAGE_KEYS = {
   ACCESS_TOKEN: 'access_token',
   REFRESH_TOKEN: 'refresh_token',
   THEME_MODE: 'theme_mode',
 } as const
 
 // Pagination
 export const DEFAULT_PAGE_SIZE = 20
 export const MAX_PAGE_SIZE = 100
 
 // Validation limits (aligned with backend)
 export const USERNAME_MIN_LENGTH = 3
 export const USERNAME_MAX_LENGTH = 32
 export const PASSWORD_MIN_LENGTH = 8
 export const PASSWORD_MAX_LENGTH = 128
 export const NICKNAME_MAX_LENGTH = 64
 export const TITLE_MAX_LENGTH = 200
 export const LOCATION_MAX_LENGTH = 200
 
 // Upload
 export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
 export const ALLOWED_EXTENSIONS = [
   '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.zip',
 ]
 
 // Event color roles
 export const EVENT_COLORS = [
   '#2563EB', // blue
   '#DC2626', // red
   '#16A34A', // green
   '#F59E0B', // orange
   '#9333EA', // purple
   '#0891B2', // cyan
 ] as const
 
 export const EVENT_COLOR_NAMES = [
   'blue', 'red', 'green', 'orange', 'purple', 'cyan',
 ] as const
