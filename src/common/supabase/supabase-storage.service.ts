import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  extractAwsS3ErrorMessage,
  supabaseConfigLooksLikePlaceholder,
  urlHostForLog,
} from '../errors/error-message.util';

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly ready: boolean;
  private readonly notReadyReason: string | null;
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly folder: string;
  private readonly publicBaseUrl: string;
  private readonly supabaseUrl: string;
  private readonly usePublicBucket: boolean;
  private readonly signedUrlTtlSeconds: number;

  constructor() {
    const endpoint = process.env.SUPABASE_S3_ENDPOINT?.trim();
    const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY?.trim();
    const supabaseUrl = process.env.SUPABASE_URL?.trim()?.replace(/\/$/, '');
    this.supabaseUrl = supabaseUrl ?? '';
    this.bucket = process.env.SUPABASE_3D_BUCKET?.trim() || 'vehicle-3d';
    this.folder = process.env.SUPABASE_3D_FOLDER?.trim() || 'models';
    const region = process.env.SUPABASE_STORAGE_REGION?.trim() || 'us-east-1';
    this.usePublicBucket =
      process.env.SUPABASE_3D_PUBLIC_BUCKET?.trim().toLowerCase() === 'true';
    const ttlRaw = Number.parseInt(process.env.SUPABASE_3D_SIGNED_URL_TTL_SECONDS?.trim() ?? '', 10);
    this.signedUrlTtlSeconds =
      Number.isFinite(ttlRaw) && ttlRaw > 60 ? ttlRaw : 60 * 60 * 24 * 7;

    const hasCredentials = Boolean(
      endpoint && accessKeyId && secretAccessKey && supabaseUrl && this.bucket,
    );
    const placeholder = supabaseConfigLooksLikePlaceholder(supabaseUrl, endpoint);
    if (placeholder) {
      this.notReadyReason =
        'Supabase URLs still use YOUR_PROJECT_REF. In backend/.env set SUPABASE_URL and SUPABASE_S3_ENDPOINT to your real project (Dashboard → Project Settings → API / Storage → S3), then restart the backend.';
      this.logger.error(`Supabase 3D storage is misconfigured: ${this.notReadyReason}`);
    } else if (!hasCredentials) {
      this.notReadyReason =
        'Supabase 3D storage env vars are missing (SUPABASE_URL, SUPABASE_S3_ENDPOINT, keys, bucket).';
      this.logger.error(`Supabase 3D storage is misconfigured: ${this.notReadyReason}`);
    } else {
      this.notReadyReason = null;
    }
    this.ready = hasCredentials && !placeholder;

    if (this.ready && endpoint && accessKeyId && secretAccessKey && supabaseUrl) {
      this.publicBaseUrl = `${supabaseUrl}/storage/v1/object/public/${this.bucket}`;
      this.client = new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      this.publicBaseUrl = '';
      this.client = null;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  getNotReadyReason(): string | null {
    return this.notReadyReason;
  }

  /** Upload GLB to Supabase Storage (S3-compatible API). Returns public HTTPS URL. */
  async uploadGlbBuffer(
    buffer: Buffer,
    opts: { context?: string } = {},
  ): Promise<string> {
    if (!this.ready || !this.client) {
      throw new InternalServerErrorException(
        'Supabase storage is not configured for 3D uploads',
      );
    }

    const suffix =
      (opts.context ?? 'model').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) ||
      'model';
    const objectKey = `${this.folder}/glb_${Date.now()}_${suffix}.glb`;

    this.logger.log(
      `Supabase GLB upload start bucket=${this.bucket} key=${objectKey} bytes=${buffer.length}`,
    );

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: 'model/gltf-binary',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch (err: unknown) {
      const msg = extractAwsS3ErrorMessage(err);
      this.logger.error(`Supabase GLB upload failed: ${msg}`);
      throw new Error(msg);
    }

    const canonicalUrl = this.buildCanonicalPublicUrl(objectKey);
    this.logger.log(
      `Supabase GLB upload OK host=${urlHostForLog(canonicalUrl)} bytes=${buffer.length} access=${this.usePublicBucket ? 'public' : 'signed'}`,
    );
    return canonicalUrl;
  }

  /** Canonical URL stored in DB (public path shape). */
  buildCanonicalPublicUrl(objectKey: string): string {
    return `${this.publicBaseUrl}/${objectKey}`;
  }

  extractObjectKey(storedUrl: string): string | null {
    try {
      const u = new URL(storedUrl);
      const prefixes = [
        `/storage/v1/object/public/${this.bucket}/`,
        `/storage/v1/object/sign/${this.bucket}/`,
        `/storage/v1/object/authenticated/${this.bucket}/`,
      ];
      for (const prefix of prefixes) {
        if (u.pathname.startsWith(prefix)) {
          return decodeURIComponent(u.pathname.slice(prefix.length));
        }
      }
      const s3Prefix = `/storage/v1/s3/${this.bucket}/`;
      if (u.pathname.startsWith(s3Prefix)) {
        return decodeURIComponent(u.pathname.slice(s3Prefix.length));
      }
    } catch {
      return null;
    }
    return null;
  }

  /** URL the browser can fetch (signed when bucket is private). */
  async resolveReadableModelUrl(storedUrl: string): Promise<string> {
    if (this.usePublicBucket) {
      return storedUrl;
    }
    const objectKey = this.extractObjectKey(storedUrl);
    if (!objectKey || !this.client) {
      return storedUrl;
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
      { expiresIn: this.signedUrlTtlSeconds },
    );
  }
}
