/**
 * Unified return type for any OAuth provider verification.
 */
export interface OAuthUserInfo {
  /** Unique identifier from the provider (e.g. Google sub, Apple sub) */
  providerId: string;
  /** Email address — may be null if the provider doesn't share it */
  email: string | null;
  /** Display name — typically "given_name family_name" */
  name: string | null;
  /** Avatar URL — may be null */
  avatarUrl: string | null;
}
