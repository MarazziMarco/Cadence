import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AppShell quick-create overlays', () => {
  it('lazy-loads and mounts each overlay only when selected', () => {
    const source = readFileSync('components/app-shell/app-shell.tsx', 'utf8')

    expect(source.match(/dynamic\(/g)).toHaveLength(3)
    expect(source).toContain("quick === 'appointment' ?")
    expect(source).toContain("quick === 'client' ?")
    expect(source).toContain("quick === 'voice' ?")
    expect(source).toContain('{ ssr: false }')
  })
})
