import * as THREE from 'three';

import {
  CYCLO_BACK_Z,
  CYCLO_FRONT_Z,
  CYCLO_RADIUS,
  CYCLO_TEXTURE_REPEAT_X,
  CYCLO_WALL_HEIGHT,
  CYCLO_WIDTH,
} from '../app/experienceConstants';

export function createCycloramaGeometry() {
  // A cyclorama is a floor that curves smoothly into a wall, eliminating a
  // visible horizon seam. We build one custom BufferGeometry by:
  // 1. defining a 2D Y/Z profile (floor → quarter-circle → wall),
  // 2. sweeping that profile across X,
  // 3. connecting neighboring samples into triangles.
  const xSegments = 36;
  const floorSegments = 10;
  const curveSegments = 18;
  const wallSegments = 10;
  const profile: Array<{ y: number; z: number }> = [];
  const curveStartZ = CYCLO_BACK_Z + CYCLO_RADIUS;

  for (let index = 0; index <= floorSegments; index += 1) {
    const t = index / floorSegments;
    profile.push({ y: 0, z: THREE.MathUtils.lerp(CYCLO_FRONT_Z, curveStartZ, t) });
  }

  for (let index = 1; index <= curveSegments; index += 1) {
    const theta = -Math.PI / 2 - (index / curveSegments) * (Math.PI / 2);
    profile.push({
      y: CYCLO_RADIUS + Math.sin(theta) * CYCLO_RADIUS,
      z: CYCLO_BACK_Z + CYCLO_RADIUS + Math.cos(theta) * CYCLO_RADIUS,
    });
  }

  for (let index = 1; index <= wallSegments; index += 1) {
    const t = index / wallSegments;
    profile.push({ y: THREE.MathUtils.lerp(CYCLO_RADIUS, CYCLO_WALL_HEIGHT, t), z: CYCLO_BACK_Z });
  }

  const profileDistances = getProfileDistances(profile);
  const surfaceLength = profileDistances[profileDistances.length - 1] || 1;
  // Position attribute: three floats per vertex.
  // UV attribute: two floats per vertex.
  // Index: integers describing which three vertices form each triangle.
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const halfWidth = CYCLO_WIDTH * 0.5;

  profile.forEach((point, profileIndex) => {
    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const u = xIndex / xSegments;
      const v = profileDistances[profileIndex] / surfaceLength;
      positions.push(THREE.MathUtils.lerp(-halfWidth, halfWidth, u), point.y, point.z);
      uvs.push(u, v);
    }
  });

  for (let profileIndex = 0; profileIndex < profile.length - 1; profileIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = profileIndex * (xSegments + 1) + xIndex;
      const b = a + 1;
      const c = (profileIndex + 1) * (xSegments + 1) + xIndex;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  // Lighting needs normals. Computing them averages adjacent triangle normals,
  // which makes the curved floor-to-wall transition shade smoothly.
  geometry.computeVertexNormals();

  return geometry;
}

export function getCycloramaRepeatY(imageAspect: number) {
  return imageAspect * getCycloramaSurfaceLength() * CYCLO_TEXTURE_REPEAT_X / CYCLO_WIDTH;
}

