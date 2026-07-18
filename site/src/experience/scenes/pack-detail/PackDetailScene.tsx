import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'

import { repositoryData } from '../../../data/repositoryData'
import { PackArtifact } from '../../primitives/PackArtifact'
import { ScanGrid } from '../../primitives/ScanGrid'
import { TrailPath } from '../../primitives/TrailPath'
import { stableSceneProgress } from '../../lifecycle/sceneLifecycle'
import { sceneStore } from '../../sceneStore'
import type { RouteSceneInput } from '../../types'
import { useExperience } from '../../useExperience'
import {
  passportLayerModel,
  passportLayers,
  settlePassportMotion,
  type PassportLayer,
} from './passportLayerModel'

const layerColors: Readonly<Record<PassportLayer, string>> = {
  manifest: '#c9d2e7',
  permissions: '#4ce0a3',
  risk: '#ff6b2c',
  provenance: '#2be4d0',
  writes: '#8995a5',
  adapter: '#f0b94f',
}

const layerSizes: Readonly<Record<PassportLayer, [number, number, number]>> = {
  manifest: [3.05, 1.85, 0.12],
  permissions: [2.72, 1.52, 0.11],
  risk: [2.4, 1.2, 0.1],
  provenance: [2.08, 0.9, 0.09],
  writes: [1.78, 0.62, 0.08],
  adapter: [1.48, 0.36, 0.07],
}

const layerTrails: readonly (readonly [number, number, number][])[] = [
  [[0.4, 2.7, -1.6], [2.8, 1.3, -0.7], [5.6, 0.25, 0]],
  [[0.2, -2.2, -1.2], [2.4, -1.05, -0.45], [5.8, -0.15, 0]],
  [[1.1, 3, -1.8], [3.7, 1.25, -0.65], [6, 0.35, 0]],
  [[1, -2.7, -1.4], [3.8, -1.25, -0.5], [6.2, -0.2, 0]],
]

function PassportPlate({
  layer,
  index,
  active,
  opacity,
}: {
  readonly layer: PassportLayer
  readonly index: number
  readonly active: boolean
  readonly opacity: number
}) {
  const size = layerSizes[layer]
  const color = layerColors[layer]

  return (
    <group position={[0, 0, (index - 2.5) * 0.13]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={layer === 'manifest' ? '#c9d2e7' : '#1b2229'}
          emissive={color}
          emissiveIntensity={active ? 0.72 : 0.18}
          metalness={0.7}
          opacity={opacity * (active ? 1 : 0.82)}
          roughness={0.25}
          transparent={opacity < 1 || !active}
        />
      </mesh>
      <mesh position={[-size[0] * 0.34, 0, size[2] * 0.72]}>
        <boxGeometry args={[0.055, size[1] * 0.66, 0.035]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
      </mesh>
      {[0.28, 0, -0.28].map((offset, lineIndex) => (
        <mesh
          key={lineIndex}
          position={[size[0] * 0.06, size[1] * offset, size[2] * 0.72]}
        >
          <boxGeometry
            args={[size[0] * (0.48 - lineIndex * 0.06), 0.035, 0.025]}
          />
          <meshStandardMaterial
            color={lineIndex === 0 ? color : '#080a0e'}
            emissive={lineIndex === 0 ? color : '#080a0e'}
            emissiveIntensity={0.6}
          />
        </mesh>
      ))}
      {layer === 'adapter' ? (
        <mesh position={[size[0] * 0.42, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.18, 0.04, 10, 28]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.9}
            metalness={0.65}
          />
        </mesh>
      ) : null}
    </group>
  )
}

export function PackDetailScene({
  opacity = 1,
  scene,
}: {
  readonly opacity?: number
  readonly scene: Extract<RouteSceneInput, { scene: 'pack-detail' }>
}) {
  const root = useRef<Group>(null)
  const layers = useRef<Array<Group | null>>([])
  const adapterTurn = useRef(0)
  const viewportWidth = useThree((state) => state.viewport.width)
  const { reducedMotion } = useExperience()
  const compact = viewportWidth < 8
  const targetAngles = useMemo(
    () =>
      new Map(
        repositoryData.supportedTargetIds.map((targetId, index) => [
          targetId,
          (index / repositoryData.supportedTargetIds.length) * Math.PI * 2,
        ]),
      ),
    [],
  )

  useFrame(({ clock }, delta) => {
    const activeScene = sceneStore.getState().active
    const currentScene =
      activeScene.scene === 'pack-detail' && activeScene.packId === scene.packId
        ? activeScene
        : scene
    const targetAngle = targetAngles.get(currentScene.targetId ?? 'codex') ?? 0

    adapterTurn.current = settlePassportMotion(
      adapterTurn.current,
      targetAngle,
      delta,
      reducedMotion,
      5.2,
    )

    passportLayers.forEach((layer, index) => {
      const group = layers.current[index]
      if (!group) return

      const transform = passportLayerModel(
        layer,
        stableSceneProgress(
          'pack-detail',
          currentScene.progress,
          reducedMotion,
        ),
      )
      group.position.x = settlePassportMotion(
        group.position.x,
        transform.position[0],
        delta,
        reducedMotion,
      )
      group.position.y = settlePassportMotion(
        group.position.y,
        transform.position[1],
        delta,
        reducedMotion,
      )
      group.position.z = settlePassportMotion(
        group.position.z,
        transform.position[2],
        delta,
        reducedMotion,
      )
      group.rotation.x = settlePassportMotion(
        group.rotation.x,
        transform.rotation[0],
        delta,
        reducedMotion,
      )
      group.rotation.y = settlePassportMotion(
        group.rotation.y,
        transform.rotation[1] + (layer === 'adapter' ? adapterTurn.current : 0),
        delta,
        reducedMotion,
      )
      group.rotation.z = settlePassportMotion(
        group.rotation.z,
        transform.rotation[2],
        delta,
        reducedMotion,
      )
      const scale = settlePassportMotion(
        group.scale.x,
        transform.scale,
        delta,
        reducedMotion,
      )
      group.scale.setScalar(scale)
    })

    if (root.current) {
      root.current.rotation.y = reducedMotion
        ? -0.16
        : -0.16 + Math.sin(clock.elapsedTime * 0.3) * 0.035
      root.current.rotation.x = reducedMotion
        ? 0.08
        : 0.08 + Math.sin(clock.elapsedTime * 0.22) * 0.025
      root.current.position.y = reducedMotion
        ? 0
        : Math.sin(clock.elapsedTime * 0.48) * 0.08
    }
  })

  return (
    <group>
      <ScanGrid opacity={opacity * 0.34} />
      {layerTrails.map((points, index) => (
        <TrailPath
          color={index % 2 === 0 ? '#2be4d0' : '#ff6b2c'}
          key={index}
          opacity={opacity * 0.2}
          points={points}
        />
      ))}
      <group
        position={[compact ? 0.55 : 2.15, compact ? -0.3 : 0.05, -0.65]}
        scale={compact ? 0.68 : 0.88}
      >
        <PackArtifact opacity={opacity * 0.13} scale={1.12} />
        <group ref={root}>
          {passportLayers.map((layer, index) => (
            <group
              key={layer}
              ref={(node) => {
                layers.current[index] = node
              }}
            >
              <PassportPlate
                active={scene.layer === layer}
                index={index}
                layer={layer}
                opacity={opacity}
              />
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}
