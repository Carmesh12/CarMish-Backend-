import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Vehicle3dService } from './vehicle-3d.service';
import { vehicle3dJobMulterOptions } from './vehicle-3d.multer';

type JwtUser = { id: string; email: string; role: string };

@Controller('vendors/me/vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VENDOR)
export class VendorVehicle3dController {
  constructor(private readonly vehicle3dService: Vehicle3dService) {}

  @Post(':vehicleId/3d-jobs')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front', maxCount: 1 },
        { name: 'left', maxCount: 1 },
        { name: 'back', maxCount: 1 },
        { name: 'right', maxCount: 1 },
        { name: 'model', maxCount: 1 },
      ],
      vehicle3dJobMulterOptions,
    ),
  )
  createJob(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @UploadedFiles()
    files: {
      front?: Express.Multer.File[];
      left?: Express.Multer.File[];
      back?: Express.Multer.File[];
      right?: Express.Multer.File[];
      model?: Express.Multer.File[];
    },
  ) {
    return this.vehicle3dService.createVendorListingJob(user.id, vehicleId, files);
  }

  @Get(':vehicleId/3d-jobs/:jobId')
  getJob(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ) {
    return this.vehicle3dService.getVendorListingJob(user.id, vehicleId, jobId);
  }
}
