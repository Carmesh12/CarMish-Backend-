import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { GetReviewsDto } from './dto/get-reviews.dto';

type JwtUser = { id: string; email: string; role: string };

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('vehicles/:vehicleId/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  create(
    @CurrentUser() user: JwtUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.id, vehicleId, dto);
  }

  @Get('vehicles/:vehicleId/reviews')
  findAllByVehicle(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: GetReviewsDto,
  ) {
    return this.reviewsService.findAllByVehicle(vehicleId, query.page, query.limit);
  }

  @Patch('reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(user.id, id, dto);
  }

  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.USER)
  remove(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviewsService.remove(user.id, id);
  }
}
