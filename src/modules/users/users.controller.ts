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
import { Roles } from 'src/common/decorators/roles.decorator';
import { AppRole } from 'src/common/constants/roles';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  
  //get me
  @Get('me')
  async me(@CurrentUser() user: { id: number }, @Res() res: Response) {
    const result = await this.usersService.findById(user.id);
    return res.status(HttpStatus.OK).json({ success: true, statusCode: HttpStatus.OK, data: result });
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: { id: number },
    @Body() dto: UpdateUserDto,
    @Res() res: Response,
  ) {
    delete (dto as any).role;
    // delete (dto as any).isVerified;

    const result = await this.usersService.update(user.id, dto);
    return res.status(HttpStatus.OK).json({ success: true, statusCode: HttpStatus.OK, data: result });
  }

  // Xoá mềm tài khoản của tôi
  @Delete('me')
  async deleteMe(@CurrentUser() user: { id: number }, @Res() res: Response) {
    await this.usersService.softDelete(user.id);
    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: { id: user.id, deleted: true },
    });
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
