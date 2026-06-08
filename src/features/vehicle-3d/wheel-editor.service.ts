import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, Vehicle3DModelStatus } from '@prisma/client';
import { existsSync, readdirSync, statSync } from 'fs';
import { basename, extname, relative, resolve } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../common/supabase/supabase-storage.service';

type MutationUser = { id: string; role: string };

type WheelModel = {
  id: string;
  name: string;
  path: string;
};

const wheelsDirectory = resolve(process.cwd(), 'assets', 'wheels');

function isWheelModelFile(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  return extension === '.glb' || extension === '.gltf';
}

function createWheelId(modelPath: string) {
  return Buffer.from(relative(wheelsDirectory, modelPath)).toString(
    'base64url',
  );
}

function collectWheelModels(directory: string): WheelModel[] {
  if (!existsSync(directory)) {
    return [];
  }

  const models: WheelModel[] = [];

  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      models.push(...collectWheelModels(path));
      continue;
    }

    if (isWheelModelFile(entry)) {
      models.push({
        id: createWheelId(path),
        name: basename(entry, extname(entry)),
        path,
      });
    }
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}

@Injectable()
export class WheelEditorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
  ) {}

  listWheelModels(origin: string) {
    return collectWheelModels(wheelsDirectory).map((model) => ({
      id: model.id,
      name: model.name,
      url: `${origin}/3d-wheel-editor/wheels/${model.id}`,
    }));
  }

  getWheelModelPath(id: string) {
    const wheelModel = collectWheelModels(wheelsDirectory).find(
      (model) => model.id === id,
    );

    if (!wheelModel) {
      throw new NotFoundException('Wheel model was not found');
    }

    return wheelModel.path;
  }

  private getWheelModelOrThrow(id: string) {
    const wheelModel = collectWheelModels(wheelsDirectory).find(
      (model) => model.id === id,
    );

    if (!wheelModel) {
      throw new NotFoundException('Selected wheel model was not found');
    }

    return wheelModel;
  }

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

  private async assertVehicleOwner(user: MutationUser, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (user.role !== Role.VENDOR) {
      throw new ForbiddenException('Only vendors can edit listing 3D models');
    }

    const vendor = await this.findVendorByAccount(user.id);

    if (vehicle.vendorId !== vendor.id) {
      throw new ForbiddenException('You do not own this vehicle');
    }

    return vehicle;
  }

  async getVendorWheelEdit(user: MutationUser, vehicleId: string) {
    await this.assertVehicleOwner(user, vehicleId);

    const model = await this.prisma.vehicle3DModel.findFirst({
      where: { vehicleId, status: Vehicle3DModelStatus.AVAILABLE },
      orderBy: { generatedAt: 'desc' },
      include: { wheelEdit: true },
    });

    if (!model) {
      throw new NotFoundException('No 3D model available for this vehicle');
    }

    return {
      modelType: 'VEHICLE_LISTING' as const,
      modelId: model.id,
      modelUrl: await this.storage.resolveReadableModelUrl(model.modelUrl),
      wheelEdit: model.wheelEdit
        ? {
            selectedWheelId: model.wheelEdit.selectedWheelId,
            selectedWheelName: model.wheelEdit.selectedWheelName,
            updatedAt: model.wheelEdit.updatedAt,
          }
        : null,
    };
  }

  async saveVendorWheelEdit(
    user: MutationUser,
    vehicleId: string,
    selectedWheelId: string,
  ) {
    const current = await this.getVendorWheelEdit(user, vehicleId);
    const wheel = this.getWheelModelOrThrow(selectedWheelId);

    const saved = await this.prisma.vehicle3DWheelEdit.upsert({
      where: { vehicle3DModelId: current.modelId },
      update: {
        selectedWheelId: wheel.id,
        selectedWheelName: wheel.name,
      },
      create: {
        vehicle3DModelId: current.modelId,
        selectedWheelId: wheel.id,
        selectedWheelName: wheel.name,
      },
    });

    return {
      ...current,
      wheelEdit: {
        selectedWheelId: saved.selectedWheelId,
        selectedWheelName: saved.selectedWheelName,
        updatedAt: saved.updatedAt,
      },
    };
  }

  async getPersonalWheelEdit(accountId: string, modelId: string) {
    const user = await this.findUserByAccount(accountId);
    const model = await this.prisma.personalVehicle3DModel.findFirst({
      where: {
        id: modelId,
        userId: user.id,
        status: Vehicle3DModelStatus.AVAILABLE,
      },
      include: { wheelEdit: true },
    });

    if (!model) {
      throw new NotFoundException('Personal 3D model was not found');
    }

    return {
      modelType: 'PERSONAL' as const,
      modelId: model.id,
      title: model.title,
      modelUrl: await this.storage.resolveReadableModelUrl(model.modelUrl),
      wheelEdit: model.wheelEdit
        ? {
            selectedWheelId: model.wheelEdit.selectedWheelId,
            selectedWheelName: model.wheelEdit.selectedWheelName,
            updatedAt: model.wheelEdit.updatedAt,
          }
        : null,
    };
  }

  async savePersonalWheelEdit(
    accountId: string,
    modelId: string,
    selectedWheelId: string,
  ) {
    const current = await this.getPersonalWheelEdit(accountId, modelId);
    const wheel = this.getWheelModelOrThrow(selectedWheelId);

    const saved = await this.prisma.personalVehicle3DWheelEdit.upsert({
      where: { personalVehicle3DModelId: current.modelId },
      update: {
        selectedWheelId: wheel.id,
        selectedWheelName: wheel.name,
      },
      create: {
        personalVehicle3DModelId: current.modelId,
        selectedWheelId: wheel.id,
        selectedWheelName: wheel.name,
      },
    });

    return {
      ...current,
      wheelEdit: {
        selectedWheelId: saved.selectedWheelId,
        selectedWheelName: saved.selectedWheelName,
        updatedAt: saved.updatedAt,
      },
    };
  }
}
