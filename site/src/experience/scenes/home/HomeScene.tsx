import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  DynamicDrawUsage,
  MathUtils,
  Object3D,
  type Group,
  type InstancedMesh,
  type Mesh,
} from 'three'

import { PackArtifact } from '../../primitives/PackArtifact'
import { ScanGrid } from '../../primitives/ScanGrid'
import { TrailPath } from '../../primitives/TrailPath'
import {
  settleSceneMotion,
  stableSceneProgress,
} from '../../lifecycle/sceneLifecycle'
import { sceneStore } from '../../sceneStore'
import { useExperience } from '../../useExperience'
import {
  createFragmentLayout,
  homeFragmentCount,
  type Point,
} from './homeSceneModel'

const runtimeTrails: readonly (readonly Point[])[] = [
  [[-5.8, 2.6, -1.8], [-1.2, 1.7, -0.4], [1.6, 0.8, 0]],
  [[-5.9, 1.5, 0.8], [-1.5, 1.1, 0.2], [1.6, 0.45, 0]],
  [[-6.1, 0.3, -1.1], [-1.8, 0.35, -0.6], [1.6, 0.1, 0]],
  [[-6.2, -0.8, 1.1], [-1.6, -0.25, 0.5], [1.6, -0.25, 0]],
  [[-5.8, -1.8, -0.7], [-1.3, -0.85, -0.2], [1.6, -0.6, 0]],
  [[-5.5, -2.7, 1.4], [-0.8, -1.5, 0.4], [1.6, -0.95, 0]],
]

export function HomeScene({ opacity = 1 }: { readonly opacity?: number }) {
  const instances = useRef<InstancedMesh>(null)
  const artifactGroup = useRef<Group>(null)
  const scanPlane = useRef<Mesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const layout = useRef(createFragmentLayout('senior-code-reviewer'))
  const currentPackId = useRef('senior-code-reviewer')
  const easedProgress = useRef(0)
  const { reducedMotion } = useExperience()

  useEffect(() => {
    instances.current?.instanceMatrix.setUsage(DynamicDrawUsage)
  }, [])

  useFrame(({ clock }, delta) => {
    const active = sceneStore.getState().active

    if (active.scene !== 'home' || !instances.current) {
      return
    }

    if (active.packId !== currentPackId.current) {
      currentPackId.current = active.packId
      layout.current = createFragmentLayout(active.packId)
    }

    const targetProgress = stableSceneProgress(
      'home',
      MathUtils.clamp(Math.max(active.progress, active.demoStep / 8), 0, 1),
      reducedMotion,
    )
    easedProgress.current = settleSceneMotion(
      easedProgress.current,
      targetProgress,
      delta,
      reducedMotion,
      4.2,
    )
    const assembly = MathUtils.smoothstep(easedProgress.current, 0.02, 0.46)

    layout.current.forEach((fragment, index) => {
      dummy.position.set(
        MathUtils.lerp(fragment.scatter[0], fragment.assembled[0], assembly),
        MathUtils.lerp(fragment.scatter[1], fragment.assembled[1], assembly),
        MathUtils.lerp(fragment.scatter[2], fragment.assembled[2], assembly),
      )
      dummy.rotation.set(
        fragment.rotation[0] * (1 - assembly),
        fragment.rotation[1] * (1 - assembly),
        fragment.rotation[2] * (1 - assembly),
      )
      dummy.scale.setScalar(fragment.scale * (0.7 + assembly * 0.3))
      dummy.updateMatrix()
      instances.current?.setMatrixAt(index, dummy.matrix)
    })
    instances.current.instanceMatrix.needsUpdate = true

    if (artifactGroup.current) {
      artifactGroup.current.rotation.y = reducedMotion
        ? -0.35 + easedProgress.current * 0.55
        : -0.35 +
          easedProgress.current * 0.55 +
          Math.sin(clock.elapsedTime * 0.35) * 0.04
      artifactGroup.current.position.y = reducedMotion
        ? 0.15
        : 0.15 + Math.sin(clock.elapsedTime * 0.6) * 0.08
    }

    if (scanPlane.current) {
      scanPlane.current.position.y = -1.45 + easedProgress.current * 3.1
      scanPlane.current.rotation.y = reducedMotion ? 0 : clock.elapsedTime * 0.08
    }
  })

  return (
    <group>
      <ScanGrid opacity={opacity * 0.36} />
      <pointLight color="#2be4d0" intensity={8} position={[1.5, 2.8, 2.8]} />
      <pointLight color="#ff6b2c" intensity={7} position={[5, -2.4, 1]} />

      {runtimeTrails.map((points, index) => (
        <TrailPath
          key={index}
          points={points}
          color={index % 3 === 2 ? '#ff6b2c' : '#2be4d0'}
          opacity={opacity * (0.36 + index * 0.055)}
        />
      ))}

      <group ref={artifactGroup} position={[2.7, 0.15, -0.35]}>
        <instancedMesh
          ref={instances}
          args={[undefined, undefined, homeFragmentCount]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.31, 0.31, 0.31]} />
          <meshStandardMaterial
            color="#26313a"
            emissive="#2be4d0"
            emissiveIntensity={0.18}
            metalness={0.7}
            opacity={opacity}
            roughness={0.24}
            transparent={opacity < 1}
          />
        </instancedMesh>
        <PackArtifact opacity={opacity * 0.16} scale={0.82} />
        <mesh ref={scanPlane} position={[0, -1.45, 0]}>
          <boxGeometry args={[3.8, 0.035, 2.15]} />
          <meshStandardMaterial
            color="#ff6b2c"
            emissive="#ff6b2c"
            emissiveIntensity={2.4}
            opacity={opacity * 0.22}
            transparent
          />
        </mesh>
      </group>
    </group>
  )
}
