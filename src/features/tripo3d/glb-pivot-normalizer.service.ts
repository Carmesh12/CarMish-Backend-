import { Injectable, Logger } from '@nestjs/common';

type SceneBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

type SceneNode = {
  getTranslation(): [number, number, number];
  setTranslation(translation: [number, number, number]): unknown;
};

type SceneLike = {
  listChildren(): SceneNode[];
};

type GetBounds = (scene: SceneLike) => SceneBounds;

@Injectable()
export class GlbPivotNormalizerService {
  private readonly logger = new Logger(GlbPivotNormalizerService.name);

  async normalizeBottomCenterPivot(buffer: Buffer, logLabel: string) {
    const [
      { NodeIO },
      { ALL_EXTENSIONS },
      { getBounds },
      draco3d,
      { MeshoptDecoder, MeshoptEncoder },
    ] = await Promise.all([
      import('@gltf-transform/core'),
      import('@gltf-transform/extensions'),
      import('@gltf-transform/functions'),
      import('draco3dgltf'),
      import('meshoptimizer'),
    ]);
    const [dracoDecoder, dracoEncoder] = await Promise.all([
      draco3d.default.createDecoderModule(),
      draco3d.default.createEncoderModule(),
      MeshoptDecoder.ready,
      MeshoptEncoder.ready,
    ]);

    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        'draco3d.decoder': dracoDecoder,
        'draco3d.encoder': dracoEncoder,
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
      });

    const document = await io.readBinary(new Uint8Array(buffer));
    const scenes = document.getRoot().listScenes();

    if (scenes.length === 0) {
      throw new Error('GLB has no scenes to normalize');
    }

    scenes.forEach((scene) => this.normalizeScene(scene, getBounds));

    const normalized = Buffer.from(await io.writeBinary(document));
    this.logger.log(
      `[${logLabel}] Normalized GLB bottom-center pivot bytes=${normalized.length}`,
    );

    return normalized;
  }

  private normalizeScene(scene: SceneLike, getBounds: GetBounds) {
    const bounds = getBounds(scene);
    const min = bounds.min;
    const max = bounds.max;

    if (
      !min.every(Number.isFinite) ||
      !max.every(Number.isFinite) ||
      max.some((value, index) => value <= min[index])
    ) {
      throw new Error('GLB scene bounds are invalid');
    }

    const centerX = (min[0] + max[0]) / 2;
    const centerZ = (min[2] + max[2]) / 2;
    const offset: [number, number, number] = [-centerX, -min[1], -centerZ];

    scene.listChildren().forEach((node) => {
      const translation = node.getTranslation();
      node.setTranslation([
        translation[0] + offset[0],
        translation[1] + offset[1],
        translation[2] + offset[2],
      ]);
    });
  }
}
