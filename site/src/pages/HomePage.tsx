import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Status } from '../components/Status'
import { repositoryData } from '../data/repositoryData'

export function HomePage() {
  return (
    <article className="route-page route-page--home">
      <section className="route-hero">
        <p className="eyebrow">Open agent workflow infrastructure</p>
        <h1>The package manager for AI agent workflows.</h1>
        <p className="route-lede">
          Package, inspect, preview, and move trusted agent capabilities across
          every supported runtime from one source tree.
        </p>
        <div className="hero-actions">
          <Link className="primary-action" to="/registry">
            Explore Registry
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="text-link" to="/docs">
            Read documentation
          </Link>
        </div>
        <div className="hero-proof" aria-label="Repository facts">
          <Status tone="success">{repositoryData.packs.length} official Packs</Status>
          <span>{repositoryData.targets.length} supported runtimes</span>
        </div>
      </section>
      <section className="route-band route-band--blueprint">
        <p className="eyebrow">One Pack / Many runtimes</p>
        <h2>Portable by contract. Inspectable before install.</h2>
      </section>
    </article>
  )
}

export { HomePage as Component }
