import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Vehicle3dService } from './vehicle-3d.service';

@Controller('3d-generation')
@UseGuards(JwtAuthGuard)
export class ThreeDGenerationController {
  constructor(private readonly vehicle3dService: Vehicle3dService) {}

  @Get('config')
  getConfig() {
    return this.vehicle3dService.getGenerationConfig();
  }
}
