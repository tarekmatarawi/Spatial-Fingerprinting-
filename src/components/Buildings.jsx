import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Extrudes each building footprint (in the X/Y ground plane) upward along +Z
// by its height, then merges every building into a single mesh (and a single
// outline) so the whole city is drawn in just two draw calls instead of
// thousands. Footprint winding is normalised to counter-clockwise so extrusion
// normals always face outward regardless of how the OSM polygon was wound.
export function Buildings({ buildings }) {
  const { fillGeometry, edgeGeometry } = useMemo(() => {
    const fillGeoms = []
    const edgeGeoms = []

    for (const building of buildings) {
      let ring = building.footprint
      if (signedArea(ring) < 0) ring = ring.slice().reverse()

      const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, p.y)))
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: building.height,
        bevelEnabled: false,
      })
      fillGeoms.push(geometry)
      edgeGeoms.push(new THREE.EdgesGeometry(geometry, 25))
    }

    const fillGeometry = fillGeoms.length ? mergeGeometries(fillGeoms, false) : null
    const edgeGeometry = edgeGeoms.length ? mergeGeometries(edgeGeoms, false) : null

    fillGeoms.forEach((g) => g.dispose())
    edgeGeoms.forEach((g) => g.dispose())

    return { fillGeometry, edgeGeometry }
  }, [buildings])

  if (!fillGeometry) return null

  return (
    <group>
      {/* Museum-board model: warm near-white volumes with ink lineweight edges */}
      <mesh geometry={fillGeometry}>
        <meshStandardMaterial color="#faf8f2" roughness={0.9} metalness={0} />
      </mesh>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial color="#44403c" />
      </lineSegments>
    </group>
  )
}

// Signed area of a ring in the X/Y plane; positive = counter-clockwise.
function signedArea(ring) {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}
