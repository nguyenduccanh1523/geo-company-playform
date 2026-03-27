/**
 * BATCH SAVE WORKER
 *
 * Xử lý: Nhận batch từ queue → Lưu vào DB
 * Chạy song song, không block main thread
 */

import { companyBatchQueue } from "../config/queue.js";
import { CompanyRepository } from "../modules/company/company.repository.js";
import { createLogger } from "../shared/utils/logger.js";

const logger = createLogger("BatchSaveWorker");

// Process 5 jobs in parallel
companyBatchQueue.process(5, async (job) => {
  const { companies, sessionId, batchNumber } = job.data;

  logger.info(
    `⏳ Processing batch ${batchNumber}: ${companies.length} companies`,
  );

  const result = {
    saved: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Save each company
    for (const company of companies) {
      try {
        // Check duplicate
        const existing = await CompanyRepository.findByPlaceId(
          company.place_id,
        );
        if (existing) {
          logger.debug(`Duplicate found: ${company.place_id}`);
          continue;
        }

        // Save
        await CompanyRepository.create({
          ...company,
          source_id: "google_places",
          external_id: company.place_id,
        });

        result.saved++;
        logger.debug(`✅ Saved: ${company.name}`);
      } catch (error) {
        result.failed++;
        result.errors.push({
          company: company.name,
          error: error.message,
        });
        logger.error(`❌ Failed to save ${company.name}:`, error.message);
      }
    }

    logger.info(
      `✅ Batch ${batchNumber} complete: ${result.saved} saved, ${result.failed} failed`,
    );

    return result;
  } catch (error) {
    logger.error(`❌ Batch ${batchNumber} error:`, error);
    throw error; // Retry on error
  }
});

// Event handlers
companyBatchQueue.on("completed", (job, result) => {
  logger.info(`✅ Job ${job.id} completed`);
});

companyBatchQueue.on("failed", (job, error) => {
  logger.error(`❌ Job ${job.id} failed:`, error.message);
});

companyBatchQueue.on("stalled", (job) => {
  logger.warn(`⚠️  Job ${job.id} stalled`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Shutting down worker...");
  await companyBatchQueue.close();
  process.exit(0);
});

logger.info("🚀 Batch save worker started");

export default companyBatchQueue;
