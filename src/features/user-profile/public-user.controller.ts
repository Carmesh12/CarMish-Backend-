import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { UserProfileService } from './user-profile.service';

@Controller('users')
export class PublicUserController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get(':accountId')
  getPublicProfile(@Param('accountId', ParseUUIDPipe) accountId: string) {
    return this.userProfileService.getPublicProfile(accountId);
  }
}
