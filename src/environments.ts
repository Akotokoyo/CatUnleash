import * as THREE from "three";

export const ENVIRONMENTS = [
  { id: "city", nameKey: "world.city", sky: 0x86c9ef, fog: 0x86c9ef, road: 0x343b43, edge: 0xa9adb0, line: 0xf6df88, sun: 0xffe7a1 },
  { id: "country", nameKey: "world.country", sky: 0x9bdcf3, fog: 0xb9e4c7, road: 0x9a7147, edge: 0x62a44e, line: 0xf0dca4, sun: 0xffefb2 },
  { id: "jungle", nameKey: "world.jungle", sky: 0x4e9d77, fog: 0x356f52, road: 0x665c43, edge: 0x1f6d3f, line: 0xd7c66b, sun: 0xcff49a },
  { id: "lab", nameKey: "world.lab", sky: 0x243746, fog: 0x243746, road: 0xb7c5cc, edge: 0x344c59, line: 0x35e5ef, sun: 0xd8fbff },
  { id: "space", nameKey: "world.space", sky: 0x030716, fog: 0x070b1c, road: 0x202536, edge: 0x444b62, line: 0x7ccfff, sun: 0xaac9ff },
  { id: "egypt", nameKey: "world.egypt", sky: 0xf0b75f, fog: 0xdd9d4b, road: 0xc99b58, edge: 0xe1bd78, line: 0xffe2a1, sun: 0xfff0a8 },
  { id: "dimension", nameKey: "world.dimension", sky: 0x19052f, fog: 0x2e0a4d, road: 0x27183c, edge: 0x5b2b78, line: 0xff4fd8, sun: 0xb5ffff },
] as const;

export type EnvironmentTheme = (typeof ENVIRONMENTS)[number];

export function getEnvironment(index: number): EnvironmentTheme {
  return ENVIRONMENTS[index % ENVIRONMENTS.length];
}

export function makeEnvironmentSky(index: number): THREE.Group {
  const theme = getEnvironment(index);
  const group = new THREE.Group();
  if (theme.id === "space" || theme.id === "dimension") {
    const positions: number[] = [];
    for (let i = 0; i < 260; i += 1) {
      positions.push((Math.random() - 0.5) * 150, 3 + Math.random() * 65, -20 - Math.random() * 135);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    group.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      color: theme.id === "space" ? 0xffffff : 0x7fffff,
      size: theme.id === "space" ? 0.28 : 0.45,
    })));
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(theme.id === "space" ? 9 : 6, 24, 16),
      new THREE.MeshBasicMaterial({ color: theme.id === "space" ? 0x576dcc : 0xea4fff, fog: false }),
    );
    planet.position.set(-27, 25, -110);
    group.add(planet);
    return group;
  }

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(theme.id === "egypt" ? 11 : 7, 40),
    new THREE.MeshBasicMaterial({ color: theme.sun, fog: false }),
  );
  sun.position.set(theme.id === "egypt" ? 0 : -24, theme.id === "egypt" ? 23 : 25, -110);
  group.add(sun);
  if (theme.id !== "lab") {
    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: theme.id === "jungle" ? 0xd8ead3 : 0xf5fbff,
      transparent: true,
      opacity: theme.id === "egypt" ? 0.28 : 0.72,
      fog: false,
    });
    for (let i = 0; i < 7; i += 1) {
      const cloud = new THREE.Group();
      for (let puff = 0; puff < 4; puff += 1) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.7 + (puff % 2) * 0.55, 9, 6), cloudMaterial);
        mesh.position.set(puff * 2, Math.sin(puff) * 0.45, 0);
        mesh.scale.y = 0.62;
        cloud.add(mesh);
      }
      cloud.position.set(-34 + (i % 4) * 23, 16 + (i % 3) * 5, -60 - Math.floor(i / 4) * 35);
      group.add(cloud);
    }
  }
  return group;
}

export function makeEnvironmentTrack(index: number, length: number): THREE.Group {
  const theme = getEnvironment(index);
  const group = new THREE.Group();
  const road = material(theme.road, 0.94, theme.id === "lab" || theme.id === "space" ? 0.18 : 0);
  const edge = material(theme.edge, 0.86);
  const line = material(theme.line, 0.65, theme.id === "dimension" ? 0.25 : 0);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.55, length), road);
  slab.receiveShadow = true;
  group.add(slab);

  for (const x of [-5.35, 5.35]) {
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.72, length), edge);
    shoulder.position.set(x, 0.08, 0);
    shoulder.receiveShadow = true;
    group.add(shoulder);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, length), line);
    curb.position.set(x + (x < 0 ? 0.68 : -0.68), 0.43, 0);
    group.add(curb);
  }
  for (const x of [-1.35, 1.35]) {
    for (let z = -5.3; z <= 5.3; z += 3.5) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 1.75), line);
      dash.position.set(x, 0.3, z);
      group.add(dash);
    }
  }
  if (theme.id === "lab") {
    for (let z = -5.6; z <= 5.6; z += 2.8) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(9.1, 0.025, 0.055), material(0x657985, 0.5));
      seam.position.set(0, 0.31, z);
      group.add(seam);
    }
  }
  return group;
}

