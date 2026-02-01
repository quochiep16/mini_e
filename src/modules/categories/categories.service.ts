import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Not, Repository } from 'typeorm';
import { Gender, UserRole } from '../users/enums/user.enum'; 
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { SearchCategoriesDto } from './dto/search-categories.dto';
import { IsNull } from 'typeorm';


@Injectable()
export class CategoriesService {
  constructor(@InjectRepository(Category) private readonly categoriesRepo: Repository<Category>) {}

  private isUniqueViolation(e: any) {
    return e?.code === 'ER_DUP_ENTRY' || /unique/i.test(e?.message ?? '');
  }

  private slugify(input: string): string {
    const base = (input ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'category';
  }

  private async ensureUniqueSlug(base: string, ignoreId?: number): Promise<string> {
    const slugBase = this.slugify(base);
    let candidate = slugBase;
    let suffix = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await this.categoriesRepo.exists({
        where: {
          slug: candidate,
          ...(ignoreId ? { id: Not(ignoreId) } : {}),
        },
      });
      if (!exists) return candidate;
      suffix += 1;
      candidate = `${slugBase}-${suffix}`;
    }
  }

  private assertAdmin(role: UserRole) {
    if (role !== UserRole.ADMIN) throw new ForbiddenException('Chỉ ADMIN mới được thao tác');
  }

  async create(role: UserRole, dto: CreateCategoryDto) {
    this.assertAdmin(role);

    if (dto.parentId) {
      const parent = await this.categoriesRepo.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException('parentId không tồn tại');
    }

    const slug = await this.ensureUniqueSlug(dto.slug ?? dto.name);

    try {
      const cat = this.categoriesRepo.create({
        name: dto.name.trim(),
        slug,
        description: dto.description ?? null,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      });
      return await this.categoriesRepo.save(cat);
    } catch (e) {
      if (this.isUniqueViolation(e)) throw new ConflictException('Slug category đã tồn tại');
      throw e;
    }
  }

  async findAllPublic(query: SearchCategoriesDto) {
    const where: any = { deletedAt: null };

    if (query.parentId !== undefined) where.parentId = query.parentId;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    else where.isActive = true;

    if (query.q?.trim()) {
      // đơn giản: q match name hoặc slug
      where.name = Like(`%${query.q.trim()}%`);
    }

    const items = await this.categoriesRepo.find({
      where,
      order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
    });

    return items;
  }

  async findTreePublic() {
    const items = await this.categoriesRepo.find({
      where: { isActive: true, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
    });

    const byId = new Map<number, any>();
    items.forEach((c) => byId.set(c.id, { ...c, children: [] }));

    const roots: any[] = [];
    for (const c of items) {
      const node = byId.get(c.id);
      if (c.parentId && byId.has(c.parentId)) {
        byId.get(c.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async findOnePublic(id: number) {
    const cat = await this.categoriesRepo.findOne({ where: { isActive: true, deletedAt: IsNull() },
 });
    if (!cat) throw new NotFoundException('Không tìm thấy category');
    return cat;
  }

  async update(role: UserRole, id: number, dto: UpdateCategoryDto) {
    this.assertAdmin(role);

    const cat = await this.categoriesRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Không tìm thấy category');

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        cat.parentId = null;
      } else {
        if (dto.parentId === id) throw new BadRequestException('parentId không hợp lệ');
        const parent = await this.categoriesRepo.findOne({ where: { id: dto.parentId } });
        if (!parent) throw new BadRequestException('parentId không tồn tại');
        cat.parentId = dto.parentId;
      }
    }

    if (dto.name !== undefined) cat.name = dto.name.trim();
    if (dto.description !== undefined) cat.description = dto.description ?? null;
    if (dto.sortOrder !== undefined) cat.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) cat.isActive = dto.isActive;

    if (dto.slug?.trim()) {
      cat.slug = await this.ensureUniqueSlug(dto.slug, cat.id);
    } else if (dto.name?.trim()) {
      // nếu đổi name mà không truyền slug -> tự update slug unique theo name
      cat.slug = await this.ensureUniqueSlug(dto.name, cat.id);
    }

    try {
      return await this.categoriesRepo.save(cat);
    } catch (e) {
      if (this.isUniqueViolation(e)) throw new ConflictException('Slug category đã tồn tại');
      throw e;
    }
  }

  async remove(role: UserRole, id: number) {
    this.assertAdmin(role);

    const cat = await this.categoriesRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Không tìm thấy category');

    // soft delete (giữ lịch sử)
    await this.categoriesRepo.softDelete({ id });
    return { success: true };
  }
}
