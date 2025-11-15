import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard'; // dùng guard hiện có của bạn

@Controller('addresses')
@UseGuards(AccessTokenGuard)
export class AddressesController {
  constructor(private readonly service: AddressesService) {}

  @Get()
  async list(@CurrentUser('sub') userId: number) {
    const data = await this.service.list(userId);
    return { success: true, data };
  }

  @Post()
  async create(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateAddressDto,
  ) {
    const data = await this.service.create(userId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  async update(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAddressDto,
  ) {
    const data = await this.service.update(userId, id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  async remove(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.service.remove(userId, id);
    return { success: true, data };
  }

  @Patch(':id/set-default')
  async setDefault(
    @CurrentUser('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.service.setDefault(userId, id);
    return { success: true, data };
  }
}
