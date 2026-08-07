 import { useState } from 'react'
 import { View, Text, Input, Button, Picker } from '@tarojs/components'
 import Taro from '@tarojs/taro'
 import { useEventsStore } from '../../stores/events-store'
 import { EVENT_COLORS, EVENT_COLOR_NAMES } from '../../utils/constants'
 import { validateTitle } from '../../utils/validators'
 import './index.scss'
 
 export default function EventFormPage() {
   const router = Taro.getCurrentInstance().router
   const eventId = router?.params?.id ? Number(router.params.id) : undefined
   const isEditing = eventId != null
 
   const [title, setTitle] = useState('')
   const [description, setDescription] = useState('')
   const [location, setLocation] = useState('')
   const [startDate, setStartDate] = useState(() => {
     const now = new Date()
     return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
   })
   const [startTime, setStartTime] = useState(() => {
     const now = new Date()
     return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
   })
   const [endDate, setEndDate] = useState(() => {
     const now = new Date()
     now.setHours(now.getHours() + 1)
     return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
   })
   const [endTime, setEndTime] = useState(() => {
     const now = new Date()
     now.setHours(now.getHours() + 1)
     return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
   })
   const [colorRole, setColorRole] = useState(0)
   const [errors, setErrors] = useState<Record<string, string>>({})
 
   const { createEvent, isLoading } = useEventsStore()
 
   const handleSubmit = async () => {
     const titleErr = validateTitle(title)
     setErrors({ title: titleErr || '' })
     if (titleErr) return
 
     const start = new Date(`${startDate}T${startTime}`)
     const end = new Date(`${endDate}T${endTime}`)
 
     if (end <= start) {
       Taro.showToast({ title: 'End time must be after start', icon: 'none' })
       return
     }
 
     const success = await createEvent({
       title: title.trim(),
       description: description.trim() || undefined,
       startTime: start.toISOString(),
       endTime: end.toISOString(),
       location: location.trim() || undefined,
       colorRole,
     })
 
     if (success) {
       Taro.showToast({ title: 'Event created', icon: 'success' })
       setTimeout(() => Taro.navigateBack(), 1500)
     }
   }
 
   return (
     <View className='event-form'>
       <View className='event-form__content'>
       <View className='form-group'>
           <Text className='form-label'>Title *</Text>
           <Input
             className={`form-input ${errors.title ? 'form-input--error' : ''}`}
             placeholder='Event title'
             value={title}
             onInput={(e) => setTitle(e.detail.value)}
           />
           {errors.title && <Text className='form-error'>{errors.title}</Text>}
         </View>
 
         <View className='form-group'>
           <Text className='form-label'>Description</Text>
           <Input
             className='form-input form-input--multiline'
             placeholder='Event description (optional)'
             value={description}
             onInput={(e) => setDescription(e.detail.value)}
           />
         </View>
 
         <View className='form-group'>
           <Text className='form-label'>Location</Text>
           <Input
             className='form-input'
             placeholder='Event location (optional)'
             value={location}
             onInput={(e) => setLocation(e.detail.value)}
           />
         </View>
 
         {/* Start date/time */}
         <Text className='form-section-title'>Start</Text>
         <View className='event-form__datetime'>
           <Picker mode='date' value={startDate} onChange={(e) => setStartDate(e.detail.value)}>
             <View className='event-form__picker'>
               <Text className='event-form__picker-icon'>📅</Text>
               <Text>{startDate}</Text>
             </View>
           </Picker>
           <Picker mode='time' value={startTime} onChange={(e) => setStartTime(e.detail.value)}>
             <View className='event-form__picker'>
               <Text className='event-form__picker-icon'>⏰</Text>
               <Text>{startTime}</Text>
             </View>
           </Picker>
         </View>
 
         {/* End date/time */}
         <Text className='form-section-title'>End</Text>
         <View className='event-form__datetime'>
           <Picker mode='date' value={endDate} onChange={(e) => setEndDate(e.detail.value)}>
             <View className='event-form__picker'>
               <Text className='event-form__picker-icon'>📅</Text>
               <Text>{endDate}</Text>
             </View>
           </Picker>
           <Picker mode='time' value={endTime} onChange={(e) => setEndTime(e.detail.value)}>
             <View className='event-form__picker'>
               <Text className='event-form__picker-icon'>⏰</Text>
               <Text>{endTime}</Text>
             </View>
           </Picker>
         </View>
 
         {/* Color picker */}
         <View className='form-group'>
           <Text className='form-label'>Color</Text>
           <View className='event-form__colors'>
             {EVENT_COLORS.map((color, i) => (
               <View
                 key={i}
                 className={`event-form__color ${colorRole === i ? 'event-form__color--selected' : ''}`}
                 style={{ backgroundColor: color }}
                 onClick={() => setColorRole(i)}
               />
             ))}
           </View>
         </View>
 
         <Button
           className='event-form__submit'
           loading={isLoading}
           disabled={isLoading}
           onClick={handleSubmit}
         >
           {isEditing ? 'Update Event' : 'Create Event'}
         </Button>
       </View>
     </View>
   )
 }
