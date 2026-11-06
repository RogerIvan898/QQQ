// Runs every src/**/*.test.ts file (plain node:assert scripts) and fails on the first error.
const files = [...new Bun.Glob('src/**/*.test.{ts,tsx}').scanSync('.')].sort();

for (const file of files) {
  const { exitCode } = Bun.spawnSync(['bun', file], {
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  if (exitCode !== 0) {
    console.error(`✗ ${file}`);
    process.exit(exitCode ?? 1);
  }
  console.log(`✓ ${file}`);
}

console.log(`${files.length} test file(s) passed`);