export function createSoftContactShadowMaterial(color: number, opacity: number) {
  // This is a "blob shadow": an authored alpha field on a plane, not a shadow
  // calculated by tracing light visibility. Advantages are stable softness,
  // zero shadow-map acne, and exact art direction. The tradeoff is that it does
  // not respond automatically when the light or silhouette changes.
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;

      float hash(vec2 value) {
        return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        // Remap UV 0..1 to a centered -1..+1 coordinate system. This makes
        // ellipse formulas symmetrical around zero.
        vec2 p = vUv * 2.0 - 1.0;
        // Each length(vec2(p.x * A, p.y * B)) is an elliptical distance
        // field. Different ellipses are layered to suggest both tight contact
        // and a broad, diffused cast shadow.
        float broad = smoothstep(1.0, 0.08, length(vec2(p.x * 0.72, p.y * 1.48)));
        float contact = smoothstep(0.46, 0.02, length(vec2((p.x - 0.08) * 1.25, p.y * 2.3)));
        float sideFalloff = smoothstep(1.0, 0.26, length(vec2((p.x + 0.18) * 0.92, p.y * 1.72)));
        // Quantized noise varies alpha in larger paper-like cells instead of
        // producing a perfectly digital gradient.
        float paperBreakup = mix(0.9, 1.06, hash(floor(vUv * 14.0)));
        float alpha = (broad * 0.7 + contact * 0.55 + sideFalloff * 0.22) * paperBreakup * uOpacity;

        // discard means this fragment writes no color and no depth at all.
        // It avoids processing nearly invisible transparent fringe pixels.
        if (alpha < 0.002) {
          discard;
        }

        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
}

export function createDialecticHalftoneShadowMaterial() {
  // This shader converts a smooth shadow-density field into a grid of square
  // halftone marks. Classic print halftoning represents darker values with
  // larger dots. Here the marks are squares to match the supplied reference.
  return new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;

      float hash(vec2 value) {
        return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 p = vUv * 2.0 - 1.0;

        // SHADOW SHAPE CONTROLS
        // ---------------------
        // These values change the internal ink shape, not the mesh's distance
        // from the dress. For physical placement, edit the position/rotation/
        // scale documented where dialecticHalftoneShadow is constructed.
        //
        // X/Y additions move each ellipse within the plane's UV space.
        // X/Y multipliers compress or stretch it.
        float broadDistance = length(vec2((p.x + 0.04) * 1.04, (p.y + 0.12) * 0.9));
        float contactDistance = length(vec2((p.x - 0.08) * 1.4, (p.y - 0.92) * 2.0));

        // Subtracting smoothstep from 1 makes values dense at the center and
        // fade to zero at the edge. The contact field concentrates ink near the
        // hem while the broad field creates the larger floor footprint.
        float broad = 1.0 - smoothstep(0.5, 1.0, broadDistance);
        float contact = 1.0 - smoothstep(0.1, 0.54, contactDistance);
        float density = clamp(broad * 0.68 + contact * 0.62, 0.0, 1.0);

        // HALFTONE GRID CONTROLS
        // ----------------------
        // Larger gridScale values create more, smaller marks. The unequal X/Y
        // counts compensate for the footprint's rectangular aspect.
        vec2 gridScale = vec2(39.0, 22.0);
        // floor() assigns every UV to an integer cell ID. fract() yields the
        // position inside that cell. Subtracting 0.5 centers it, and abs()
        // makes distance symmetric across all four quadrants.
        vec2 grid = floor(vUv * gridScale);
        vec2 cell = abs(fract(vUv * gridScale) - 0.5);
        float variation = hash(grid);

        // Darker density => larger square. Random variation prevents a sterile
        // perfectly uniform screen while keeping every cell stable over time.
        float squareSize = mix(0.015, 0.4, density) * mix(0.9, 1.06, variation);

        // For a square, max(abs(x), abs(y)) is the distance to its boundary.
        // Fragments outside the chosen half-size are discarded, leaving only
        // the printed mark. The density test removes the ellipse's faint tail.
        if (density < 0.05 || max(cell.x, cell.y) > squareSize) {
          discard;
        }

        // RGB is a nearly black blue ink. Alpha still varies with density, so
        // the center reads heavier without becoming a solid digital shape.
        gl_FragColor = vec4(vec3(0.025, 0.055, 0.075), mix(0.22, 0.56, density));
      }
    `,
    transparent: true,
    // The subject is deliberately composited after the background. Disabling
    // the test makes the footprint independent of the backdrop's depth, while
    // disabling writes guarantees it cannot hide the subsequently drawn dress.
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export function createTechnicolorYellowPlaneMaterial(color: number) {
  const material = new THREE.MeshBasicMaterial({
    color,
    depthWrite: true,
  });
  material.fog = false;
  material.toneMapped = false;

  return material;
}

export function getCoveredCycloramaTransform(imageAspect: number) {
  const surfaceAspect = CYCLO_WIDTH / getCycloramaSurfaceLength();
  const scale = new THREE.Vector2(1, 1);

  if (imageAspect > surfaceAspect) {
    scale.x = surfaceAspect / imageAspect;
  } else {
    scale.y = imageAspect / surfaceAspect;
  }

  return {
    offset: new THREE.Vector2((1 - scale.x) * 0.5, (1 - scale.y) * 0.5),
    scale,
  };
}

function getCycloramaSurfaceLength() {
  const floorLength = CYCLO_FRONT_Z - (CYCLO_BACK_Z + CYCLO_RADIUS);
  const curveLength = CYCLO_RADIUS * Math.PI * 0.5;
  const wallLength = CYCLO_WALL_HEIGHT - CYCLO_RADIUS;

  return floorLength + curveLength + wallLength;
}

function getProfileDistances(profile: Array<{ y: number; z: number }>) {
  let distance = 0;

  return profile.map((point, index) => {
    if (index === 0) {
      return 0;
    }

    const previousPoint = profile[index - 1];
    distance += Math.hypot(point.y - previousPoint.y, point.z - previousPoint.z);

    return distance;
  });
}
