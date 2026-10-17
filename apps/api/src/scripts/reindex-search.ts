import { prisma } from '../lib/prisma.js';
import { reindexAll } from '../search/indexer.js';
import { getEmbeddingProvider } from '../search/embeddings.js';
import { collectionName } from '../search/vector-store.js';

async function main() {
  console.log(`Embedding provider: ${getEmbeddingProvider().id}; collection: ${collectionName()}`);
  console.log(await reindexAll());
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); setTimeout(() => process.exit(), 200); });
