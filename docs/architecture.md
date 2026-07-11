# Fashion System Architecture

## Module map

`src/main.ts` is the composition root. It creates shared Three.js objects and
wires focused systems together; behavior belongs in the modules below.

- `src/app/` owns shared runtime types, constants, and device render profiles.
- `src/config/` owns declarative dress and theme definitions.
- `src/rendering/studio/StudioScene.ts` owns the physical set and theme props.
- `src/themes/createThemeController.ts` applies a theme to scene and DOM state.
- `src/rendering/dresses/` owns dress loading, caches, ghosts, thumbnails, and
  activation. The mobile full-dress cache intentionally holds one active GLB.
- `src/interactions/createSubjectInteractions.ts` owns pointer, wheel, touch,
  camera motion, and dress rotation state transitions.
- `src/rendering/createFrameLoop.ts` owns per-frame update and render ordering.
- `src/rendering/createViewportController.ts` owns canvas, render-target, camera,
  title-mask, and responsive resize synchronization.
- `src/rendering/mew/` owns Invisible Cities selective rendering.
- `src/rendering/effects/` owns temporary and selective post-processing effects.
- `src/rendering/particles/` and `src/rendering/sculptures/` own theme systems.
- `src/ui/` creates DOM views and controls; `src/styles/` contains stage themes.

## Extension paths

To add a dress, add its declarative asset entry in `src/config/dresses.ts`. The
dress controller, URL state, switchers, thumbnails, cache, and ghosts consume
that configuration.

To add a theme, add its definition in `src/config/themes.ts`, apply scene state
in `createThemeController`, and add only its theme-scoped styling and optional
StudioScene-owned system. Keep renderer ownership out of UI modules.

Every system that creates geometries, materials, textures, render targets,
renderers, observers, timers, or event listeners must expose deterministic
cleanup. The composition root calls those `dispose()` methods on unload and HMR.

## Mobile GPU policy

- Mobile keeps one primary WebGL context, including Invisible Cities effects.
- The extra Invisible Cities foreground renderer is lazy and desktop-only.
- Both dress thumbnails share one lazy offscreen renderer and copy into 2D
  canvases. Invisible Cities and Wind Archive never allocate that hidden context.
- Mobile retains one full textured dress; inactive GLBs are evicted and disposed.
- Dress-transition render targets exist only for the transition duration.
- Pixel ratio and frame cadence come from `src/app/renderProfile.ts`.

============================================================================
READING GUIDE: HOW THIS THREE.JS APPLICATION WORKS
============================================================================

This file is intentionally documented as a teaching text. You do not need to
understand every subsystem before changing one small visual parameter.
Start with the mental model below, then jump to the section you care about.

THE SHORTEST POSSIBLE THREE.JS MENTAL MODEL
--------------------------------------------

1. A `Scene` is a tree of objects. It is not an image and does not draw
   anything by itself.
2. A `Camera` describes the point of view.
3. A `WebGLRenderer` asks the GPU to draw the scene from that camera.
4. A visible `Mesh` is normally:

       Mesh = Geometry (shape/vertices) + Material (how pixels look)

5. A transform (`position`, `rotation`, `scale`) belongs to every
   `Object3D`. Child transforms are evaluated relative to their parent.
6. The animation loop updates state and then renders a new frame.

The scene graph in this app is conceptually:

  scene
  ├── camera
  │   └── studio.infiniteBackdropMesh  (camera-attached, always fills the view)
  ├── active dress pivot
  │   ├── normalized GLB model
  │   ├── ordinary contact shadow
  │   └── Dialectic halftone floor shadow
  ├── cyclorama / physical studio
  ├── Wind Archive shadow + falling photo group
  ├── theme-specific sculpture groups
  └── ghost dress group

COORDINATE SYSTEMS: THE SOURCE OF MOST 3D CONFUSION
---------------------------------------------------

Three.js uses a right-handed coordinate system:

  +X = screen-right in the default front view
  +Y = up
  +Z = toward the camera in this scene

