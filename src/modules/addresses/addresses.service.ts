import {
  Injectable,
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

  async list(userId: number) {
    return this.addrRepo.find({
      where: { userId },
      order: { isDefault: 'DESC', id: 'DESC' },
    });
  }

  async create(userId: number, dto: CreateAddressDto) {
    return this.dataSource.transaction(async (trx) => {
      const repo = trx.getRepository(Address);
      if (dto.isDefault) {
        await repo.update({ userId }, { isDefault: false as any });
      }
      const row = repo.create({
        userId,
        fullName: dto.fullName.trim(),
        phone: dto.phone.trim(),
        formattedAddress: dto.formattedAddress.trim(),
        placeId: dto.placeId ?? null,
        lat: dto.lat != null ? (dto.lat as any) : null,
        lng: dto.lng != null ? (dto.lng as any) : null,
        isDefault: !!dto.isDefault,
      });
      return await repo.save(row);
    });
  }

  async update(userId: number, id: number, dto: UpdateAddressDto) {
    const addr = await this.addrRepo.findOne({ where: { id, userId } });
    if (!addr) throw new NotFoundException('Không tìm thấy địa chỉ');

    if (dto.fullName !== undefined) addr.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) addr.phone = dto.phone.trim();
    if (dto.formattedAddress !== undefined)
      addr.formattedAddress = dto.formattedAddress.trim();
    if (dto.placeId !== undefined) addr.placeId = dto.placeId ?? null;
    if (dto.lat !== undefined) addr.lat = (dto.lat as any) ?? null;
    if (dto.lng !== undefined) addr.lng = (dto.lng as any) ?? null;

    return this.addrRepo.save(addr);
  }

  async remove(userId: number, id: number) {
    const addr = await this.addrRepo.findOne({ where: { id, userId } });
    if (!addr) throw new NotFoundException('Không tìm thấy địa chỉ');
    await this.addrRepo.delete({ id, userId });
    return { success: true };
  }

  async setDefault(userId: number, id: number) {
    const addr = await this.addrRepo.findOne({ where: { id, userId } });
    if (!addr) throw new NotFoundException('Không tìm thấy địa chỉ');

    await this.dataSource.transaction(async (trx) => {
      const repo = trx.getRepository(Address);
      await repo.update({ userId }, { isDefault: false as any });
      addr.isDefault = true;
      await repo.save(addr);
    });

    return { success: true };
  }
}
