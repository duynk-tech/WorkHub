/**
 * Trình cài đặt WorkHub — chạy: npm run setup
 *
 * 1. Hỏi thông tin kết nối MySQL và kiểm tra kết nối
 * 2. Tạo database nếu chưa có (utf8mb4)
 * 3. Sinh khóa bảo mật và ghi file .env
 * 4. Chạy prisma migrate deploy + seed
 * 5. Tạo tài khoản quản trị
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';

const ROOT = join(import.meta.dirname, '..');
const ENV_PATH = join(ROOT, '.env');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
};

const log = {
  title: (s: string) => console.log(`\n${c.bold}${c.cyan}${s}${c.reset}`),
  ok: (s: string) => console.log(`${c.green}✓${c.reset} ${s}`),
  warn: (s: string) => console.log(`${c.yellow}!${c.reset} ${s}`),
  err: (s: string) => console.log(`${c.red}✗${c.reset} ${s}`),
  info: (s: string) => console.log(`${c.dim}  ${s}${c.reset}`),
};

const rl = createInterface({ input: stdin, output: stdout });

async function ask(question: string, fallback = ''): Promise<string> {
  const suffix = fallback ? ` ${c.dim}(${fallback})${c.reset}` : '';
  const answer = (await rl.question(`${c.blue}?${c.reset} ${question}${suffix}: `)).trim();
  return answer || fallback;
}

async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
  const answer = await ask(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'}`, defaultYes ? 'y' : 'n');
  return answer.toLowerCase().startsWith('y');
}

function run(command: string, env: Record<string, string> = {}) {
  execSync(command, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
}

async function main() {
  console.log(`
${c.bold}${c.cyan}╔══════════════════════════════════════════╗
║          WorkHub — Trình cài đặt         ║
║   Công việc · Nghỉ phép · Duyệt · Công   ║
╚══════════════════════════════════════════╝${c.reset}`);

  if (existsSync(ENV_PATH)) {
    log.warn('Đã tồn tại file .env');
    if (!(await askYesNo('Ghi đè cấu hình hiện tại?', false))) {
      log.info('Giữ nguyên .env. Chạy tiếp migrate + seed…');
      await migrateAndSeed();
      rl.close();
      return;
    }
  }

  // ── 1. Thông tin kết nối MySQL ──
  log.title('1/5 · Kết nối MySQL');
  const host = await ask('Máy chủ MySQL', '127.0.0.1');
  const port = await ask('Cổng', '3306');
  const user = await ask('Tên người dùng', 'root');
  const password = await ask('Mật khẩu', '');
  const database = await ask('Tên database', 'workhub');

  log.info('Đang kiểm tra kết nối…');
  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection({ host, port: Number(port), user, password, multipleStatements: true });
    const [rows] = await connection.query('SELECT VERSION() AS version');
    log.ok(`Kết nối thành công — ${(rows as { version: string }[])[0].version}`);
  } catch (e) {
    log.err(`Không kết nối được: ${e instanceof Error ? e.message : e}`);
    log.info('Kiểm tra lại máy chủ MySQL đang chạy và thông tin đăng nhập.');
    rl.close();
    process.exit(1);
  }

  // ── 2. Tạo database ──
  log.title('2/5 · Khởi tạo database');
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  log.ok(`Database "${database}" sẵn sàng (utf8mb4)`);

  const shadowDb = `${database}_shadow`;
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${shadowDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    log.ok(`Database shadow "${shadowDb}" sẵn sàng (phục vụ migrate)`);
  } catch {
    log.warn('Không tạo được database shadow — chỉ ảnh hưởng khi phát triển migration mới');
  }
  await connection.end();

  // ── 3. Ghi .env ──
  log.title('3/5 · Sinh cấu hình');
  const appUrl = await ask('Địa chỉ ứng dụng', 'http://localhost:3000');
  const appName = await ask('Tên hệ thống hiển thị', 'WorkHub');
  const enableScheduler = await askYesNo('Bật bộ lập lịch nội bộ (nhắc việc, chốt công)?', true);

  const encode = encodeURIComponent;
  const databaseUrl = `mysql://${encode(user)}${password ? `:${encode(password)}` : ''}@${host}:${port}/${database}`;
  const shadowUrl = `mysql://${encode(user)}${password ? `:${encode(password)}` : ''}@${host}:${port}/${shadowDb}`;

  const envContent = `# Sinh bởi npm run setup — ${new Date().toISOString()}
DATABASE_URL="${databaseUrl}"
SHADOW_DATABASE_URL="${shadowUrl}"

APP_URL="${appUrl}"
APP_NAME="${appName}"

AUTH_SECRET="${randomBytes(48).toString('base64')}"
APP_ENCRYPTION_KEY="${randomBytes(32).toString('base64')}"
CRON_SECRET="${randomBytes(24).toString('hex')}"

ENABLE_SCHEDULER="${enableScheduler}"
TZ="Asia/Ho_Chi_Minh"
`;

  writeFileSync(ENV_PATH, envContent, 'utf8');
  log.ok('Đã ghi file .env với khóa bảo mật sinh ngẫu nhiên');

  // ── 4. Migrate + seed ──
  await migrateAndSeed();

  // ── 5. Tài khoản quản trị ──
  log.title('5/5 · Tài khoản quản trị');
  const adminUsername = await ask('Tên đăng nhập quản trị', 'admin');
  let adminPassword = await ask('Mật khẩu quản trị (tối thiểu 8 ký tự)', '');
  while (adminPassword && adminPassword.length < 8) {
    log.warn('Mật khẩu quá ngắn');
    adminPassword = await ask('Mật khẩu quản trị', '');
  }
  const adminName = await ask('Họ tên quản trị', 'Quản trị hệ thống');
  const adminEmail = await ask('Email quản trị', 'admin@workhub.local');

  run('npx tsx prisma/seed/index.ts', {
    SEED_ADMIN_USERNAME: adminUsername,
    SEED_ADMIN_PASSWORD: adminPassword || 'Admin@123',
    SEED_ADMIN_NAME: adminName,
    SEED_ADMIN_EMAIL: adminEmail,
  });

  console.log(`
${c.green}${c.bold}╔══════════════════════════════════════════╗
║           CÀI ĐẶT HOÀN TẤT ✓             ║
╚══════════════════════════════════════════╝${c.reset}

  ${c.bold}Khởi chạy:${c.reset}      npm run dev     ${c.dim}(phát triển)${c.reset}
                   npm run build && npm start   ${c.dim}(chạy thật)${c.reset}

  ${c.bold}Truy cập:${c.reset}       ${appUrl}
  ${c.bold}Đăng nhập:${c.reset}      ${adminUsername} / ${adminPassword || 'Admin@123'}

  ${c.dim}Sau khi đăng nhập, vào Cấu hình → Zalo Bot để kết nối bot,
  và Cấu hình → Tích hợp & MCP để cấp API key cho trợ lý AI.${c.reset}
`);

  rl.close();
}

async function migrateAndSeed() {
  log.title('4/5 · Tạo bảng và dữ liệu khởi tạo');
  log.info('Sinh Prisma Client…');
  run('npx prisma generate');

  log.info('Áp dụng migration…');
  try {
    run('npx prisma migrate deploy');
  } catch {
    log.warn('migrate deploy thất bại — thử đồng bộ schema trực tiếp (db push)');
    run('npx prisma db push --accept-data-loss');
  }
  log.ok('Cấu trúc database đã sẵn sàng');

  const withDemo = await askYesNo('Nạp dữ liệu demo (cây phòng ban, 14 nhân sự, công việc mẫu)?', false);
  if (withDemo) {
    run('npx tsx prisma/seed/index.ts --demo', { SEED_DEMO_PASSWORD: 'Workhub@123' });
    log.ok('Đã nạp dữ liệu demo — mật khẩu tài khoản demo: Workhub@123');
  } else {
    run('npx tsx prisma/seed/index.ts');
  }
  log.ok('Đã nạp quyền, vai trò, loại nghỉ phép, ca làm việc, quy trình duyệt mặc định');
}

main().catch((e) => {
  log.err(e instanceof Error ? e.message : String(e));
  rl.close();
  process.exit(1);
});
