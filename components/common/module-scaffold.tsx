import { ReactNode } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'

export function ModuleScaffold({ title, description, icon: Icon, emptyTitle, emptyDesc, actions }: { title: string; description: string; icon: any; emptyTitle: string; emptyDesc: string; actions?: ReactNode }) {
  return (
    <div>
      <PageHeader title={title} description={description} actions={actions} />
      <EmptyState icon={Icon} title={emptyTitle} description={emptyDesc} />
    </div>
  )
}
