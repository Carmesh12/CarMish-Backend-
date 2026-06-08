import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SaveWheelEditDto } from './dto/save-wheel-edit.dto';
import { WheelEditorService } from './wheel-editor.service';

type JwtUser = { id: string; email: string; role: string };

function getRequestOrigin(request: Request) {
  return `${request.protocol}://${request.get('host')}`;
}

@Controller('3d-wheel-editor')
export class WheelEditorController {
  constructor(private readonly wheelEditorService: WheelEditorService) {}

  @Get('wheels')
  listWheelModels(@Req() request: Request) {
    return this.wheelEditorService.listWheelModels(getRequestOrigin(request));
  }

  @Get('wheels/:id')
  getWheelModel(@Param('id') id: string, @Res() response: Response) {
    return response.sendFile(this.wheelEditorService.getWheelModelPath(id));
  }

  @Get('vendor/vehicles/:vehicleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  getVendorWheelEdit(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.wheelEditorService.getVendorWheelEdit(user, vehicleId);
  }

  @Put('vendor/vehicles/:vehicleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  saveVendorWheelEdit(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: SaveWheelEditDto,
  ) {
    return this.wheelEditorService.saveVendorWheelEdit(
      user,
      vehicleId,
      dto.selectedWheelId,
    );
  }

  @Get('personal/models/:modelId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  getPersonalWheelEdit(
    @CurrentUser() user: JwtUser,
    @Param('modelId', ParseUUIDPipe) modelId: string,
  ) {
    return this.wheelEditorService.getPersonalWheelEdit(user.id, modelId);
  }

  @Put('personal/models/:modelId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  savePersonalWheelEdit(
    @CurrentUser() user: JwtUser,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body() dto: SaveWheelEditDto,
  ) {
    return this.wheelEditorService.savePersonalWheelEdit(
      user.id,
      modelId,
      dto.selectedWheelId,
    );
  }
}
