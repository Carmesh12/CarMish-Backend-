import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './features/auth/auth.module';
import { UserProfileModule } from './features/user-profile/user-profile.module';
import { VendorProfileModule } from './features/vendor-profile/vendor-profile.module';
import { AdminProfileModule } from './features/admin-profile/admin-profile.module';
import { VehiclesModule } from './features/vehicles/vehicles.module';
import { VehicleImagesModule } from './features/vehicle-images/vehicle-images.module';
import { FavoritesModule } from './features/favorites/favorites.module';
import { PurchaseRequestsModule } from './features/purchase-requests/purchase-requests.module';
import { ReviewsModule } from './features/reviews/reviews.module';
import { ReportsModule } from './features/reports/reports.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UserProfileModule,
    VendorProfileModule,
    AdminProfileModule,
    VehiclesModule,
    VehicleImagesModule,
    FavoritesModule,
    PurchaseRequestsModule,
    ReviewsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
