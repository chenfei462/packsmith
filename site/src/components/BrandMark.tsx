import { Link } from 'react-router-dom'

export function BrandMark() {
  return (
    <Link className="brand-mark" to="/" aria-label="Packsmith home">
      <span className="brand-mark__sigil" aria-hidden="true">
        PS
      </span>
      <span>Packsmith</span>
    </Link>
  )
}
