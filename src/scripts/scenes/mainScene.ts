import { ExtendedGroup, ExtendedMesh, Scene3D } from '@enable3d/phaser-extension'
import PhysicsBody from '@enable3d/common/dist/physicsBody';
import * as THREE from 'three'

const WATER_DENSITY = 1000; // kg/m^3
const DEPTH = 4;
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
    this.third.physics.setGravity(0, -9.81, 0); // gravity pointing downward
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
      "Hull": 500,
      "Keel": 500
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
        if (other.name === 'waterBox') {
          const buoyancyForce = this.buoyantForce(pb, water).multiplyScalar(1);
          console.log('buoyancyForce for ', pb.name, buoyancyForce);
          // // const buoyancyForce = displacementVolume * WATER_DENSITY; // proportional to Y position
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

  private buoyantForce(mesh: ExtendedMesh, water: ExtendedMesh): THREE.Vector3 {
    const clippedGeometry = this.third.csg.intersect(water, mesh).geometry;

    if (!clippedGeometry) {
      console.warn('No clipped geometry found');
      return new THREE.Vector3(0, 0, 0);
    }

    // Add the clipped geometry to the scene temporarily for visualization
    const neonMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const clippedMesh = new THREE.Mesh(clippedGeometry, neonMaterial);
    // clippedMesh.scale.set(1, 1, 1);//
    clippedMesh.position.copy(water.position);
    // clippedMesh.position.copy(mesh.position);
    clippedMesh.name = 'clippedMesh';
    this.third.scene.add(clippedMesh);
    setTimeout(() => {
      this.third.scene.remove(clippedMesh);
    }, 500);

    // Integrate over the faces of the clipped geometry
    const buoyancyForce = new THREE.Vector3();
    const position = clippedGeometry.attributes.position;
    const index = clippedGeometry.index;

    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const vA = new THREE.Vector3().fromBufferAttribute(position, index.getX(i));
        const vB = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + 1));
        const vC = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + 2));

        // Compute the centroid of the triangle
        const centroid = new THREE.Vector3().addVectors(vA, vB).add(vC).divideScalar(3);

        // Compute the area of the triangle
        const edge1 = new THREE.Vector3().subVectors(vB, vA);
        const edge2 = new THREE.Vector3().subVectors(vC, vA);
        const triangleArea = edge1.cross(edge2).length() / 2;

        // compute the triangle normal
        const triangleNormal = edge1.cross(edge2).normalize();

        // Compute the buoyancy force for the triangle
        const depth = Math.max(0, -centroid.y); // Only consider submerged parts
        const forceMagnitude = WATER_DENSITY * depth * triangleArea;
        const force = triangleNormal.clone().multiplyScalar(forceMagnitude);

        buoyancyForce.add(force);
      }
    }

    return buoyancyForce;
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


        // Apply a torque damping force
        const torqueDampingFactor = -100; // adjust damping factor as needed
        const dampingTorque = new THREE.Vector3(
          -body.angularVelocity.x * torqueDampingFactor,
          -body.angularVelocity.y * torqueDampingFactor,
          -body.angularVelocity.z * torqueDampingFactor
        );
        body.applyTorque(dampingTorque.x, dampingTorque.y, dampingTorque.z);
        // body.applyTorque

        // Apply damping force proportional to velocity
        const dampingFactor = -1000; // adjust damping factor as needed
        const v = body.velocity;
        const dampingForce = new THREE.Vector3(
          v.x * dampingFactor,
          v.y * dampingFactor,
          v.z * dampingFactor
        );
        body.applyForce(dampingForce.x, dampingForce.y, dampingForce.z);
      }
    });
  }

}
