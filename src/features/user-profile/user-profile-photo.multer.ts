import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const USER_PROFILE_PHOTO_SUBDIR = 'user-profiles';

export function userProfilePhotoUploadDir(): string {
  const dir = join(process.cwd(), 'uploads', USER_PROFILE_PHOTO_SUBDIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export const userProfilePhotoMulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, userProfilePhotoUploadDir());
    },
    filename: (_req, file, cb) => {
      const ext = EXT_FOR_MIME[file.mimetype] ?? '.jpg';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(
        new BadRequestException(
          'Only JPEG, PNG, WebP, and GIF images are allowed',
        ),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

export function publicPathForUserProfilePhoto(filename: string): string {
  return `/uploads/${USER_PROFILE_PHOTO_SUBDIR}/${filename}`;
}