"Local space" means coordinates relative to an object's parent. "World
space" means coordinates after every parent transform has been applied.
"View/camera space" means coordinates relative to the camera. "Clip space"
is the GPU's post-projection space; after division by W, visible X and Y are
approximately -1..+1. "UV space" is a 2D texture coordinate system, usually
0..1 from one edge of a surface to the other.

A model imported from a GLB may have arbitrary dimensions and origin. The
loader normalizes and grounds it in `loadDress.ts`. We then put it inside a
`THREE.Group` called a pivot. Rotating/scaling the pivot controls the complete
subject without destroying the model's internal node hierarchy.

CPU CODE VERSUS GPU SHADER CODE
-------------------------------

TypeScript in this file runs on the CPU. GLSL strings (`vertexShader` and
`fragmentShader`) are compiled and run on the GPU:

- A vertex shader runs once per vertex. It normally transforms a vertex from
  local model coordinates into clip space.
- A fragment shader runs for each covered pixel/sample. It decides that
  pixel's color and alpha.
- A `uniform` is a CPU-controlled value shared by every shader invocation in
  one draw call: time, opacity, a texture, etc.
- A `varying` is written by the vertex shader, interpolated across the
  triangle, and read by the fragment shader. `vUv` is the common example.
- A `sampler2D` is a texture; `texture2D(texture, uv)` reads it.
- `mix(a, b, t)` linearly interpolates; `smoothstep` creates a soft threshold;
  `fract`, `floor`, `sin`, and `dot` are often combined to make cheap
  deterministic pseudo-random patterns.

THE STANDARD VERTEX-SHADER LINE
-------------------------------

Many shaders below contain:

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

Read it from right to left:

- `position` is the local geometry vertex.
- `modelViewMatrix` combines the object's world transform with the inverse
  camera transform, producing camera/view space.
- `projectionMatrix` applies perspective and produces clip space.
- `gl_Position` is the required vertex-shader output.

RENDER TARGETS AND POST-PROCESSING
----------------------------------

Normal rendering goes directly to the canvas. Post-processing instead draws
into an offscreen texture called a render target. `EffectComposer` runs a
chain of passes over that texture:

  RenderPass → Bloom → Bokeh → custom color/grain shader → OutputPass

Each pass consumes an image and produces another image. This app also uses
separate offscreen pipelines for the subject. That is selective
post-processing: the background can stay crisp while the dress receives a
controlled bloom, or a transition glitch can affect only the dress.

ALPHA, DEPTH, AND BLENDING
--------------------------

- Alpha is transparency. It does not by itself decide draw order.
- The depth buffer stores the closest rendered surface at each pixel.
- `depthTest` checks whether a fragment is behind something already drawn.
- `depthWrite` decides whether a fragment updates the depth buffer.
- Transparent overlay planes commonly use `depthTest: false` and
  `depthWrite: false`, because they are deliberately composited in screen
  order rather than treated as solid 3D surfaces.
- Additive blending adds light values and is useful for bloom. Ordinary
  alpha blending mixes foreground and background.

PERFORMANCE RULES USED HERE
---------------------------

- Temporary vectors used every frame are allocated once and reused. Creating
  thousands of `Vector3` objects per second causes garbage-collection pauses.
- Pixel ratio is capped. Doubling pixel ratio can approximately quadruple
  the number of pixels the GPU must shade.
- Loaded dresses and ghost models are cached, but old GPU resources are
  disposed when evicted.
- The render loop uses delta time, so motion speed is mostly independent of
  monitor refresh rate.

SAFE TUNING WORKFLOW
--------------------

1. Find the named mesh/material/pass rather than changing a random number.
2. Change one variable at a time.
3. Test every theme that shares that renderer or shader.
4. Check both dresses: their source GLBs have different silhouettes.
5. Run `npm run build`; TypeScript catches many integration mistakes, while
   live visual inspection catches composition and shader mistakes.

The large section comments below explain the implementation in the order the
application creates and renders it.
