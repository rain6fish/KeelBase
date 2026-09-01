// SPDX-License-Identifier: Apache-2.0

 /** Date formatting helpers */
 
 export function formatDate(dateStr: string | Date): string {
   const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
   const year = d.getFullYear()
   const month = String(d.getMonth() + 1).padStart(2, '0')
   const day = String(d.getDate()).padStart(2, '0')
   return `${year}-${month}-${day}`
 }
 
 export function formatDateTime(dateStr: string | Date): string {
   const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
   const date = formatDate(d)
   const hours = String(d.getHours()).padStart(2, '0')
   const minutes = String(d.getMinutes()).padStart(2, '0')
   return `${date} ${hours}:${minutes}`
 }
 
 export function formatMonthYear(date: Date): string {
   const months = [
     'January', 'February', 'March', 'April', 'May', 'June',
     'July', 'August', 'September', 'October', 'November', 'December',
   ]
   return `${months[date.getMonth()]} ${date.getFullYear()}`
 }
 
 export function formatTime(dateStr: string | Date): string {
   const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
   const hours = String(d.getHours()).padStart(2, '0')
   const minutes = String(d.getMinutes()).padStart(2, '0')
   return `${hours}:${minutes}`
 }
 
 export function formatShortDateTime(dateStr: string | Date): string {
   const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
   const month = String(d.getMonth() + 1).padStart(2, '0')
   const day = String(d.getDate()).padStart(2, '0')
   const hours = String(d.getHours()).padStart(2, '0')
   const minutes = String(d.getMinutes()).padStart(2, '0')
   return `${month}/${day} ${hours}:${minutes}`
 }
