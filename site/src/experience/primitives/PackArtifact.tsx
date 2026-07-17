import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { useStore } from 'zustand'

import { sceneStore } from '../sceneStore'

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
  const paused = useStore(sceneStore, (state) => state.paused)

  useFrame(({ clock }, delta) => {
    if (!group.current || paused) {
      return
    }

    group.current.rotation.y += delta * 0.12
    group.current.position.y = position[1] + Math.sin(clock.elapsedTime * 0.7) * 0.12
  })

  return (
    <group
      ref={group}
      position={position}
      rotation={rotation}
      scale={scale}
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
