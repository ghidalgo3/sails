import { ExtendedGroup, ExtendedMesh, ExtendedObject3D, Scene3D } from '@enable3d/phaser-extension'
// import { PhysicsBody } from '@enable3d/common'
import { features } from 'process';
import * as THREE from 'three'
// import { AmmoPhysics, PhysicsLoader } from 'enable3d'
// import { OrbitControls } from 'orbit-controls'
// import { GLTFLoader } from 'gltf-loader'


export default class MainScene extends Scene3D {
  constructor() {
    super({ key: 'MainScene' })
  }

  init() {
    this.accessThirdDimension();
    this.third.physics.debug?.enable(); // enable Ammo.js physics debugging

    // set gravity for the physics world
    this.third.physics.setGravity(0, -9.8, 0); // gravity pointing downward
  }

  async create() {
    // creates a nice scene
    this.third.warpSpeed()
    await this.createWater();
    await this.addBoat();
  }

  private async addBoat() {
    const gltf = await this.third.load.gltf('assets/models/beneteau361.glb');
    const group = new ExtendedGroup();
    const sceneObjects: THREE.Object3D[] = [];
    const physicsObjects: any[] = [];
  // const first_child = gltf.scene.children;

    // @ts-ignore
    gltf.scene.traverse((child) => {
      // @ts-ignore
      if (child.isMesh) {
        sceneObjects.push(child);
      }
    });
    sceneObjects.forEach((child) => {
      child.castShadow = true; // enable shadow casting
      child.receiveShadow = true; // enable shadow receiving
      group.attach(child);
      // const physicsObject = this.third.scene.add(child);
      // @ts-ignore
      // this.third.physics.add.existing(child, {
      //   shape: 'convex', // approximate the mesh with a convex shape
      //   // compound: true, // use compound shape for complex meshes
      //   // TODO read from a property
      //   mass: 5000 / gltf.scene.children.length,
      // });
      // physicsObjects.push(physicsObject);
    });
    group.position.set(0, 2, 0);
    this.third.scene.add(group);
    // this.third.physics.add.existing(group);
    // Create constraints between the physics objects
    // for (let i = 1; i < physicsObjects.length; i++) {
    //   this.third.physics.add.constraints.lock(
    //     physicsObjects[0],
    //     physicsObjects[i]
    //   );
    // }
  }

  private async createWater() {
    const textures = await Promise.all([
      this.third.load.texture('/assets/water/Water_1_M_Normal.jpg'),
      this.third.load.texture('/assets/water/Water_2_M_Normal.jpg')
    ]);
    textures[0].needsUpdate = true;
    textures[1].needsUpdate = true;
    this.third.misc.water({
      y: 1,
      normalMap0: textures[0],
      normalMap1: textures[1]
    });
  }

  update(time: any, delta: number) {
    this.third.physics.update(delta);
    this.third.physics.updateDebugger();
    // this.physics.u
    // apply buoyancy forces to objects in the scene
    // const waterLevel = 0; // define the water level
    // this.third.physics.setGravity(0, -9.8, 0); // set gravity for the physics world
  }
}
