import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  MathUtils,
  Vector3,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
} from 'three'

import type { DocsTopicId } from '../../../content/docs'
import { DOCS_TOPIC_IDS } from '../../../features/docs/docsManifest'
import { ScanGrid } from '../../primitives/ScanGrid'
import { TrailPath } from '../../primitives/TrailPath'
import { sceneStore } from '../../sceneStore'
import type { RouteSceneInput } from '../../types'
import { useExperience } from '../../useExperience'
import { pipelineModel } from './pipelineModel'

const defaultCamera = new Vector3(0, 1.1, 10.5)
const pipelineModels = new Map(
  DOCS_TOPIC_IDS.map((topic) => [topic, pipelineModel(topic)] as const),
)
const vectorPositions = pipelineModels
  .get('install')!
  .nodes.map((node) => new Vector3(...node.position))

function normalizeTopic(topic: string): DocsTopicId {
  return DOCS_TOPIC_IDS.includes(topic as DocsTopicId)
    ? (topic as DocsTopicId)
    : 'install'
}

export function DocsScene({
  opacity = 1,
  scene,
}: {
  readonly opacity?: number
  readonly scene: Extract<RouteSceneInput, { scene: 'docs' }>
}) {
  const root = useRef<Group>(null)
  const nodes = useRef<Array<Group | null>>([])
  const nodeMaterials = useRef<Array<MeshStandardMaterial | null>>([])
  const signal = useRef<Mesh>(null)
  const camera = useThree((state) => state.camera)
  const viewportWidth = useThree((state) => state.viewport.width)
  const { reducedMotion } = useExperience()
  const compact = viewportWidth < 8
  const topic = normalizeTopic(scene.topic)
  const model = pipelineModels.get(topic)!
  const cameraTarget = useRef(new Vector3())

  useEffect(
    () => () => {
      camera.position.copy(defaultCamera)
      camera.lookAt(0, 0, 0)
    },
    [camera],
  )

  useFrame(({ clock }, delta) => {
    const activeScene = sceneStore.getState().active
    const docsActive = activeScene.scene === 'docs'
    const activeTopic = docsActive ? normalizeTopic(activeScene.topic) : topic
    const activeModel = pipelineModels.get(activeTopic)!

    activeModel.nodes.forEach((node, index) => {
      const material = nodeMaterials.current[index]
      if (material) {
        const targetOpacity = opacity * (node.active ? 1 : node.visited ? 0.62 : 0.26)
        material.opacity = MathUtils.damp(
          material.opacity,
          targetOpacity,
          reducedMotion ? 25 : 9,
          delta,
        )
      }

      if (reducedMotion) return
      const group = nodes.current[index]
      if (!group) return

      const pulse = node.active ? Math.sin(clock.elapsedTime * 2.1) * 0.12 : 0
      group.position.x = MathUtils.damp(
        group.position.x,
        node.position[0],
        7,
        delta,
      )
      group.position.y = MathUtils.damp(
        group.position.y,
        node.position[1] + (node.active ? 0.24 : 0) + pulse,
        7,
        delta,
      )
      group.position.z = MathUtils.damp(
        group.position.z,
        node.position[2] + (node.active ? 0.2 : 0),
        7,
        delta,
      )
      group.rotation.x += delta * (node.active ? 0.42 : 0.08)
      group.rotation.y += delta * (node.active ? 0.58 : 0.12)
      const targetScale = node.active ? 1.34 : node.visited ? 1 : 0.82
      const scale = MathUtils.damp(group.scale.x, targetScale, 7, delta)
      group.scale.setScalar(scale)
    })

    if (!reducedMotion && root.current) {
      root.current.rotation.y = Math.sin(clock.elapsedTime * 0.19) * 0.035
      root.current.position.y = Math.sin(clock.elapsedTime * 0.31) * 0.06
    }

    if (!reducedMotion && signal.current) {
      if (activeModel.activeIndex === 0) {
        signal.current.position.copy(vectorPositions[0])
        signal.current.position.y += Math.sin(clock.elapsedTime * 1.8) * 0.14
      } else {
        const phase =
          (clock.elapsedTime * 0.46) % Math.max(1, activeModel.activeIndex)
        const segment = Math.min(
          Math.floor(phase),
          activeModel.activeIndex - 1,
        )
        const segmentProgress = MathUtils.smoothstep(phase - segment, 0, 1)
        signal.current.position.lerpVectors(
          vectorPositions[segment],
          vectorPositions[segment + 1],
          segmentProgress,
        )
      }
    }

    if (!reducedMotion) {
      const focusNode = vectorPositions[activeModel.activeIndex]
      cameraTarget.current.set(
        docsActive ? focusNode.x * 0.09 : defaultCamera.x,
        docsActive ? 1.05 + focusNode.y * 0.12 : defaultCamera.y,
        docsActive ? 9.85 : defaultCamera.z,
      )
      camera.position.lerp(
        cameraTarget.current,
        1 - Math.exp(-delta * (docsActive ? 2.8 : 6.5)),
      )
      camera.lookAt(0, 0, 0)
    }
  })

  return (
    <group>
      <ScanGrid opacity={opacity * 0.2} />
      <group
        ref={root}
        position={[compact ? 0 : -0.35, compact ? -0.4 : 0, -1.2]}
        scale={compact ? 0.65 : 0.9}
      >
        {model.paths.map((path) => (
          <group key={`${path.from}-${path.to}`}>
            <TrailPath
              color="#34404c"
              opacity={opacity * 0.34}
              points={path.points}
            />
            <TrailPath
              color="#2be4d0"
              opacity={opacity * (path.traced ? 0.76 : 0.08)}
              points={path.points}
            />
          </group>
        ))}

        {model.nodes.map((node, index) => (
          <group
            key={node.id}
            position={node.position}
            ref={(group) => {
              nodes.current[index] = group
            }}
          >
            <mesh castShadow receiveShadow>
              <octahedronGeometry args={[0.42, 0]} />
              <meshStandardMaterial
                color="#65727f"
                emissive="#2be4d0"
                emissiveIntensity={0.3}
                metalness={0.62}
                opacity={opacity * (node.active ? 1 : node.visited ? 0.62 : 0.26)}
                ref={(material) => {
                  nodeMaterials.current[index] = material
                }}
                roughness={0.28}
                transparent
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.68, 0.025, 8, 32]} />
              <meshStandardMaterial
                color="#ff6b2c"
                emissive="#ff6b2c"
                emissiveIntensity={1}
                opacity={opacity * (node.active ? 0.85 : 0.08)}
                transparent
              />
            </mesh>
            <mesh position={[0, -0.72, -0.05]}>
              <boxGeometry args={[1.15, 0.06, 0.08]} />
              <meshStandardMaterial
                color="#2be4d0"
                emissive="#2be4d0"
                emissiveIntensity={0.35}
                opacity={opacity * (node.visited ? 0.62 : 0.14)}
                transparent
              />
            </mesh>
          </group>
        ))}

        {!reducedMotion ? (
          <mesh ref={signal}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial
              color="#fff06a"
              emissive="#fff06a"
              emissiveIntensity={2.2}
              opacity={opacity}
              transparent={opacity < 1}
            />
          </mesh>
        ) : null}
      </group>
    </group>
  )
}
