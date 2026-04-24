import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { UserRole } from '../users/enums/user.enum';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { SearchCategoriesDto } from './dto/search-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,

    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  private assertAdmin(role: UserRole) {
    if (role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ ADMIN mới được thao tác category');
    }
  }

  private isUniqueViolation(error: any) {
    return (
      error?.code === 'ER_DUP_ENTRY' ||
      error?.errno === 1062 ||
      /unique/i.test(error?.message ?? '')
    );
  }

  private slugify(input: string): string {
    const base = (input ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return base || 'category';
  }

  private async slugExists(slug: string, ignoreId?: number): Promise<boolean> {
    const qb = this.categoriesRepo
      .createQueryBuilder('category')
      .withDeleted()
      .where('category.slug = :slug', { slug });

    if (ignoreId) {
      qb.andWhere('category.id != :ignoreId', { ignoreId });
    }

    const count = await qb.getCount();

    return count > 0;
  }

  private async ensureUniqueSlug(base: string, ignoreId?: number): Promise<string> {
    const slugBase = this.slugify(base);

    let candidate = slugBase;
    let suffix = 1;

    while (await this.slugExists(candidate, ignoreId)) {
      suffix += 1;
      candidate = `${slugBase}-${suffix}`;
    }

    return candidate;
  }

  private async findCategoryOrFail(id: number): Promise<Category> {
    const category = await this.categoriesRepo.findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Không tìm thấy category');
    }

    return category;
  }

  private async ensureParentValid(parentId: number, currentId?: number) {
    if (currentId && parentId === currentId) {
      throw new BadRequestException('parentId không hợp lệ');
    }

    const parent = await this.categoriesRepo.findOne({
      where: { id: parentId },
    });

    if (!parent) {
      throw new BadRequestException('parentId không tồn tại');
    }

    if (currentId) {
      await this.ensureNoParentCycle(currentId, parentId);
    }

    return parent;
  }

  private async ensureNoParentCycle(currentId: number, newParentId: number) {
    let parentId: number | null | undefined = newParentId;

    while (parentId) {
      if (parentId === currentId) {
        throw new BadRequestException(
          'Không thể chọn category con/cháu làm category cha',
        );
      }

      const parent = await this.categoriesRepo.findOne({
        where: { id: parentId },
        select: ['id', 'parentId'],
      });

      parentId = parent?.parentId;
    }
  }

  async create(role: UserRole, dto: CreateCategoryDto) {
    this.assertAdmin(role);

    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('name không được để trống');
    }

    if (dto.parentId) {
      await this.ensureParentValid(dto.parentId);
    }

    const slug = await this.ensureUniqueSlug(dto.slug?.trim() || name);

    try {
      const category = this.categoriesRepo.create({
        name,
        slug,
        description: dto.description?.trim() || null,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      });

      return await this.categoriesRepo.save(category);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Slug category đã tồn tại');
      }

      throw error;
    }
  }

  async findAllPublic(query: SearchCategoriesDto) {
    const qb = this.categoriesRepo.createQueryBuilder('category');

    if (query.parentId !== undefined) {
      qb.andWhere('category.parent_id = :parentId', {
        parentId: query.parentId,
      });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('category.is_active = :isActive', {
        isActive: query.isActive,
      });
    } else {
      qb.andWhere('category.is_active = :isActive', {
        isActive: true,
      });
    }

    if (query.q?.trim()) {
      qb.andWhere('(category.name LIKE :keyword OR category.slug LIKE :keyword)', {
        keyword: `%${query.q.trim()}%`,
      });
    }

    return qb
      .orderBy('category.sort_order', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .getMany();
  }

  async findTreePublic() {
    const items = await this.categoriesRepo.find({
      where: {
        isActive: true,
      },
      order: {
        sortOrder: 'ASC',
        name: 'ASC',
        id: 'ASC',
      },
    });

    const byId = new Map<number, Category & { children: any[] }>();

    for (const category of items) {
      byId.set(category.id, {
        ...category,
        children: [],
      });
    }

    const roots: Array<Category & { children: any[] }> = [];

    for (const category of items) {
      const node = byId.get(category.id);

      if (!node) {
        continue;
      }

      if (category.parentId && byId.has(category.parentId)) {
        byId.get(category.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async findOnePublic(id: number) {
    const category = await this.categoriesRepo.findOne({
      where: {
        id,
        isActive: true,
      },
      relations: {
        parent: true,
        children: true,
      },
      order: {
        children: {
          sortOrder: 'ASC',
          name: 'ASC',
          id: 'ASC',
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Không tìm thấy category');
    }

    category.children = (category.children ?? []).filter((child) => child.isActive);

    return category;
  }

  async update(role: UserRole, id: number, dto: UpdateCategoryDto) {
    this.assertAdmin(role);

    const category = await this.findCategoryOrFail(id);

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        category.parentId = null;
      } else {
        await this.ensureParentValid(dto.parentId, id);
        category.parentId = dto.parentId;
      }
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      if (!name) {
        throw new BadRequestException('name không được để trống');
      }

      category.name = name;
    }

    if (dto.description !== undefined) {
      category.description = dto.description?.trim() || null;
    }

    if (dto.sortOrder !== undefined) {
      category.sortOrder = dto.sortOrder;
    }

    if (dto.isActive !== undefined) {
      category.isActive = dto.isActive;
    }

    if (dto.slug !== undefined) {
      const slugInput = dto.slug.trim();

      if (!slugInput) {
        throw new BadRequestException('slug không được để trống');
      }

      category.slug = await this.ensureUniqueSlug(slugInput, category.id);
    } else if (dto.name !== undefined) {
      category.slug = await this.ensureUniqueSlug(category.name, category.id);
    }

    try {
      return await this.categoriesRepo.save(category);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Slug category đã tồn tại');
      }

      throw error;
    }
  }

  async remove(role: UserRole, id: number) {
    this.assertAdmin(role);

    const category = await this.findCategoryOrFail(id);

    const childCount = await this.categoriesRepo.count({
      where: {
        parentId: id,
      },
    });

    if (childCount > 0) {
      throw new BadRequestException(
        'Category đang có category con, không thể xóa. Hãy xóa hoặc chuyển category con trước.',
      );
    }

    const productCount = await this.productsRepo
      .createQueryBuilder('product')
      .where('product.category_id = :categoryId', { categoryId: id })
      .getCount();

    if (productCount > 0) {
      throw new BadRequestException(
        'Category đang có sản phẩm, không thể xóa. Bạn nên tắt isActive thay vì xóa.',
      );
    }

    await this.categoriesRepo.softDelete({
      id: category.id,
    });

    return {
      id: category.id,
      deleted: true,
    };
  }
}