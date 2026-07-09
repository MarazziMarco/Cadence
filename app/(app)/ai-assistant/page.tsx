import { Bot } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'

export default function AiAssistantPage() {
  return <ModuleScaffold title="AI Assistant" description="Write naturally — Cadence turns it into structured scheduling rules." icon={Bot} emptyTitle="Natural language parser coming online" emptyDesc="Type things like 'Paola can come Wednesday or Friday' and watch it become structured JSON the scheduler understands." />
}
