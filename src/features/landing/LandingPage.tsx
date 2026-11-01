import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Logo, Panel, buttonClasses } from '@/components/ui'
import { MapPreviewArt } from '@/features/library/MapPreviewArt'
import { LanguageSelect } from '@/features/settings/LanguageSelect'
import { ThemeToggle } from '@/features/settings/ThemeToggle'
import { cn } from '@/lib/cn'

export function LandingPage() {
  const { t } = useTranslation()
  // Shaped like the map's own blocks: a colored field per idea, no icon tiles.
  const features = [
    {
      title: t('landing.features.structureTitle'),
      body: t('landing.features.structureBody'),
      tint: 'bg-ch-yellow',
    },
    {
      title: t('landing.features.languagesTitle'),
      body: t('landing.features.languagesBody'),
      tint: 'bg-ch-sky',
    },
    {
      title: t('landing.features.keyTitle'),
      body: t('landing.features.keyBody'),
      tint: 'bg-ch-mint',
    },
  ]

  return (
    <div className="paper-dots min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle className="max-sm:hidden" />
          <LanguageSelect />
          <Link
            to="/sign-in"
            className={buttonClasses({ variant: 'secondary', className: 'max-md:hidden' })}
          >
            {t('auth.signIn.submit')}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <section className="grid items-center gap-10 pt-8 md:grid-cols-[1.05fr_1fr] md:pt-16">
          <div>
            <h1 className="animate-rise text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl lg:text-[4rem]">
              {t('landing.title')}
            </h1>
            <p className="mt-6 max-w-xl animate-rise text-lg text-ink [animation-delay:90ms]">
              {t('landing.subtitle')}
            </p>
            <div className="mt-8 flex animate-rise flex-wrap gap-3 [animation-delay:180ms]">
              <Link to="/sign-up" className={buttonClasses({ size: 'lg' })}>
                {t('landing.ctaStart')}
                <ArrowRight size={18} aria-hidden className="rtl:-scale-x-100" />
              </Link>
              <Link to="/sign-in" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
                {t('landing.ctaSignIn')}
              </Link>
            </div>
          </div>
          {/* The preview map pops in, builds itself, then drifts like a note on a desk. */}
          <div className="relative animate-pop [animation-delay:120ms]">
            <span
              aria-hidden
              className="mynota-float absolute -end-3 -top-4 size-14 rounded-neo border-2 border-line bg-ch-pink [--tilt:12deg] max-sm:hidden"
            />
            <span
              aria-hidden
              className="mynota-float absolute -start-4 -bottom-5 h-9 w-24 rounded-full border-2 border-line bg-ch-orange [--tilt:-6deg] [animation-delay:-3s] max-sm:hidden"
            />
            <Panel shadow="lg" className="relative overflow-hidden p-2">
              <MapPreviewArt className="block h-auto w-full" />
            </Panel>
          </div>
        </section>

        <section className="mt-20 grid gap-4 md:grid-cols-3">
          {features.map(({ title, body, tint }) => (
            <div
              key={title}
              className={cn(
                'mynota-scroll-in mynota-lift rounded-neo-lg border-2 border-line p-6 text-ink neo-shadow md:min-h-48',
                tint,
              )}
            >
              <h2 className="text-xl leading-snug font-bold text-balance">{title}</h2>
              <p className="mt-2 text-base leading-relaxed">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
