import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './common/mail/mail.module';
import { AuthModule } from './features/auth/auth.module';
import { UserProfileModule } from './features/user-profile/user-profile.module';
import { VendorProfileModule } from './features/vendor-profile/vendor-profile.module';
import { AdminProfileModule } from './features/admin-profile/admin-profile.module';
import { VehiclesModule } from './features/vehicles/vehicles.module';
import { VehicleImagesModule } from './features/vehicle-images/vehicle-images.module';
import { FavoritesModule } from './features/favorites/favorites.module';
import { PurchaseRequestsModule } from './features/purchase-requests/purchase-requests.module';
import { RentalRequestsModule } from './features/rental-requests/rental-requests.module';
import { ReviewsModule } from './features/reviews/reviews.module';
import { ReportsModule } from './features/reports/reports.module';
import { NotificationsModule } from './features/notifications/notifications.module';
import { ChatModule } from './features/chat/chat.module';
import { Vehicle3dModule } from './features/vehicle-3d/vehicle-3d.module';
import { AdminVendorsModule } from './features/admin-vendors/admin-vendors.module';
import { AdminAccountsModule } from './features/admin-accounts/admin-accounts.module';
import { AdminMessagingModule } from './features/admin-messaging/admin-messaging.module';
import { ConversationsModule } from './features/conversations/conversations.module';
import { ThreeDPrintRequestsModule } from './features/three-d-print-requests/three-d-print-requests.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    AuthModule,
    UserProfileModule,
    VendorProfileModule,
    AdminProfileModule,
    VehiclesModule,
    VehicleImagesModule,
    FavoritesModule,
    PurchaseRequestsModule,
    RentalRequestsModule,
    ReviewsModule,
    ReportsModule,
    NotificationsModule,
    ChatModule,
    Vehicle3dModule,
    AdminVendorsModule,
    AdminAccountsModule,
    AdminMessagingModule,
    ConversationsModule,
    ThreeDPrintRequestsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
