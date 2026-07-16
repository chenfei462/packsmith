import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

export function RouteErrorPage() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <main id="main-content" className="route-page route-error" tabIndex={-1}>
      <section className="route-hero route-hero--compact">
        <p className="eyebrow">Packsmith / Error</p>
        <h1>{notFound ? 'Page not found' : 'Page unavailable'}</h1>
        <p className="route-lede">
          The requested route could not be loaded from this build.
        </p>
        <Link className="text-link" to="/registry">
          Browse Registry
        </Link>
      </section>
    </main>
  )
}
