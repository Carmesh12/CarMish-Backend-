import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './features/auth/auth.module';
import { UserProfileModule } from './features/user-profile/user-profile.module';

@Module({
  imports: [PrismaModule, AuthModule, UserProfileModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
