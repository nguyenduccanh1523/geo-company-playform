// ============================================
// CRAWLER HELPER - Dedup, Versioning, Change Detection
// ============================================
// Utilities for:
// - Deduplication (name matching, fuzzy search)
// - Change detection (what changed between versions)
// - Version creation (with smart defaults)
// - Data quality checks
// ============================================

import { database } from "../database.js";

// Similarity threshold (0-1) for considering records as duplicates
const SIMILARITY_THRESHOLD = 0.85;
const FIELD_CONFIDENCE = {
  name: 0.95,
  industry: 0.7,
  address: 0.8,
  website: 0.95,
  email: 0.98,
};

export class CrawlerHelper {
  // ============================================
  // DEDUP: Simple String Similarity (Levenshtein)
  // ============================================
  static stringSimilarity(str1, str2) {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0;

    const matrix = Array(s2.length + 1)
      .fill(null)
      .map(() => Array(s1.length + 1).fill(0));

    for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= s2.length; j++) {
      for (let i = 1; i <= s1.length; i++) {
        const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator,
        );
      }
    }

    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return 1 - distance / maxLength;
  }

  // ============================================
  // DEDUP: Find Potential Duplicates (Companies)
  // ============================================
  static async findDuplicateCompanies(newCompany, projectId) {
    // Get all active companies in project
    const result = await database.query(
      `SELECT 
        c.id,
        c.confidence_score,
        cv.name,
        cv.industry,
        cv.address,
        cv.website,
        cv.email
      FROM company c
      JOIN company_version cv ON c.current_version_id = cv.id
      WHERE c.project_id = $1
        AND c.status = 'active'
      LIMIT 1000`,
      [projectId],
    );

    const candidates = [];

    for (const existing of result.rows) {
      // Score each field match
      const scores = {};
      let weightedSum = 0;
      let weightSum = 0;

      if (newCompany.name && existing.name) {
        const nameSim = this.stringSimilarity(newCompany.name, existing.name);
        scores.name = nameSim;
        weightedSum += nameSim * FIELD_CONFIDENCE.name;
        weightSum += FIELD_CONFIDENCE.name;
      }

      if (newCompany.website && existing.website) {
        const websiteSim = this.stringSimilarity(
          newCompany.website,
          existing.website,
        );
        scores.website = websiteSim;
        weightedSum += websiteSim * FIELD_CONFIDENCE.website;
        weightSum += FIELD_CONFIDENCE.website;
      }

      if (newCompany.email && existing.email) {
        const emailSim = this.stringSimilarity(
          newCompany.email,
          existing.email,
        );
        scores.email = emailSim;
        weightedSum += emailSim * FIELD_CONFIDENCE.email;
        weightSum += FIELD_CONFIDENCE.email;
      }

      if (newCompany.address && existing.address) {
        const addressSim = this.stringSimilarity(
          newCompany.address,
          existing.address,
        );
        scores.address = addressSim;
        weightedSum += addressSim * FIELD_CONFIDENCE.address;
        weightSum += FIELD_CONFIDENCE.address;
      }

      if (weightSum > 0) {
        const overallScore = weightedSum / weightSum;

        if (overallScore >= SIMILARITY_THRESHOLD) {
          candidates.push({
            id: existing.id,
            name: existing.name,
            matchScore: overallScore,
            fieldScores: scores,
          });
        }
      }
    }

    return candidates.sort((a, b) => b.matchScore - a.matchScore);
  }

  // ============================================
  // DEDUP: Find Potential Duplicates (People)
  // ============================================
  static async findDuplicatePeople(newPerson, projectId) {
    const result = await database.query(
      `SELECT 
        p.id,
        pv.full_name,
        pv.email,
        pv.linkedin_url
      FROM person p
      JOIN person_version pv ON p.current_version_id = pv.id
      WHERE p.project_id = $1
        AND p.status = 'active'
      LIMIT 1000`,
      [projectId],
    );

    const candidates = [];

    for (const existing of result.rows) {
      const scores = {};
      let weightedSum = 0;
      let weightSum = 0;

      if (newPerson.full_name && existing.full_name) {
        const nameSim = this.stringSimilarity(
          newPerson.full_name,
          existing.full_name,
        );
        scores.name = nameSim;
        weightedSum += nameSim * 0.9;
        weightSum += 0.9;
      }

      if (newPerson.email && existing.email) {
        const emailSim = this.stringSimilarity(newPerson.email, existing.email);
        scores.email = emailSim;
        weightedSum += emailSim * 0.98;
        weightSum += 0.98;
      }

      if (weightSum > 0) {
        const overallScore = weightedSum / weightSum;

        if (overallScore >= SIMILARITY_THRESHOLD) {
          candidates.push({
            id: existing.id,
            name: existing.full_name,
            matchScore: overallScore,
            fieldScores: scores,
          });
        }
      }
    }

    return candidates.sort((a, b) => b.matchScore - a.matchScore);
  }

  // ============================================
  // CHANGE DETECTION: Compare Two Versions
  // ============================================
  static detectChanges(oldVersion, newVersion) {
    const changes = {};
    const fieldsToCheck = [
      "name",
      "industry",
      "address",
      "lat",
      "lng",
      "website",
      "email",
      "phone",
      "description",
    ];

    fieldsToCheck.forEach((field) => {
      const oldVal = oldVersion[field];
      const newVal = newVersion[field];

      if (oldVal !== newVal) {
        changes[field] = {
          old: oldVal,
          new: newVal,
          changed: true,
        };
      }
    });

    return changes;
  }

  // ============================================
  // QUALITY: Normalize Company Data
  // ============================================
  static normalizeCompany(data) {
    return {
      name: data.name?.trim() || null,
      industry: data.industry?.trim() || null,
      address: data.address?.trim() || null,
      website: this.normalizeUrl(data.website),
      email: this.normalizeEmail(data.email),
      phone: this.normalizePhone(data.phone),
      description: data.description?.trim() || null,
      lat: data.lat ? parseFloat(data.lat) : null,
      lng: data.lng ? parseFloat(data.lng) : null,
    };
  }

  // ============================================
  // QUALITY: Normalize Person Data
  // ============================================
  static normalizePerson(data) {
    return {
      full_name: data.full_name?.trim() || null,
      title: data.title?.trim() || null,
      bio: data.bio?.trim() || null,
      email: this.normalizeEmail(data.email),
      phone: this.normalizePhone(data.phone),
      linkedin_url: this.normalizeUrl(data.linkedin_url),
    };
  }

  // ============================================
  // UTILITY: Normalize URL
  // ============================================
  static normalizeUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      return u.hostname + (u.pathname === "/" ? "" : u.pathname);
    } catch {
      return null;
    }
  }

  // ============================================
  // UTILITY: Normalize Email
  // ============================================
  static normalizeEmail(email) {
    if (!email) return null;
    return email.toLowerCase().trim();
  }

  // ============================================
  // UTILITY: Normalize Phone
  // ============================================
  static normalizePhone(phone) {
    if (!phone) return null;
    return phone.replace(/\D/g, "");
  }

  // ============================================
  // QUALITY: Calculate Data Quality Score
  // ============================================
  static calculateQualityScore(data) {
    const fields = Object.keys(data);
    const filledFields = fields.filter(
      (f) => data[f] !== null && data[f] !== "",
    );
    const completeness = filledFields.length / fields.length;

    // Weight by importance
    const importantFields = ["name", "industry", "address"];
    const importantFilled = importantFields.filter(
      (f) => data[f] && data[f] !== "",
    );
    const importance = importantFilled.length / importantFields.length;

    // Score is average of completeness and importance
    return (completeness + importance) / 2;
  }

  // ============================================
  // VERSION: Create Version with Smart Defaults
  // ============================================
  static prepareVersionData(rawData, entityType) {
    if (entityType === "company") {
      const normalized = this.normalizeCompany(rawData);
      return {
        ...normalized,
        data_quality_score: this.calculateQualityScore(normalized),
        is_verified: false,
        raw_data: rawData,
      };
    } else if (entityType === "person") {
      const normalized = this.normalizePerson(rawData);
      return {
        ...normalized,
        data_quality_score: this.calculateQualityScore(normalized),
        is_verified: false,
        raw_data: rawData,
      };
    }

    return rawData;
  }

  // ============================================
  // CHECK: Is Data Valid for Creating Record?
  // ============================================
  static isValidCompanyData(data) {
    // Must have at least name and one contact method
    const hasName = data.name && data.name.trim().length > 0;
    const hasContact =
      (data.website && data.website.length > 0) ||
      (data.email && data.email.length > 0) ||
      (data.phone && data.phone.length > 0);

    return hasName && hasContact;
  }

  static isValidPersonData(data) {
    // Must have name
    const hasName = data.full_name && data.full_name.trim().length > 0;
    return hasName;
  }

  // ============================================
  // STATS: Batch Quality Analysis
  // ============================================
  static async analyzeBatchQuality(batchId) {
    const result = await database.query(
      `SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'duplicate' THEN 1 END) as duplicates,
        COUNT(CASE WHEN is_new THEN 1 END) as new_records,
        COUNT(CASE WHEN is_updated THEN 1 END) as updated_records,
        AVG(processing_time_ms)::INT as avg_processing_time
      FROM crawl_item
      WHERE batch_id = $1`,
      [batchId],
    );

    const stats = result.rows[0];

    return {
      summary: {
        totalItems: parseInt(stats.total_items),
        successRate: ((stats.successful / stats.total_items) * 100).toFixed(1),
        duplicateRate: ((stats.duplicates / stats.total_items) * 100).toFixed(
          1,
        ),
        newData: stats.new_records,
        updatedData: stats.updated_records,
        avgProcessingTime: stats.avg_processing_time,
      },
      quality: this.calculateQualityFromStats(stats),
    };
  }

  // ============================================
  // UTILITY: Calculate Quality from Stats
  // ============================================
  static calculateQualityFromStats(stats) {
    const successRate = stats.successful / stats.total_items;
    const duplicateRate = stats.duplicates / stats.total_items;
    const dataNewness =
      (stats.new_records + stats.updated_records) / stats.total_items;

    // Quality score: 60% success, 20% low duplicate, 20% data freshness
    const quality =
      successRate * 0.6 + (1 - duplicateRate) * 0.2 + dataNewness * 0.2;

    return {
      score: quality.toFixed(3),
      status:
        quality >= 0.9
          ? "excellent"
          : quality >= 0.8
            ? "good"
            : quality >= 0.7
              ? "acceptable"
              : "poor",
      issues: this.getQualityIssues(stats),
    };
  }

  // ============================================
  // UTILITY: Get Quality Issues
  // ============================================
  static getQualityIssues(stats) {
    const issues = [];

    const successRate = stats.successful / stats.total_items;
    if (successRate < 0.9) {
      issues.push(`Low success rate: ${(successRate * 100).toFixed(1)}%`);
    }

    const duplicateRate = stats.duplicates / stats.total_items;
    if (duplicateRate > 0.1) {
      issues.push(`High duplicate rate: ${(duplicateRate * 100).toFixed(1)}%`);
    }

    const newData = stats.new_records + stats.updated_records;
    if (newData / stats.total_items < 0.1) {
      issues.push("Very little new or updated data");
    }

    return issues;
  }

  // ============================================
  // UTILITY: Adjust Threshold
  // ============================================
  static setDuplicateThreshold(threshold) {
    if (threshold >= 0 && threshold <= 1) {
      SIMILARITY_THRESHOLD = threshold;
    }
  }

  // ============================================
  // UTILITY: Get Threshold
  // ============================================
  static getConfig() {
    return {
      similarityThreshold: SIMILARITY_THRESHOLD,
      fieldConfidence: FIELD_CONFIDENCE,
    };
  }
}

export default CrawlerHelper;
