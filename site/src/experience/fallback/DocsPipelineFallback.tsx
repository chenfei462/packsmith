export function DocsPipelineFallback() {
  return (
    <div
      className="fallback-composition fallback-docs-pipeline"
      data-fallback-composition="docs-pipeline"
    >
      <div className="fallback-grid" />
      <svg
        aria-hidden="true"
        className="fallback-docs-pipeline__graph"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 720 300"
      >
        <polyline
          className="fallback-docs-pipeline__base"
          fill="none"
          points="42,238 166,188 286,116 412,74 542,132 674,210"
        />
        <polyline
          className="fallback-docs-pipeline__trace"
          fill="none"
          points="42,238 166,188 286,116 412,74 542,132 674,210"
        />
        {[
          [42, 238],
          [166, 188],
          [286, 116],
          [412, 74],
          [542, 132],
          [674, 210],
        ].map(([x, y], index) => (
          <g key={index} transform={`translate(${x} ${y})`}>
            <rect height="28" transform="rotate(45)" width="28" x="-14" y="-14" />
            <circle r="5" />
          </g>
        ))}
      </svg>
    </div>
  )
}
