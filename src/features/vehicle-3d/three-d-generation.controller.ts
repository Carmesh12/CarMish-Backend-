import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { isThreeDMockMode } from './three-d-config';

@Controller('3d-generation')
@UseGuards(JwtAuthGuard)
export class ThreeDGenerationController {
  @Get('config')
  getConfig() {
    return { mockMode: isThreeDMockMode() };
  }
}
