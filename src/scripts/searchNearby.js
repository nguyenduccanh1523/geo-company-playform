/**
 * Demo: Tìm kiếm công ty gần khách sạn bằng Google Places API
 *
 * Cách sử dụng:
 * 1. Set GOOGLE_PLACES_API_KEY trong .env
 * 2. Chạy: npm run search:nearby
 */

import dotenv from "dotenv";
import { pool } from "../config/database.js";
import GooglePlacesService from "../services/googlePlacesService.js";
import CompanyImportService from "../services/companyImportService.js";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🏨 SEARCH NEARBY COMPANIES (Google Places)              ║
╚════════════════════════════════════════════════════════════╝
  `);

  try {
    // 1. Kiểm tra Google Places API Key
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!googleApiKey) {
      throw new Error(
        "❌ GOOGLE_PLACES_API_KEY not found in .env\n" +
          "   Get it from: https://cloud.google.com/maps-platform/\n" +
          "   Add to .env: GOOGLE_PLACES_API_KEY=your_api_key",
      );
    }

    // 2. Lấy hotel từ database
    const hotelRes = await pool.query(
      `SELECT hv.id, hv.name, hv.lat, hv.lng
       FROM hotel_version hv
       WHERE hv.lat IS NOT NULL AND hv.lng IS NOT NULL
       ORDER BY hv.created_at DESC
       LIMIT 1`,
    );

    if (hotelRes.rows.length === 0) {
      console.log("⚠️  Không tìm thấy hotel nào trong database");
      console.log("\n💡 Hướng dẫn:");
      console.log("   1. Nhập khách sạn vào database trước");
      console.log("   2. Chạy: npm run db:seed");
      process.exit(1);
    }

    const hotel = hotelRes.rows[0];
    console.log(`\n✅ Hotel Found:`);
    console.log(`   Name: ${hotel.name}`);
    console.log(`   Location: ${hotel.lat}, ${hotel.lng}`);

    // 3. Initialize services
    const googlePlaces = new GooglePlacesService(googleApiKey);
    const companyImport = new CompanyImportService(googlePlaces);

    // 4. Tìm kiếm công ty gần khách sạn
    const batchId = uuidv4();
    const radius = process.argv[2] ? parseInt(process.argv[2]) : 100; // Default 100km

    console.log(`\n🔍 Starting search for companies within ${radius}km...`);
    console.log(`   Batch ID: ${batchId}\n`);

    const result = await companyImport.importCompaniesAroundHotel(
      hotel.id,
      {
        name: hotel.name,
        lat: hotel.lat,
        lng: hotel.lng,
      },
      radius,
      batchId,
    );

    console.log(`\n✅ Import Complete!`);
    console.log(`   Total Found: ${result.total_found}`);
    console.log(`   Imported: ${result.imported}`);
    console.log(`   Linked: ${result.linked}`);
    console.log(`   Errors: ${result.errors.length}`);

    // 5. Hiển thị statistics
    const stats = await companyImport.getStatistics(hotel.id);
    console.log(`\n📊 Statistics:`);
    console.log(`   Total Companies: ${stats.total_companies}`);
    console.log(`   Within 10km: ${stats.within_10km}`);
    console.log(`   Within 25km: ${stats.within_25km}`);
    console.log(`   Within 50km: ${stats.within_50km}`);
    console.log(`   Avg Distance: ${stats.avg_distance}km`);
    console.log(`   Min Distance: ${stats.min_distance}km`);
    console.log(`   Max Distance: ${stats.max_distance}km`);
    console.log(`   Industries: ${stats.industries_count}`);

    // 6. Hiển thị top 10 công ty gần nhất
    const companies = await companyImport.getCompaniesNearHotel(
      hotel.id,
      radius,
      10,
    );
    console.log(`\n🏢 Top 10 Nearest Companies:\n`);
    companies.forEach((company, idx) => {
      console.log(`${idx + 1}. ${company.name} (${company.distance_km}km)`);
      console.log(`   Industry: ${company.industry}`);
      console.log(`   Address: ${company.address}`);
      if (company.phone) console.log(`   Phone: ${company.phone}`);
      if (company.website) console.log(`   Website: ${company.website}`);
      console.log("");
    });

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors during import:\n`);
      result.errors.slice(0, 5).forEach((err) => {
        console.log(`   - ${err.business}: ${err.error}`);
      });
    }

    console.log(
      `\n✨ Done! Companies are now in database and linked to hotel.`,
    );
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
