'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, RotateCcw } from 'lucide-react'
import { useWorkspace } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { getMovedTemplate, saveMovedTemplate, defaultBody, TEMPLATE_PLACEHOLDERS } from '@/lib/api/templates'

export function TemplatesClient() {
  const { business } = useWorkspace()
  const { t } = useT()
  const businessId = business?.id ?? ''
  const [body, setBody] = useState('')
  const [lang, setLang] = useState('en')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!businessId) return
    let alive = true
    getMovedTemplate(businessId)
      .then((r) => { if (alive) { setBody(r.body); setLang(r.language) } })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [businessId])

  async function save() {
    setSaving(true)
    try { await saveMovedTemplate(businessId, body); toast.success(t('templates.saved')) }
    catch { toast.error(t('templates.saveError')) }
    finally { setSaving(false) }
  }

  function insert(token: string) { setBody((b) => (b ? b + ' ' + token : token)) }

  return (
    <div>
      <PageHeader title={t('templates.title')} description={t('templates.subtitle')} />
      <Card className="max-w-2xl shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('templates.movedTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t('templates.loading')}</div>
          ) : (
            <>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="resize-y" placeholder={t('templates.placeholder')} />
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('templates.availablePlaceholders')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_PLACEHOLDERS.map((p) => (
                    <button key={p} type="button" onClick={() => insert(p)}>
                      <Badge variant="secondary" className="cursor-pointer font-mono hover:bg-accent">{p}</Badge>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={save} disabled={saving || !body.trim()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {t('common.save')}</Button>
                <Button variant="outline" onClick={() => setBody(defaultBody(lang))}><RotateCcw className="mr-2 h-4 w-4" /> {t('templates.reset')}</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
