'use client'

import { useState, type ChangeEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createPatient, updatePatient } from '@/lib/api/patients'
import type { Patient } from '@/lib/types/db'
import { useT } from '@/lib/i18n/use-t'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

export function PatientFormDialog({ businessId, patient, open, onOpenChange }: { businessId: string; patient?: Patient | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { t } = useT()
  const editing = !!patient
  const [firstName, setFirstName] = useState(patient?.first_name ?? '')
  const [lastName, setLastName] = useState(patient?.last_name ?? '')
  const [email, setEmail] = useState(patient?.email ?? '')
  const [phone, setPhone] = useState(patient?.phone ?? '')
  const [address, setAddress] = useState(patient?.address ?? '')
  const [city, setCity] = useState(patient?.city ?? '')
  const [postalCode, setPostalCode] = useState(patient?.postal_code ?? '')
  const [notes, setNotes] = useState(patient?.notes ?? '')
  const [color, setColor] = useState(patient?.color ?? COLORS[0])
  const [isVip, setIsVip] = useState(patient?.is_vip ?? false)

  const mutation = useMutation({
    mutationFn: async () => {
      const values: Partial<Patient> = {
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        postal_code: postalCode.trim() || null,
        notes: notes.trim() || null,
        color,
        is_vip: isVip,
      }
      if (editing) return updatePatient(patient!.id, values)
      return createPatient(businessId, values)
    },
    onSuccess: () => {
      toast.success(editing ? t('patf.updated') : t('patf.added'))
      qc.invalidateQueries({ queryKey: ['patients'] })
      if (editing) qc.invalidateQueries({ queryKey: ['patient', patient!.id] })
      onOpenChange(false)
    },
    onError: (e: any) => toast.error(e.message || t('appt.saveFailed')),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? t('patf.editTitle') : t('patf.newTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="patient-first-name">{t('patf.first')}</Label><Input id="patient-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="patient-last-name">{t('patf.last')}</Label><Input id="patient-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="patient-email">{t('patf.email')}</Label><Input id="patient-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="patient-phone">{t('patf.phone')}</Label><Input id="patient-phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-address">{t('patf.address')}</Label>
            <Input id="patient-address" value={address} onChange={(e: ChangeEvent<HTMLInputElement>) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="patient-city">{t('patf.city')}</Label><Input id="patient-city" value={city} onChange={(e: ChangeEvent<HTMLInputElement>) => setCity(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="patient-postal-code">{t('patf.postalCode')}</Label><Input id="patient-postal-code" value={postalCode} onChange={(e: ChangeEvent<HTMLInputElement>) => setPostalCode(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="patient-notes">{t('patf.notes')}</Label><Textarea id="patient-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Label>{t('patf.color')}</Label>
              <div className="flex gap-1.5">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setColor(c)} className={`h-6 w-6 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={isVip} onCheckedChange={setIsVip} /><Label>{t('patf.vip')}</Label></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => mutation.mutate()} disabled={!firstName.trim() || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? t('common.save') : t('patf.addClient')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
