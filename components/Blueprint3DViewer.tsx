"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";

interface LocationResult {
  place_id?: string;
  lat?: number;
  lng?: number;
  name?: string;
  photo_url?: string;
  rooms?: { url: string; label?: string }[];
}

interface Props {
  location: LocationResult;
  modelUrl?: string; // optional override
}

/**
 * Beginner-friendly 3D blueprint viewer:
 * - Drop a glTF (.glb) into /public/models/{place_id}.glb
 * - Or pass modelUrl prop to point to a different location
 *
 * Movement: WASD + mouse look (click to lock) with simple raycast collision
 */
export default function Blueprint3DViewer({ location, modelUrl }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<PointerLockControls | null>(null);
  const rafRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Basic scene + camera + renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b0b);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 2000);
    camera.position.set(0, 1.6, 0); // player eye height
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    hemi.position.set(0, 200, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    scene.add(dir);

    // Floor fallback (if your model has no floor)
    const floorGeo = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // PointerLock controls
    const controls = new PointerLockControls(camera, renderer.domElement);
    controlsRef.current = controls;

    function onLock() { setLocked(true); }
    function onUnlock() { setLocked(false); }
    controls.addEventListener("lock", onLock);
    controls.addEventListener("unlock", onUnlock);

    // Movement state
    const move = { forward: false, backward: false, left: false, right: false };
    let velocity = new THREE.Vector3();
    const speed = 3.0; // meters/sec

    function onKeyDown(e: KeyboardEvent) {
      switch (e.code) {
        case "KeyW": move.forward = true; break;
        case "KeyS": move.backward = true; break;
        case "KeyA": move.left = true; break;
        case "KeyD": move.right = true; break;
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      switch (e.code) {
        case "KeyW": move.forward = false; break;
        case "KeyS": move.backward = false; break;
        case "KeyA": move.left = false; break;
        case "KeyD": move.right = false; break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Simple collision: raycast from camera in movement direction
    const raycaster = new THREE.Raycaster();
    const tempVec = new THREE.Vector3();
    const downVec = new THREE.Vector3(0, -1, 0);

    // Load model
    const loader = new GLTFLoader();
    const placeId = location.place_id ?? "default";
    const defaultUrl = `/models/${placeId}.glb`;
    const url = modelUrl ?? defaultUrl;

    loader.load(
      url,
      (gltf) => {
        // Add model
        const root = gltf.scene;
        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.castShadow = true;
            m.receiveShadow = true;
            // Optional: mark colliders by name in Blender (prefix "collider")
            // if (m.name.toLowerCase().startsWith("collider")) (m.userData as any).collider = true;
          }
        });

        // Center model and add to scene
        scene.add(root);

        // Optional: compute bounding and center camera / player
        const box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty() === false) {
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          // Place player near min Z + small offset
          camera.position.set(center.x, 1.6, box.min.z + 1.2);
        }

        setLoading(false);
      },
      undefined,
      (err) => {
        console.error("Failed to load model:", err);
        setLoading(false);
      }
    );

    // Resize handling
    function onResize() {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    }
    window.addEventListener("resize", onResize);

    // Animation loop
    let last = performance.now();
    function animate(now = performance.now()) {
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (controls.isLocked === true) {
        // Update velocity smoothing
        const forward = (move.forward ? 1 : 0) - (move.backward ? 1 : 0);
        const strafe = (move.right ? 1 : 0) - (move.left ? 1 : 0);

        // Direction in world space
        const dir = new THREE.Vector3();
        controls.getDirection(dir); // normalized forward vector
        dir.y = 0;
        dir.normalize();

        // Right vector
        const right = new THREE.Vector3();
        right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

        tempVec.set(0, 0, 0);
        tempVec.addScaledVector(dir, forward);
        tempVec.addScaledVector(right, strafe);
        if (tempVec.lengthSq() > 0) tempVec.normalize();

        // Attempt movement with simple raycast collision
        const step = tempVec.clone().multiplyScalar(speed * delta);

        // Raycast a short distance ahead from camera position (player radius)
        const origin = camera.position.clone();
        origin.y = 1.0; // ray origin height (roughly chest height)
        const checkDir = step.clone().normalize();
        const maxDistance = step.length() + 0.35; // player's radius buffer

        let canMove = true;
        if (checkDir.lengthSq() > 0) {
          raycaster.set(origin, checkDir);
          const intersects = raycaster.intersectObjects(scene.children, true);
          if (intersects.length > 0 && intersects[0].distance < maxDistance) {
            canMove = false;
          }
        }

        if (canMove) {
          camera.position.add(step);
        }

        // Keep camera at ground height (simple ground snap)
        raycaster.set(camera.position.clone().add(new THREE.Vector3(0, 5, 0)), downVec);
        const groundHits = raycaster.intersectObjects(scene.children, true);
        if (groundHits.length > 0) {
          const groundY = groundHits[0].point.y;
          camera.position.y = Math.max(1.2, groundY + 1.6 - 0.5); // keep player ~1.6m above ground
        }
      }

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(animate);
    }
    rafRef.current = requestAnimationFrame(animate);

    // Click to lock
    const onClick = () => {
      if (controls.isLocked === false) controls.lock();
    };
    containerRef.current.addEventListener("click", onClick);

    // Clean up
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      controls.removeEventListener("lock", onLock);
      controls.removeEventListener("unlock", onUnlock);
      containerRef.current?.removeEventListener("click", onClick);
      controls.dispose();
      renderer.dispose();
      scene.clear();
      // remove renderer DOM element
      if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.place_id, modelUrl]);

  // Simple overlay UI
  return (
    <div ref={containerRef} className="w-full h-full relative bg-black">
      {!locked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 text-white px-4 py-3 rounded-md pointer-events-auto">
            <div className="text-sm">Click to enter — mouse to look, WASD to move</div>
          </div>
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-white/60">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-2" />
            <div className="text-sm">Loading 3D blueprint…</div>
          </div>
        </div>
      )}

      {/* Optional simple hotspot list from rooms */}
      {location.rooms && location.rooms.length > 0 && (
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          {location.rooms.map((r, i) => (
            <button
              key={i}
              onClick={() => alert(`Open photo: ${r.url}`)}
              className="bg-white/10 text-white/80 px-2 py-1 rounded text-xs"
            >
              {r.label ?? `View ${i + 1}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
