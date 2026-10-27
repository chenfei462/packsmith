import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { useStore } from 'zustand'

import { settleSceneMotion } from '../lifecycle/sceneLifecycle'
import { sceneStore } from '../sceneStore'
import { useExperience } from '../useExperience'

export interface PackArtifactProps {
  readonly position?: [number, number, number]
  readonly rotation?: [number, number, number]
  readonly scale?: number
  readonly accent?: string
  readonly opacity?: number
}

export function PackArtifact({
  position = [0, 0, 0],
  rotation = [0.18, -0.45, 0],
  scale = 1,
  accent = '#2be4d0',
  opacity = 1,
}: PackArtifactProps) {
  const group = useRef<Group>(null)
  const [initialPosition] = useState(position)
  const [initialRotation] = useState(rotation)
  const [initialScale] = useState(scale)
  const paused = useStore(sceneStore, (state) => state.paused)
  const { reducedMotion } = useExperience()

  useFrame(({ clock }, delta) => {
    if (!group.current || paused) {
      return
    }

    const float = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.7) * 0.12
    const turn = reducedMotion ? 0 : clock.elapsedTime * 0.12
    group.current.position.x = settleSceneMotion(
      group.current.position.x,
      position[0],
      delta,
      reducedMotion,
    )
    group.current.position.y = settleSceneMotion(
      group.current.position.y,
      position[1] + float,
      delta,
      reducedMotion,
    )
    group.current.position.z = settleSceneMotion(
      group.current.position.z,
      position[2],
      delta,
      reducedMotion,
    )
    group.current.rotation.x = settleSceneMotion(
      group.current.rotation.x,
      rotation[0],
      delta,
      reducedMotion,
    )
    group.current.rotation.y = settleSceneMotion(
      group.current.rotation.y,
      rotation[1] + turn,
      delta,
      reducedMotion,
    )
    group.current.rotation.z = settleSceneMotion(
      group.current.rotation.z,
      rotation[2],
      delta,
      reducedMotion,
    )
    const nextScale = settleSceneMotion(
      group.current.scale.x,
      scale,
      delta,
      reducedMotion,
    )
    group.current.scale.setScalar(nextScale)
  })

  return (
    <group
      ref={group}
      position={initialPosition}
      rotation={initialRotation}
      scale={initialScale}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.8, 1.7, 1.25]} />
        <meshStandardMaterial
          color="#151c22"
          metalness={0.72}
          roughness={0.28}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, 0, 0.66]} castShadow>
        <boxGeometry args={[2.25, 1.15, 0.1]} />
        <meshStandardMaterial
          color="#c9d2e7"
          emissive={accent}
          emissiveIntensity={0.12}
          metalness={0.35}
          roughness={0.4}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[-0.72, 0, 0.76]}>
        <boxGeometry args={[0.08, 0.76, 0.08]} />
        <meshStandardMaterial color={accent} emissive={accent} />
      </mesh>
      <mesh position={[0.2, 0.34, 0.76]}>
        <boxGeometry args={[1.25, 0.08, 0.08]} />
        <meshStandardMaterial color="#181520" />
      </mesh>
      <mesh position={[0.02, 0, 0.76]}>
        <boxGeometry args={[1.6, 0.08, 0.08]} />
        <meshStandardMaterial color="#181520" />
      </mesh>
      <mesh position={[-0.1, -0.34, 0.76]}>
        <boxGeometry args={[1.35, 0.08, 0.08]} />
        <meshStandardMaterial color="#181520" />
      </mesh>
    </group>
  )
}
