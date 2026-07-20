'use client'

import { useT } from '@/lib/i18n/use-t'
import { PageHeader } from '@/components/common/page-header'
import { VoiceAppointment } from './voice-appointment'

// The AI Assistant page now hosts the working voice appointment tool. The old
// Gemini availability parser (non-functional without an API key) was removed.
export function AiAssistantClient() {
  const { t } = useT()

  return (
    <div>
      <PageHeader
        title={t('assistant.title')}
        description={t('assistant.description')}
      />
      <div className="max-w-2xl">
        <VoiceAppointment />
      </div>
    </div>
  )
}
