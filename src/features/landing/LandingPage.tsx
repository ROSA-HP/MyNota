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
          <ThemeToggle className="hidden sm:inline-flex" />
          <LanguageSelect />
          <Link
            to="/sign-in"
            className={buttonClasses({ variant: 'secondary', className: 'hidden md:inline-flex' })}
          >
            {t('auth.signIn.submit')}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <section className="grid items-center gap-10 pt-8 md:grid-cols-[1.05fr_1fr] md:pt-16">
          <div>
            <h1 className="text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl lg:text-[4rem]">
              {t('landing.title')}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink">{t('landing.subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/sign-up" className={buttonClasses({ size: 'lg' })}>
                {t('landing.ctaStart')}
                <ArrowRight size={18} aria-hidden className="rtl:-scale-x-100" />
              </Link>
              <Link to="/sign-in" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
                {t('landing.ctaSignIn')}
              </Link>
            </div>
          </div>
          <Panel shadow="lg" className="overflow-hidden p-2">
            <MapPreviewArt className="block h-auto w-full" />
          </Panel>
        </section>

        <section className="mt-20 grid gap-4 md:grid-cols-3">
          {features.map(({ title, body, tint }) => (
            <div
              key={title}
              className={cn('rounded-neo-lg border-2 border-line p-6 text-ink md:min-h-48', tint)}
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
