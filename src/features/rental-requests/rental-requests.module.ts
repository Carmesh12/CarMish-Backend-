import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RentalRequestsController } from './rental-requests.controller';
import { RentalRequestsService } from './rental-requests.service';

@Module({
  imports: [NotificationsModule],
  controllers: [RentalRequestsController],
  providers: [RentalRequestsService],
})
export class RentalRequestsModule {}
