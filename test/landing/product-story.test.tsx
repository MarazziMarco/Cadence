import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LANDING_COPY } from '@/components/landing/landing-copy'
import {
  PRODUCT_STORY_COPY_MOTION,
  PRODUCT_STORY_IMAGE_MOTION,
  ProductStory,
} from '@/components/landing/product-story'

const reducedMotion = vi.hoisted(() => ({ value: false }))

vi.mock('framer-motion', async (importOriginal) => {
  const original = await importOriginal<typeof import('framer-motion')>()
  return {
    ...original,
    useReducedMotion: () => reducedMotion.value,
  }
})

describe('ProductStory', () => {
  beforeEach(() => {
    reducedMotion.value = false
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  it('renders one ordered story containing all eight chapters', () => {
    render(
      <ProductStory
        ariaLabel={LANDING_COPY.en.story.ariaLabel}
        steps={LANDING_COPY.en.story.steps}
      />,
    )

    const chapters = screen.getAllByTestId('product-story-chapter')
    expect(chapters).toHaveLength(8)
    expect(chapters.map((chapter) => chapter.dataset.stepId)).toEqual([
      'voice',
      'gaps',
      'suggestions',
      'optimized',
      'messages',
      'route',
      'waiting',
      'personal',
    ])
    expect(chapters[0]).toHaveAccessibleName(/1.*Book by voice/i)
    expect(chapters[7]).toHaveAccessibleName(/8.*Your rules, your algorithm/i)
  })

  it('keeps the active image and copy together in one sticky stage', () => {
    render(
      <ProductStory
        ariaLabel={LANDING_COPY.en.story.ariaLabel}
        steps={LANDING_COPY.en.story.steps}
      />,
    )

    const stage = screen.getByTestId('product-story-stage')
    expect(stage).toContainElement(screen.getByTestId('product-story-image'))
    expect(stage).toContainElement(screen.getByRole('heading', {
      name: 'Book by voice',
    }))
  })

  it('sizes each screenshot by its own aspect ratio without a shared frame', () => {
    const { container } = render(
      <ProductStory
        ariaLabel={LANDING_COPY.en.story.ariaLabel}
        steps={LANDING_COPY.en.story.steps}
      />,
    )

    const media = screen.getByTestId('product-story-media')
    expect(media).not.toHaveClass('border', 'bg-card', 'shadow-xl')
    expect(screen.getByTestId('product-story-image')).toHaveClass(
      'h-auto',
      'w-auto',
      'max-h-full',
      'max-w-full',
    )
    expect(container.querySelector('.bg-gradient-to-tr')).not.toBeInTheDocument()
  })

  it('holds the final chapter before releasing the sticky stage', () => {
    render(
      <ProductStory
        ariaLabel={LANDING_COPY.en.story.ariaLabel}
        steps={LANDING_COPY.en.story.steps}
      />,
    )

    expect(screen.getByTestId('product-story-tail')).toHaveClass(
      'h-[48svh]',
      'sm:h-[55vh]',
    )
  })

  it('keeps the chapter dots below and above the image shadow', () => {
    render(
      <ProductStory
        ariaLabel={LANDING_COPY.en.story.ariaLabel}
        steps={LANDING_COPY.en.story.steps}
      />,
    )

    expect(screen.getByTestId('product-story-pagination')).toHaveClass(
      'relative',
      'z-10',
      'shrink-0',
      'mt-6',
      'sm:mt-8',
    )
  })

  it('anchors the chapter dots at a stable height across screenshot formats', () => {
    render(
      <ProductStory
        ariaLabel={LANDING_COPY.en.story.ariaLabel}
        steps={LANDING_COPY.en.story.steps}
      />,
    )

    expect(screen.getByTestId('product-story-visual')).toHaveClass(
      'h-[40svh]',
      'sm:h-[54vh]',
      'lg:h-[72vh]',
    )
  })

  it('moves outgoing content outward and introduces the next chapter from below', () => {
    expect(PRODUCT_STORY_IMAGE_MOTION.exit).toMatchObject({
      opacity: 0,
      x: 36,
      y: -22,
    })
    expect(PRODUCT_STORY_COPY_MOTION.exit).toMatchObject({
      opacity: 0,
      x: -30,
      y: -20,
    })
    expect(PRODUCT_STORY_IMAGE_MOTION.initial).toMatchObject({
      opacity: 0,
      y: 30,
    })
    expect(PRODUCT_STORY_COPY_MOTION.initial).toMatchObject({
      opacity: 0,
      y: 30,
    })
  })

  it('changes the sticky image and copy with the active chapter', async () => {
    render(
      <ProductStory
        ariaLabel={LANDING_COPY.en.story.ariaLabel}
        steps={LANDING_COPY.en.story.steps}
      />,
    )

    expect(screen.getByTestId('product-story-image')).toHaveAttribute(
      'src',
      '/landing/voice.png',
    )
    fireEvent.click(screen.getByRole('button', {
      name: /the best route, measured/i,
    }))
    await waitFor(() => {
      expect(screen.getByTestId('product-story-image')).toHaveAttribute(
        'src',
        '/landing/route.webp',
      )
    })
    expect(screen.getByTestId('product-story-image')).toHaveAccessibleName(
      /route map/i,
    )
    expect(screen.getByRole('heading', {
      name: 'The best route, measured',
    })).toBeInTheDocument()
  })

  it('disables scroll-linked movement for reduced-motion users', () => {
    reducedMotion.value = true

    render(
      <ProductStory
        ariaLabel={LANDING_COPY.en.story.ariaLabel}
        steps={LANDING_COPY.en.story.steps}
      />,
    )

    expect(screen.getByTestId('product-story-visual')).toHaveAttribute(
      'data-reduced-motion',
      'true',
    )
  })
})
