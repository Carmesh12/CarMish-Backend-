import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupabaseStorageModule } from '../../common/supabase/supabase-storage.module';
import { AdminMessagingModule } from '../admin-messaging/admin-messaging.module';
import { ThreeDPrintRequestsController } from './three-d-print-requests.controller';
import { ThreeDPrintRequestsService } from './three-d-print-requests.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    NotificationsModule,
    SupabaseStorageModule,
    AdminMessagingModule,
  ],
  controllers: [ThreeDPrintRequestsController],
  providers: [ThreeDPrintRequestsService],
})
export class ThreeDPrintRequestsModule {}
