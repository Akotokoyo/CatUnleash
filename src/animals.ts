import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const TARGET_HEIGHT = 1.18;
const toonRamp = makeToonRamp();

function makeToonRamp(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D non disponibile");
  const stops = ["#a3a3a3", "#a3a3a3", "#d2d2d2", "#d2d2d2", "#ffffff", "#ffffff", "#ffffff", "#ffffff"];
  stops.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(index, 0, 1, 1);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

export interface AnimalTint {
  fur: number;
  pattern?: string;
  patch?: number;
  extra?: number;
  belly?: number;
}

let catTemplate: THREE.Group | undefined;
let dogTemplate: THREE.Group | undefined;
let loadPromise: Promise<void> | undefined;
const tintMaps = new Map<string, THREE.CanvasTexture>();

function modelUrl(file: string): string {
  return new URL(`models/${file}`, document.baseURI).href;
}

export function hasAnimalModels(): boolean {
  return Boolean(catTemplate && dogTemplate);
}

export function loadAnimalModels(): Promise<void> {
  if (!loadPromise) {
    loadPromise = Promise.all([
      loadTemplate(modelUrl("animal-cat.glb")),
      loadTemplate(modelUrl("animal-dog.glb"), { receiveShadow: false }),
    ])
      .then(([cat, dog]) => {
        catTemplate = cat;
        dogTemplate = dog;
      })
      .catch((error: unknown) => {
        console.warn("Kenney animal models failed to load", error);
        loadPromise = undefined;
      });
  }
  return loadPromise ?? Promise.resolve();
}

async function loadTemplate(url: string, options: { receiveShadow?: boolean } = {}): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  return normalizeModel(gltf.scene, options);
}

function normalizeModel(scene: THREE.Object3D, options: { receiveShadow?: boolean } = {}): THREE.Group {
  const wrap = new THREE.Group();
  wrap.userData.kenney = true;
  wrap.add(scene);
  scene.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  scene.scale.multiplyScalar(TARGET_HEIGHT / Math.max(size.y, 0.0001));
  scene.updateWorldMatrix(true, true);
  box.setFromObject(wrap);
  scene.position.y -= box.min.y;
  // Procedural cats face -Z; Kenney animals typically face +Z.
  scene.rotation.y = Math.PI;
  wrap.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = options.receiveShadow ?? true;
    object.frustumCulled = false;
    const source = object.material;
    if (Array.isArray(source)) return;
    if (
      !(source instanceof THREE.MeshStandardMaterial) &&
      !(source instanceof THREE.MeshPhysicalMaterial)
    ) {
      return;
    }
    if (source.map) {
      source.map.magFilter = THREE.NearestFilter;
      source.map.minFilter = THREE.NearestFilter;
      source.map.colorSpace = THREE.SRGBColorSpace;
    }
    object.material = new THREE.MeshToonMaterial({
      map: source.map,
      color: source.color,
      gradientMap: toonRamp,
    });
    source.dispose();
  });
  return wrap;
}

function cloneTemplate(template: THREE.Group, tint?: AnimalTint): THREE.Group {
  const clone = template.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    object.material = Array.isArray(material)
      ? material.map((item) => tintMaterial(item, tint))
      : tintMaterial(material, tint);
  });
  return clone;
}

function tintMaterial(material: THREE.Material, tint?: AnimalTint): THREE.Material {
  const clone = material.clone();
  if (!tint || !("color" in clone)) return clone;
  const colored = clone as THREE.MeshToonMaterial;
  colored.color.setHex(0xffffff);
  if (colored.map) colored.map = remappedMap(colored.map, tint);
  else colored.color.setHex(tint.fur);
  return clone;
}

function remappedMap(source: THREE.Texture, tint: AnimalTint): THREE.Texture {
  const key = [
    source.uuid,
    tint.fur,
    tint.pattern ?? "",
    tint.patch ?? "",
    tint.extra ?? "",
    tint.belly ?? "",
  ].join(":");
  const cached = tintMaps.get(key);
  if (cached) return cached;

  const image = source.image as CanvasImageSource | undefined;
  const width = "width" in (image ?? {}) ? Number((image as { width: number }).width) : 0;
  const height = "height" in (image ?? {}) ? Number((image as { height: number }).height) : 0;
  if (!image || !width || !height) return source;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height);
  const fur = new THREE.Color(tint.fur);
  const light = new THREE.Color(tint.patch ?? tint.belly ?? 0xf6f1e8);
  const extra = tint.extra !== undefined ? new THREE.Color(tint.extra) : undefined;
  const bicolor = tint.pattern === "bicolor" || tint.pattern === "calico";

  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index] / 255;
    const green = pixels.data[index + 1] / 255;
    const blue = pixels.data[index + 2] / 255;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const sat = max < 1e-4 ? 0 : (max - min) / max;
    if (luma < 0.12 || sat > 0.42) continue;

    let target = fur;
    if (luma > 0.78 && sat < 0.28) {
      if (!bicolor && tint.belly === undefined) continue;
      target = light;
    } else if (bicolor && luma > 0.5 && sat < 0.32) {
      target = light;
    } else if (extra && luma > 0.32 && luma < 0.48 && sat < 0.32) {
      target = extra;
    }

    const shade = THREE.MathUtils.clamp(luma / 0.58, 0.42, 1.22);
    pixels.data[index] = Math.round(Math.min(1, target.r * shade) * 255);
    pixels.data[index + 1] = Math.round(Math.min(1, target.g * shade) * 255);
    pixels.data[index + 2] = Math.round(Math.min(1, target.b * shade) * 255);
  }

  context.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.flipY = source.flipY;
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.needsUpdate = true;
  tintMaps.set(key, map);
  return map;
}

export function cloneCatModel(tint?: AnimalTint): THREE.Group | undefined {
  return catTemplate ? cloneTemplate(catTemplate, tint) : undefined;
}

export function cloneDogModel(tint?: AnimalTint): THREE.Group | undefined {
  return dogTemplate ? cloneTemplate(dogTemplate, tint) : undefined;
}
