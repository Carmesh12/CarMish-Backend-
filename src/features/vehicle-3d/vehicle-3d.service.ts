import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Vehicle3DJobStatus,
  Vehicle3DModelStatus,
  VehicleListingStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TripoHttpService } from '../tripo3d/tripo-http.service';
import { TripoMultiviewPipelineService } from '../tripo3d/tripo-multiview-pipeline.service';
import type { MultiviewSlot } from '../tripo3d/tripo-multiview-pipeline.service';
import { SupabaseStorageService } from '../../common/supabase/supabase-storage.service';
import {
  extractErrorDetails,
  extractErrorMessage,
  urlHostForLog,
} from '../../common/errors/error-message.util';
import { isThreeDMockMode } from './three-d-config';

export type JobUploadFiles = {
  front?: Express.Multer.File[];
  left?: Express.Multer.File[];
  back?: Express.Multer.File[];
  right?: Express.Multer.File[];
  model?: Express.Multer.File[];
};

@Injectable()
export class Vehicle3dService {
  private readonly logger = new Logger(Vehicle3dService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripoHttp: TripoHttpService,
    private readonly pipeline: TripoMultiviewPipelineService,
    private readonly storage: SupabaseStorageService,
  ) {}

  private async findVendorByAccount(accountId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { accountId },
    });
    if (!vendor) {
      throw new NotFoundException('Vendor profile not found');
    }
    return vendor;
  }

  private async findUserByAccount(accountId: string) {
    const user = await this.prisma.user.findUnique({
      where: { accountId },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }

  private hasMultiviewImages(files: JobUploadFiles): boolean {
    return Boolean(
      files.front?.length ||
        files.left?.length ||
        files.back?.length ||
        files.right?.length,
    );
  }

  private extractFour(files: JobUploadFiles): MultiviewSlot[] {
    const front = files.front?.[0];
    const left = files.left?.[0];
    const back = files.back?.[0];
    const right = files.right?.[0];
    if (!front || !left || !back || !right) {
      throw new BadRequestException('Missing one or more views: front, left, back, right');
    }
    return [
      { buffer: front.buffer, mimetype: front.mimetype },
      { buffer: left.buffer, mimetype: left.mimetype },
      { buffer: back.buffer, mimetype: back.mimetype },
      { buffer: right.buffer, mimetype: right.mimetype },
    ];
  }

  private assertStorageReady() {
    if (!this.storage.isReady()) {
      throw new ServiceUnavailableException(
        this.storage.getNotReadyReason() ??
          '3D storage is not configured (Supabase). Check backend/.env and restart the server.',
      );
    }
  }

  private assertTripoReady() {
    if (!this.tripoHttp.isConfigured()) {
      throw new ServiceUnavailableException('3D generation is not configured (Tripo)');
    }
  }

  private async resolveModelUrl(stored: string | null | undefined): Promise<string | null> {
    if (!stored) return null;
    return this.storage.resolveReadableModelUrl(stored);
  }

  async createVendorListingJob(
    accountId: string,
    vehicleId: string,
    files: JobUploadFiles,
  ) {
    this.assertStorageReady();
    const vendor = await this.findVendorByAccount(accountId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: vendor.id },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (isThreeDMockMode()) {
      if (this.hasMultiviewImages(files)) {
        throw new BadRequestException(
          'In mock mode upload a single GLB via the "model" field, not multiview images',
        );
      }
      const modelFile = files.model?.[0];
      if (!modelFile) {
        throw new BadRequestException('Upload a GLB file in the "model" field (mock mode)');
      }

      const job = await this.prisma.vehicle3DJob.create({
        data: {
          vehicleId,
          providerName: 'mock',
          status: Vehicle3DJobStatus.PENDING,
        },
      });

      setImmediate(() => {
        void this.runVendorMockPipeline(job.id, vehicleId, modelFile).catch(
          (err: unknown) => {
            const details = extractErrorDetails(err);
            this.logger.error(
              `Vendor mock 3D pipeline failed job=${job.id}: ${details.message}`,
              details.stack,
            );
          },
        );
      });

      return { jobId: job.id };
    }

    if (files.model?.length) {
      throw new BadRequestException(
        'Direct model upload is only allowed when THREE_D_MOCK_MODE is enabled on the server',
      );
    }

    this.assertTripoReady();
    const slots = this.extractFour(files);

    const job = await this.prisma.vehicle3DJob.create({
      data: {
        vehicleId,
        providerName: 'tripo',
        status: Vehicle3DJobStatus.PENDING,
      },
    });

    setImmediate(() => {
      void this.runVendorListingPipeline(job.id, vehicleId, slots).catch((err: unknown) => {
        const details = extractErrorDetails(err);
        this.logger.error(
          `Vendor 3D pipeline failed job=${job.id}: ${details.message}`,
          details.stack,
        );
      });
    });

    return { jobId: job.id };
  }

  private async runVendorMockPipeline(
    jobId: string,
    vehicleId: string,
    modelFile: Express.Multer.File,
  ) {
    this.logger.log(`[MOCK] Vendor 3D pipeline start job=${jobId} vehicle=${vehicleId}`);
    try {
      await this.prisma.vehicle3DJob.update({
        where: { id: jobId },
        data: { status: Vehicle3DJobStatus.PROCESSING },
      });

      this.logger.log(`[MOCK] Uploading GLB job=${jobId} bytes=${modelFile.buffer.length}`);
      const modelUrl = await this.storage.uploadGlbBuffer(modelFile.buffer, {
        context: `vendor-vehicle=${vehicleId} job=${jobId}`,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.vehicle3DModel.create({
          data: {
            vehicleId,
            jobId,
            modelUrl,
            fileFormat: 'glb',
            status: Vehicle3DModelStatus.AVAILABLE,
          },
        });
        await tx.vehicle3DJob.update({
          where: { id: jobId },
          data: {
            status: Vehicle3DJobStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      });
      this.logger.log(
        `[MOCK] Vendor 3D pipeline COMPLETED job=${jobId} storageHost=${urlHostForLog(modelUrl)}`,
      );
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      const details = extractErrorDetails(err);
      this.logger.error(
        `[MOCK] Vendor 3D pipeline FAILED job=${jobId}: ${msg}`,
        details.stack,
      );
      await this.prisma.vehicle3DJob.update({
        where: { id: jobId },
        data: {
          status: Vehicle3DJobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: msg,
        },
      });
    }
  }

  private async runVendorListingPipeline(
    jobId: string,
    vehicleId: string,
    slots: MultiviewSlot[],
  ) {
    this.logger.log(`Vendor 3D pipeline start job=${jobId} vehicle=${vehicleId}`);
    try {
      await this.prisma.vehicle3DJob.update({
        where: { id: jobId },
        data: { status: Vehicle3DJobStatus.PROCESSING },
      });

      const modelUrl = await this.pipeline.runToStoredGlbUrl(
        slots,
        `vendor-vehicle=${vehicleId} job=${jobId}`,
        {
          onTripoTaskSubmitted: async (taskId) => {
            await this.prisma.vehicle3DJob.update({
              where: { id: jobId },
              data: { externalJobId: taskId },
            });
          },
        },
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.vehicle3DModel.create({
          data: {
            vehicleId,
            jobId,
            modelUrl,
            fileFormat: 'glb',
            status: Vehicle3DModelStatus.AVAILABLE,
          },
        });
        await tx.vehicle3DJob.update({
          where: { id: jobId },
          data: {
            status: Vehicle3DJobStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      });
      this.logger.log(
        `Vendor 3D pipeline COMPLETED job=${jobId} storageHost=${urlHostForLog(modelUrl)}`,
      );
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      const details = extractErrorDetails(err);
      this.logger.error(
        `Vendor 3D pipeline FAILED job=${jobId}: ${msg}`,
        details.stack,
      );
      await this.prisma.vehicle3DJob.update({
        where: { id: jobId },
        data: {
          status: Vehicle3DJobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: msg,
        },
      });
    }
  }

  async getVendorListingJob(accountId: string, vehicleId: string, jobId: string) {
    const vendor = await this.findVendorByAccount(accountId);
    const job = await this.prisma.vehicle3DJob.findFirst({
      where: { id: jobId, vehicleId, vehicle: { vendorId: vendor.id } },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    const model =
      job.status === Vehicle3DJobStatus.COMPLETED
        ? await this.prisma.vehicle3DModel.findFirst({
            where: { jobId: job.id, status: Vehicle3DModelStatus.AVAILABLE },
            orderBy: { generatedAt: 'desc' },
          })
        : null;

    return {
      id: job.id,
      status: job.status,
      errorMessage: job.status === Vehicle3DJobStatus.FAILED ? job.errorMessage : null,
      modelUrl: await this.resolveModelUrl(model?.modelUrl),
    };
  }

  async createPersonalJob(accountId: string, files: JobUploadFiles, title?: string) {
    this.assertStorageReady();
    const user = await this.findUserByAccount(accountId);

    if (isThreeDMockMode()) {
      if (this.hasMultiviewImages(files)) {
        throw new BadRequestException(
          'In mock mode upload a single GLB via the "model" field, not multiview images',
        );
      }
      const modelFile = files.model?.[0];
      if (!modelFile) {
        throw new BadRequestException('Upload a GLB file in the "model" field (mock mode)');
      }

      const job = await this.prisma.personalVehicle3DJob.create({
        data: {
          userId: user.id,
          providerName: 'mock',
          status: Vehicle3DJobStatus.PENDING,
        },
      });

      setImmediate(() => {
        void this.runPersonalMockPipeline(job.id, user.id, modelFile, title).catch(
          (err: unknown) => {
            const details = extractErrorDetails(err);
            this.logger.error(
              `Personal mock 3D pipeline failed job=${job.id}: ${details.message}`,
              details.stack,
            );
          },
        );
      });

      return { jobId: job.id };
    }

    if (files.model?.length) {
      throw new BadRequestException(
        'Direct model upload is only allowed when THREE_D_MOCK_MODE is enabled on the server',
      );
    }

    this.assertTripoReady();
    const slots = this.extractFour(files);

    const job = await this.prisma.personalVehicle3DJob.create({
      data: {
        userId: user.id,
        providerName: 'tripo',
        status: Vehicle3DJobStatus.PENDING,
      },
    });

    setImmediate(() => {
      void this.runPersonalPipeline(job.id, user.id, slots, title).catch((err: unknown) => {
        const details = extractErrorDetails(err);
        this.logger.error(
          `Personal 3D pipeline failed job=${job.id}: ${details.message}`,
          details.stack,
        );
      });
    });

    return { jobId: job.id };
  }

  private async runPersonalMockPipeline(
    jobId: string,
    userId: string,
    modelFile: Express.Multer.File,
    title?: string,
  ) {
    this.logger.log(`[MOCK] Personal 3D pipeline start job=${jobId} user=${userId}`);
    try {
      await this.prisma.personalVehicle3DJob.update({
        where: { id: jobId },
        data: { status: Vehicle3DJobStatus.PROCESSING },
      });

      this.logger.log(`[MOCK] Uploading GLB job=${jobId} bytes=${modelFile.buffer.length}`);
      const modelUrl = await this.storage.uploadGlbBuffer(modelFile.buffer, {
        context: `personal-user=${userId} job=${jobId}`,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.personalVehicle3DModel.create({
          data: {
            userId,
            jobId,
            modelUrl,
            fileFormat: 'glb',
            title: title?.trim() ? title.trim().slice(0, 200) : null,
            status: Vehicle3DModelStatus.AVAILABLE,
          },
        });
        await tx.personalVehicle3DJob.update({
          where: { id: jobId },
          data: {
            status: Vehicle3DJobStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      });
      this.logger.log(
        `[MOCK] Personal 3D pipeline COMPLETED job=${jobId} storageHost=${urlHostForLog(modelUrl)}`,
      );
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      const details = extractErrorDetails(err);
      this.logger.error(
        `[MOCK] Personal 3D pipeline FAILED job=${jobId}: ${msg}`,
        details.stack,
      );
      await this.prisma.personalVehicle3DJob.update({
        where: { id: jobId },
        data: {
          status: Vehicle3DJobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: msg,
        },
      });
    }
  }

  private async runPersonalPipeline(
    jobId: string,
    userId: string,
    slots: MultiviewSlot[],
    title?: string,
  ) {
    this.logger.log(`Personal 3D pipeline start job=${jobId} user=${userId}`);
    try {
      await this.prisma.personalVehicle3DJob.update({
        where: { id: jobId },
        data: { status: Vehicle3DJobStatus.PROCESSING },
      });

      const modelUrl = await this.pipeline.runToStoredGlbUrl(
        slots,
        `personal-user=${userId} job=${jobId}`,
        {
          onTripoTaskSubmitted: async (taskId) => {
            await this.prisma.personalVehicle3DJob.update({
              where: { id: jobId },
              data: { externalJobId: taskId },
            });
          },
        },
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.personalVehicle3DModel.create({
          data: {
            userId,
            jobId,
            modelUrl,
            fileFormat: 'glb',
            title: title?.trim() ? title.trim().slice(0, 200) : null,
            status: Vehicle3DModelStatus.AVAILABLE,
          },
        });
        await tx.personalVehicle3DJob.update({
          where: { id: jobId },
          data: {
            status: Vehicle3DJobStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      });
      this.logger.log(
        `Personal 3D pipeline COMPLETED job=${jobId} storageHost=${urlHostForLog(modelUrl)}`,
      );
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      const details = extractErrorDetails(err);
      this.logger.error(
        `Personal 3D pipeline FAILED job=${jobId}: ${msg}`,
        details.stack,
      );
      await this.prisma.personalVehicle3DJob.update({
        where: { id: jobId },
        data: {
          status: Vehicle3DJobStatus.FAILED,
          completedAt: new Date(),
          errorMessage: msg,
        },
      });
    }
  }

  async getPersonalJob(accountId: string, jobId: string) {
    const user = await this.findUserByAccount(accountId);
    const job = await this.prisma.personalVehicle3DJob.findFirst({
      where: { id: jobId, userId: user.id },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    const model =
      job.status === Vehicle3DJobStatus.COMPLETED
        ? await this.prisma.personalVehicle3DModel.findFirst({
            where: { jobId: job.id, status: Vehicle3DModelStatus.AVAILABLE },
            orderBy: { generatedAt: 'desc' },
          })
        : null;

    return {
      id: job.id,
      status: job.status,
      errorMessage: job.status === Vehicle3DJobStatus.FAILED ? job.errorMessage : null,
      modelUrl: await this.resolveModelUrl(model?.modelUrl),
    };
  }

  async listPersonalModels(accountId: string) {
    const user = await this.findUserByAccount(accountId);
    const rows = await this.prisma.personalVehicle3DModel.findMany({
      where: { userId: user.id, status: Vehicle3DModelStatus.AVAILABLE },
      orderBy: { generatedAt: 'desc' },
      select: {
        id: true,
        modelUrl: true,
        title: true,
        generatedAt: true,
        fileFormat: true,
      },
    });
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        modelUrl: (await this.resolveModelUrl(row.modelUrl)) ?? row.modelUrl,
      })),
    );
  }

  async getListingThreeDSummary(
    vehicleId: string,
  ): Promise<{ has3DModel: boolean; threeDModelUrl: string | null }> {
    const model = await this.prisma.vehicle3DModel.findFirst({
      where: { vehicleId, status: Vehicle3DModelStatus.AVAILABLE },
      orderBy: { generatedAt: 'desc' },
    });
    return {
      has3DModel: Boolean(model),
      threeDModelUrl: await this.resolveModelUrl(model?.modelUrl),
    };
  }

  async getPublishedVehicleModelUrl(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    if (vehicle.listingStatus !== VehicleListingStatus.PUBLISHED) {
      throw new ForbiddenException('Vehicle is not published');
    }
    const model = await this.prisma.vehicle3DModel.findFirst({
      where: { vehicleId, status: Vehicle3DModelStatus.AVAILABLE },
      orderBy: { generatedAt: 'desc' },
    });
    if (!model) {
      throw new NotFoundException('No 3D model available for this listing');
    }
    return { modelUrl: (await this.resolveModelUrl(model.modelUrl)) ?? model.modelUrl };
  }
}
