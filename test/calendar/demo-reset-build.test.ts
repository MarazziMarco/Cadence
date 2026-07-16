import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('demo reset server bundle', () => {
  it('does not make .env.local a statically resolved module asset', () => {
    const source = readFileSync('scripts/seed-demo.mjs', 'utf8')

    expect(source).not.toMatch(
      /new URL\(\s*['"`]\.\.\/\.env\.local['"`]\s*,\s*import\.meta\.url\s*\)/,
    )
  })
})
