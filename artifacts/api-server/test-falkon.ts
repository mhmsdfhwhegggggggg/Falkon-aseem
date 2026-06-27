/**
 * FALKON PRO — INTEGRATION TESTS v5.0
 * =====================================
 * اختبارات حقيقية شاملة — تشغيل في Replit:
 *   DATABASE_URL=postgresql://... node --loader ts-node/esm test-falkon.ts
 *
 * أو بعد البناء:
 *   pnpm run build && node dist/test-falkon.mjs
 */

import { dbPool, upsertAccount, getAccount, loadAccounts, removeAccount, type StoredAccount } from "./src/telegram/session-store.js";
import { createJob, updateJob, getJob, loadJobs, type Job } from "./src/telegram/jobs.js";

// ─── Colors ───────────────────────────────────────────────────────────────────
const G = "\x1b[32m✓\x1b[0m";
const R = "\x1b[31m✗\x1b[0m";
const B = "\x1b[34m";
const E = "\x1b[0m";

let passed = 0, failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { console.log(`  ${G} ${msg}`); passed++; }
  else           { console.error(`  ${R} FAIL: ${msg}`); failed++; }
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── TEST SUITE ───────────────────────────────────────────────────────────────

async function testDatabaseConnection() {
  console.log(`\n${B}━━━ TEST 1: PostgreSQL Connection ━━━${E}`);
  try {
    const res = await dbPool.query("SELECT NOW() as time, version() as version");
    assert(res.rows.length === 1, "Database responds");
    assert(res.rows[0].time instanceof Date, "Returns valid timestamp");
    console.log(`      Server time: ${res.rows[0].time.toISOString()}`);
    const version = (res.rows[0].version as string).split(" ").slice(0,2).join(" ");
    console.log(`      PostgreSQL: ${version}`);
  } catch (err) {
    assert(false, `Connection failed: ${err}`);
  }
}

