import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitPaymentSessions1700000005200 implements MigrationInterface {
  name = 'InitPaymentSessions1700000005200';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS payment_sessions (
        id CHAR(36) NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        code VARCHAR(32) NOT NULL,
        method ENUM('VNPAY') NOT NULL DEFAULT 'VNPAY',
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(6) NOT NULL DEFAULT 'VND',
        status ENUM('PENDING','PAID','FAILED','CANCELED') NOT NULL DEFAULT 'PENDING',
        orders_json JSON NOT NULL,
        payment_ref VARCHAR(64) NULL,
        payment_meta JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_payment_sessions_code (code),
        KEY IDX_payment_sessions_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS payment_sessions`);
  }
}
