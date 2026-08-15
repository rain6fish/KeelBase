import { Box, Button, Card, Typography } from '@mui/material'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function ForbiddenView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card sx={{ textAlign: 'center', px: 6, py: 5 }}>
        <ShieldOutlinedIcon color="error" sx={{ fontSize: 64, mb: 1 }} />
        <Typography variant="h5" fontWeight="bold" mb={1}>
          {t('forbidden')}
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          {t('forbiddenHint')}
        </Typography>
        <Button color="primary" variant="contained" onClick={() => navigate('/login')}>
          {t('back')}
        </Button>
      </Card>
    </Box>
  )
}
