import { Module } from '@nestjs/common';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminAccountsController],
  providers: [AdminAccountsService],
  exports: [AdminAccountsService],
})
export class AdminAccountsModule {}
