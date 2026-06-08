import { Injectable, Logger } from '@nestjs/common';
import {
  extractErrorMessage,
  urlHostForLog,
} from '../../common/errors/error-message.util';
import { TripoHttpService } from './tripo-http.service';
import { TripoStsUploadService } from './tripo-sts-upload.service';
import { SupabaseStorageService } from '../../common/supabase/supabase-storage.service';
import { GlbPivotNormalizerService } from './glb-pivot-normalizer.service';

export type MultiviewSlot = { buffer: Buffer; mimetype: string };

type TripoOutputField = string | { url?: string } | null | undefined;
type TripoFileObject = {
  type: string;
  object: { bucket: string; key: string };
};

type TripoTaskState = {
  task_id?: string;
  status?: string;
  type?: string;
  progress?: number;
  running_left_time?: number;
  queuing_num?: number;
  create_time?: number;
  output?: {
    model?: TripoOutputField;
    base_model?: TripoOutputField;
    pbr_model?: TripoOutputField;
  };
  error_code?: number;
  error_msg?: string;
  consumed_credit?: number;
};

const GLB_MAGIC = 0x46546c67; // "glTF" little-endian

@Injectable()
export class TripoMultiviewPipelineService {
  private readonly logger = new Logger(TripoMultiviewPipelineService.name);

  constructor(
    private readonly tripoHttp: TripoHttpService,
    private readonly stsUpload: TripoStsUploadService,
    private readonly storage: SupabaseStorageService,
    private readonly pivotNormalizer: GlbPivotNormalizerService,
  ) {}

  private modelVersion(): string {
    return process.env.TRIPO_MULTIVIEW_MODEL_VERSION?.trim() || 'v3.1-20260211';
  }

  private textureModelVersion(): string {
    return process.env.TRIPO_TEXTURE_MODEL_VERSION?.trim() || 'v3.0-20250812';
  }

  private textureQuality(): string {
    return process.env.TRIPO_TEXTURE_QUALITY?.trim() || 'standard';
  }

  private textureAlignment(): string {
    return process.env.TRIPO_TEXTURE_ALIGNMENT?.trim() || 'geometry';
  }

