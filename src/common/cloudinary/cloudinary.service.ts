import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly ready: boolean;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    this.ready = Boolean(cloudName && apiKey && apiSecret);
    if (this.ready) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async uploadImageBuffer(buffer: Buffer): Promise<string> {
    if (!this.ready) {
      throw new InternalServerErrorException(
        'Image upload is not configured',
      );
    }

    const folder =
      process.env.CLOUDINARY_PROFILE_FOLDER ?? 'carmesh/user-profiles';

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (err, result: UploadApiResponse | undefined) => {
          if (err) {
            reject(err);
            return;
          }
          if (!result?.secure_url) {
            reject(new Error('Cloudinary returned no secure_url'));
            return;
          }
          resolve(result.secure_url);
        },
      );
      Readable.from(buffer).pipe(stream);
    });
  }
}
