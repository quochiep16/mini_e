import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTypeormMetadata1700000002800 implements MigrationInterface {
  name = 'CreateTypeormMetadata1700000002800';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS \`typeorm_metadata\` (
        \`type\` varchar(255) NOT NULL,
        \`database\` varchar(255) NULL,
        \`schema\` varchar(255) NULL,
        \`table\` varchar(255) NULL,
        \`name\` varchar(255) NULL,
        \`value\` text NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Có thể giữ lại để TypeORM dùng lâu dài; nhưng nếu muốn rollback:
    await q.query('DROP TABLE IF EXISTS `typeorm_metadata`;');
  }
}
