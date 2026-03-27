import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  me(@Headers() headers: Record<string, string | string[] | undefined>) {
    const token = this.extractTokenFromHeaders(headers);
    if (!token) {
      throw new UnauthorizedException('Missing auth token');
    }
    return this.authService.getMeByToken(token);
  }

  private extractTokenFromHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): string | undefined {
    const getFirstString = (v: string | string[] | undefined) => {
      if (Array.isArray(v)) return v[0];
      return v;
    };

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      const valueAsString = getFirstString(value);
      if (!valueAsString) continue;

      if (lowerKey === 'authorization') {
        const match = valueAsString.match(/^Bearer\s+(.+)$/i);
        return match ? match[1] : valueAsString;
      }

      if (lowerKey === 'access-token' || lowerKey === 'accesstoken') {
        return valueAsString;
      }

      if (lowerKey === 'x-access-token') {
        return valueAsString;
      }
    }

    return undefined;
  }
}

