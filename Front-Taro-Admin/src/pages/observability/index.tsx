import { View, Text } from '@tarojs/components'
import { OBSERVABILITY_URLS } from '../../utils/constants'
import { useLocaleStore, t } from '../../i18n'
import './index.scss'

const SERVICES = [
  { key: 'grafana', label: 'Grafana', desc: 'visualization & alerts', url: OBSERVABILITY_URLS.grafana },
  { key: 'prometheus', label: 'Prometheus', desc: 'metrics /rules', url: OBSERVABILITY_URLS.prometheus },
  { key: 'jaeger', label: 'Jaeger', desc: 'tracing', url: OBSERVABILITY_URLS.jaeger },
  { key: 'loki', label: 'Loki', desc: 'logs', url: OBSERVABILITY_URLS.loki },
] as const

function ObservabilityPage() {
  useLocaleStore((s) => s.locale)
  return (
    <View className='page'>
      <Text className='page__title'>{t('obsTitle')}</Text>
      <Text className='obs__hint'>{t('obsHint')}</Text>

      <View className='obs__grid'>
        {SERVICES.map((s) => (
          <View key={s.key} className='card obs__card'>
            <Text className='obs__name'>{s.label}</Text>
            <Text className='obs__desc'>{s.desc}</Text>
            <Text className='obs__url'>{s.url}</Text>
            <View
              className='obs__open'
              onClick={() => {
                window.open(s.url, '_blank')
              }}
            >
              <Text>{t('open')}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

export default ObservabilityPage