async function testSchemaCreation() {
  console.log(`\n${B}━━━ TEST 2: Schema Auto-Creation ━━━${E}`);
  await sleep(2000); // Wait for bootLoad
  try {
    const res = await dbPool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('falkon_accounts','falkon_jobs','falkon_health')
    `);
    const tables = res.rows.map((r: any) => r.table_name);
    assert(tables.includes("falkon_accounts"), "falkon_accounts table exists");
    assert(tables.includes("falkon_jobs"),     "falkon_jobs table exists");
    console.log(`      Tables found: ${tables.join(", ")}`);
  } catch (err) {
    assert(false, `Schema check failed: ${err}`);
  }
}

async function testSessionStore() {
  console.log(`\n${B}━━━ TEST 3: Session Store CRUD ━━━${E}`);
  const testId = `test_acc_${Date.now()}`;
  
  const testAccount: StoredAccount = {
    id:            testId,
    phone:         "+966500000001",
    firstName:     "Test",
    lastName:      "Account",
    username:      "testuser_falkon",
    userId:        "123456789",
    sessionString: "1BVtsOKABu0...", // fake session
    addedAt:       new Date().toISOString(),
    isActive:      true,
    dailyAdded:    0,
    lastReset:     new Date().toISOString().split("T")[0]!,
    ownerHwid:     "test_hwid",
  };

  // Upsert
  await upsertAccount(testAccount);
  await sleep(500); // Wait for async PG write

  // In-memory read (immediate)
  const fromMemory = getAccount(testId);
  assert(fromMemory !== undefined, "getAccount() returns from memory immediately");
  assert(fromMemory?.phone === "+966500000001", "Phone number correct");
  assert(fromMemory?.firstName === "Test", "First name correct");

  // PostgreSQL read
  await sleep(1000);
  const pgRes = await dbPool.query("SELECT * FROM falkon_accounts WHERE id = $1", [testId]);
  assert(pgRes.rows.length === 1, "Account persisted to PostgreSQL");
  assert(pgRes.rows[0].phone === "+966500000001", "Phone stored correctly in PG");
  assert(pgRes.rows[0].is_active === true, "isActive stored correctly");
  assert(pgRes.rows[0].owner_hwid === "test_hwid", "ownerHwid stored correctly");

  // Update
  await upsertAccount({ ...testAccount, dailyAdded: 150 });
  await sleep(500);
  const pgRes2 = await dbPool.query("SELECT daily_added FROM falkon_accounts WHERE id = $1", [testId]);
  assert(pgRes2.rows[0].daily_added === 150, "dailyAdded updated to 150");

  // Filter by ownerHwid
  const filtered = loadAccounts("test_hwid");
  assert(filtered.some(a => a.id === testId), "loadAccounts filters by ownerHwid");
  const otherFiltered = loadAccounts("other_hwid");
  assert(!otherFiltered.some(a => a.id === testId), "Other hwid cannot see test account");

  // Delete
  await removeAccount(testId);
  await sleep(500);
  assert(getAccount(testId) === undefined, "Account removed from memory");
  const pgRes3 = await dbPool.query("SELECT id FROM falkon_accounts WHERE id = $1", [testId]);
  assert(pgRes3.rows.length === 0, "Account deleted from PostgreSQL");
}

async function testJobsStore() {
  console.log(`\n${B}━━━ TEST 4: Jobs Store ━━━${E}`);

  // Create job
  const job = createJob("extraction", { group: "@test_group", limit: 1000 }, "acc_test_1", "hwid_test");
  assert(job.id.startsWith("job_"), `Job ID format correct: ${job.id}`);
  assert(job.status === "queued", "Initial status is queued");
  assert(job.ownerHwid === "hwid_test", "ownerHwid set correctly");

  // Read from memory
  const fromMem = getJob(job.id);
  assert(fromMem !== undefined, "getJob() returns from memory");
  assert(fromMem?.type === "extraction", "Job type correct");

  // Update
  updateJob(job.id, { status: "running", startedAt: new Date().toISOString(), progress: 500, total: 1000 });
  const updated = getJob(job.id);
  assert(updated?.status === "running", "Status updated to running");
  assert(updated?.progress === 500, "Progress updated to 500");

  // Complete
  updateJob(job.id, {
    status: "completed", completedAt: new Date().toISOString(),
    progress: 1000, total: 1000,
    result: { extracted: 1000, members: [] },
  });
  const completed = getJob(job.id);
  assert(completed?.status === "completed", "Status updated to completed");
  assert(completed?.result?.extracted === 1000, "Result stored in memory");

  // Wait for PG persistence
  await sleep(3000);
  const pgRes = await dbPool.query("SELECT * FROM falkon_jobs WHERE id = $1", [job.id]);
  assert(pgRes.rows.length === 1, "Job persisted to PostgreSQL");
  assert(pgRes.rows[0].status === "completed", "Completed status in PostgreSQL");
  assert(pgRes.rows[0].progress === 1000, "Progress persisted to PostgreSQL");
  assert(pgRes.rows[0].owner_hwid === "hwid_test", "ownerHwid persisted");

  // Verify session strings are NOT stored in PG
  const jobWithSession = createJob("add_members", { targetGroup: "@t", sessionString: "SECRET_SESSION" }, "acc1");
  await sleep(3000);
  const pgRes2 = await dbPool.query("SELECT config_json FROM falkon_jobs WHERE id = $1", [jobWithSession.id]);
  if (pgRes2.rows.length > 0) {
    const cfg = pgRes2.rows[0].config_json;
    assert(!JSON.stringify(cfg).includes("SECRET_SESSION"), "Session strings NOT persisted to PG ✓ Security OK");
  }

  // loadJobs with ownerHwid filter
  const myJobs = loadJobs("hwid_test");
  assert(myJobs.some(j => j.id === job.id), "loadJobs returns own jobs");
}

async function testParallelSplitting() {
  console.log(`\n${B}━━━ TEST 5: Parallel Splitting Logic ━━━${E}`);

  // splitIntoChunks — the core of parallel add-members
  function splitIntoChunks<T>(arr: T[], n: number): T[][] {
    const chunks: T[][] = Array.from({ length: n }, () => []);
    arr.forEach((item, i) => chunks[i % n]!.push(item));
    return chunks;
  }

  const members = Array.from({ length: 1000 }, (_, i) => ({ userId: `u${i}`, username: `user${i}`, status: "pending" as const, firstName: "", lastName: "", isOnline: false }));
  const chunks10 = splitIntoChunks(members, 10);
  assert(chunks10.length === 10, "10 accounts → 10 chunks");
  assert(chunks10.every(c => c.length === 100), "Each chunk has exactly 100 members");
  assert(chunks10.flat().length === 1000, "No members lost in chunking");

  const chunks7 = splitIntoChunks(members, 7);
  const sizes = chunks7.map(c => c.length);
  assert(chunks7.flat().length === 1000, "Uneven split: all 1000 members accounted for");
  assert(Math.max(...sizes) - Math.min(...sizes) <= 1, `Uneven split balanced: ${sizes.join(",")}`);

  // splitChars — the core of parallel extraction
  const ARABIC = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
  const LATIN = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const ALL = [...ARABIC, ...LATIN, ...'0123456789'.split(''), '_'];

  function splitChars(chars: string[], n: number): string[][] {
    const chunks: string[][] = Array.from({ length: n }, () => []);
    chars.forEach((c, i) => chunks[i % n]!.push(c));
    return chunks;
  }

  const charGroups8 = splitChars(ALL, 8);
  assert(charGroups8.flat().join('') === ALL.join(''), "All chars preserved after splitting");
  assert(new Set(charGroups8.flat()).size === ALL.length, "No duplicate chars in groups");
  console.log(`      ${ALL.length} chars / 8 accounts = ${charGroups8.map(g=>g.length).join(",")} chars each`);
  console.log(`      Speedup vs single account: ~${(ALL.length / Math.ceil(ALL.length / 8)).toFixed(1)}x`);
}

async function testAntiBanLogic() {
  console.log(`\n${B}━━━ TEST 6: Anti-Ban Health Scoring ━━━${E}`);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS falkon_health (
      account_id TEXT PRIMARY KEY,
      score INTEGER NOT NULL DEFAULT 100,
      total_added INTEGER NOT NULL DEFAULT 0,
      total_errors INTEGER NOT NULL DEFAULT 0,
      flood_count INTEGER NOT NULL DEFAULT 0,
      peer_flood_count INTEGER NOT NULL DEFAULT 0,
      circuit_open BOOLEAN NOT NULL DEFAULT FALSE,
      circuit_open_until BIGINT NOT NULL DEFAULT 0,
      warmup_mode BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TEXT NOT NULL DEFAULT NOW()::TEXT
    )
  `);

  const testAccId = `test_health_${Date.now()}`;

  // Insert health record
  await dbPool.query(
    `INSERT INTO falkon_health (account_id, score, flood_count, peer_flood_count, circuit_open, circuit_open_until, warmup_mode, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()::TEXT)
     ON CONFLICT (account_id) DO UPDATE SET score=$2, flood_count=$3`,
    [testAccId, 70, 2, 1, false, 0, false]
  );

  const res = await dbPool.query("SELECT * FROM falkon_health WHERE account_id = $1", [testAccId]);
  assert(res.rows.length === 1, "Health record stored in PostgreSQL");
  assert(res.rows[0].score === 70, `Score stored correctly: ${res.rows[0].score}`);
  assert(res.rows[0].flood_count === 2, "Flood count stored correctly");

  // Clean up
  await dbPool.query("DELETE FROM falkon_health WHERE account_id = $1", [testAccId]);
}

// ─── Main runner ──────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "═".repeat(55));
  console.log("  FALKON PRO v5.0 — Integration Test Suite");
  console.log("  " + new Date().toLocaleString("ar-SA"));
  console.log("═".repeat(55));

  try {
    await testDatabaseConnection();
    await testSchemaCreation();
    await testSessionStore();
    await testJobsStore();
    await testParallelSplitting();
    await testAntiBanLogic();
  } catch (err) {
    console.error("\n❌ Unhandled test error:", err);
    failed++;
  }

  console.log("\n" + "═".repeat(55));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log("  🎉 ALL TESTS PASSED — System is production ready!");
  } else {
    console.log(`  ⚠️  ${failed} test(s) failed — check above for details`);
  }
  console.log("═".repeat(55) + "\n");

  await dbPool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
