import { repositoryData } from '../data/repositoryData'

export function RegistryPage() {
  return (
    <article className="route-page">
      <section className="route-hero route-hero--compact">
        <p className="eyebrow">Spatial catalog / Verified source</p>
        <h1>Registry</h1>
        <p className="route-lede">
          Search {repositoryData.packs.length} official Packs with real Passport
          evidence and runtime previews.
        </p>
      </section>
    </article>
  )
}

export { RegistryPage as Component }
