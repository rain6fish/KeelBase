// SPDX-License-Identifier: Apache-2.0

import { useRef, type ChangeEvent } from 'react'
import { IconButton, InputAdornment, TextField } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'

interface DebouncedSearchProps {
  value: string
  placeholder?: string
  /** debounce 毫秒，默认 400 */
  delay?: number
  onChange: (v: string) => void
  onSearch: (v: string) => void
}

export function DebouncedSearch({ value, placeholder, delay = 400, onChange, onSearch }: DebouncedSearchProps) {
  const timer = useRef<number | null>(null)

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    onChange(v)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onSearch(v), delay)
  }

  const handleClear = () => {
    if (timer.current) window.clearTimeout(timer.current)
    onChange('')
    onSearch('')
  }

  return (
    <TextField
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      size="small"
      variant="outlined"
      sx={{ maxWidth: 260 }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <IconButton size="small" onClick={handleClear}>
              <CloseIcon fontSize="small" />
            </IconButton>
          ) : null,
        },
      }}
    />
  )
}
