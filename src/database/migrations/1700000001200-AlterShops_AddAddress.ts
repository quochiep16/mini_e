import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterShopsAddAddress1700000001200 implements MigrationInterface {
  name = 'AlterShopsAddAddress1700000001200';

  public async up(q: QueryRunner): Promise<void> {
    // Đổi phone -> shop_phone (nếu cột phone đã tồn tại)
    await q.query(`
      ALTER TABLE \`shops\`
      CHANGE COLUMN \`phone\` \`shop_phone\` VARCHAR(30) NULL;
    `);

    // Thêm các cột địa chỉ
    await q.query(`
      ALTER TABLE \`shops\`
        ADD COLUMN \`shop_address\` VARCHAR(255) NULL AFTER \`description\`,
        ADD COLUMN \`shop_lat\` DECIMAL(10,7) NULL AFTER \`shop_address\`,
        ADD COLUMN \`shop_lng\` DECIMAL(10,7) NULL AFTER \`shop_lat\`,
        ADD COLUMN \`shop_place_id\` VARCHAR(191) NULL AFTER \`shop_lng\`;
    `);

    await q.query(`CREATE INDEX \`shops_placeId_idx\` ON \`shops\`(\`shop_place_id\`);`);
    await q.query(`CREATE INDEX \`shops_phone_idx\` ON \`shops\`(\`shop_phone\`);`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`shops_phone_idx\` ON \`shops\`;`);
    await q.query(`DROP INDEX \`shops_placeId_idx\` ON \`shops\`;`);

    await q.query(`
      ALTER TABLE \`shops\`
        DROP COLUMN \`shop_place_id\`,
        DROP COLUMN \`shop_lng\`,
        DROP COLUMN \`shop_lat\`,
        DROP COLUMN \`shop_address\`;
    `);

    await q.query(`
      ALTER TABLE \`shops\`
      CHANGE COLUMN \`shop_phone\` \`phone\` VARCHAR(30) NULL;
    `);
  }
}
