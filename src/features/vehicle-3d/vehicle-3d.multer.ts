import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import { isThreeDMockMode, threeDMockMaxModelBytes } from './three-d-config';

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MODEL_MIME = new Set(['model/gltf-binary', 'application/octet-stream']);

function isGlbFilename(name: string): boolean {
  return name.toLowerCase().endsWith('.glb');
}

const imageMaxBytes = 20 * 1024 * 1024;
const combinedMaxBytes = Math.max(imageMaxBytes, threeDMockMaxModelBytes());

export const vehicle3dJobMulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: combinedMaxBytes,
    files: 5,
  },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (file.fieldname === 'model') {
      if (!isThreeDMockMode()) {
        cb(new BadRequestException('Direct model upload is only allowed in mock mode'), false);
        return;
      }
      const mimeOk = MODEL_MIME.has(file.mimetype) || file.mimetype === '';
      if (!mimeOk && !isGlbFilename(file.originalname)) {
        cb(
          new BadRequestException('Mock mode accepts GLB files only (.glb)'),
          false,
        );
        return;
      }
      if (!isGlbFilename(file.originalname)) {
        cb(new BadRequestException('Mock mode requires a .glb file extension'), false);
        return;
      }
      cb(null, true);
      return;
    }

    if (['front', 'left', 'back', 'right'].includes(file.fieldname)) {
      if (isThreeDMockMode()) {
        cb(
          new BadRequestException(
            'In mock mode upload a single GLB via the "model" field, not multiview images',
          ),
          false,
        );
        return;
      }
      if (!IMAGE_MIME.has(file.mimetype)) {
        cb(
          new BadRequestException(
            'Only JPEG, PNG, and WebP images are allowed (max 20MB each)',
          ),
          false,
        );
        return;
      }
      cb(null, true);
      return;
    }

    cb(new BadRequestException(`Unexpected upload field: ${file.fieldname}`), false);
  },
};

/** @deprecated use vehicle3dJobMulterOptions */
export const vehicle3dMulterOptions = vehicle3dJobMulterOptions;
