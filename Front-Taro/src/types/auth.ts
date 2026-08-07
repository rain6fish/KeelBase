 export interface User {
   id: number
   username: string
   nickname: string
   createdAt?: string
   updatedAt?: string
 }
 
 export interface UserProfile extends User {
   loginAttempts: number
 }
 
 export interface LoginRequest {
   username: string
   password: string
 }
 
 export interface RegisterRequest {
   username: string
   password: string
   nickname: string
 }
 
 export interface LoginResponse {
   accessToken: string
   refreshToken: string
   user: User
 }
 
 export type AuthStatus = 'initial' | 'loading' | 'authenticated' | 'unauthenticated' | 'error'
