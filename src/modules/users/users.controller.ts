import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, ParseIntPipe,
  Res, HttpStatus,
} from '@nestjs/common';

import type { Response } from 'express';

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/constants/roles';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  
  //get me
  @Get('me')
  async me(@CurrentUser('sub') sub: number, @Res() res: Response) {
    const userId = Number(sub);
    const result = await this.usersService.findById(userId);
    return res.status(HttpStatus.OK).json({ success: true, statusCode: HttpStatus.OK, data: result });
  }

  @Patch('me')
  async updateMe(@CurrentUser('sub') sub: number, @Body() dto: UpdateUserDto, @Res() res: Response) {
    const userId = Number(sub);
    delete (dto as any).role;
    const result = await this.usersService.update(userId, dto);
    return res.status(HttpStatus.OK).json({ success: true, statusCode: HttpStatus.OK, data: result });
  }

  @Delete('me')
  async deleteMe(@CurrentUser('sub') sub: number, @Res() res: Response) {
    const userId = Number(sub);
    await this.usersService.softDelete(userId);
    return res.status(HttpStatus.OK).json({ success: true, statusCode: HttpStatus.OK, data: { id: userId, deleted: true } });
  }

  // CREATE
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

  // GET ALL
  @Roles(AppRole.ADMIN)
  @Get()
  async findAll(@Query() q: QueryUserDto, @Res() res: Response) {
    const result = await this.usersService.findAll(q);
    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result, // { items, meta }
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
      data: { id, deleted: true },
    });
  }
  // (tuỳ chọn) DELETE (hard)
  @Delete(':id/hard')
  async hardRemove(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.usersService.hardDelete(id);
    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: { id, deleted: true },
    });
  }
  // (tuỳ chọn) RESTORE
  @Post(':id/restore')
  async restore(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    await this.usersService.restore(id);
    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: { id, restored: true },
    });
  }

  // (tuỳ chọn) Lấy danh sách đã xoá
  @Get('deleted/all')
  async findAllDeleted(@Query() q: QueryUserDto, @Res() res: Response) {
    const result = await this.usersService.findAllDeleted(q);
    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result, // { items, meta }
    });
  }

}
