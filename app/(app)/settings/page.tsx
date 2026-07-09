import { Settings } from 'lucide-react'
import { ModuleScaffold } from '@/components/common/module-scaffold'

export default function SettingsPage() {
  return <ModuleScaffold title="Settings" description="Business, language, theme, notifications and more." icon={Settings} emptyTitle="Settings coming online" emptyDesc="Manage business profile, scheduler weights, AI options and feature flags." />
}
