import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterShopsUserFkCascade1700000001400 implements MigrationInterface {
  name = 'AlterShopsUserFkCascade1700000001400';

  public async up(_q: QueryRunner): Promise<void> {
    // no-op:
    // FK_shops_user đã được tạo đúng với ON DELETE CASCADE ON UPDATE CASCADE từ InitShops.
  }

  public async down(_q: QueryRunner): Promise<void> {
    // no-op
  }
}