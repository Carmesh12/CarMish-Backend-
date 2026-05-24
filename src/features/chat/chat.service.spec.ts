import { ChatSenderType, ListingType } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatService } from './chat.service';

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(),
}));

describe('ChatService Gemini response handling', () => {
  let generateContent: jest.Mock;
  let prisma: {
    user: { findFirst: jest.Mock };
    chatSession: { findUnique: jest.Mock };
    chatMessage: { create: jest.Mock };
    vehicle: { findMany: jest.Mock };
  };
  let service: ChatService;
  const originalGeminiApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    generateContent = jest.fn();
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: () => ({ generateContent }),
    }));

    prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'user-1', accountId: 'account-1' }),
      },
      chatSession: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'session-1', userId: 'user-1' }),
      },
      chatMessage: {
        create: jest.fn(({ data }) =>
          Promise.resolve({
            id: `${data.senderType.toLowerCase()}-message`,
            ...data,
          }),
        ),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'vehicle-1',
            brand: 'Toyota',
            model: 'Camry',
            listingType: ListingType.SALE,
          },
        ]),
      },
    };
    service = new ChatService(prisma as never);
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalGeminiApiKey;
    jest.clearAllMocks();
  });

  function mockGeminiText(text: string) {
    generateContent.mockResolvedValue({
      response: {
        text: () => text,
      },
    });
  }

  it('uses valid Gemini JSON response normally', async () => {
    mockGeminiText(
      JSON.stringify({
        listingType: 'SALE',
        brand: 'Toyota',
        model: 'Camry',
        maxPrice: 30000,
        minPrice: null,
        city: 'Amman',
        minYear: 2020,
        maxYear: null,
      }),
    );

    const result = await service.sendMessage('account-1', 'session-1', {
      message: 'Toyota Camry for sale in Amman under 30000',
    });

    expect(result.fallback).toBeUndefined();
    expect(result.filters).toMatchObject({
      listingType: 'SALE',
      brand: 'Toyota',
      model: 'Camry',
      maxPrice: 30000,
      city: 'Amman',
      minYear: 2020,
    });
    expect(result.recommendations).toHaveLength(1);
    expect(prisma.vehicle.findMany).toHaveBeenCalled();
  });

  it('returns a safe fallback when Gemini returns malformed JSON', async () => {
    mockGeminiText('Here are some filters: { listingType: SALE');

    const result = await service.sendMessage('account-1', 'session-1', {
      message: 'find me a Toyota',
    });

    expect(result).toMatchObject({
      fallback: true,
      message:
        'I could not fully understand the AI response, but you can try rephrasing your request.',
      recommendations: [],
      filters: {
        listingType: null,
        brand: null,
        model: null,
        maxPrice: null,
        minPrice: null,
        city: null,
        minYear: null,
        maxYear: null,
      },
    });
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        senderType: ChatSenderType.BOT,
        message:
          'I could not fully understand the AI response, but you can try rephrasing your request.',
      },
    });
  });

  it('normalizes valid JSON with missing fields safely', async () => {
    mockGeminiText(
      JSON.stringify({
        brand: 'Toyota',
      }),
    );

    const result = await service.sendMessage('account-1', 'session-1', {
      message: 'Toyota',
    });

    expect(result.fallback).toBeUndefined();
    expect(result.filters).toEqual({
      listingType: null,
      brand: 'Toyota',
      model: null,
      maxPrice: null,
      minPrice: null,
      city: null,
      minYear: null,
      maxYear: null,
    });
    expect(prisma.vehicle.findMany).toHaveBeenCalled();
  });
});
