import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateUsersEmailPhoneNullable1700000000100 implements MigrationInterface {
  name = 'UpdateUsersEmailPhoneNullable1700000000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE users SET email = NULL WHERE email = ''`);
    await queryRunner.query(`UPDATE users SET phone = NULL WHERE phone = ''`);
    await queryRunner.query(`UPDATE users SET email = LOWER(email) WHERE email IS NOT NULL`);
    await queryRunner.query(`
      UPDATE users
      SET phone = CONCAT('+84', SUBSTRING(phone, 2))
      WHERE phone REGEXP '^0[0-9]{9,10}$'
    `);

    await queryRunner.query(`ALTER TABLE users MODIFY email VARCHAR(320) NULL`);
    await queryRunner.query(`ALTER TABLE users MODIFY phone VARCHAR(20) NULL`);

    const indexes: Array<{ INDEX_NAME: string }> = await queryRunner.query(`
      SELECT DISTINCT INDEX_NAME
      FROM information_schema.statistics
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME IN ('email', 'phone')
        AND INDEX_NAME <> 'PRIMARY'
    `);

    for (const row of indexes) {
      try {
        await queryRunner.query(`DROP INDEX \`${row.INDEX_NAME}\` ON users`);
      } catch {}
    }

    await queryRunner.query(`CREATE UNIQUE INDEX users_email_uq ON users (email)`);
    await queryRunner.query(`CREATE UNIQUE INDEX users_phone_uq ON users (phone)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`DROP INDEX users_email_uq ON users`);
    } catch {}
    try {
      await queryRunner.query(`DROP INDEX users_phone_uq ON users`);
    } catch {}

    try {
      await queryRunner.query(`CREATE UNIQUE INDEX users_email_uq ON users (email)`);
    } catch {}
    try {
      await queryRunner.query(`CREATE INDEX users_phone_idx ON users (phone)`);
    } catch {}
  }
}