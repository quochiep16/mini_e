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

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // CREATE
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
  @Get()
  async findAll(@Query() q: QueryUserDto, @Res() res: Response) {
    const result = await this.usersService.findAll(q);
    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result, // { items, meta }
    });
  }

  // GET BY ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const result = await this.usersService.findById(id);
    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  // UPDATE
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

  // DELETE (soft)
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
