import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminMessagingModule } from '../admin-messaging/admin-messaging.module';

@Module({
  imports: [PrismaModule, AuthModule, AdminMessagingModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
