import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitShopStats1700000001300 implements MigrationInterface {
  name = 'InitShopStats1700000001300';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // no-op:
    // shop_stats đã được tạo đầy đủ trong InitShops1700000001000.
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // no-op
  }
}