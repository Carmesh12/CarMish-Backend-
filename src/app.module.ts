import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './features/auth/auth.module';
import { UserProfileModule } from './features/user-profile/user-profile.module';
import { VendorProfileModule } from './features/vendor-profile/vendor-profile.module';
import { AdminProfileModule } from './features/admin-profile/admin-profile.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UserProfileModule,
    VendorProfileModule,
    AdminProfileModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
