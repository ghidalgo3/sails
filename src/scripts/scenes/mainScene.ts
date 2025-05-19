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
  name: 'water',
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
    await this.addWater();
    await this.addBoat();
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

  private async addBoat() {
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
      "Hull": 10000,
      "Keel": 40000
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
    waterBox.visible = false;
  }

  private submergedVolume(mesh: ExtendedMesh, water: ExtendedMesh): number {
    // const water = this.third.make.box(waterBoxConfig);
    const clippedGeometry = this.third.csg.intersect(
      mesh,
      water
    );
    clippedGeometry.geometry.computeBoundingBox();
    const boundingBox = clippedGeometry.geometry.boundingBox;

    if (!boundingBox) return 0;

    const size = new THREE.Vector3();
    boundingBox.getSize(size);

    const volume = size.x * size.y * size.z;
    return volume;
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
    const water = this.third.scene.getObjectByName('water') as ExtendedMesh;

    // Apply buoyancy force and damping to physics objects
    this.third.scene.traverse((object: any) => {
      if (object.body instanceof PhysicsBody && water) {
        const body: PhysicsBody = object.body;
        const displacementVolume = this.submergedVolume(object, water);
        console.log('displacementVolume for ', object.name, displacementVolume);
        const buoyancyForce = displacementVolume * WATER_DENSITY; // proportional to Y position
        object.body.applyForceY(buoyancyForce);


        // Apply damping force proportional to velocity
        const dampingFactor = -100; // adjust damping factor as needed
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
