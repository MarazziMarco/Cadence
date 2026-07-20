'use client'

import { useState } from 'react'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion'

import { cn } from '@/lib/utils'
import type { LandingStoryStep } from './landing-copy'

export const PRODUCT_STORY_IMAGE_MOTION = {
  initial: { opacity: 0, x: 10, y: 30, scale: 0.985 },
  animate: { opacity: 1, x: 0, y: 0, scale: 1 },
  exit: { opacity: 0, x: 36, y: -22, scale: 0.985 },
} as const

export const PRODUCT_STORY_COPY_MOTION = {
  initial: { opacity: 0, x: -8, y: 30 },
  animate: { opacity: 1, x: 0, y: 0 },
  exit: { opacity: 0, x: -30, y: -20 },
} as const

export function ProductStory({
  ariaLabel,
  steps,
}: {
  ariaLabel: string
  steps: LandingStoryStep[]
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const reduceMotion = Boolean(useReducedMotion())
  const activeStep = steps[activeIndex] ?? steps[0]

  if (!activeStep) return null

  return (
    <div
      aria-label={ariaLabel}
      className="relative"
      role="region"
    >
      <div
        data-testid="product-story-stage"
        className="sticky top-14 z-10 flex min-h-[calc(100svh-3.5rem)] items-center py-4 sm:top-16 sm:min-h-[calc(100svh-4rem)] sm:py-6"
      >
        <div className="grid w-full items-center gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)] lg:gap-14">
          <div
            data-testid="product-story-visual"
            data-reduced-motion={reduceMotion}
            className="flex h-[40svh] flex-col sm:h-[54vh] lg:h-[72vh]"
          >
            <div className="group relative mx-auto flex h-full w-full max-w-5xl min-h-0 flex-col">
              <div
                data-testid="product-story-media"
                className="relative flex min-h-0 w-full flex-1 items-center justify-center"
              >
                <AnimatePresence initial={false} mode="wait">
                  <motion.img
                    key={activeStep.id}
                    data-testid="product-story-image"
                    src={activeStep.image}
                    alt={activeStep.alt}
                    loading={activeIndex === 0 ? 'eager' : 'lazy'}
                    initial={reduceMotion ? false : PRODUCT_STORY_IMAGE_MOTION.initial}
                    animate={PRODUCT_STORY_IMAGE_MOTION.animate}
                    exit={reduceMotion ? undefined : PRODUCT_STORY_IMAGE_MOTION.exit}
                    transition={{ duration: reduceMotion ? 0 : 0.46, ease: [0.22, 1, 0.36, 1] }}
                    className="h-auto max-h-full w-auto max-w-full object-contain drop-shadow-[0_24px_40px_rgba(35,28,70,0.18)]"
                  />
                </AnimatePresence>
              </div>
              <div
                data-testid="product-story-pagination"
                className="relative z-10 mt-6 flex shrink-0 justify-center gap-1 sm:mt-8"
              >
                {steps.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    aria-label={step.title}
                    aria-current={index === activeIndex ? 'step' : undefined}
                    className="flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setActiveIndex(index)}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-1.5 rounded-full transition-[width,background-color] duration-300',
                        index === activeIndex
                          ? 'w-5 bg-primary'
                          : 'w-1.5 bg-border',
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative min-h-[12rem]" aria-live="polite">
            <AnimatePresence initial={false} mode="wait">
              <motion.article
                key={activeStep.id}
                data-testid="product-story-active-copy"
                initial={reduceMotion ? false : PRODUCT_STORY_COPY_MOTION.initial}
                animate={PRODUCT_STORY_COPY_MOTION.animate}
                exit={reduceMotion ? undefined : PRODUCT_STORY_COPY_MOTION.exit}
                transition={{ duration: reduceMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-[12rem] flex-col justify-center px-3 sm:px-7"
              >
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-sm">
                  {activeIndex + 1}
                </div>
                <h3 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
                  {activeStep.title}
                </h3>
                <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {activeStep.desc}
                </p>
              </motion.article>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="-mt-[calc(100svh-3.5rem)] sm:-mt-[calc(100svh-4rem)]">
        {steps.map((step, index) => (
          <motion.div
            key={step.id}
            data-testid="product-story-chapter"
            data-step-id={step.id}
            aria-label={`${index + 1}. ${step.title}`}
            className="pointer-events-none h-[68svh] sm:h-[72vh]"
            viewport={{ amount: 0.5, margin: '-12% 0px -12% 0px' }}
            onViewportEnter={() => setActiveIndex(index)}
          />
        ))}
        <div
          aria-hidden="true"
          data-testid="product-story-tail"
          className="h-[48svh] sm:h-[55vh]"
        />
      </div>
    </div>
  )
}
