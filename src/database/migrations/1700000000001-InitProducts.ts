import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitProducts1700000000001 implements MigrationInterface {
  name = 'InitProducts1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`products\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(255) NOT NULL,
        \`description\` TEXT NULL,
        \`price\` DECIMAL(10,2) NOT NULL,
        \`stock\` INT UNSIGNED NOT NULL,
        \`categoryId\` INT UNSIGNED NULL,
        \`createdAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deletedAt\` DATETIME(6) NULL,
        CONSTRAINT \`PK_products_id\` PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await queryRunner.query(`CREATE INDEX \`products_name_idx\` ON \`products\` (\`name\`);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`products_name_idx\` ON \`products\`;`);
    await queryRunner.query(`DROP TABLE \`products\`;`);
  }
}