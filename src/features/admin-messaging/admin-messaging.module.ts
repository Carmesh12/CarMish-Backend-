import { Module } from '@nestjs/common';
import { AdminMessagingController } from './admin-messaging.controller';
import { AdminMessagingService } from './admin-messaging.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminMessagingController],
  providers: [AdminMessagingService],
  exports: [AdminMessagingService],
})
export class AdminMessagingModule {}
