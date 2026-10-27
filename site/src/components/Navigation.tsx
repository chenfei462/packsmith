import { useEffect, useId, useState } from 'react'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

import { useLanguage } from '../i18n/useLanguage'
import { BrandMark } from './BrandMark'
import { LanguageMenu } from './LanguageMenu'

export function Navigation() {
  const [openPath, setOpenPath] = useState<string | null>(null)
  const menuId = useId()
  const { pathname } = useLocation()
  const { t } = useLanguage()
  const open = openPath === pathname

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenPath(null)
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  return (
    <header className="site-header">
      <BrandMark />
      <nav className="primary-nav" aria-label={t('nav.primary')}>
        <LanguageMenu />
        <button
          className="nav-menu-button"
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          onClick={() =>
            setOpenPath((current) => (current === pathname ? null : pathname))
          }
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <div
          className={`nav-links${open ? ' is-open' : ''}`}
          id={menuId}
        >
          <NavLink to="/" end>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/registry">{t('nav.registry')}</NavLink>
          <NavLink to="/docs">{t('nav.docs')}</NavLink>
          <a
            className="nav-github"
            href="https://github.com/chenfei462/packsmith"
            target="_blank"
            rel="noreferrer"
          >
            {t('nav.github')}
            <ArrowUpRight aria-hidden="true" size={16} />
          </a>
        </div>
      </nav>
    </header>
  )
}
