import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitShopStats1700000001300 implements MigrationInterface {
  name = 'InitShopStats1700000001300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`shop_stats\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`shop_id\` INT UNSIGNED NOT NULL,

        \`product_count\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`total_sold\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`total_revenue\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`total_orders\` INT UNSIGNED NOT NULL DEFAULT 0,

        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_shop_stats_shop_id\` (\`shop_id\`),

        CONSTRAINT \`FK_shop_stats_shop\`
          FOREIGN KEY (\`shop_id\`)
          REFERENCES \`shops\`(\`id\`)
          ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cân nhắc: chỉ drop nếu bạn thật sự muốn rollback xóa luôn bảng này
    await queryRunner.query(`
      DROP TABLE IF EXISTS \`shop_stats\`;
    `);
  }
}
