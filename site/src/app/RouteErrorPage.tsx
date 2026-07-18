import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

export function RouteErrorPage() {
  const error = useRouteError()
  const notFound =
    (isRouteErrorResponse(error) || error instanceof Response) &&
    error.status === 404
  const packNotFound = error instanceof Response && error.status === 404

  return (
    <main id="main-content" className="route-page route-error" tabIndex={-1}>
      <section className="route-hero route-hero--compact">
        <p className="eyebrow">Packsmith / Error</p>
        <h1>
          {packNotFound
            ? 'Pack not found'
            : notFound
              ? 'Page not found'
              : 'Page unavailable'}
        </h1>
        <p className="route-lede">
          The requested route could not be loaded from this build.
        </p>
        <div className="hero-actions">
          <Link className="text-link" to="/registry">
            {packNotFound ? 'Back to Registry' : 'Browse Registry'}
          </Link>
          <Link className="text-link" to="/docs">
            Read documentation
          </Link>
        </div>
      </section>
    </main>
  )
}
