'use client'

import { useWorkspace } from '@/lib/workspace-context'
import { PageHeader } from '@/components/common/page-header'
import { VoiceAppointment } from './voice-appointment'

// The AI Assistant page now hosts the working voice appointment tool. The old
// Gemini availability parser (non-functional without an API key) was removed.
export function AiAssistantClient() {
  const { business } = useWorkspace()
  const it = business?.language === 'it'

  return (
    <div>
      <PageHeader
        title={it ? 'Assistente voce' : 'Voice assistant'}
        description={it
          ? 'Detta un appuntamento e Cadence lo trasforma in campi pronti da confermare.'
          : 'Dictate an appointment and Cadence turns it into ready-to-confirm fields.'}
      />
      <div className="max-w-2xl">
        <VoiceAppointment />
      </div>
    </div>
  )
}
