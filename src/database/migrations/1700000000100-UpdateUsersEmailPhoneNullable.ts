import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateUsersEmailPhoneNullable1700000009999 implements MigrationInterface {
  name = 'UpdateUsersEmailPhoneNullable1700000009999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Dọn dữ liệu rác: '' -> NULL
    await queryRunner.query(`UPDATE users SET email = NULL WHERE email = ''`);
    await queryRunner.query(`UPDATE users SET phone = NULL WHERE phone = ''`);

    // 2) Chuẩn hoá email: lowercase
    await queryRunner.query(`UPDATE users SET email = LOWER(email) WHERE email IS NOT NULL`);

    // 3) Chuẩn hoá phone VN: 0xxxxxxxxx -> +84xxxxxxxxx
    // (chỉ áp dụng cho số bắt đầu bằng 0 và dài 10-11)
    await queryRunner.query(`
      UPDATE users
      SET phone = CONCAT('+84', SUBSTRING(phone, 2))
      WHERE phone REGEXP '^0[0-9]{9,10}$'
    `);

    // 4) Đổi cột thành NULLABLE (và đúng kích thước)
    await queryRunner.query(`ALTER TABLE users MODIFY email VARCHAR(320) NULL`);
    await queryRunner.query(`ALTER TABLE users MODIFY phone VARCHAR(20) NULL`);

    // 5) Drop tất cả index đang nằm trên email/phone (trừ PRIMARY)
    // để tránh lỗi "Duplicate key name" hoặc trùng index cũ
    const indexes: Array<{ INDEX_NAME: string }> = await queryRunner.query(`
      SELECT DISTINCT INDEX_NAME
      FROM information_schema.statistics
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME IN ('email', 'phone')
        AND INDEX_NAME <> 'PRIMARY'
    `);

    for (const row of indexes) {
      const idx = row.INDEX_NAME;
      try {
        await queryRunner.query(`DROP INDEX \`${idx}\` ON users`);
      } catch {
        // ignore nếu index không tồn tại
      }
    }

    // 6) Tạo UNIQUE index (MySQL cho phép nhiều NULL trong UNIQUE)
    await queryRunner.query(`CREATE UNIQUE INDEX users_email_uq ON users (email)`);
    await queryRunner.query(`CREATE UNIQUE INDEX users_phone_uq ON users (phone)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // rollback: bỏ unique
    try {
      await queryRunner.query(`DROP INDEX users_email_uq ON users`);
    } catch {}
    try {
      await queryRunner.query(`DROP INDEX users_phone_uq ON users`);
    } catch {}

    // tạo lại index thường (tuỳ bạn có cần không)
    try {
      await queryRunner.query(`CREATE INDEX users_email_idx ON users (email)`);
    } catch {}
    try {
      await queryRunner.query(`CREATE INDEX users_phone_idx ON users (phone)`);
    } catch {}

    // Không ép NOT NULL lại để tránh lỗi dữ liệu
  }
}