export function makeEnvironmentDecor(environmentIndex: number, tileIndex: number): THREE.Group {
  const theme = getEnvironment(environmentIndex);
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const x = side * 8.5;
    if (theme.id === "city") {
      group.add(makeBuilding(x, -3.7, tileIndex * 2 + (side > 0 ? 1 : 0)));
      group.add(makeBuilding(x, 4.5, tileIndex * 2 + (side > 0 ? 7 : 4)));
      group.add(makeStreetLight(side * 5.25, 1.5, side, 0xffdf78));
    } else if (theme.id === "country") {
      group.add(makeTree(side * 6.4, -3.4, 0x68a64d, 0x6f482b));
      group.add(tileIndex % 2 === 0 ? makeBarn(x, 3.1, side) : makeHayBales(x, 3.1));
    } else if (theme.id === "jungle") {
      group.add(makeTree(side * 6.2, -3.6, 0x197542, 0x594127, true));
      group.add(makeTree(side * 8.5, 3.7, 0x2a9852, 0x594127, true));
      if (tileIndex % 2 === 0) group.add(makeRuin(side * 5.8, 4.8));
    } else if (theme.id === "lab") {
      group.add(makeLabModule(x, -3.5, tileIndex));
      group.add(makeLabModule(x, 4.6, tileIndex + 3));
      group.add(makeStreetLight(side * 5.2, 1, side, 0x42f5ff));
    } else if (theme.id === "space") {
      group.add(makeAsteroid(side * 7, -3.8, tileIndex));
      group.add(makeAsteroid(side * 9, 4.2, tileIndex + 7));
      group.add(makeBeacon(side * 5.2, 1.5, 0x79bfff));
    } else if (theme.id === "egypt") {
      group.add(makePyramid(x, 0.4, 5 + (tileIndex % 3)));
      group.add(makeObelisk(side * 5.8, -4.2));
    } else {
      group.add(makeDimensionShape(side * 6.4, -3.2, tileIndex));
      group.add(makeDimensionShape(side * 8.4, 4.1, tileIndex + 5));
      group.add(makeBeacon(side * 5.2, 1.5, 0xff4fd8));
    }
  }
  return group;
}

function material(color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function makeBuilding(x: number, z: number, seed: number): THREE.Group {
  const group = new THREE.Group();
  const colors = [0xe8755d, 0x5c8fc4, 0xe2b65b, 0x6fa587, 0x9a78ad, 0xd9894c];
  const width = 4.6 + (seed % 3) * 0.65;
  const height = 6 + (seed % 5) * 1.65;
  const depth = 5.5;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(colors[seed % colors.length], 0.86));
  body.position.y = height / 2;
  body.castShadow = true;
  group.add(body);
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: seed % 2 === 0 ? 0x9fe1f2 : 0xffd77d,
    emissive: seed % 2 === 0 ? 0x163b4b : 0x4c3611,
    emissiveIntensity: 0.35,
  });
  for (let floor = 1.5; floor < height - 0.6; floor += 1.65) {
    for (const windowX of [-width * 0.25, width * 0.25]) {
      const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.82, 0.08), windowMaterial);
      windowMesh.position.set(windowX, floor, depth / 2 + 0.05);
      group.add(windowMesh);
    }
  }
  group.position.set(x, -0.2, z);
  return group;
}

function makeStreetLight(x: number, z: number, side: number, color: number): THREE.Group {
  const group = new THREE.Group();
  const dark = material(0x17201f, 0.4, 0.25);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 8), dark);
  pole.position.y = 2.1;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.1, 0.1), dark);
  arm.position.set(-side * 0.36, 4.1, 0);
  group.add(arm);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 }),
  );
  lamp.position.set(-side * 0.75, 3.98, 0);
  group.add(lamp);
  group.position.set(x, 0.4, z);
  return group;
}

