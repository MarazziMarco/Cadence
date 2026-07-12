'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, X, StickyNote } from 'lucide-react'
import { updatePatient } from '@/lib/api/patients'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// Sticky-note board persisted in patients.notes (as JSON). Backward compatible:
// a plain-text legacy note is shown as one yellow note. No schema change.
const COLORS = [
  { key: 'yellow', cls: 'bg-yellow-100 border-yellow-300 text-yellow-950' },
  { key: 'pink', cls: 'bg-pink-100 border-pink-300 text-pink-950' },
  { key: 'green', cls: 'bg-green-100 border-green-300 text-green-950' },
  { key: 'blue', cls: 'bg-sky-100 border-sky-300 text-sky-950' },
  { key: 'purple', cls: 'bg-purple-100 border-purple-300 text-purple-950' },
]
type Note = { id: string; text: string; color: string }

function parse(initial: string | null): Note[] {
  if (!initial) return []
  try {
    const j = JSON.parse(initial)
    if (Array.isArray(j)) return j.map((n: any, i: number) => ({ id: String(n.id ?? i), text: String(n.text ?? ''), color: n.color ?? 'yellow' }))
  } catch {}
  return [{ id: '0', text: initial, color: 'yellow' }]
}

export function PatientNotes({ patientId, initial }: { patientId: string; initial: string | null }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState<Note[]>(() => parse(initial))

  async function persist(next: Note[]) {
    setNotes(next)
    try {
      await updatePatient(patientId, { notes: next.length ? JSON.stringify(next) : null } as any)
      qc.invalidateQueries({ queryKey: ['patient', patientId] })
    } catch (e: any) { toast.error(e.message || 'Failed to save note') }
  }

  const add = () => persist([...notes, { id: Date.now().toString(), text: '', color: 'yellow' }])
  const remove = (id: string) => persist(notes.filter((n) => n.id !== id))
  const setText = (id: string, text: string) => setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, text } : n)))
  const setColor = (id: string, color: string) => persist(notes.map((n) => (n.id === id ? { ...n, color } : n)))

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium"><StickyNote className="h-4 w-4 text-primary" /> Notes</div>
        <Button size="sm" variant="outline" onClick={add}><Plus className="mr-1.5 h-4 w-4" /> Add note</Button>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet — add a sticky note.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => {
            const c = COLORS.find((x) => x.key === n.color) ?? COLORS[0]
            return (
              <div key={n.id} className={cn('relative rounded-xl border p-3 shadow-sm', c.cls)}>
                <button onClick={() => remove(n.id)} aria-label="Delete note" className="absolute right-1.5 top-1.5 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                <textarea value={n.text} onChange={(e) => setText(n.id, e.target.value)} onBlur={() => persist(notes)} rows={4} placeholder="Write a note…" className="w-full resize-none bg-transparent pr-4 text-sm outline-none placeholder:opacity-60" />
                <div className="mt-2 flex gap-1.5">
                  {COLORS.map((col) => (
                    <button key={col.key} onClick={() => setColor(n.id, col.key)} aria-label={col.key} className={cn('h-4 w-4 rounded-full border', col.cls, n.color === col.key && 'ring-2 ring-foreground/40')} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
