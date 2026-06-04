import { Module } from '@nestjs/common';
import { AdminVendorsController } from './admin-vendors.controller';
import { AdminVendorsService } from './admin-vendors.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminMessagingModule } from '../admin-messaging/admin-messaging.module';

@Module({
  imports: [NotificationsModule, AdminMessagingModule],
  controllers: [AdminVendorsController],
  providers: [AdminVendorsService],
  exports: [AdminVendorsService],
})
export class AdminVendorsModule {}
