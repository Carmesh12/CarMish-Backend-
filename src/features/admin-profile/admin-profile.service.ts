import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  ReportStatus,
  RequestStatus,
  Role,
  VehicleListingStatus,
  VendorVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';

type AdminDashboardRange = 'week' | 'month' | 'year' | 'all';

type AiInsight = {
  type: 'success' | 'warning' | 'info';
  title: string;
  message: string;
  action?: string;
  source: 'ai' | 'fallback';
};

type AccountAdminRow = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  admin: {
    id: string;
    accountId: string;
    firstName: string;
    lastName: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

@Injectable()
export class AdminProfileService {
  private readonly logger = new Logger(AdminProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getProfile(accountId: string) {
    const account = await this.loadAdminAccount(accountId);
    return this.toProfileResponse(account);
  }

  async updateProfile(accountId: string, dto: UpdateAdminProfileDto) {
    const account = await this.loadAdminAccount(accountId);
    const adminId = account.admin!.id;

    const data: { firstName?: string; lastName?: string } = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();

    if (Object.keys(data).length === 0) {
      return this.toProfileResponse(account);
    }

    await this.prisma.admin.update({ where: { id: adminId }, data });
    const updated = await this.loadAdminAccount(accountId);
    return this.toProfileResponse(updated);
  }

  async getDashboard(accountId: string, range: AdminDashboardRange = 'month') {
    const account = await this.loadAdminAccount(accountId);
    const a = account.admin!;
    const fullName = `${a.firstName} ${a.lastName}`.trim();
    const completion = this.computeProfileCompletion(account, a);
    const analytics = await this.buildAnalytics(range);

    return {
      range,
      greeting: { fullName, email: account.email },
      accountSummary: {
        role: account.role,
        isActive: account.isActive,
        memberSince: account.createdAt,
      },
      profileCompletion: completion,
      analytics,
      quickActions: [
        { id: 'edit-profile', label: 'Edit profile', path: '/admin/profile' },
        { id: 'vendor-requests', label: 'Vendor requests', path: '/admin/vendors' },
        { id: 'reports', label: 'Reports', path: '/admin/reports' },
        { id: 'accounts', label: 'Manage accounts', path: '/admin/accounts' },
      ],
    };
  }

  async getDashboardInsights(accountId: string, range: AdminDashboardRange = 'month') {
    await this.loadAdminAccount(accountId);
    const analytics = await this.buildAnalytics(range);
    const insights = await this.generateAiInsights(analytics, range);
    return { range, insights };
  }

  async chatWithAnalytics(accountId: string, message: string, range: AdminDashboardRange = 'month') {
    await this.loadAdminAccount(accountId);
    const analytics = await this.buildAnalytics(range);
    const fallbackAnswer = [
      'Here are some quick platform-level recommendations:',
      '',
      '- Review pending vendor applications to keep the marketplace growing.',
      '- Address open reports, especially high-severity ones with 6+ reports on a single vehicle.',
      '- Monitor approval rates and revenue trends to identify potential issues early.',
    ].join('\n');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { answer: fallbackAnswer, source: 'fallback' as const, suggestions: this.getChatSuggestions() };
    }

    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: process.env.GEMINI_VENDOR_ANALYTICS_MODEL ?? 'gemini-flash-latest',
      });
      const result = await model.generateContent(this.buildChatPrompt(message, analytics, range));
      const answer = result.response.text().trim();
      return {
        answer: answer || fallbackAnswer,
        source: answer ? ('ai' as const) : ('fallback' as const),
        suggestions: this.getChatSuggestions(),
      };
    } catch (error) {
      this.logger.warn(`Gemini admin chat failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      return { answer: fallbackAnswer, source: 'fallback' as const, suggestions: this.getChatSuggestions() };
    }
  }

  private async buildAnalytics(range: AdminDashboardRange) {
    const dateFilter = this.getDateFilter(range);
    const dateWhere = dateFilter ? { createdAt: { gte: dateFilter } } : {};

    const [
      totalUsers,
      totalVendors,
      totalVehicles,
      activeListings,
      pendingVendors,
      openReports,
      purchaseRequests,
      rentalRequests,
      vendorsByStatus,
      recentUsers,
      recentVendors,
      recentVehicles,
      topVendors,
      topReportedVehicles,
    ] = await Promise.all([
      this.prisma.account.count({ where: { role: Role.USER } }),
      this.prisma.account.count({ where: { role: Role.VENDOR } }),
      this.prisma.vehicle.count(),
      this.prisma.vehicle.count({ where: { listingStatus: VehicleListingStatus.PUBLISHED } }),
      this.prisma.vendor.count({ where: { verificationStatus: VendorVerificationStatus.PENDING } }),
      this.prisma.report.count({ where: { status: ReportStatus.PENDING } }),
      this.prisma.purchaseRequest.findMany({ where: dateWhere, select: { status: true, offeredPrice: true, createdAt: true } }),
      this.prisma.rentalRequest.findMany({ where: dateWhere, select: { status: true, totalPrice: true, createdAt: true } }),
      this.prisma.vendor.groupBy({ by: ['verificationStatus'], _count: { id: true } }),
      this.prisma.account.count({ where: { role: Role.USER, ...dateWhere } }),
      this.prisma.account.count({ where: { role: Role.VENDOR, ...dateWhere } }),
      this.prisma.vehicle.count({ where: dateWhere }),
      this.prisma.vendor.findMany({
        take: 5,
        include: {
          account: { select: { email: true } },
          _count: { select: { vehicles: true, purchaseRequests: true, rentalRequests: true } },
        },
        orderBy: { vehicles: { _count: 'desc' } },
      }),
      this.prisma.report.groupBy({
        by: ['vehicleId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

    const approvedPurchases = purchaseRequests.filter((r) => r.status === RequestStatus.APPROVED);
    const approvedRentals = rentalRequests.filter((r) => r.status === RequestStatus.APPROVED);
    const purchaseRevenue = approvedPurchases.reduce((s, r) => s + Number(r.offeredPrice ?? 0), 0);
    const rentalRevenue = approvedRentals.reduce((s, r) => s + Number(r.totalPrice ?? 0), 0);
    const totalRevenue = Math.round((purchaseRevenue + rentalRevenue) * 100) / 100;
    const totalRequests = purchaseRequests.length + rentalRequests.length;
    const approvedRequests = approvedPurchases.length + approvedRentals.length;
    const approvalRate = totalRequests > 0 ? Math.round((approvedRequests / totalRequests) * 100) : 0;

    const vendorStatusMap: Record<string, number> = {};
    for (const v of vendorsByStatus) {
      vendorStatusMap[v.verificationStatus] = v._count.id;
    }

    const topReportedDetails = await Promise.all(
      topReportedVehicles.map(async (r) => {
        const vehicle = await this.prisma.vehicle.findUnique({
          where: { id: r.vehicleId },
          select: { title: true, brand: true, model: true, vendor: { select: { businessName: true } } },
        });
        return { vehicleId: r.vehicleId, title: vehicle?.title ?? 'Unknown', brand: vehicle?.brand ?? '', vendorName: vehicle?.vendor?.businessName ?? '', reportCount: r._count.id };
      }),
    );

    const reportsByStatus = await this.prisma.report.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    const reportStatusMap: Record<string, number> = {};
    for (const r of reportsByStatus) {
      reportStatusMap[r.status] = r._count.id;
    }

    return {
      kpis: {
        totalUsers,
        totalVendors,
        totalVehicles,
        activeListings,
        totalRevenue,
        purchaseRevenue: Math.round(purchaseRevenue * 100) / 100,
        rentalRevenue: Math.round(rentalRevenue * 100) / 100,
        pendingVendors,
        openReports,
        totalRequests,
        approvalRate,
      },
      growth: {
        newUsersInRange: recentUsers,
        newVendorsInRange: recentVendors,
        newVehiclesInRange: recentVehicles,
      },
      vendors: {
        approved: vendorStatusMap['APPROVED'] ?? 0,
        pending: vendorStatusMap['PENDING'] ?? 0,
        rejected: vendorStatusMap['REJECTED'] ?? 0,
      },
      reports: {
        pending: reportStatusMap['PENDING'] ?? 0,
        reviewed: reportStatusMap['REVIEWED'] ?? 0,
        resolved: reportStatusMap['RESOLVED'] ?? 0,
        dismissed: reportStatusMap['DISMISSED'] ?? 0,
      },
      topVendors: topVendors.map((v) => ({
        id: v.id,
        businessName: v.businessName,
        email: v.account.email,
        vehicles: v._count.vehicles,
        purchaseRequests: v._count.purchaseRequests,
        rentalRequests: v._count.rentalRequests,
      })),
      topReportedVehicles: topReportedDetails,
    };
  }

  private async generateAiInsights(analytics: Record<string, unknown>, range: AdminDashboardRange): Promise<AiInsight[]> {
    const fallback = this.buildFallbackInsights(analytics);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return fallback;

    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: process.env.GEMINI_VENDOR_ANALYTICS_MODEL ?? 'gemini-flash-latest',
      });
      const result = await model.generateContent(this.buildInsightsPrompt(analytics, range));
      const parsed = this.parseAiInsights(result.response.text());
      return parsed.length > 0 ? parsed : fallback;
    } catch (error) {
      this.logger.warn(`Gemini admin insights failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      return fallback;
    }
  }

  private buildFallbackInsights(analytics: Record<string, unknown>): AiInsight[] {
    const kpis = analytics['kpis'] as Record<string, number> | undefined;
    const insights: AiInsight[] = [];

    if (kpis?.pendingVendors && kpis.pendingVendors > 0) {
      insights.push({ type: 'warning', title: 'Pending vendor applications', message: `${kpis.pendingVendors} vendor applications awaiting review.`, action: 'Review and respond to pending vendors.', source: 'fallback' });
    }
    if (kpis?.openReports && kpis.openReports > 0) {
      insights.push({ type: 'warning', title: 'Open reports', message: `${kpis.openReports} reports need attention.`, action: 'Prioritize high-severity grouped reports.', source: 'fallback' });
    }
    if (kpis?.approvalRate !== undefined && kpis.approvalRate < 50) {
      insights.push({ type: 'info', title: 'Low approval rate', message: `Only ${kpis.approvalRate}% of requests are approved.`, action: 'Investigate why vendors are rejecting so many requests.', source: 'fallback' });
    }
    if (kpis?.totalRevenue && kpis.totalRevenue > 0) {
      insights.push({ type: 'success', title: 'Revenue growing', message: `Platform has generated $${Math.round(kpis.totalRevenue).toLocaleString()} in this period.`, source: 'fallback' });
    }
    if (insights.length === 0) {
      insights.push({ type: 'info', title: 'Platform healthy', message: 'No critical issues detected. Keep monitoring growth.', source: 'fallback' });
    }

    return insights.slice(0, 5);
  }

  private buildInsightsPrompt(analytics: Record<string, unknown>, range: AdminDashboardRange) {
    return [
      'You are CarMesh Platform Admin Advisor.',
      'Analyze the admin dashboard data and produce actionable insights for the platform administrator.',
      'Use only the provided data. Do not invent metrics.',
      'Return valid JSON only: {"insights":[{"type":"success|warning|info","title":"short title","message":"one sentence","action":"next step"}]}',
      'Return 3 to 5 insights.',
      '',
      `Range: ${range}`,
      'Dashboard data:',
      JSON.stringify(analytics),
    ].join('\n');
  }

  private buildChatPrompt(question: string, analytics: Record<string, unknown>, range: AdminDashboardRange) {
    return [
      'You are CarMesh Platform Admin Assistant.',
      'Answer admin questions using only the provided platform analytics.',
      'Stay within: user/vendor management, reports, revenue, listings, platform health, growth.',
      'If out of scope, say you can only help with CarMesh platform administration.',
      'Format with short sections, blank lines, and bullet points starting with "- ".',
      '',
      'Admin question:',
      question,
      '',
      `Range: ${range}`,
      'Platform data:',
      JSON.stringify(analytics),
    ].join('\n');
  }

  private parseAiInsights(text: string): AiInsight[] {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return [];

    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { insights?: unknown };
      if (!Array.isArray(parsed.insights)) return [];
      return parsed.insights
        .map((item): AiInsight | null => {
          if (!item || typeof item !== 'object') return null;
          const s = item as Record<string, unknown>;
          if (!['success', 'warning', 'info'].includes(s.type as string)) return null;
          if (typeof s.title !== 'string' || typeof s.message !== 'string') return null;
          return {
            type: s.type as 'success' | 'warning' | 'info',
            title: (s.title as string).slice(0, 90),
            message: (s.message as string).slice(0, 260),
            action: typeof s.action === 'string' ? (s.action as string).slice(0, 220) : undefined,
            source: 'ai',
          };
        })
        .filter((i): i is AiInsight => i !== null)
        .slice(0, 5);
    } catch {
      return [];
    }
  }

  private getChatSuggestions() {
    return [
      'What are the biggest platform risks right now?',
      'How can I improve vendor approval throughput?',
      'Which vehicles are generating the most reports?',
      'What revenue trends should I be aware of?',
    ];
  }

  private getDateFilter(range: AdminDashboardRange): Date | undefined {
    if (range === 'all') return undefined;
    const d = new Date();
    if (range === 'week') d.setDate(d.getDate() - 6);
    else if (range === 'month') d.setDate(d.getDate() - 29);
    else d.setMonth(d.getMonth() - 11);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private async loadAdminAccount(accountId: string): Promise<AccountAdminRow> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true, email: true, role: true, isActive: true,
        createdAt: true, updatedAt: true,
        admin: { select: { id: true, accountId: true, firstName: true, lastName: true, createdAt: true, updatedAt: true } },
      },
    });
    if (!account || account.role !== Role.ADMIN) throw new NotFoundException('Admin profile not found');
    if (!account.admin) throw new NotFoundException('Admin profile not found');
    return account as AccountAdminRow;
  }

  private toProfileResponse(account: AccountAdminRow) {
    const a = account.admin!;
    return {
      accountId: account.id, email: account.email, role: account.role,
      isActive: account.isActive, firstName: a.firstName, lastName: a.lastName,
      accountCreatedAt: account.createdAt, accountUpdatedAt: account.updatedAt,
      profileCreatedAt: a.createdAt, profileUpdatedAt: a.updatedAt,
    };
  }

  private computeProfileCompletion(account: { email: string }, admin: { firstName: string; lastName: string }) {
    const checks = [
      { key: 'firstName', filled: admin.firstName.trim().length > 0 },
      { key: 'lastName', filled: admin.lastName.trim().length > 0 },
      { key: 'email', filled: account.email.trim().length > 0 },
    ];
    const completedFields = checks.filter((c) => c.filled).map((c) => c.key);
    const missingFields = checks.filter((c) => !c.filled).map((c) => c.key);
    return { percentage: Math.round((completedFields.length / 3) * 100), completedFields, missingFields };
  }
}
