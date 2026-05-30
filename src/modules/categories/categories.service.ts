import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product } from '../products/entities/product.entity';
import { UserRole } from '../users/enums/user.enum';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { SearchCategoriesDto } from './dto/search-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

type CategoryNode = Category & {
  children: CategoryNode[];
};

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,

    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  private assertAdmin(role?: UserRole) {
    if (role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ ADMIN mới được thao tác category');
    }
  }

  private assertSellerOrAdmin(role?: UserRole) {
    if (role !== UserRole.SELLER && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ SELLER hoặc ADMIN mới được lấy danh sách category này');
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

  private normalizeText(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed || null;
  }

  private async slugExists(slug: string, ignoreId?: number): Promise<boolean> {
    const qb = this.categoriesRepo
      .createQueryBuilder('category')
      .withDeleted()
      .where('category.slug = :slug', { slug });

    if (ignoreId) {
      qb.andWhere('category.id != :ignoreId', { ignoreId });
    }

    return (await qb.getCount()) > 0;
  }

  private async ensureUniqueSlug(
    input: string,
    ignoreId?: number,
  ): Promise<string> {
    const base = this.slugify(input);
    let candidate = base;
    let suffix = 1;

    while (await this.slugExists(candidate, ignoreId)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
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
      throw new BadRequestException('Không thể chọn chính nó làm category cha');
    }

    const parent = await this.categoriesRepo.findOne({
      where: {
        id: parentId,
      },
      select: {
        id: true,
        parentId: true,
        isActive: true,
      },
    });

    if (!parent) {
      throw new BadRequestException('Category cha không tồn tại');
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
        select: {
          id: true,
          parentId: true,
        },
      });

      parentId = parent?.parentId;
    }
  }

  private buildTree(items: Category[]): CategoryNode[] {
    const byId = new Map<number, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const item of items) {
      byId.set(item.id, {
        ...item,
        children: [],
      });
    }

    for (const item of items) {
      const node = byId.get(item.id);

      if (!node) {
        continue;
      }

      if (item.parentId && byId.has(item.parentId)) {
        byId.get(item.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  private formatSellerOption(category: Category, allById: Map<number, Category>) {
    const names: string[] = [category.name];

    let parentId = category.parentId;
    let safeLoop = 0;

    while (parentId && safeLoop < 20) {
      const parent = allById.get(parentId);

      if (!parent) {
        break;
      }

      names.unshift(parent.name);
      parentId = parent.parentId;
      safeLoop += 1;
    }

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
      imageUrl: category.imageUrl,
      sortOrder: category.sortOrder,
      fullName: names.join(' / '),
    };
  }

  async create(role: UserRole, dto: CreateCategoryDto) {
    this.assertAdmin(role);

    const name = dto.name?.trim();

    if (!name) {
      throw new BadRequestException('Tên category không được để trống');
    }

    if (dto.parentId) {
      await this.ensureParentValid(dto.parentId);
    }

    const slug = await this.ensureUniqueSlug(dto.slug || name);

    try {
      const category = this.categoriesRepo.create({
        name,
        slug,
        description: this.normalizeText(dto.description),
        imageUrl: this.normalizeText(dto.imageUrl),
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

  /**
   * User home:
   * chỉ lấy category gốc trên cùng.
   */
  async findHomeRootCategories() {
    return this.categoriesRepo
      .createQueryBuilder('category')
      .where('category.is_active = :isActive', { isActive: true })
      .andWhere('category.parent_id IS NULL')
      .orderBy('category.sort_order', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .getMany();
  }

  /**
   * Public tree:
   * lấy toàn bộ category active rồi build cây.
   */
  async findActiveTree() {
    const items = await this.categoriesRepo
      .createQueryBuilder('category')
      .where('category.is_active = :isActive', { isActive: true })
      .orderBy('category.sort_order', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .getMany();

    return this.buildTree(items);
  }

  /**
   * Seller/Admin thêm sản phẩm:
   * lấy tất cả category active, gồm cha/con/cháu.
   * fullName giúp FE hiển thị dạng: Cha / Con / Cháu
   */
  async findSellerOptions(role: UserRole) {
    this.assertSellerOrAdmin(role);

    const items = await this.categoriesRepo
      .createQueryBuilder('category')
      .where('category.is_active = :isActive', { isActive: true })
      .orderBy('category.sort_order', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .getMany();

    const allById = new Map<number, Category>();

    for (const item of items) {
      allById.set(item.id, item);
    }

    return items.map((category) => this.formatSellerOption(category, allById));
  }

  /**
   * Admin list:
   * lấy cả active/inactive, search, lọc parent, lọc trạng thái, phân trang.
   */
  async findAllForAdmin(role: UserRole, query: SearchCategoriesDto) {
    this.assertAdmin(role);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'sortOrder';
    const sortOrder = (query.sortOrder ?? 'ASC').toUpperCase() as 'ASC' | 'DESC';

    const sortColumnMap: Record<string, string> = {
      id: 'category.id',
      name: 'category.name',
      slug: 'category.slug',
      sortOrder: 'category.sortOrder',
      createdAt: 'category.createdAt',
      updatedAt: 'category.updatedAt',
    };

    const qb = this.categoriesRepo.createQueryBuilder('category');

    if (query.q?.trim()) {
      qb.andWhere(
        '(category.name LIKE :keyword OR category.slug LIKE :keyword OR CAST(category.id AS CHAR) LIKE :keyword)',
        {
          keyword: `%${query.q.trim()}%`,
        },
      );
    }

    if (query.parentId !== undefined) {
      qb.andWhere('category.parentId = :parentId', {
        parentId: query.parentId,
      });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('category.isActive = :isActive', {
        isActive: query.isActive,
      });
    }

    qb.orderBy(sortColumnMap[sortBy] ?? 'category.sortOrder', sortOrder)
      .addOrderBy('category.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
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

    category.children = (category.children ?? []).filter(
      (child) => child.isActive && !child.deletedAt,
    );

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
        throw new BadRequestException('Tên category không được để trống');
      }

      category.name = name;
    }

    if (dto.description !== undefined) {
      category.description = this.normalizeText(dto.description);
    }

    if (dto.imageUrl !== undefined) {
      category.imageUrl = this.normalizeText(dto.imageUrl);
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
        throw new BadRequestException('Slug không được để trống');
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

    /**
     * Vì đây là soft delete nên DB không tự ON DELETE SET NULL.
     * Ta chủ động xử lý:
     * - con của category bị xóa sẽ thành category gốc
     * - sản phẩm đang gắn category này sẽ set categoryId = null
     */
    await this.categoriesRepo
      .createQueryBuilder()
      .update(Category)
      .set({
        parentId: null,
      })
      .where('parent_id = :id', { id })
      .execute();

    await this.productsRepo
      .createQueryBuilder()
      .update(Product)
      .set({
        categoryId: null,
      } as any)
      .where('category_id = :id', { id })
      .execute();

    await this.categoriesRepo.softDelete({
      id: category.id,
    });

    return {
      id: category.id,
      deleted: true,
    };
  }
}