  private fileTypeForMime(mimetype: string): string {
    const m = mimetype.toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('webp')) return 'webp';
    return 'jpeg';
  }

  private coerceOutputUrl(value: TripoOutputField): string | null {
    if (typeof value === 'string' && value.startsWith('http')) return value;
    if (value && typeof value === 'object' && typeof value.url === 'string') {
      return value.url.startsWith('http') ? value.url : null;
    }
    return null;
  }

  private pickModelUrl(
    output: TripoTaskState['output'],
  ): { url: string; field: string } | null {
    if (!output) return null;
    const candidates: [string, TripoOutputField][] = [
      ['pbr_model', output.pbr_model],
      ['model', output.model],
      ['base_model', output.base_model],
    ];
    for (const [field, value] of candidates) {
      const url = this.coerceOutputUrl(value);
      if (url) return { url, field };
    }
    return null;
  }

  private assertValidGlb(buffer: Buffer): void {
    if (buffer.length < 12) {
      throw new Error(
        `Downloaded file is too small to be a GLB (${buffer.length} bytes)`,
      );
    }
    const magic = buffer.readUInt32LE(0);
    if (magic !== GLB_MAGIC) {
      throw new Error(
        'Downloaded file is not a valid GLB (missing glTF magic header)',
      );
    }
  }

  private async downloadTripoModel(
    tripoUrl: string,
    logLabel: string,
  ): Promise<Buffer> {
    const host = urlHostForLog(tripoUrl);
    this.logger.log(`[${logLabel}] Downloading Tripo model from host=${host}`);

    const needsAuth = host.includes('tripo3d');
    const authHeaders = needsAuth
      ? { Authorization: `Bearer ${this.tripoHttp.apiKey}` }
      : undefined;

    let res = await fetch(tripoUrl, { headers: authHeaders });
    if (!res.ok && !needsAuth) {
      res = await fetch(tripoUrl, {
        headers: { Authorization: `Bearer ${this.tripoHttp.apiKey}` },
      });
    }
    if (!res.ok) {
      throw new Error(
        `Failed to download Tripo model (HTTP ${res.status} ${res.statusText})`,
      );
    }

    const contentType = res.headers.get('content-type') ?? 'unknown';
    const glbBuffer = Buffer.from(await res.arrayBuffer());
    this.logger.log(
      `[${logLabel}] Tripo download OK content-type=${contentType} bytes=${glbBuffer.length}`,
    );
    this.assertValidGlb(glbBuffer);
    return glbBuffer;
  }

  private extractTaskId(created: Record<string, unknown>): string {
    const taskId =
      (typeof created.task_id === 'string' && created.task_id) ||
      (typeof created.taskId === 'string' && created.taskId) ||
      null;

    if (!taskId) {
      throw new Error('Tripo did not return task_id');
    }

    return taskId;
  }

  private async createSegmentedModelTask(
    files: TripoFileObject[],
  ): Promise<string> {
    const created = await this.tripoHttp.postJson<Record<string, unknown>>(
      '/task',
      {
        type: 'multiview_to_model',
        files,
        model_version: this.modelVersion(),
        generate_parts: true,
        texture: false,
        pbr: false,
        quad: false,
      },
    );

    return this.extractTaskId(created);
  }

  private async createTextureTask(
    originalModelTaskId: string,
    files: TripoFileObject[],
  ): Promise<string> {
    const created = await this.tripoHttp.postJson<Record<string, unknown>>(
      '/task',
      {
        type: 'texture_model',
        original_model_task_id: originalModelTaskId,
        model_version: this.textureModelVersion(),
        texture_prompt: {
          images: files,
        },
        texture: true,
        pbr: true,
        texture_quality: this.textureQuality(),
        texture_alignment: this.textureAlignment(),
        bake: true,
      },
    );

    return this.extractTaskId(created);
  }

  /**
   * Uploads four views (front, left, back, right), runs Tripo segmented
   * multiview generation, then textures the segmented task and stores the final GLB.
   */
  async runToStoredGlbUrl(
    slots: MultiviewSlot[],
    logLabel: string,
    hooks?: { onTripoTaskSubmitted?: (taskId: string) => Promise<void> },
  ): Promise<string> {
    if (slots.length !== 4) {
      throw new Error('multiview_to_model requires exactly 4 image slots');
    }

    const files: TripoFileObject[] = [];
    for (let i = 0; i < 4; i++) {
      const slot = slots[i];
      const obj = await this.stsUpload.uploadImageBuffer(
        slot.buffer,
        slot.mimetype,
      );
      files.push({
        type: this.fileTypeForMime(slot.mimetype),
        object: { bucket: obj.bucket, key: obj.key },
      });
    }

    const segmentedTaskId = await this.createSegmentedModelTask(files);
    this.logger.log(
      `[${logLabel}] Tripo segmented task submitted task=${segmentedTaskId}`,
    );

    if (hooks?.onTripoTaskSubmitted) {
      await hooks.onTripoTaskSubmitted(segmentedTaskId);
    }

    await this.pollUntilTerminal(segmentedTaskId, `${logLabel} segmented`);

    const textureTaskId = await this.createTextureTask(segmentedTaskId, files);
    this.logger.log(
      `[${logLabel}] Tripo texture task submitted task=${textureTaskId}`,
    );

    if (hooks?.onTripoTaskSubmitted) {
      await hooks.onTripoTaskSubmitted(textureTaskId);
    }

    const picked = await this.pollUntilTerminal(
      textureTaskId,
      `${logLabel} texture`,
    );
    this.logger.log(
      `[${logLabel}] Tripo output field=${picked.field} host=${urlHostForLog(picked.url)}`,
    );

    const glbBuffer = await this.downloadTripoModel(picked.url, logLabel);
    const normalizedGlbBuffer =
      await this.pivotNormalizer.normalizeBottomCenterPivot(
        glbBuffer,
        logLabel,
      );

    this.logger.log(
      `[${logLabel}] Uploading bottom-center GLB to Supabase (${normalizedGlbBuffer.length} bytes)`,
    );
    try {
      const publicUrl = await this.storage.uploadGlbBuffer(normalizedGlbBuffer, {
        context: logLabel,
      });
      this.logger.log(
        `[${logLabel}] Pipeline complete storage host=${urlHostForLog(publicUrl)}`,
      );
      return publicUrl;
    } catch (err: unknown) {
      throw new Error(`Supabase upload failed: ${extractErrorMessage(err)}`);
    }
  }

  private async pollUntilTerminal(
    taskId: string,
    logLabel: string,
  ): Promise<{ url: string; field: string }> {
    const deadline = Date.now() + 45 * 60 * 1000;
    let attempt = 0;

    while (Date.now() < deadline) {
      attempt += 1;
      let data: TripoTaskState;
      try {
        data = await this.tripoHttp.getJson<TripoTaskState>(`/task/${taskId}`);
      } catch (e) {
        const status =
          typeof e === 'object' && e && 'status' in e
            ? (e as { status: number }).status
            : 0;
        if (status === 429) {
          const backoff =
            Math.min(60_000, 2000 * 2 ** Math.min(attempt, 8)) +
            Math.floor(Math.random() * 500);
          this.logger.warn(`[${logLabel}] Tripo 429 backing off ${backoff}ms`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw e;
      }

      const status = (data.status ?? '').toLowerCase();
      const progress = data.progress;
      const rlt = data.running_left_time;
      const credit =
        data.consumed_credit !== undefined
          ? data.consumed_credit
          : (data as { consumption?: number }).consumption;

      this.logger.log(
        `[${logLabel}] Tripo task=${taskId} status=${status} progress=${progress ?? 'n/a'} running_left_time=${rlt ?? 'n/a'} consumed_credit=${credit ?? 'n/a'}`,
      );

      if (status === 'success') {
        const picked = this.pickModelUrl(data.output);
        if (!picked) {
          this.logger.error(
            `[${logLabel}] Tripo success but output keys=${JSON.stringify(
              data.output ? Object.keys(data.output) : [],
            )}`,
          );
          throw new Error('Tripo task succeeded but no model URL in output');
        }
        return picked;
      }

      if (
        status === 'failed' ||
        status === 'cancelled' ||
        status === 'expired' ||
        status === 'banned'
      ) {
        const msg = data.error_msg || `Tripo task ended with status=${status}`;
        throw new Error(msg);
      }

      const sleepMs = 2000 + Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, sleepMs));
    }

    throw new Error('Tripo task polling timed out');
  }
}
