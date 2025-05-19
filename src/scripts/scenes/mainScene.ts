import { ExtendedGroup, ExtendedMesh, Scene3D } from '@enable3d/phaser-extension'
import PhysicsBody from '@enable3d/common/dist/physicsBody';
import * as THREE from 'three'

const G = 9.81; // m/s^2
const WATER_DENSITY = 1000; // kg/m^3
const DEPTH = 5;
const waterBoxConfig = {
  x: 0,
  y: -DEPTH / 2,
  z: 0,
  width: 100,
  height: DEPTH,
  depth: 100,
  name: 'waterBox',
}

export default class MainScene extends Scene3D {
  water: ExtendedMesh;
  constructor() {
    super({ key: 'MainScene' })
  }

  init() {
    this.accessThirdDimension();
    this.third.physics.debug?.enable(); // enable Ammo.js physics debugging
    // set gravity for the physics world
    this.third.physics.setGravity(0, -G, 0); // gravity pointing downward
  }

  async create() {
    this.third.warpSpeed("-ground");
    this.addBottom();
    const water = await this.addWater();
    await this.addBoat(water);
  }

  private addBottom() {
    const ground = this.third.add.plane({
      width: 100,
      height: 100,
      y: -DEPTH,
      name: 'ground',
      // rotation: { x: -Math.PI / 2 }
    });
    ground.receiveShadow = true; // enable shadow receiving
    ground.rotateX(-Math.PI / 2); // rotate the plane to be horizontal
    this.third.physics.add.existing(ground, { mass: 0 });
  }

  private async addBoat(water: ExtendedMesh) {
    const gltf = await this.third.load.gltf('assets/models/beneteau361.glb');
    const group = new ExtendedGroup();
    group.name = 'boat';
    const sceneObjects: THREE.Object3D[] = [];
    const physicsObjects: any[] = [];
    // @ts-ignore
    gltf.scene.traverse((child) => {
      // @ts-ignore
      if (child.isMesh) {
        sceneObjects.push(child);
      }
    });
    const massMap = {
      "Hull": 2000,
      "Keel": 3000
    }
    sceneObjects.forEach((child) => {
      child.receiveShadow = child.castShadow = true;
      this.third.scene.add(child);
      // @ts-ignore
      this.third.physics.add.existing(child, {
        shape: 'convex',
        mass: massMap[child.name], // kg
      });
      physicsObjects.push(child);
    });

    for (let i = 1; i < physicsObjects.length; i++) {
      this.third.physics.add.constraints.fixed(
        physicsObjects[0].body,
        physicsObjects[i].body,
        true
      );
    }

    physicsObjects.forEach((pb: ExtendedMesh) => {
      pb.body.on.collision((other: any, event) => {
        // console.log(pb.name, 'collided with ', other.name, event);
        // print the size of the bounding box of this object
        // const size = box.getSize(new THREE.Vector3());
        // console.log('size of ', pb.name, size);

        if (other.name === 'waterBox') {
          const box = new THREE.Box3().setFromObject(pb);
          const waterBox = new THREE.Box3().setFromObject(other);
          const fullySubmerged = waterBox.containsBox(box);
          pb.body.setDamping(0.7, 0.7); // set linear and angular damping

          const buoyancyForce = this.buoyantForce(pb, water, fullySubmerged).multiplyScalar(1 / 100);
          // console.log('buoyancyForce for ', pb.name, buoyancyForce);
          pb.body.applyForce(buoyancyForce.x, buoyancyForce.y, buoyancyForce.z);
        }
      })
    })
  }

  private async addWater() {
    const textures = await Promise.all([
      this.third.load.texture('/assets/water/Water_1_M_Normal.jpg'),
      this.third.load.texture('/assets/water/Water_2_M_Normal.jpg')
    ]);
    textures[0].needsUpdate = true;
    textures[1].needsUpdate = true;
    // Fake waves
    this.third.misc.water({
      y: 0, // lowered water level by 10 meters
      normalMap0: textures[0],
      normalMap1: textures[1],
      flowX: 1,
      // scale: 1,
      width: 100,
      height: 100,
    });

    // Why add an invisible box?
    // To use it later on for CSG volume calculation
    const waterBox = this.third.add.box(waterBoxConfig);
    this.third.physics.add.existing(waterBox, { mass: 0, collisionFlags: 4 });
    waterBox.visible = false;
    return waterBox
  }

