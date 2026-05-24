import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  ChatSenderType,
  ListingType,
  VehicleAvailabilityStatus,
  VehicleListingStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChatSessionDto } from './dto/create-chat-session.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';

type VehicleFilters = {
  listingType: 'SALE' | 'RENT' | 'BOTH' | null;
  brand: string | null;
  model: string | null;
  maxPrice: number | null;
  minPrice: number | null;
  city: string | null;
  minYear: number | null;
  maxYear: number | null;
};

type ExtractVehicleFiltersResult = {
  filters: VehicleFilters;
  fallback: boolean;
};

const EMPTY_VEHICLE_FILTERS: VehicleFilters = {
  listingType: null,
  brand: null,
  model: null,
  maxPrice: null,
  minPrice: null,
  city: null,
  minYear: null,
  maxYear: null,
};

const AI_PARSE_FALLBACK_MESSAGE =
  'I could not fully understand the AI response, but you can try rephrasing your request.';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizeVehicleFilters(value: unknown): VehicleFilters {
    const source =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};

    const stringOrNull = (key: string) => {
      const raw = source[key];
      return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    };

    const numberOrNull = (key: string) => {
      const raw = source[key];
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    };

    const rawListingType = source.listingType;
    const listingType =
      rawListingType === 'SALE' ||
      rawListingType === 'RENT' ||
      rawListingType === 'BOTH'
        ? rawListingType
        : null;

    return {
      listingType,
      brand: stringOrNull('brand'),
      model: stringOrNull('model'),
      maxPrice: numberOrNull('maxPrice'),
      minPrice: numberOrNull('minPrice'),
      city: stringOrNull('city'),
      minYear: numberOrNull('minYear'),
      maxYear: numberOrNull('maxYear'),
    };
  }

  private parseGeminiFilters(text: string): ExtractVehicleFiltersResult {
    const cleanedText = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return {
        filters: this.normalizeVehicleFilters(JSON.parse(cleanedText)),
        fallback: false,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to parse Gemini vehicle filters JSON: ${
          error instanceof Error ? error.message : 'Unknown parse error'
        }`,
      );

      return {
        filters: { ...EMPTY_VEHICLE_FILTERS },
        fallback: true,
      };
    }
  }

  private async extractVehicleFilters(
    message: string,
  ): Promise<ExtractVehicleFiltersResult> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new BadRequestException('Gemini API key is not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = [
      'You are CarMesh assistant.',
      'The user message can be in Arabic or English.',

      'Extract vehicle search filters from the user message.',
      'Extract filters only. Do not invent values.',
      'If unknown, use null.',
      'Return valid JSON only, no markdown, no extra text.',
      '',
      'Supported filters (JSON keys):',
      '- listingType: "SALE" | "RENT" | "BOTH" | null',
      '- brand: string | null',
      '- model: string | null',
      '- maxPrice: number | null',
      '- minPrice: number | null',
      '- city: string | null',
      '- minYear: number | null',
      '- maxYear: number | null',
      '',
      'User message:',
      message,
    ].join('\n');

    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
    });

    let result: Awaited<ReturnType<typeof model.generateContent>>;
    try {
      result = await model.generateContent(prompt);
    } catch {
      throw new BadRequestException('AI service is temporarily unavailable');
    }

    const text = result.response.text();

    return this.parseGeminiFilters(text);
  }

  private buildAssistantReply(
    recommendations: any[],
    userMessage: string,
    filters: VehicleFilters,
  ) {
    const count = recommendations.length;

    const isArabic = /[\u0600-\u06FF]/.test(userMessage);

    if (count === 0) {
      return isArabic
        ? 'عذرًا، لم أجد سيارات مطابقة.'
        : 'Sorry, I could not find matching vehicles.';
    }

    const parts: string[] = [];

    if (filters.brand) parts.push(filters.brand);
    if (filters.model) parts.push(filters.model);

    if (isArabic) {
      const subject = parts.length
        ? `سيارات ${parts.join(' ')}`
        : 'سيارات مطابقة';

      let listingText = '';
      if (filters.listingType === 'SALE') listingText = 'للبيع';
      if (filters.listingType === 'RENT') listingText = 'للإيجار';

      const cityText = filters.city ? `في ${filters.city}` : '';
      const extras = [listingText, cityText].filter(Boolean).join(' ');

      return `وجدت ${count} ${subject}${extras ? ` ${extras}` : ''}.`;
    }

    const subject = parts.length
      ? `${parts.join(' ')} vehicles`
      : 'matching vehicles';

    let listingText = '';
    if (filters.listingType === 'SALE') listingText = 'for sale';
    if (filters.listingType === 'RENT') listingText = 'for rent';

    const cityText = filters.city ? `in ${filters.city}` : '';

    const extras = [listingText, cityText].filter(Boolean).join(' ');

    return `I found ${count} ${subject}${extras ? ` ${extras}` : ''}.`;
  }

  async createSession(accountId: string, dto: CreateChatSessionDto) {
    void dto;

    const user = await this.prisma.user.findFirst({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return this.prisma.chatSession.create({
      data: {
        userId: user.id,
      },
    });
  }

  async findMySessions(accountId: string) {
    const user = await this.prisma.user.findFirst({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return this.prisma.chatSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
  }

  async findOneSession(accountId: string, sessionId: string) {
    const user = await this.prisma.user.findFirst({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    if (session.userId !== user.id) {
      throw new ForbiddenException(
        'You are not allowed to access this chat session',
      );
    }

    return session;
  }

  async deleteSession(accountId: string, sessionId: string) {
    const user = await this.prisma.user.findFirst({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    if (session.userId !== user.id) {
      throw new ForbiddenException(
        'You are not allowed to delete this chat session',
      );
    }

    await this.prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return { message: 'Chat session deleted successfully' };
  }

  async sendMessage(
    accountId: string,
    sessionId: string,
    dto: SendChatMessageDto,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { accountId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    if (session.userId !== user.id) {
      throw new ForbiddenException(
        'You are not allowed to access this chat session',
      );
    }

    const createdMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId,
        senderType: ChatSenderType.USER,
        message: dto.message,
      },
    });

    const { filters, fallback } = await this.extractVehicleFilters(dto.message);

    if (fallback) {
      const assistantMessage = await this.prisma.chatMessage.create({
        data: {
          sessionId,
          senderType: ChatSenderType.BOT,
          message: AI_PARSE_FALLBACK_MESSAGE,
        },
      });

      return {
        userMessage: createdMessage,
        assistantMessage,
        reply: AI_PARSE_FALLBACK_MESSAGE,
        message: AI_PARSE_FALLBACK_MESSAGE,
        filters,
        recommendations: [],
        fallback: true,
      };
    }

    const hasMeaningfulCriteria =
      filters.listingType != null ||
      filters.brand != null ||
      filters.model != null ||
      filters.maxPrice != null ||
      filters.minPrice != null ||
      filters.city != null ||
      filters.minYear != null ||
      filters.maxYear != null;

    if (!hasMeaningfulCriteria) {
      const reply =
        'Hi! Tell me what kind of car you are looking for, for example: Toyota for sale in Amman under 30000.';

      const assistantMessage = await this.prisma.chatMessage.create({
        data: {
          sessionId,
          senderType: ChatSenderType.BOT,
          message: reply,
        },
      });

      return {
        userMessage: createdMessage,
        assistantMessage,
        reply,
        filters,
        recommendations: [],
      };
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        listingStatus: VehicleListingStatus.PUBLISHED,
        availabilityStatus: VehicleAvailabilityStatus.AVAILABLE,
        ...(filters.brand
          ? {
              brand: {
                contains: filters.brand,
                mode: 'insensitive',
              },
            }
          : {}),
        ...(filters.model
          ? {
              model: {
                contains: filters.model,
                mode: 'insensitive',
              },
            }
          : {}),
        ...(filters.city
          ? {
              locationCity: {
                contains: filters.city,
                mode: 'insensitive',
              },
            }
          : {}),
        ...(filters.minYear != null || filters.maxYear != null
          ? {
              year: {
                ...(filters.minYear != null ? { gte: filters.minYear } : {}),
                ...(filters.maxYear != null ? { lte: filters.maxYear } : {}),
              },
            }
          : {}),
        ...(filters.listingType === 'SALE'
          ? {
              listingType: { in: [ListingType.SALE, ListingType.BOTH] },
              ...(filters.maxPrice != null
                ? { price: { lte: filters.maxPrice } }
                : {}),
            }
          : filters.listingType === 'RENT'
            ? {
                listingType: { in: [ListingType.RENT, ListingType.BOTH] },
                ...(filters.maxPrice != null
                  ? { rentalPricePerDay: { lte: filters.maxPrice } }
                  : {}),
              }
            : {}),
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
        },
      },
    });

    const reply = this.buildAssistantReply(vehicles, dto.message, filters);

    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        sessionId,
        senderType: ChatSenderType.BOT,
        message: reply,
      },
    });

    return {
      userMessage: createdMessage,
      assistantMessage,
      reply,
      filters,
      recommendations: vehicles,
    };
  }
}
