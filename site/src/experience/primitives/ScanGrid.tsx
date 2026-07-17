export function ScanGrid({ opacity = 0.35 }: { readonly opacity?: number }) {
  return (
    <gridHelper
      args={[28, 28, '#2be4d0', '#34404c']}
      position={[0, -2.35, 0]}
      material-transparent
      material-opacity={opacity}
    />
  )
}