  extractTriangles(mesh: ExtendedMesh) {
    let geometry = mesh.geometry;
    geometry.computeVertexNormals(); // ensure normals exist
    // geometry = geometry.toNonIndexed(); // flat triangle list

    const posAttr = geometry.attributes.position;
    const triangles: any[] = [];

    for (let i = 0; i < posAttr.count; i += 3) {
      const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i);
      const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i + 1);
      const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i + 2);

      // Transform to world space
      mesh.updateMatrixWorld();
      v0.applyMatrix4(mesh.matrixWorld);
      v1.applyMatrix4(mesh.matrixWorld);
      v2.applyMatrix4(mesh.matrixWorld);

      triangles.push({ v0, v1, v2 });
    }
    return triangles;
  }

  computeBuoyantForce(mesh: ExtendedMesh): THREE.Vector3 {
    const tris = this.extractTriangles(mesh);
    const result = new THREE.Vector3();
    let i = 0;
    for (const { v0, v1, v2 } of tris) {
      // Compute triangle center and depth
      const center = new THREE.Vector3().addVectors(v0, v1).add(v2).multiplyScalar(1 / 3);
      const depth = -center.y;
      if (depth <= 0) continue;  // above water

      // Compute normal and area
      const edge1 = new THREE.Vector3().subVectors(v1, v0);
      const edge2 = new THREE.Vector3().subVectors(v2, v0);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
      const area = new THREE.Vector3().crossVectors(edge1, edge2).length() * 0.5;

      // Basic pressure approximation: linearly increase with depth
      const pressure = WATER_DENSITY * G * depth;
      const forceMag = pressure * area * -1;

      const force = new THREE.Vector3(
        normal.x * forceMag,
        normal.y * forceMag,
        normal.z * forceMag
      );
      result.add(force);

  // i++;
  // if (i % 10 === 0) {
  //   const arrow = this.third.scene.add(new THREE.ArrowHelper(normal, center, 1, 0x0000ff));
  //   setTimeout(() => {
  //     this.third.scene.remove(arrow);
  //   }, 50);
  // }

  // const relPos = new Ammo.btVector3(
  //   center.x - mesh.position.x,
  //   center.y - mesh.position.y,
  //   center.z - mesh.position.z
  // );

      // mesh.body.applyForce(force.x, force.y, force.z);
    }
    console.log('buoyant force: ', result);
    return result;
  }



  private buoyantForce(mesh: ExtendedMesh, water: ExtendedMesh, partiallySubmerged: boolean = true): THREE.Vector3 {
    const clippedGeometry = partiallySubmerged ?
      this.third.csg.intersect(water, mesh).geometry
      : this.third.csg.intersect(water, mesh).geometry;
    // Add the clipped geometry to the scene temporarily for visualization
    const neonMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const clippedMesh = new ExtendedMesh(clippedGeometry, neonMaterial);

    // mesh.geometry.computeVertexNormals();
    clippedMesh.geometry.computeVertexNormals();
    // const helper = new THREE.VertexNormalsHelper(mesh, 1, 0xff0000); // 1 is the length of the normal lines
    // this.third.scene.add(helper);

    // clippedMesh.scale.set(1, 1, 1);//
    clippedMesh.position.copy(water.position);
    // clippedMesh.position.copy(mesh.position);
    clippedMesh.name = 'clippedMesh';

    this.third.scene.add(clippedMesh);
    setTimeout(() => {
      this.third.scene.remove(clippedMesh);
    }, 50);

    return this.computeBuoyantForce(clippedMesh);

    // Integrate over the faces of the clipped geometry
    // const buoyancyForce = new THREE.Vector3();
    // const position = clippedGeometry.attributes.position;
    // const index = clippedGeometry.index;

    // if (index) {
    //   for (let i = 0; i < index.count; i += 3) {
    //     const vA = new THREE.Vector3().fromBufferAttribute(position, i);
    //     const vB = new THREE.Vector3().fromBufferAttribute(position, i + 1);
    //     const vC = new THREE.Vector3().fromBufferAttribute(position, i + 2);

    //     // Compute the centroid of the triangle
    //     const centroid = new THREE.Vector3().addVectors(vA, vB).add(vC).divideScalar(3);

    //     // Compute the area of the triangle
    //     const edge1 = new THREE.Vector3().subVectors(vB, vA);
    //     const edge2 = new THREE.Vector3().subVectors(vC, vA);
    //     const triangleArea = edge1.cross(edge2).length() / 2;

    //     // compute the triangle normal
    //     const triangleNormal = edge1.cross(edge2).normalize();

    //     if (i % 10 === 0) {
    //       const arrow = this.third.scene.add(new THREE.ArrowHelper(triangleNormal, centroid, 1, 0x0000ff));
    //       setTimeout(() => {
    //         this.third.scene.remove(arrow);
    //       }, 500);
    //     }

    //     // Compute the buoyancy force for the triangle
    //     const depth = Math.max(0, -centroid.y); // Only consider submerged parts
    //     // console.log('depth: ', depth);
    //     const forceMagnitude = -WATER_DENSITY * depth * triangleArea * G;
    //     const force = triangleNormal.clone().multiplyScalar(forceMagnitude);
    //     // console.log('buoyancy force: ', force);
    //     buoyancyForce.add(force);
    //   }
    // }

    // return buoyancyForce;
  }

  private logSceneHierarchy(object: THREE.Object3D, depth: number = 0): void {
    const prefix = ' '.repeat(depth * 2);
    console.log(`${prefix}${object.name || 'Unnamed Object'} (${object.type})`);
    object.children.forEach(child => this.logSceneHierarchy(child, depth + 1));
  }

  update(time: any, delta: number) {
    this.third.physics.update(delta);
    this.third.physics.updateDebugger();

    // Render the scene hierarchy in camera space
    // console.log('Scene Hierarchy:');
    // this.logSceneHierarchy(this.third.scene);
    const water = this.third.scene.getObjectByName('waterBox') as ExtendedMesh;

    // Apply buoyancy force and damping to physics objects
    this.third.scene.traverse((object: any) => {
      if (object.body instanceof PhysicsBody && water) {
        // check if the object body intersects with the water
        const body: PhysicsBody = object.body;
        object.body.setDamping(0.1, 0.1); // set linear and angular damping
      }
    });
  }

}
