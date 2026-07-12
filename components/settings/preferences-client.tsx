'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { updateBusinessSettings } from '@/lib/api/working-hours'
import { CURRENCIES, LANGUAGES } from '@/lib/types/db'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Business preferences that aren't tied to the daily flow. Currency lives on the
// existing business.currency column (no schema change); saving refreshes the
// server components so amounts re-render in the chosen currency everywhere.
export function PreferencesClient() {
  const { business } = useWorkspace()
  const { t } = useT()
  const router = useRouter()
  const businessId = business?.id ?? ''
  const [currency, setCurrency] = useState(business?.currency || 'EUR')
  const [language, setLanguage] = useState(business?.language || 'en')
  const [saving, setSaving] = useState(false)

  const dirty = currency !== business?.currency || language !== business?.language

  async function save() {
    if (!businessId) return
    setSaving(true)
    try {
      await updateBusinessSettings(businessId, { currency, language })
      toast.success(t('prefs.saved'))
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {t('nav.settings')}</Link>
      <PageHeader title={t('prefs.title')} description={t('prefs.subtitle')} />
      <Card className="max-w-lg shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('prefs.cardTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('prefs.language')}</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('prefs.currency')}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('prefs.preview')}: {formatMoney(1234.5, currency)}</p>
          </div>
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {t('common.save')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
