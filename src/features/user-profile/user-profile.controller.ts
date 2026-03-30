import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChangeUserPasswordDto } from './dto/change-user-password.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UserProfileService } from './user-profile.service';
import { userProfileImageMulterOptions } from './user-profile-image.multer';

type JwtUser = { id: string; email: string; role: string };

@Controller('user')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: JwtUser) {
    return this.userProfileService.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.userProfileService.updateProfile(user.id, dto);
  }

  @Patch('profile/password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChangeUserPasswordDto,
  ) {
    return this.userProfileService.changePassword(user.id, dto);
  }

  @Patch('profile/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image', userProfileImageMulterOptions))
  updateProfileImage(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    return this.userProfileService.updateProfileImage(user.id, file);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: JwtUser) {
    return this.userProfileService.getDashboard(user.id);
  }
}
