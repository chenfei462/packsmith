import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  DynamicDrawUsage,
  Euler,
  MathUtils,
  Object3D,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three'

import { repositoryData } from '../../../data/repositoryData'
import { ScanGrid } from '../../primitives/ScanGrid'
import { TrailPath } from '../../primitives/TrailPath'
import type { RouteSceneInput } from '../../types'
import { useExperience } from '../../useExperience'
import { layoutRegistryPacks } from './registryLayout'

const registrySeed = 0x5041434b
const catalogIds = repositoryData.packs.map((pack) => pack.id)
const catalogIndex = new Map(catalogIds.map((id, index) => [id, index]))
const fullLayout = layoutRegistryPacks(catalogIds, registrySeed)
const fullLayoutById = new Map(fullLayout.map((item) => [item.id, item]))
const packColors = new Map(
  repositoryData.packs.map((pack) => {
    const color =
      pack.passport.computedRisk === 'blocked'
        ? '#ff5b62'
        : pack.passport.computedRisk === 'high'
          ? '#ff6b2c'
          : pack.passport.computedRisk === 'medium'
            ? '#479f99'
            : '#65727f'
    return [pack.id, new Color(color)] as const
  }),
)

const constellationPaths: readonly (readonly [number, number, number][])[] = [
  [[-6, -1.9, -2], [-2.4, -0.8, -0.5], [0, 0, 0]],
  [[-5.7, 2.2, -1.4], [-2.1, 1, 0], [0.5, 0.2, -0.4]],
  [[5.8, 2.5, -2], [2.6, 1.1, -0.6], [0.8, 0, 0]],
  [[6.2, -1.7, -1], [2.8, -0.7, 0], [0.6, -0.1, 0.3]],
  [[-3.8, 3.3, -3], [-0.9, 1.7, -0.9], [1.3, 0.4, 0]],
  [[4.4, -3.1, -2.5], [1.8, -1.5, -0.7], [-0.4, -0.2, 0]],
]

interface MutableTransform {
  readonly position: Vector3
  readonly rotation: Euler
  scale: number
}

function RegistryParticles({
  count,
  opacity,
}: {
  readonly count: number
  readonly opacity: number
}) {
  const particles = useRef<InstancedMesh>(null)
  const group = useRef<Group>(null)
  const dummy = useMemo(() => new Object3D(), [])

  useEffect(() => {
    if (!particles.current) return

    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399963
      const radius = 3.2 + (index % 11) * 0.42
      dummy.position.set(
        Math.cos(angle) * radius,
        ((index * 7) % 13 - 6) * 0.34,
        Math.sin(angle) * radius * 0.5 - 2.2,
      )
      dummy.rotation.set(angle * 0.1, angle, angle * 0.05)
      dummy.scale.setScalar(0.25 + (index % 4) * 0.07)
      dummy.updateMatrix()
      particles.current.setMatrixAt(index, dummy.matrix)
    }
    particles.current.instanceMatrix.needsUpdate = true
  }, [count, dummy])

  useFrame(({ clock }) => {
    if (!group.current) return
    group.current.rotation.y = clock.elapsedTime * 0.025
    group.current.position.y = Math.sin(clock.elapsedTime * 0.24) * 0.12
  })

  return (
    <group ref={group}>
      <instancedMesh ref={particles} args={[undefined, undefined, count]}>
        <octahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial
          color="#2be4d0"
          emissive="#2be4d0"
          emissiveIntensity={0.32}
          opacity={opacity * 0.42}
          transparent
        />
      </instancedMesh>
    </group>
  )
}

