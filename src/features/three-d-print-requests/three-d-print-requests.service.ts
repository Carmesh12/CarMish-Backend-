import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  RelatedEntityType,
  Role,
  ThreadContext,
  ThreeDPrintModelType,
  ThreeDPrintRequestStatus,
  Vehicle3DModelStatus,
  VehicleListingStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../common/supabase/supabase-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminMessagingService } from '../admin-messaging/admin-messaging.service';
import { CreateThreeDPrintRequestDto } from './dto/create-three-d-print-request.dto';
import { GetThreeDPrintRequestsQueryDto } from './dto/get-three-d-print-requests-query.dto';
import { UpdateThreeDPrintRequestStatusDto } from './dto/update-three-d-print-request-status.dto';

type JwtUser = { id: string; role: string };

@Injectable()
export class ThreeDPrintRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly storage: SupabaseStorageService,
    private readonly adminMessagingService: AdminMessagingService,
  ) {}

  async create(requester: JwtUser, dto: CreateThreeDPrintRequestDto) {
    if (requester.role !== Role.USER && requester.role !== Role.VENDOR) {
      throw new ForbiddenException(
        'Only users and vendors can request 3D printing',
      );
    }

    const hasVehicleModel = Boolean(dto.vehicle3DModelId);
    const hasPersonalModel = Boolean(dto.personalVehicle3DModelId);
    if (hasVehicleModel === hasPersonalModel) {
      throw new BadRequestException(
        'Provide exactly one model id: vehicle3DModelId or personalVehicle3DModelId',
      );
    }

    const modelContext = dto.vehicle3DModelId
      ? await this.resolveVehicleModel(requester, dto.vehicle3DModelId)
      : await this.resolvePersonalModel(
          requester,
          dto.personalVehicle3DModelId!,
        );

    const request = await this.prisma.threeDPrintRequest.create({
      data: {
        requesterAccountId: requester.id,
        vehicle3DModelId:
          modelContext.modelType === ThreeDPrintModelType.VEHICLE_LISTING
            ? modelContext.modelId
            : null,
        personalVehicle3DModelId:
          modelContext.modelType === ThreeDPrintModelType.PERSONAL
            ? modelContext.modelId
            : null,
        modelType: modelContext.modelType,
        modelUrlSnapshot: modelContext.modelUrl,
        title: dto.title?.trim() || modelContext.title,
        message: dto.message?.trim() || null,
      },
      include: this.requestInclude(),
    });

    await this.notifyAdminsAboutNewRequest(request.id, modelContext.title);
    return this.resolveRequestUrls(request);
  }

  async findMine(accountId: string, query: GetThreeDPrintRequestsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = {
      requesterAccountId: accountId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.threeDPrintRequest.findMany({
        where,
        include: this.requestInclude(),
        orderBy: { requestedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.threeDPrintRequest.count({ where }),
    ]);

    return {
      data: await Promise.all(
        data.map((request) => this.resolveRequestUrls(request)),
      ),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllForAdmin(query: GetThreeDPrintRequestsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = query.status ? { status: query.status } : {};

    const [data, total] = await Promise.all([
      this.prisma.threeDPrintRequest.findMany({
        where,
        include: this.requestInclude(),
        orderBy: { requestedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.threeDPrintRequest.count({ where }),
    ]);

    return {
      data: await Promise.all(
        data.map((request) => this.resolveRequestUrls(request)),
      ),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateStatus(
    adminAccountId: string,
    requestId: string,
    dto: UpdateThreeDPrintRequestStatusDto,
  ) {
    if (dto.status === ThreeDPrintRequestStatus.CANCELLED) {
      throw new BadRequestException('Admins cannot cancel print requests');
    }

    const existing = await this.prisma.threeDPrintRequest.findUnique({
      where: { id: requestId },
    });
    if (!existing) {
      throw new NotFoundException('3D print request not found');
    }

    const updated = await this.prisma.threeDPrintRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        adminResponse: dto.adminResponse?.trim() || null,
        reviewedByAdminAccountId: adminAccountId,
        reviewedAt: new Date(),
      },
      include: this.requestInclude(),
    });

    if (
      dto.status === ThreeDPrintRequestStatus.APPROVED ||
      dto.status === ThreeDPrintRequestStatus.REJECTED
    ) {
      const adminResponse = dto.adminResponse?.trim();
      await this.notificationsService.createNotification({
        accountId: updated.requesterAccountId,
        title:
          dto.status === ThreeDPrintRequestStatus.APPROVED
            ? '3D print request approved'
            : '3D print request rejected',
        body:
          dto.adminResponse?.trim() ||
          (dto.status === ThreeDPrintRequestStatus.APPROVED
            ? 'Admin approved your 3D printing request. Please check the request details for next steps.'
            : 'Admin rejected your 3D printing request.'),
        type:
          dto.status === ThreeDPrintRequestStatus.APPROVED
            ? NotificationType.THREE_D_PRINT_REQUEST_APPROVED
            : NotificationType.THREE_D_PRINT_REQUEST_REJECTED,
        relatedEntityType: RelatedEntityType.THREE_D_PRINT_REQUEST,
        relatedEntityId: updated.id,
      });

      if (adminResponse) {
        await this.sendAdminMessageForPrintRequest(
          adminAccountId,
          updated.requesterAccountId,
          updated.id,
          updated.title ?? '3D print request',
          dto.status,
          adminResponse,
        );
      }
    }

    return this.resolveRequestUrls(updated);
  }

  private async sendAdminMessageForPrintRequest(
    adminAccountId: string,
    requesterAccountId: string,
    requestId: string,
    title: string,
    status: ThreeDPrintRequestStatus,
    adminResponse: string,
  ) {
    const subject = `3D print request: ${title}`;
    const body = [
      `Status: ${status}`,
      '',
      adminResponse,
      '',
      'You can reply here to coordinate printing details.',
    ].join('\n');
    const existingThread = await this.prisma.adminVendorThread.findFirst({
      where: {
        adminAccountId,
        vendorAccountId: requesterAccountId,
        context: ThreadContext.THREE_D_PRINT_REQUEST,
        contextEntityId: requestId,
      },
      select: { id: true },
    });

    if (existingThread) {
      await this.adminMessagingService.replyToThread({
        threadId: existingThread.id,
        senderAccountId: adminAccountId,
        body,
      });
      return;
    }

    await this.adminMessagingService.createThread({
      adminAccountId,
      vendorAccountId: requesterAccountId,
      subject,
      body,
      context: ThreadContext.THREE_D_PRINT_REQUEST,
      contextEntityId: requestId,
    });
  }

  private async resolveRequestUrls<T extends { modelUrlSnapshot: string }>(
    request: T,
  ): Promise<T> {
    return {
      ...request,
      modelUrlSnapshot: await this.storage.resolveReadableModelUrl(
        request.modelUrlSnapshot,
      ),
    };
  }

  private async resolveVehicleModel(user: JwtUser, modelId: string) {
    const model = await this.prisma.vehicle3DModel.findUnique({
      where: { id: modelId },
      include: {
        vehicle: {
          select: {
            id: true,
            title: true,
            vendorId: true,
            listingStatus: true,
            vendor: { select: { accountId: true } },
          },
        },
      },
    });

    if (!model || model.status !== Vehicle3DModelStatus.AVAILABLE) {
      throw new NotFoundException('3D model is not available');
    }

    const isOwnerVendor =
      user.role === Role.VENDOR && model.vehicle.vendor.accountId === user.id;
    if (
      model.vehicle.listingStatus !== VehicleListingStatus.PUBLISHED &&
      !isOwnerVendor
    ) {
      throw new ForbiddenException(
        'This 3D model is not available for printing',
      );
    }

    return {
      modelId: model.id,
      modelType: ThreeDPrintModelType.VEHICLE_LISTING,
      modelUrl: model.modelUrl,
      title: model.vehicle.title,
    };
  }

  private async resolvePersonalModel(user: JwtUser, modelId: string) {
    if (user.role !== Role.USER) {
      throw new ForbiddenException(
        'Only the owner can request this personal model',
      );
    }

    const model = await this.prisma.personalVehicle3DModel.findUnique({
      where: { id: modelId },
      include: { user: { select: { accountId: true } } },
    });

    if (!model || model.status !== Vehicle3DModelStatus.AVAILABLE) {
      throw new NotFoundException('Personal 3D model is not available');
    }

    if (model.user.accountId !== user.id) {
      throw new ForbiddenException('You do not own this personal 3D model');
    }

    return {
      modelId: model.id,
      modelType: ThreeDPrintModelType.PERSONAL,
      modelUrl: model.modelUrl,
      title: model.title || 'Personal 3D model',
    };
  }

  private async notifyAdminsAboutNewRequest(requestId: string, title: string) {
    const admins = await this.prisma.account.findMany({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.createNotification({
          accountId: admin.id,
          title: 'New 3D print request',
          body: `A 3D print request was submitted for ${title}.`,
          type: NotificationType.THREE_D_PRINT_REQUEST_CREATED,
          relatedEntityType: RelatedEntityType.THREE_D_PRINT_REQUEST,
          relatedEntityId: requestId,
        }),
      ),
    );
  }

  private requestInclude() {
    return {
      requester: {
        select: {
          id: true,
          email: true,
          role: true,
          user: {
            select: { firstName: true, lastName: true, phoneNumber: true },
          },
          vendor: {
            select: {
              businessName: true,
              contactPersonName: true,
              phoneNumber: true,
            },
          },
        },
      },
      reviewedByAdmin: {
        select: {
          id: true,
          email: true,
          admin: { select: { firstName: true, lastName: true } },
        },
      },
      vehicleModel: {
        select: {
          id: true,
          modelUrl: true,
          vehicle: {
            select: { id: true, title: true, brand: true, model: true },
          },
        },
      },
      personalModel: {
        select: { id: true, modelUrl: true, title: true },
      },
    };
  }
}
