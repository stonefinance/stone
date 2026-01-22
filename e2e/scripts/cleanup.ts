import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const E2E_DIR = path.join(__dirname, '..');

async function main() {
  console.log('Cleaning up E2E test environment...\n');

  // Stop docker compose
  console.log('Stopping Docker Compose services...');
  try {
    execSync('docker compose -f docker-compose.e2e.yml down -v', {
      cwd: E2E_DIR,
      stdio: 'inherit',
    });
  } catch {
    console.log('Docker Compose already stopped or not running');
  }

  // Remove any leftover containers
  console.log('\nRemoving leftover containers...');
  try {
    execSync('docker compose -f docker-compose.e2e.yml rm -f', {
      cwd: E2E_DIR,
      stdio: 'inherit',
    });
  } catch {
    // Ignore errors
  }

  // Clean up chain data
  const chainDir = path.join(E2E_DIR, 'chain');
  if (fs.existsSync(chainDir)) {
    console.log('\nRemoving chain data...');
    fs.rmSync(chainDir, { recursive: true, force: true });
  }

  // Clean up deployment env file
  const envFile = path.join(E2E_DIR, '.env.deployment');
  if (fs.existsSync(envFile)) {
    console.log('Removing deployment env file...');
    fs.unlinkSync(envFile);
  }

  // Clean up test results
  const testResults = path.join(E2E_DIR, 'test-results');
  if (fs.existsSync(testResults)) {
    console.log('Removing test results...');
    fs.rmSync(testResults, { recursive: true, force: true });
  }

  const playwrightReport = path.join(E2E_DIR, 'playwright-report');
  if (fs.existsSync(playwrightReport)) {
    console.log('Removing Playwright report...');
    fs.rmSync(playwrightReport, { recursive: true, force: true });
  }

  console.log('\nCleanup complete!');
}

main().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
