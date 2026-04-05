import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest(err: any, user: any) {
    // If there is an error or no user, just return undefined instead of throwing
    return err || !user ? undefined : user;
  }
}