function makeTree(x: number, z: number, leafColor: number, trunkColor: number, jungle = false): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.48, jungle ? 5.8 : 4.2, 8), material(trunkColor, 0.9));
  trunk.position.y = jungle ? 2.9 : 2.1;
  trunk.castShadow = true;
  group.add(trunk);
  for (let i = 0; i < (jungle ? 5 : 3); i += 1) {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(jungle ? 1.7 : 1.45, 10, 7), material(leafColor + i * 0x030300, 0.86));
    crown.position.set((i - 2) * 0.65, (jungle ? 5.6 : 4.1) + (i % 2) * 0.55, (i % 2) * 0.45);
    crown.scale.y = 0.75;
    crown.castShadow = true;
    group.add(crown);
  }
  group.position.set(x, 0, z);
  return group;
}

function makeBarn(x: number, z: number, side: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, 5), material(0xb74332, 0.9));
  body.position.y = 1.75;
  group.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 2.2, 4), material(0x563a32, 0.88));
  roof.position.y = 4.6;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.1), material(0xf0e1bc, 0.8));
  door.position.set(-side * 2.51, 1.2, 0);
  door.rotation.y = Math.PI / 2;
  group.add(door);
  group.position.set(x, 0, z);
  return group;
}

function makeHayBales(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 12), material(0xd9a936, 0.95));
    bale.rotation.z = Math.PI / 2;
    bale.position.set((i - 1) * 1.25, 0.9 + (i === 1 ? 1.1 : 0), 0);
    group.add(bale);
  }
  group.position.set(x, 0, z);
  return group;
}

function makeRuin(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  for (const offset of [-0.75, 0.75]) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.65, 3.8, 0.65), material(0x718064, 0.95));
    column.position.set(offset, 1.9, 0);
    group.add(column);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.75), material(0x718064, 0.95));
  lintel.position.y = 4;
  group.add(lintel);
  group.position.set(x, 0, z);
  return group;
}

function makeLabModule(x: number, z: number, seed: number): THREE.Group {
  const group = new THREE.Group();
  const height = 6 + (seed % 3) * 1.5;
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, height, 5), material(0x718b98, 0.45, 0.35));
  body.position.y = height / 2;
  body.castShadow = true;
  group.add(body);
  for (let y = 1.4; y < height; y += 1.8) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.55, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x3de7ec, emissive: 0x1c9ba4, emissiveIntensity: 0.8 }),
    );
    panel.position.set(0, y, 2.56);
    group.add(panel);
  }
  group.position.set(x, 0, z);
  return group;
}

function makeAsteroid(x: number, z: number, seed: number): THREE.Group {
  const group = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.6 + (seed % 3) * 0.4, 0),
    material(seed % 2 ? 0x625b73 : 0x736b5e, 0.94),
  );
  rock.position.y = 2 + (seed % 4);
  rock.rotation.set(seed, seed * 0.4, seed * 0.7);
  rock.castShadow = true;
  group.add(rock);
  group.position.set(x, 0, z);
  return group;
}

function makeBeacon(x: number, z: number, color: number): THREE.Group {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.09, 8, 20),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1 }),
  );
  ring.position.y = 2.4;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.4, 8), material(0x303541, 0.45, 0.5));
  pole.position.y = 1.2;
  group.add(pole);
  group.position.set(x, 0, z);
  return group;
}

function makePyramid(x: number, z: number, size: number): THREE.Group {
  const group = new THREE.Group();
  for (let layer = 0; layer < 4; layer += 1) {
    const width = size - layer * 1.05;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, width), material(0xd7ad68, 0.96));
    mesh.position.y = layer * 1.05 + 0.6;
    group.add(mesh);
  }
  group.position.set(x, -0.2, z);
  return group;
}

function makeObelisk(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.72, 5.8, 0.72), material(0xb77c3e, 0.9));
  shaft.position.y = 2.9;
  group.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.2, 4), material(0xe5bd67, 0.8));
  tip.position.y = 6.35;
  tip.rotation.y = Math.PI / 4;
  group.add(tip);
  group.position.set(x, 0, z);
  return group;
}

function makeDimensionShape(x: number, z: number, seed: number): THREE.Group {
  const group = new THREE.Group();
  const color = seed % 2 ? 0x36f5dd : 0xff4fd8;
  const geometry = seed % 3 === 0
    ? new THREE.TorusKnotGeometry(0.85, 0.22, 40, 6)
    : seed % 3 === 1
      ? new THREE.OctahedronGeometry(1.35)
      : new THREE.TorusGeometry(1.2, 0.2, 8, 20);
  const shape = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.85, wireframe: seed % 2 === 0 }),
  );
  shape.position.y = 2.4 + (seed % 4) * 0.7;
  shape.rotation.set(seed * 0.3, seed * 0.6, seed * 0.2);
  group.add(shape);
  group.position.set(x, 0, z);
  return group;
}
