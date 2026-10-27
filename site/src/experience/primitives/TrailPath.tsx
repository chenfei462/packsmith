import { Line } from '@react-three/drei'

export function TrailPath({
  points,
  color = '#ff6b2c',
  opacity = 0.75,
}: {
  readonly points: readonly [number, number, number][]
  readonly color?: string
  readonly opacity?: number
}) {
  return (
    <Line
      points={[...points]}
      color={color}
      lineWidth={1.2}
      transparent
      opacity={opacity}
    />
  )
}
