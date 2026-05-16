import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { TripoHttpService } from './tripo-http.service';

export type TripoS3Object = { bucket: string; key: string };

type StsTokenResponse = {
  s3_host: string;
  resource_bucket: string;
  resource_uri: string;
  session_token: string;
  sts_ak: string;
  sts_sk: string;
};

const MIME_TO_STS: Record<string, 'jpeg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class TripoStsUploadService {
  constructor(private readonly tripoHttp: TripoHttpService) {}

  stsFormatForMime(mimetype: string): 'jpeg' | 'png' | 'webp' {
    const fmt = MIME_TO_STS[mimetype.toLowerCase()];
    if (!fmt) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are allowed for Tripo');
    }
    return fmt;
  }

  async uploadImageBuffer(buffer: Buffer, mimetype: string): Promise<TripoS3Object> {
    const format = this.stsFormatForMime(mimetype);
    const data = await this.tripoHttp.postJson<StsTokenResponse>('/upload/sts/token', {
      format,
    });

    const client = new S3Client({
      region: 'us-west-2',
      endpoint: `https://${data.s3_host}`,
      credentials: {
        accessKeyId: data.sts_ak,
        secretAccessKey: data.sts_sk,
        sessionToken: data.session_token,
      },
      forcePathStyle: true,
    });

    await client.send(
      new PutObjectCommand({
        Bucket: data.resource_bucket,
        Key: data.resource_uri,
        Body: buffer,
        ContentType: mimetype,
      }),
    );

    return { bucket: data.resource_bucket, key: data.resource_uri };
  }
}
