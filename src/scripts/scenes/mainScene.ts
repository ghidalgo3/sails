import { ExtendedGroup, ExtendedMesh, ExtendedObject3D, Scene3D } from '@enable3d/phaser-extension'
import PhysicsBody from '@enable3d/common/dist/physicsBody';
// import { PhysicsBody } from '@enabled3d'
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
    this.third.physics.setGravity(0, -9.81, 0); // gravity pointing downward
  }

  async create() {
    // creates a nice scene
    this.third.warpSpeed("-ground");

    // Add a ground plane at Y = -10
    this.addBottom(); // make it a static physics collider

    await this.createWater();
    await this.addBoat();
  }

  private addBottom() {
    const ground = this.third.add.plane({
      width: 100,
      height: 100,
      y: -10,
      // rotation: { x: -Math.PI / 2 }
    });
    ground.receiveShadow = true; // enable shadow receiving
    ground.rotateX(-Math.PI / 2); // rotate the plane to be horizontal
    this.third.physics.add.existing(ground, { mass: 0 });
  }

  private async addBoat(): Promise<ExtendedGroup> {
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
      physicsObjects.push(group.add(child)) // difference between add and attach?
      // const physicsObject = this.third.physics.add.existing(child);
      // @ts-ignore
      // this.third.physics.add.existing(child, {
      //   shape: 'convex', // approximate the mesh with a convex shape
      //   // compound: true, // use compound shape for complex meshes
      //   // TODO read from a property
      //   mass: 5000 / gltf.scene.children.length,
      // });
      // physicsObjects.push(child);
    });

    physicsObjects.forEach((child) => {
      this.third.physics.add.existing(child, {
        shape: 'convex', // approximate the mesh with a convex shape
        // compound: true, // use compound shape for complex meshes
        // TODO read from a property
        mass: 5000, // kg
      });
    });

    for (let i = 1; i < physicsObjects.length; i++) {
      this.third.physics.add.constraints.fixed(
        physicsObjects[0].body,
        physicsObjects[i].body,
        true
      );
    }
    group.position.set(0, 2, 0);
    this.third.scene.add(group);
    // this.third.scene.children[0]
    // group.children[0]
    // this.third.physics.add.existing(group);
    // Create constraints between the physics objects

    return group;
  }

  private async createWater() {
    const textures = await Promise.all([
      this.third.load.texture('/assets/water/Water_1_M_Normal.jpg'),
      this.third.load.texture('/assets/water/Water_2_M_Normal.jpg')
    ]);
    textures[0].needsUpdate = true;
    textures[1].needsUpdate = true;
    this.third.misc.water({
      y: 0, // lowered water level by 10 meters
      normalMap0: textures[0],
      normalMap1: textures[1],
      flowX: 1,
      // scale: 1,
      width: 100,
      height: 100,
    });
  }

  update(time: any, delta: number) {
    this.third.physics.update(delta);
    this.third.physics.updateDebugger();

    // Apply buoyancy force and damping to physics objects
    this.third.scene.children.forEach((object: any) => {
      if (object.body instanceof PhysicsBody && object.position.y < 0) {
        const body: PhysicsBody = object.body;
        const buoyancyForce = -object.position.y * 1000; // proportional to Y position
        object.body.applyForceY(buoyancyForce);

        // Apply damping force proportional to velocity
        const dampingFactor = -10; // adjust damping factor as needed
        const v = body.velocity;
        body.applyForce(v.x * dampingFactor, v.y * dampingFactor, v.z * dampingFactor);
      }
    })
  }

}
