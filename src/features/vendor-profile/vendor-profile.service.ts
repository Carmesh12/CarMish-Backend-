import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as bcrypt from 'bcrypt';
import {
  RequestStatus,
  Role,
  VehicleAvailabilityStatus,
  VehicleListingStatus,
  VendorVerificationStatus,
} from '@prisma/client';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChangeVendorPasswordDto } from './dto/change-vendor-password.dto';
import { VendorDashboardRange } from './dto/get-vendor-dashboard-query.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';
import { VendorAnalyticsChatDto } from './dto/vendor-analytics-chat.dto';

const BCRYPT_SALT_ROUNDS = 10;

type VendorAiInsight = {
  type: 'success' | 'warning' | 'info';
  title: string;
  message: string;
  action?: string;
  source: 'ai' | 'fallback';
};

type AccountVendorRow = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  vendor: {
    id: string;
    accountId: string;
    businessName: string;
    contactPersonName: string;
    phoneNumber: string | null;
    businessAddress: string | null;
    logoUrl: string | null;
    verificationStatus: VendorVerificationStatus;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

@Injectable()
export class VendorProfileService {
  private readonly logger = new Logger(VendorProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async getProfile(accountId: string) {
    const account = await this.loadVendorAccount(accountId);
    return this.toProfileResponse(account);
  }

  async getPublicProfile(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        vendor: {
          select: {
            id: true,
            businessName: true,
            contactPersonName: true,
            phoneNumber: true,
            businessAddress: true,
            logoUrl: true,
            verificationStatus: true,
            createdAt: true,
            vehicles: {
              where: { listingStatus: VehicleListingStatus.PUBLISHED },
              orderBy: { createdAt: 'desc' },
              include: {
                images: {
                  orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (
      !account ||
      account.role !== Role.VENDOR ||
      !account.isActive ||
      !account.vendor
    ) {
      throw new NotFoundException('Vendor profile not found');
    }

    const { vendor } = account;
    return {
      accountId: account.id,
      email: account.email,
      businessName: vendor.businessName,
      contactPersonName: vendor.contactPersonName,
      phoneNumber: vendor.phoneNumber,
      businessAddress: vendor.businessAddress,
      logoUrl: vendor.logoUrl,
      verificationStatus: vendor.verificationStatus,
      memberSince: account.createdAt,
      profileCreatedAt: vendor.createdAt,
      vehicles: vendor.vehicles,
    };
  }

  async updateProfile(accountId: string, dto: UpdateVendorProfileDto) {
    const account = await this.loadVendorAccount(accountId);
    const vendorId = account.vendor!.id;

    const data: {
      businessName?: string;
      contactPersonName?: string;
      phoneNumber?: string | null;
      businessAddress?: string | null;
      logoUrl?: string | null;
    } = {};

    if (dto.businessName !== undefined) {
      data.businessName = dto.businessName.trim();
    }
    if (dto.contactPersonName !== undefined) {
      data.contactPersonName = dto.contactPersonName.trim();
    }
    if (dto.phoneNumber !== undefined) {
      const t = dto.phoneNumber.trim();
      data.phoneNumber = t === '' ? null : t;
    }
    if (dto.businessAddress !== undefined) {
      const t = dto.businessAddress.trim();
      data.businessAddress = t === '' ? null : t;
    }
    if (dto.logoUrl !== undefined) {
      const t = dto.logoUrl.trim();
      data.logoUrl = t === '' ? null : t;
    }

    if (Object.keys(data).length === 0) {
      return this.toProfileResponse(account);
    }

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data,
    });

    const updated = await this.loadVendorAccount(accountId);
    return this.toProfileResponse(updated);
  }

  async changePassword(accountId: string, dto: ChangeVendorPasswordDto) {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException(
        'New password and confirmation do not match',
      );
    }

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, passwordHash: true, role: true },
    });

    if (!account || account.role !== Role.VENDOR) {
      throw new NotFoundException('Vendor profile not found');
    }

    const currentOk = await bcrypt.compare(
      dto.currentPassword,
      account.passwordHash,
    );
    if (!currentOk) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.prisma.account.update({
      where: { id: accountId },
      data: { passwordHash },
    });

    return { message: 'Password updated successfully' };
  }

  async updateLogo(
    accountId: string,
    file: Express.Multer.File,
  ): Promise<{ message: string; logoUrl: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Logo image file is required');
    }

    const account = await this.loadVendorAccount(accountId);
    const vendorId = account.vendor!.id;

    let logoUrl: string;
    try {
      logoUrl = await this.cloudinaryService.uploadImageBuffer(
        file.buffer,
        process.env.CLOUDINARY_VENDOR_LOGO_FOLDER ?? 'carmesh/vendor-logos',
      );
    } catch {
      throw new InternalServerErrorException('Could not upload logo image');
    }

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: { logoUrl },
    });

    return {
      message: 'Vendor logo uploaded successfully',
      logoUrl,
    };
  }

  async getDashboard(accountId: string, range: VendorDashboardRange = 'month') {
    const account = await this.loadVendorAccount(accountId);
    const v = account.vendor!;
    const completion = this.computeProfileCompletion(account, v);
    const analytics = await this.buildDashboardAnalytics(v.id, range);

    return {
      range,
      greeting: {
        businessName: v.businessName,
        contactPersonName: v.contactPersonName,
        email: account.email,
        logoUrl: v.logoUrl,
      },
      accountSummary: {
        role: account.role,
        isActive: account.isActive,
        verificationStatus: v.verificationStatus,
        memberSince: account.createdAt,
      },
      profileCompletion: completion,
      analytics,
      quickActions: [
        {
          id: 'edit-profile',
          label: 'Edit profile',
          path: '/vendor/profile',
        },
        {
          id: 'change-password',
          label: 'Change password',
          path: '/vendor/profile#change-password',
        },
        {
          id: 'upload-logo',
          label: 'Upload logo',
          path: '/vendor/profile#business-logo',
        },
        {
          id: 'add-vehicle',
          label: 'Add vehicle',
          path: '/vendor/vehicles/new',
        },
        {
          id: 'my-vehicles',
          label: 'Manage vehicles',
          path: '/vendor/vehicles',
        },
        {
          id: 'purchases',
          label: 'Purchase requests',
          path: '/vendor/purchases',
        },
        {
          id: 'rentals',
          label: 'Rental requests',
          path: '/vendor/rentals',
        },
      ],
    };
  }

  async getDashboardInsights(
    accountId: string,
    range: VendorDashboardRange = 'month',
  ) {
    const account = await this.loadVendorAccount(accountId);
    const vendor = account.vendor!;
    const profileCompletion = this.computeProfileCompletion(account, vendor);
    const analytics = await this.buildDashboardAnalytics(vendor.id, range);
    const insights = await this.generateAiInsights({
      vendor: {
        businessName: vendor.businessName,
        verificationStatus: vendor.verificationStatus,
      },
      range,
      profileCompletion,
      analytics,
    });

    return { range, insights };
  }

  async chatWithAnalytics(accountId: string, dto: VendorAnalyticsChatDto) {
    const range = dto.range ?? 'month';
    const account = await this.loadVendorAccount(accountId);
    const vendor = account.vendor!;
    const profileCompletion = this.computeProfileCompletion(account, vendor);
    const analytics = await this.buildDashboardAnalytics(vendor.id, range);
    const fallbackAnswer = [
      'Here is a quick dashboard-based recommendation:',
      '',
      '- Review pending requests first because fast responses improve conversion.',
      '- Refresh underperforming listings with clearer photos, stronger titles, and competitive pricing.',
      '- Prioritize vehicles with no favorites or requests and compare them with your strongest listings.',
    ].join('\n');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        answer: fallbackAnswer,
        source: 'fallback' as const,
        suggestions: this.getAnalyticsChatSuggestions(),
      };
    }

    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model:
          process.env.GEMINI_VENDOR_ANALYTICS_MODEL ?? 'gemini-flash-latest',
      });
      const result = await model.generateContent(
        this.buildAnalyticsChatPrompt({
          question: dto.message,
          vendor: {
            businessName: vendor.businessName,
            verificationStatus: vendor.verificationStatus,
          },
          range,
          profileCompletion,
          analytics,
        }),
      );
      const answer = result.response.text().trim();

      return {
        answer: answer || fallbackAnswer,
        source: answer ? ('ai' as const) : ('fallback' as const),
        suggestions: this.getAnalyticsChatSuggestions(),
      };
    } catch (error) {
      this.logger.warn(
        `Gemini vendor analytics chat failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );

      return {
        answer: fallbackAnswer,
        source: 'fallback' as const,
        suggestions: this.getAnalyticsChatSuggestions(),
      };
    }
  }

  private async buildDashboardAnalytics(
    vendorId: string,
    range: VendorDashboardRange,
  ) {
    const dateFilter = this.getDateFilter(range);
    const requestWhere = dateFilter
      ? { vendorId, createdAt: { gte: dateFilter } }
      : { vendorId };
    const vehicleScopedWhere = dateFilter
      ? { vehicle: { vendorId }, createdAt: { gte: dateFilter } }
      : { vehicle: { vendorId } };

    const [
      vehicles,
      purchaseRequests,
      rentalRequests,
      favoritesCount,
      reviews,
      reportsCount,
    ] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { vendorId },
        include: {
          _count: {
            select: {
              purchaseRequests: true,
              rentalRequests: true,
              favorites: true,
              reviews: true,
            },
          },
        },
      }),
      this.prisma.purchaseRequest.findMany({
        where: requestWhere,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.rentalRequest.findMany({
        where: requestWhere,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.favorite.count({ where: vehicleScopedWhere }),
      this.prisma.review.findMany({
        where: vehicleScopedWhere,
        select: {
          rating: true,
          vehicleId: true,
          createdAt: true,
        },
      }),
      this.prisma.report.count({ where: vehicleScopedWhere }),
    ]);

    const publishedVehicles = vehicles.filter(
      (vehicle) => vehicle.listingStatus === VehicleListingStatus.PUBLISHED,
    );
    const soldVehicles = vehicles.filter(
      (vehicle) =>
        vehicle.availabilityStatus === VehicleAvailabilityStatus.SOLD,
    );
    const rentedVehicles = vehicles.filter(
      (vehicle) =>
        vehicle.availabilityStatus === VehicleAvailabilityStatus.RENTED,
    );

    const approvedPurchases = purchaseRequests.filter(
      (request) => request.status === RequestStatus.APPROVED,
    );
    const approvedRentals = rentalRequests.filter(
      (request) => request.status === RequestStatus.APPROVED,
    );
    const rejectedRequests = [...purchaseRequests, ...rentalRequests].filter(
      (request) => request.status === RequestStatus.REJECTED,
    );
    const pendingRequests = [...purchaseRequests, ...rentalRequests].filter(
      (request) => request.status === RequestStatus.PENDING,
    );
    const totalRequests = purchaseRequests.length + rentalRequests.length;
    const approvedRequests = approvedPurchases.length + approvedRentals.length;

    const purchaseRevenue = approvedPurchases.reduce(
      (sum, request) => sum + Number(request.offeredPrice ?? 0),
      0,
    );
    const rentalRevenue = approvedRentals.reduce(
      (sum, request) => sum + Number(request.totalPrice ?? 0),
      0,
    );
    const averageRating =
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) /
          reviews.length
        : 0;

    return {
      kpis: {
        estimatedRevenue:
          Math.round((purchaseRevenue + rentalRevenue) * 100) / 100,
        purchaseRevenue: Math.round(purchaseRevenue * 100) / 100,
        rentalRevenue: Math.round(rentalRevenue * 100) / 100,
        activeListings: publishedVehicles.length,
        pendingRequests: pendingRequests.length,
        approvalRate:
          totalRequests > 0
            ? Math.round((approvedRequests / totalRequests) * 100)
            : 0,
        rejectionRate:
          totalRequests > 0
            ? Math.round((rejectedRequests.length / totalRequests) * 100)
            : 0,
        averageRating: Math.round(averageRating * 10) / 10,
        favorites: favoritesCount,
        reports: reportsCount,
      },
      inventory: {
        total: vehicles.length,
        published: publishedVehicles.length,
        draft: vehicles.filter(
          (vehicle) => vehicle.listingStatus === VehicleListingStatus.DRAFT,
        ).length,
        hidden: vehicles.filter(
          (vehicle) => vehicle.listingStatus === VehicleListingStatus.HIDDEN,
        ).length,
        archived: vehicles.filter(
          (vehicle) => vehicle.listingStatus === VehicleListingStatus.ARCHIVED,
        ).length,
        available: vehicles.filter(
          (vehicle) =>
            vehicle.availabilityStatus === VehicleAvailabilityStatus.AVAILABLE,
        ).length,
        sold: soldVehicles.length,
        rented: rentedVehicles.length,
        unavailable: vehicles.filter(
          (vehicle) =>
            vehicle.availabilityStatus ===
            VehicleAvailabilityStatus.UNAVAILABLE,
        ).length,
      },
      requests: {
        total: totalRequests,
        purchase: this.countStatuses(purchaseRequests),
        rental: this.countStatuses(rentalRequests),
      },
      trends: this.buildRequestTrend(range, purchaseRequests, rentalRequests),
      topVehicles: this.buildTopVehicles(
        vehicles,
        purchaseRequests,
        rentalRequests,
      ),
      underperformingVehicles: this.buildUnderperformingVehicles(
        publishedVehicles,
        purchaseRequests,
        rentalRequests,
      ),
      insights: this.buildInsights({
        pendingRequests: pendingRequests.length,
        publishedVehicles: publishedVehicles.length,
        draftVehicles: vehicles.filter(
          (vehicle) => vehicle.listingStatus === VehicleListingStatus.DRAFT,
        ).length,
        underperformingCount: this.buildUnderperformingVehicles(
          publishedVehicles,
          purchaseRequests,
          rentalRequests,
        ).length,
        topVehicleTitle: this.buildTopVehicles(
          vehicles,
          purchaseRequests,
          rentalRequests,
        )[0]?.title,
        averageRating,
      }),
    };
  }

  private async generateAiInsights(context: {
    vendor: {
      businessName: string;
      verificationStatus: VendorVerificationStatus;
    };
    range: VendorDashboardRange;
    profileCompletion: unknown;
    analytics: { insights: VendorAiInsight[] } & Record<string, unknown>;
  }): Promise<VendorAiInsight[]> {
    const fallbackInsights = context.analytics.insights;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return fallbackInsights;
    }

    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model:
          process.env.GEMINI_VENDOR_ANALYTICS_MODEL ?? 'gemini-flash-latest',
      });
      const result = await model.generateContent(
        this.buildInsightsPrompt(context),
      );
      const text = result.response.text();
      const parsed = this.parseAiInsights(text);
      return parsed.length > 0 ? parsed : fallbackInsights;
    } catch (error) {
      this.logger.warn(
        `Gemini vendor dashboard insights failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return fallbackInsights;
    }
  }

  private buildInsightsPrompt(context: {
    vendor: {
      businessName: string;
      verificationStatus: VendorVerificationStatus;
    };
    range: VendorDashboardRange;
    profileCompletion: unknown;
    analytics: Record<string, unknown>;
  }) {
    const { insights: _fallbackInsights, ...analytics } = context.analytics;
    void _fallbackInsights;

    return [
      'You are CarMesh Vendor Growth Advisor.',
      'Analyze the vendor dashboard data and produce practical actionable insights for a vehicle marketplace vendor.',
      'Use only the provided dashboard data. Do not invent metrics, sales, customer segments, or platform capabilities.',
      'Return valid JSON only, no markdown, no explanation.',
      'The JSON shape must be: {"insights":[{"type":"success|warning|info","title":"short title","message":"one clear sentence","action":"specific next step"}]}',
      'Return 3 to 5 insights. Make them specific, business-oriented, and useful.',
      '',
      'Dashboard context:',
      JSON.stringify({
        vendor: context.vendor,
        range: context.range,
        profileCompletion: context.profileCompletion,
        analytics,
      }),
    ].join('\n');
  }

  private parseAiInsights(text: string): VendorAiInsight[] {
    const jsonText = this.extractJsonObject(text);
    if (!jsonText) return [];

    try {
      const parsed = JSON.parse(jsonText) as { insights?: unknown };
      if (!Array.isArray(parsed.insights)) return [];

      return parsed.insights
        .map((item): VendorAiInsight | null => {
          if (!item || typeof item !== 'object') return null;
          const source = item as Record<string, unknown>;
          const type = source.type;
          const title = source.title;
          const message = source.message;
          const action = source.action;

          if (type !== 'success' && type !== 'warning' && type !== 'info') {
            return null;
          }
          if (typeof title !== 'string' || typeof message !== 'string') {
            return null;
          }

          return {
            type,
            title: title.trim().slice(0, 90),
            message: message.trim().slice(0, 260),
            action:
              typeof action === 'string'
                ? action.trim().slice(0, 220)
                : undefined,
            source: 'ai',
          };
        })
        .filter((item): item is VendorAiInsight => item !== null)
        .slice(0, 5);
    } catch {
      return [];
    }
  }

  private extractJsonObject(text: string): string | null {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    return cleaned.slice(start, end + 1);
  }

  private buildAnalyticsChatPrompt(context: {
    question: string;
    vendor: {
      businessName: string;
      verificationStatus: VendorVerificationStatus;
    };
    range: VendorDashboardRange;
    profileCompletion: unknown;
    analytics: Record<string, unknown>;
  }) {
    const { insights: _fallbackInsights, ...analytics } = context.analytics;
    void _fallbackInsights;

    return [
      'You are CarMesh Vendor Analytics Assistant.',
      'Answer vendor questions using only the provided dashboard analytics for this vehicle marketplace.',
      'The answer must stay within vendor performance, vehicle listings, marketplace demand, pricing, photos, requests, rentals, purchases, customer targeting, and operational improvements.',
      'If the question is outside this scope, politely say you can only help with CarMesh vendor dashboard and listing performance.',
      'Do not invent unavailable data such as demographics, exact ad targeting, impressions, or traffic sources unless present in the dashboard context.',
      'Format the answer for easy reading. Use short sections, blank lines between sections, and bullet points that start with "- ".',
      'Keep each bullet short and actionable. Match the user question language when possible.',
      '',
      'Vendor question:',
      context.question,
      '',
      'Dashboard context:',
      JSON.stringify({
        vendor: context.vendor,
        range: context.range,
        profileCompletion: context.profileCompletion,
        analytics,
      }),
    ].join('\n');
  }

  private getAnalyticsChatSuggestions() {
    return [
      'How can I improve my underperforming vehicles?',
      'Which vehicles should I focus on this week?',
      'How can I increase purchase request approvals?',
      'What should I change in my listings to attract more customers?',
    ];
  }

  private getDateFilter(range: VendorDashboardRange): Date | undefined {
    if (range === 'all') return undefined;

    const date = new Date();
    if (range === 'week') {
      date.setDate(date.getDate() - 6);
    } else if (range === 'month') {
      date.setDate(date.getDate() - 29);
    } else {
      date.setMonth(date.getMonth() - 11);
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private countStatuses(requests: { status: RequestStatus }[]) {
    return {
      total: requests.length,
      pending: requests.filter(
        (request) => request.status === RequestStatus.PENDING,
      ).length,
      approved: requests.filter(
        (request) => request.status === RequestStatus.APPROVED,
      ).length,
      rejected: requests.filter(
        (request) => request.status === RequestStatus.REJECTED,
      ).length,
      cancelled: requests.filter(
        (request) => request.status === RequestStatus.CANCELLED,
      ).length,
      completed: requests.filter(
        (request) => request.status === RequestStatus.COMPLETED,
      ).length,
    };
  }

  private buildRequestTrend(
    range: VendorDashboardRange,
    purchaseRequests: { createdAt: Date }[],
    rentalRequests: { createdAt: Date }[],
  ) {
    const buckets = this.createTrendBuckets(range);
    for (const request of purchaseRequests) {
      const bucket = buckets.get(this.getBucketKey(request.createdAt, range));
      if (bucket) {
        bucket.purchase += 1;
        bucket.total += 1;
      }
    }
    for (const request of rentalRequests) {
      const bucket = buckets.get(this.getBucketKey(request.createdAt, range));
      if (bucket) {
        bucket.rental += 1;
        bucket.total += 1;
      }
    }
    return Array.from(buckets.values());
  }

  private createTrendBuckets(range: VendorDashboardRange) {
    const buckets = new Map<
      string,
      { label: string; purchase: number; rental: number; total: number }
    >();
    const now = new Date();
    const count = range === 'week' ? 7 : range === 'month' ? 30 : 12;

    for (let i = count - 1; i >= 0; i -= 1) {
      const date = new Date(now);
      if (range === 'week' || range === 'month') {
        date.setDate(now.getDate() - i);
      } else {
        date.setMonth(now.getMonth() - i, 1);
      }
      const key = this.getBucketKey(date, range);
      buckets.set(key, {
        label:
          range === 'week' || range === 'month'
            ? date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
            : date.toLocaleDateString('en', {
                month: 'short',
                year: '2-digit',
              }),
        purchase: 0,
        rental: 0,
        total: 0,
      });
    }
    return buckets;
  }

  private getBucketKey(date: Date, range: VendorDashboardRange) {
    if (range === 'week' || range === 'month') {
      return date.toISOString().slice(0, 10);
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private buildTopVehicles(
    vehicles: {
      id: string;
      title: string;
      brand: string;
      model: string;
      _count: {
        purchaseRequests: number;
        rentalRequests: number;
        favorites: number;
        reviews: number;
      };
    }[],
    purchaseRequests: {
      vehicleId: string;
      status: RequestStatus;
      offeredPrice: unknown;
    }[],
    rentalRequests: {
      vehicleId: string;
      status: RequestStatus;
      totalPrice: unknown;
    }[],
  ) {
    return vehicles
      .map((vehicle) => {
        const periodPurchaseRequests = purchaseRequests.filter(
          (request) => request.vehicleId === vehicle.id,
        );
        const periodRentalRequests = rentalRequests.filter(
          (request) => request.vehicleId === vehicle.id,
        );
        const approvedPurchaseRevenue = periodPurchaseRequests
          .filter((request) => request.status === RequestStatus.APPROVED)
          .reduce((sum, request) => sum + Number(request.offeredPrice ?? 0), 0);
        const approvedRentalRevenue = periodRentalRequests
          .filter((request) => request.status === RequestStatus.APPROVED)
          .reduce((sum, request) => sum + Number(request.totalPrice ?? 0), 0);
        const periodRequests =
          periodPurchaseRequests.length + periodRentalRequests.length;

        return {
          id: vehicle.id,
          title: vehicle.title,
          subtitle: `${vehicle.brand} ${vehicle.model}`.trim(),
          requests: periodRequests,
          favorites: vehicle._count.favorites,
          reviews: vehicle._count.reviews,
          estimatedRevenue:
            Math.round(
              (approvedPurchaseRevenue + approvedRentalRevenue) * 100,
            ) / 100,
          score:
            periodRequests * 3 +
            vehicle._count.favorites * 2 +
            vehicle._count.reviews,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  private buildUnderperformingVehicles(
    vehicles: {
      id: string;
      title: string;
      brand: string;
      model: string;
      createdAt: Date;
      _count: { favorites: number };
    }[],
    purchaseRequests: { vehicleId: string }[],
    rentalRequests: { vehicleId: string }[],
  ) {
    return vehicles
      .map((vehicle) => {
        const requestCount =
          purchaseRequests.filter((request) => request.vehicleId === vehicle.id)
            .length +
          rentalRequests.filter((request) => request.vehicleId === vehicle.id)
            .length;
        return {
          id: vehicle.id,
          title: vehicle.title,
          subtitle: `${vehicle.brand} ${vehicle.model}`.trim(),
          requests: requestCount,
          favorites: vehicle._count.favorites,
          listedAt: vehicle.createdAt,
        };
      })
      .filter((vehicle) => vehicle.requests === 0 && vehicle.favorites === 0)
      .sort((a, b) => a.listedAt.getTime() - b.listedAt.getTime())
      .slice(0, 5);
  }

  private buildInsights(input: {
    pendingRequests: number;
    publishedVehicles: number;
    draftVehicles: number;
    underperformingCount: number;
    topVehicleTitle?: string;
    averageRating: number;
  }): VendorAiInsight[] {
    const insights: VendorAiInsight[] = [];

    if (input.pendingRequests > 0) {
      insights.push({
        type: 'warning',
        title: 'Pending requests',
        message: `${input.pendingRequests} pending requests need your response.`,
        action: 'Review pending purchase and rental requests today.',
        source: 'fallback',
      });
    }
    if (input.draftVehicles > 0) {
      insights.push({
        type: 'info',
        title: 'Draft listings',
        message: `${input.draftVehicles} draft vehicles can be completed and published.`,
        action: 'Complete missing details and publish your strongest drafts.',
        source: 'fallback',
      });
    }
    if (input.underperformingCount > 0) {
      insights.push({
        type: 'warning',
        title: 'Low engagement listings',
        message: `${input.underperformingCount} published vehicles have no requests or favorites in this period.`,
        action:
          'Refresh photos, pricing, title, and description for these listings.',
        source: 'fallback',
      });
    }
    if (input.topVehicleTitle) {
      insights.push({
        type: 'success',
        title: 'Best performer',
        message: `${input.topVehicleTitle} is your strongest listing right now.`,
        action:
          'Use similar photos, pricing, and descriptions on similar vehicles.',
        source: 'fallback',
      });
    }
    if (input.publishedVehicles === 0) {
      insights.push({
        type: 'info',
        title: 'No published listings',
        message: 'Publish your first vehicle to start receiving requests.',
        action:
          'Add vehicle photos, set a clear price, and publish the listing.',
        source: 'fallback',
      });
    }
    if (input.averageRating >= 4.5) {
      insights.push({
        type: 'success',
        title: 'Strong reputation',
        message:
          'Your average rating is excellent. Keep highlighting reviewed vehicles.',
        action:
          'Feature highly reviewed listings and ask satisfied customers for reviews.',
        source: 'fallback',
      });
    }

    return insights.slice(0, 5);
  }

  private async loadVendorAccount(
    accountId: string,
  ): Promise<AccountVendorRow> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        vendor: {
          select: {
            id: true,
            accountId: true,
            businessName: true,
            contactPersonName: true,
            phoneNumber: true,
            businessAddress: true,
            logoUrl: true,
            verificationStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!account || account.role !== Role.VENDOR) {
      throw new NotFoundException('Vendor profile not found');
    }
    if (!account.vendor) {
      throw new NotFoundException('Vendor profile not found');
    }

    return account as AccountVendorRow;
  }

  private toProfileResponse(account: AccountVendorRow) {
    const v = account.vendor!;
    return {
      accountId: account.id,
      email: account.email,
      role: account.role,
      isActive: account.isActive,
      businessName: v.businessName,
      contactPersonName: v.contactPersonName,
      phoneNumber: v.phoneNumber,
      businessAddress: v.businessAddress,
      logoUrl: v.logoUrl,
      verificationStatus: v.verificationStatus,
      accountCreatedAt: account.createdAt,
      accountUpdatedAt: account.updatedAt,
      profileCreatedAt: v.createdAt,
      profileUpdatedAt: v.updatedAt,
    };
  }

  private computeProfileCompletion(
    account: { email: string },
    vendor: {
      businessName: string;
      contactPersonName: string;
      phoneNumber: string | null;
      businessAddress: string | null;
      logoUrl: string | null;
    },
  ) {
    const checks: { key: string; filled: boolean }[] = [
      { key: 'businessName', filled: vendor.businessName.trim().length > 0 },
      {
        key: 'contactPersonName',
        filled: vendor.contactPersonName.trim().length > 0,
      },
      { key: 'email', filled: account.email.trim().length > 0 },
      {
        key: 'phoneNumber',
        filled: (vendor.phoneNumber ?? '').trim().length > 0,
      },
      {
        key: 'businessAddress',
        filled: (vendor.businessAddress ?? '').trim().length > 0,
      },
      {
        key: 'logoUrl',
        filled: (vendor.logoUrl ?? '').trim().length > 0,
      },
    ];
    const completedFields = checks.filter((c) => c.filled).map((c) => c.key);
    const missingFields = checks.filter((c) => !c.filled).map((c) => c.key);
    const percentage = Math.round((completedFields.length / 6) * 100);
    return { percentage, completedFields, missingFields };
  }
}
