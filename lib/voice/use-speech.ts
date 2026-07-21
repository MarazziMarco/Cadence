'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Thin wrapper around the browser Web Speech API (free, native). Shared by the
// voice appointment tool and the calendar dictation button. Reports lack of
// support / denied permission so callers can fall back to typed text.
export function useSpeech(lang: string) {
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const recRef = useRef<any>(null)
  const onResultRef = useRef<(t: string) => void>(() => {})
  const onDeniedRef = useRef<() => void>(() => {})

  useEffect(() => {
    const SR = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    if (!SR) { setSupported(false); return }
    const rec = new SR()
    rec.interimResults = false
    rec.maxAlternatives = 1
    // Ask for on-device recognition where supported (best effort). This is not a
    // guarantee: on some browsers the audio is still sent to the vendor's servers,
    // which is why the UI shows a pre-activation notice instead of claiming local.
    try { (rec as any).processLocally = true } catch {}
    rec.onresult = (e: any) => {
      // Stop + reset immediately so the mic UI never stays "listening" after an
      // auto-finalized result (some browsers fire onresult without a prompt onend).
      setListening(false)
      try { rec.stop() } catch {}
      onResultRef.current(e.results[0][0].transcript as string)
    }
    rec.onerror = (e: any) => {
      setListening(false)
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setSupported(false); onDeniedRef.current() }
    }
    rec.onend = () => setListening(false)
    rec.onaudioend = () => setListening(false)
    recRef.current = rec
    return () => { try { rec.abort() } catch {} }
  }, [])

  useEffect(() => { if (recRef.current) recRef.current.lang = lang }, [lang])

  const start = useCallback((onResult: (t: string) => void, onDenied?: () => void) => {
    const rec = recRef.current
    if (!rec) { setSupported(false); return }
    onResultRef.current = onResult
    onDeniedRef.current = onDenied || (() => {})
    try { rec.start(); setListening(true) } catch { /* already started */ }
  }, [])

  const stop = useCallback(() => { try { recRef.current?.stop() } catch {}; setListening(false) }, [])

  return { supported, listening, start, stop }
}

/** Maps an interface language code to a BCP-47 tag for SpeechRecognition. */
export function speechLang(lang: string | null | undefined): string {
  switch (lang) {
    case 'it': return 'it-IT'
    case 'es': return 'es-ES'
    case 'fr': return 'fr-FR'
    case 'de': return 'de-DE'
    default: return 'en-US'
  }
}
