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
  async deleteMe(@CurrentUser('id') userId: number, @Res() res: Response) {
    await this.usersService.softDelete(Number(userId));

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        id: Number(userId),
        deleted: true,
        message: 'Tài khoản đã được xóa mềm',
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
  @Get('deleted/all')
  async findAllDeleted(@Query() q: QueryUserDto, @Res() res: Response) {
    const result = await this.usersService.findAllDeleted(q);

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
  async remove(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.usersService.softDelete(id);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        id,
        deleted: true,
        message: 'User đã được xóa mềm',
      },
    });
  }

  @Roles(AppRole.ADMIN)
  @Post(':id/restore')
  async restore(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.usersService.restore(id);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        id,
        restored: true,
      },
    });
  }

  @Roles(AppRole.ADMIN)
  @Delete(':id/hard')
  async hardRemove(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.usersService.hardDelete(id);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        id,
        deleted: true,
        hardDeleted: true,
        message: 'User đã được xóa cứng',
      },
    });
  }
}