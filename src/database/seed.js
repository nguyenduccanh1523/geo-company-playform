/**
 * Seed Script - Nhập dữ liệu mẫu
 */

import { query } from "../config/database.js";
import * as companyRepository from "./repositories/companyRepository.js";
import { v4 as uuidv4 } from "uuid";

async function seedDatabase() {
  console.log("🌱 Bắt đầu nhập dữ liệu mẫu...\n");

  try {
    // 1. Tạo DataSources
    console.log("📝 Tạo data sources...");
    const sources = [
      { name: "Google Places API", type: "api" },
      { name: "Eventbrite API", type: "api" },
      { name: "Meetup API", type: "api" },
      { name: "LinkedIn Scraper", type: "scraper" },
    ];

    const sourceIds = {};
    for (const source of sources) {
      const result = await query(
        "INSERT INTO data_source (id, name, type) VALUES ($1, $2, $3) RETURNING id",
        [uuidv4(), source.name, source.type],
      );
      sourceIds[source.name] = result.rows[0].id;
      console.log(`  ✓ ${source.name}`);
    }

    // 2. Tạo Hotel (điểm gốc)
    console.log("\n🏨 Tạo khách sạn...");
    const hotelResult = await query(
      "INSERT INTO hotel (id, name, lat, lng, address) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [uuidv4(), "Hotel XYZ", 10.7769, 106.7009, "TP. Hồ Chí Minh"],
    );
    const hotelId = hotelResult.rows[0].id;
    console.log(`  ✓ Hotel XYZ (${hotelResult.rows[0].id})`);

    // 3. Tạo các công ty mẫu
    console.log("\n🏢 Tạo công ty mẫu...");
    const companiesData = [
      {
        name: "Tech Solutions Vietnam",
        industry: "Technology",
        address: "District 1, HCMC",
        lat: 10.78,
        lng: 106.705,
        website: "https://techsolutions.com",
        email: "contact@techsolutions.com",
        phone: "(08) 1234 5678",
        description:
          "Công ty cung cấp giải pháp công nghệ toàn diện cho các doanh nghiệp",
        source: "Google Places API",
        source_id: sourceIds["Google Places API"],
        external_id: "TECH_SOL_001",
      },
      {
        name: "Marketing Plus",
        industry: "Marketing",
        address: "District 3, HCMC",
        lat: 10.79,
        lng: 106.715,
        website: "https://marketingplus.vn",
        email: "info@marketingplus.vn",
        phone: "(08) 9876 5432",
        description: "Dịch vụ marketing digital và quảng cáo tổng thể",
        source: "Google Places API",
        source_id: sourceIds["Google Places API"],
        external_id: "MKT_PLUS_001",
      },
      {
        name: "Event Management Pro",
        industry: "Event Management",
        address: "District 5, HCMC",
        lat: 10.765,
        lng: 106.695,
        website: "https://eventpro.vn",
        email: "hello@eventpro.vn",
        phone: "(08) 3456 7890",
        description: "Công ty tổ chức sự kiện, hội thảo và conference",
        source: "Google Places API",
        source_id: sourceIds["Google Places API"],
        external_id: "EVT_PRO_001",
      },
    ];

    const companyIds = [];
    for (const companyData of companiesData) {
      const company = await companyRepository.createCompany(companyData);
      companyIds.push(company.id);
      console.log(`  ✓ ${company.name}`);
    }

    // 4. Tạo sự kiện mẫu
    console.log("\n📅 Tạo sự kiện mẫu...");
    const eventsData = [
      {
        name: "Tech Innovation Summit 2024",
        description: "Hội thảo về các xu hướng công nghệ mới nhất",
        start_date: "2024-03-15",
        end_date: "2024-03-17",
        location: "District 1, HCMC",
        lat: 10.78,
        lng: 106.705,
        source: "Eventbrite API",
        source_id: sourceIds["Eventbrite API"],
        external_id: "EVT_TECH_2024",
      },
      {
        name: "Digital Marketing Workshop",
        description: "Khoá đào tạo marketing kỹ thuật số toàn diện",
        start_date: "2024-04-01",
        end_date: "2024-04-05",
        location: "District 3, HCMC",
        lat: 10.79,
        lng: 106.715,
        source: "Meetup API",
        source_id: sourceIds["Meetup API"],
        external_id: "WKS_MKT_APR",
      },
    ];

    const eventIds = [];
    for (const eventData of eventsData) {
      const result = await query(
        `INSERT INTO event (
          id, name, description, start_date, end_date, location, lat, lng, 
          source, source_id, external_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          uuidv4(),
          eventData.name,
          eventData.description,
          eventData.start_date,
          eventData.end_date,
          eventData.location,
          eventData.lat,
          eventData.lng,
          eventData.source,
          eventData.source_id,
          eventData.external_id,
        ],
      );
      eventIds.push(result.rows[0].id);
      console.log(`  ✓ ${eventData.name}`);
    }

    // 5. Tạo quan hệ Company-Event
    console.log("\n🔗 Tạo quan hệ Company-Event...");
    await query(
      "INSERT INTO company_event (company_id, event_id, role) VALUES ($1, $2, $3)",
      [companyIds[0], eventIds[0], "sponsor"],
    );
    console.log(`  ✓ Tech Solutions Vietnam -> Tech Innovation Summit`);

    await query(
      "INSERT INTO company_event (company_id, event_id, role) VALUES ($1, $2, $3)",
      [companyIds[1], eventIds[1], "organizer"],
    );
    console.log(`  ✓ Marketing Plus -> Digital Marketing Workshop`);

    console.log("\n✨ Nhập dữ liệu mẫu hoàn tất!");
    console.log(`
📊 Thống kê:
   - Data Sources: ${sources.length}
   - Companies: ${companiesData.length}
   - Events: ${eventsData.length}
    `);
  } catch (error) {
    console.error("\n❌ Lỗi nhập dữ liệu:", error.message);
    if (error.message.includes("already exists")) {
      console.log("ℹ️  Dữ liệu đã tồn tại, bỏ qua");
    } else {
      process.exit(1);
    }
  }
}

seedDatabase();
