import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  Res,
  HttpStatus,
} from '@nestjs/common';

import type { Response } from 'express';

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/constants/roles';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser('id') userId: number, @Res() res: Response) {
    const result = await this.usersService.findById(Number(userId));

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @Patch('me')
  async updateMe(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateMeDto,
    @Res() res: Response,
  ) {
    const result = await this.usersService.updateMe(Number(userId), dto);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @Delete('me')
  async deactivateMe(@CurrentUser('id') userId: number, @Res() res: Response) {
    await this.usersService.deactivate(Number(userId));

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        id: Number(userId),
        deactivated: true,
        message: 'Tài khoản đã được vô hiệu hóa',
      },
    });
  }

  @Roles(AppRole.ADMIN)
  @Post()
  async create(@Body() dto: CreateUserDto, @Res() res: Response) {
    const result = await this.usersService.create(dto);

    return res.status(HttpStatus.CREATED).json({
      success: true,
      statusCode: HttpStatus.CREATED,
      data: result,
    });
  }

  @Roles(AppRole.ADMIN)
  @Get()
  async findAll(@Query() q: QueryUserDto, @Res() res: Response) {
    const result = await this.usersService.findAll(q);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @Roles(AppRole.ADMIN)
  @Get('deactivated/all')
  async findAllDeactivated(@Query() q: QueryUserDto, @Res() res: Response) {
    const result = await this.usersService.findAllDeactivated(q);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @Roles(AppRole.ADMIN)
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const result = await this.usersService.findById(id);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @Roles(AppRole.ADMIN)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Res() res: Response,
  ) {
    const result = await this.usersService.update(id, dto);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @Roles(AppRole.ADMIN)
  @Delete(':id')
  async deactivate(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.usersService.deactivate(id);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        id,
        deactivated: true,
        message: 'Tài khoản đã được vô hiệu hóa',
      },
    });
  }
}