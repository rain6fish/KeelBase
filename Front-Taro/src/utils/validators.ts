// SPDX-License-Identifier: Apache-2.0

 /** Form-validation helpers aligned with backend constraints */
 
 export function validateUsername(value?: string): string | null {
   if (!value || value.trim().length === 0) return 'Username is required'
   if (value.length < 3) return 'Username must be at least 3 characters'
   if (value.length > 32) return 'Username must be at most 32 characters'
   if (!/^[a-zA-Z0-9_]+$/.test(value)) {
     return 'Username can only contain letters, numbers, and underscores'
   }
   return null
 }
 
 export function validatePassword(value?: string): string | null {
   if (!value || value.length === 0) return 'Password is required'
   if (value.length < 8) return 'Password must be at least 8 characters'
   if (value.length > 128) return 'Password must be at most 128 characters'
   if (!/^(?=.*[a-zA-Z])(?=.*\d)/.test(value)) {
     return 'Password must contain both letters and numbers'
   }
   return null
 }
 
 export function validateNickname(value?: string): string | null {
   if (!value || value.trim().length === 0) return 'Nickname is required'
   if (value.length > 64) return 'Nickname must be at most 64 characters'
   return null
 }
 
 export function validateTitle(value?: string): string | null {
   if (!value || value.trim().length === 0) return 'Title is required'
   if (value.length > 200) return 'Title must be at most 200 characters'
   return null
 }
 
 export function validateRequired(value?: string, field?: string): string | null {
   if (!value || value.trim().length === 0) return `${field || 'This field'} is required`
   return null
 }
 
 export function validateUrl(value?: string): string | null {
   if (!value || value.trim().length === 0) return null
   try {
     new URL(value)
     return null
   } catch {
     return 'Please enter a valid URL'
   }
 }
