export function HomeForgeFallback() {
  return (
    <div
      className="fallback-composition fallback-home-forge"
      data-fallback-composition="home-forge"
    >
      <div className="fallback-grid" />
      <div className="fallback-home-forge__assembly">
        <div className="fallback-home-forge__core" />
        {Array.from({ length: 10 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="fallback-home-forge__scan" />
    </div>
  )
}
