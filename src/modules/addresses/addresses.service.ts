import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Address } from './entities/address.entity';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Injectable()
export class AddressesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Address) private readonly addrRepo: Repository<Address>,
  ) {}

  private normalizePhone(phone?: string) {
    const raw = (phone ?? '').trim();
    if (!raw) {
      throw new BadRequestException('Số điện thoại không được để trống');
    }

    if (/^\+\d{8,15}$/.test(raw)) return raw;
    if (/^84\d{8,15}$/.test(raw)) return `+${raw}`;
    if (/^0\d{9,10}$/.test(raw)) return `+84${raw.slice(1)}`;

    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;

    throw new BadRequestException('Số điện thoại không hợp lệ');
  }

  private toDecimalString(value?: number) {
    if (value === undefined || value === null || Number.isNaN(value)) {
      return undefined;
    }
    return String(value);
  }

  async list(userId: number) {
    return this.addrRepo.find({
      where: { userId },
      order: { isDefault: 'DESC', id: 'DESC' },
    });
  }

  async create(userId: number, dto: CreateAddressDto) {
    return this.dataSource.transaction(async (trx) => {
      const repo = trx.getRepository(Address);

      const existingCount = await repo.count({ where: { userId } });

      // địa chỉ đầu tiên luôn là mặc định
      const shouldBeDefault = existingCount === 0 ? true : !!dto.isDefault;

      if (shouldBeDefault) {
        await repo.update({ userId }, { isDefault: false as any });
      }

      const row = repo.create({
        userId,
        fullName: dto.fullName.trim(),
        phone: this.normalizePhone(dto.phone),
        formattedAddress: dto.formattedAddress.trim(),
        placeId: dto.placeId?.trim() || undefined,
        lat: this.toDecimalString(dto.lat),
        lng: this.toDecimalString(dto.lng),
        isDefault: shouldBeDefault,
      });

      return repo.save(row);
    });
  }

  async update(userId: number, id: number, dto: UpdateAddressDto) {
    return this.dataSource.transaction(async (trx) => {
      const repo = trx.getRepository(Address);

      const addr = await repo.findOne({ where: { id, userId } });
      if (!addr) {
        throw new NotFoundException('Không tìm thấy địa chỉ');
      }

      if (dto.fullName !== undefined) {
        addr.fullName = dto.fullName.trim();
      }

      if (dto.phone !== undefined) {
        addr.phone = this.normalizePhone(dto.phone);
      }

      if (dto.formattedAddress !== undefined) {
        addr.formattedAddress = dto.formattedAddress.trim();
      }

      if (dto.placeId !== undefined) {
        addr.placeId = dto.placeId?.trim() || undefined;
      }

      if (dto.lat !== undefined) {
        addr.lat = this.toDecimalString(dto.lat);
      }

      if (dto.lng !== undefined) {
        addr.lng = this.toDecimalString(dto.lng);
      }

      if (dto.isDefault === true && !addr.isDefault) {
        await repo.update({ userId }, { isDefault: false as any });
        addr.isDefault = true;
      }

      const saved = await repo.save(addr);

      // nếu user chỉ có đúng 1 địa chỉ, luôn giữ nó là default
      const count = await repo.count({ where: { userId } });
      if (count === 1 && !saved.isDefault) {
        saved.isDefault = true;
        return repo.save(saved);
      }

      return saved;
    });
  }

  async remove(userId: number, id: number) {
    return this.dataSource.transaction(async (trx) => {
      const repo = trx.getRepository(Address);

      const addr = await repo.findOne({ where: { id, userId } });
      if (!addr) {
        throw new NotFoundException('Không tìm thấy địa chỉ');
      }

      const wasDefault = addr.isDefault;

      await repo.delete({ id, userId });

      if (wasDefault) {
        const fallback = await repo.findOne({
          where: { userId },
          order: { id: 'DESC' },
        });

        if (fallback) {
          fallback.isDefault = true;
          await repo.save(fallback);
        }
      }

      return { success: true };
    });
  }

  async setDefault(userId: number, id: number) {
    return this.dataSource.transaction(async (trx) => {
      const repo = trx.getRepository(Address);

      const addr = await repo.findOne({ where: { id, userId } });
      if (!addr) {
        throw new NotFoundException('Không tìm thấy địa chỉ');
      }

      await repo.update({ userId }, { isDefault: false as any });
      addr.isDefault = true;
      await repo.save(addr);

      return { success: true };
    });
  }
}