export function RegistryScene({
  opacity = 1,
  scene,
}: {
  readonly opacity?: number
  readonly scene: Extract<RouteSceneInput, { scene: 'registry' }>
}) {
  const { config } = useExperience()
  const instances = useRef<InstancedMesh>(null)
  const field = useRef<Group>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const targetPosition = useRef(new Vector3())
  const colorScratch = useRef(new Color())
  const focusedColor = useMemo(() => new Color('#ff6b2c'), [])
  const currentTransforms = useRef(new Map<string, MutableTransform>())
  const targetLayout = useMemo(
    () => layoutRegistryPacks(scene.packIds, registrySeed),
    [scene.packIds],
  )
  const targetLayoutById = useMemo(
    () => new Map(targetLayout.map((item) => [item.id, item])),
    [targetLayout],
  )
  const particleCount = config.tier === 'low' ? 22 : config.tier === 'balanced' ? 38 : 58
  const lineCount = config.tier === 'low' ? 3 : 6

  useEffect(() => {
    instances.current?.instanceMatrix.setUsage(DynamicDrawUsage)
  }, [])

  useFrame(({ clock }, delta) => {
    if (!instances.current) return
    const interpolation = 1 - Math.exp(-delta * 5.4)

    for (const id of catalogIds) {
      const index = catalogIndex.get(id)
      const fullTarget = fullLayoutById.get(id)
      const filteredTarget = targetLayoutById.get(id)
      if (index === undefined || !fullTarget) continue

      let current = currentTransforms.current.get(id)
      if (!current) {
        current = {
          position: new Vector3(...fullTarget.position),
          rotation: new Euler(...fullTarget.rotation),
          scale: fullTarget.scale,
        }
        currentTransforms.current.set(id, current)
      }

      const focused = id === scene.focusedPackId
      const visible = Boolean(filteredTarget)
      const position = filteredTarget?.position ?? fullTarget.position
      targetPosition.current.set(position[0], position[1], position[2])

      if (!visible) {
        targetPosition.current.multiplyScalar(1.35)
        targetPosition.current.z -= 2.4
      } else if (focused) {
        targetPosition.current.y += 0.32
        targetPosition.current.z += 1.45
      }

      current.position.lerp(targetPosition.current, interpolation)
      current.rotation.x = MathUtils.damp(
        current.rotation.x,
        filteredTarget?.rotation[0] ?? fullTarget.rotation[0],
        5.4,
        delta,
      )
      current.rotation.y = MathUtils.damp(
        current.rotation.y,
        (filteredTarget?.rotation[1] ?? fullTarget.rotation[1]) +
          clock.elapsedTime * 0.035,
        5.4,
        delta,
      )
      current.rotation.z = MathUtils.damp(
        current.rotation.z,
        filteredTarget?.rotation[2] ?? fullTarget.rotation[2],
        5.4,
        delta,
      )
      current.scale = MathUtils.damp(
        current.scale,
        visible ? (filteredTarget?.scale ?? 1) * (focused ? 1.7 : 1) : 0.001,
        5.8,
        delta,
      )

      dummy.position.copy(current.position)
      dummy.rotation.copy(current.rotation)
      dummy.scale.setScalar(current.scale)
      dummy.updateMatrix()
      instances.current.setMatrixAt(index, dummy.matrix)

      colorScratch.current
        .copy(packColors.get(id) ?? focusedColor)
        .lerp(focusedColor, focused ? 1 : 0)
      instances.current.setColorAt(index, colorScratch.current)
    }

    instances.current.instanceMatrix.needsUpdate = true
    if (instances.current.instanceColor) {
      instances.current.instanceColor.needsUpdate = true
    }

    if (field.current) {
      field.current.rotation.x = -0.16 + scene.progress * 0.12
      field.current.rotation.y = 0.22 + scene.progress * 0.38
      field.current.position.y = 0.2 - scene.progress * 0.72
    }
  })

  return (
    <group>
      <ScanGrid opacity={opacity * 0.38} />
      <RegistryParticles key={particleCount} count={particleCount} opacity={opacity} />
      {constellationPaths.slice(0, lineCount).map((points, index) => (
        <TrailPath
          key={index}
          points={points}
          color={index % 3 === 0 ? '#ff6b2c' : '#2be4d0'}
          opacity={opacity * 0.34}
        />
      ))}
      <group ref={field} position={[2.2, 0.2, -0.7]}>
        <instancedMesh
          ref={instances}
          args={[undefined, undefined, catalogIds.length]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.72, 0.42, 0.72]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#2be4d0"
            emissiveIntensity={0.11}
            metalness={0.62}
            opacity={opacity}
            roughness={0.3}
            transparent={opacity < 1}
            vertexColors
          />
        </instancedMesh>
      </group>
    </group>
  )
}
