import { FileText } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'

export default function TemplatesPage() {
  return <ModuleScaffold title="Templates" description="Reusable message and appointment templates." icon={FileText} emptyTitle="Templates coming online" emptyDesc="Create reusable templates for reminders, confirmations and recurring appointments." />
}
