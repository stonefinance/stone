import { setTimeout } from 'timers/promises';

interface ServiceConfig {
  name: string;
  url: string;
  healthCheck?: (response: Response) => Promise<boolean>;
}

const services: ServiceConfig[] = [
  {
    name: 'wasmd (blockchain)',
    url: 'http://localhost:26657/status',
    healthCheck: async (response) => {
      const data = await response.json();
      return data.result?.sync_info?.catching_up === false;
    },
  },
  {
    name: 'postgres (database)',
    url: 'http://localhost:5432',
    // TCP check handled differently
  },
  {
    name: 'indexer (GraphQL)',
    url: 'http://localhost:4000/health',
  },
  {
    name: 'frontend (Next.js)',
    url: 'http://localhost:3000',
  },
];

async function checkService(service: ServiceConfig): Promise<boolean> {
  try {
    const response = await fetch(service.url);
    if (!response.ok) return false;
    if (service.healthCheck) {
      return await service.healthCheck(response);
    }
    return true;
  } catch {
    return false;
  }
}

async function waitForService(
  service: ServiceConfig,
  maxRetries: number,
  delayMs: number
): Promise<void> {
  console.log(`Waiting for ${service.name}...`);

  for (let i = 0; i < maxRetries; i++) {
    const isHealthy = await checkService(service);
    if (isHealthy) {
      console.log(`${service.name} is ready!`);
      return;
    }
    console.log(`  Attempt ${i + 1}/${maxRetries}...`);
    await setTimeout(delayMs);
  }

  throw new Error(`${service.name} did not become ready in time`);
}

async function main() {
  const maxRetries = parseInt(process.env.MAX_RETRIES || '60', 10);
  const delayMs = parseInt(process.env.DELAY_MS || '2000', 10);

  console.log('Waiting for all services to be ready...\n');

  // Wait for services in order (some depend on others)
  const serviceOrder = ['wasmd (blockchain)', 'indexer (GraphQL)', 'frontend (Next.js)'];

  for (const serviceName of serviceOrder) {
    const service = services.find(s => s.name === serviceName);
    if (service) {
      await waitForService(service, maxRetries, delayMs);
    }
  }

  console.log('\nAll services are ready!');
}

main().catch((error) => {
  console.error('Service readiness check failed:', error.message);
  process.exit(1);
});
