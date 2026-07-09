import { FlaskConical } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'

export default function LabPage() {
  return <ModuleScaffold title="Experimental Lab" description="Preview features behind feature flags." icon={FlaskConical} emptyTitle="Nothing brewing yet" emptyDesc="Experimental modules will appear here, toggleable without touching code." />
}
