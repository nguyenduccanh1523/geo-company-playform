import { ApifyClient } from "apify-client";

export class ApifyService {
  constructor() {
    this.client = new ApifyClient({
      token: process.env.APIFY_TOKEN,
    });
  }

  async getCompanyEmployees1(companyUrl, maxItems = 50) {
    try {
      const input = {
        urls: [companyUrl], // 🔥 FIX CHÍNH
        maxItems,
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ["RESIDENTIAL"],
          apifyProxyCountry: "US",
        },
      };

      console.log("[ApifyService] Input:", input);

      const run = await this.client
        .actor("scrapio/linkedin-company-employees")
        .call(input);

      console.log("[ApifyService] Run:", run);

      const { items } = await this.client
        .dataset(run.defaultDatasetId)
        .listItems();

      return items;
    } catch (error) {
      console.error("[ApifyService FULL ERROR]:", error);
      throw new Error("Failed to fetch LinkedIn employees");
    }
  }

  async getCompanyEmployees(companyUrl, maxItems = 25) {
    try {
      console.log("[ApifyService] Get employees from:", companyUrl);

      const input = {
        maxItems,
        companies: [companyUrl],
      };

      const run = await this.client
        .actor("harvestapi/linkedin-company-employees")
        .call(input);

      const { items } = await this.client
        .dataset(run.defaultDatasetId)
        .listItems();

      return items;
    } catch (error) {
      console.error("[ApifyService] Error:", error.message);
      throw new Error("Failed to fetch LinkedIn employees");
    }
  }

  async searchLinkedinByGoogle(keyword, maxResults = 100) {
    try {
      console.log("[ApifyService] Google search LinkedIn:", keyword);

      const input = {
        queries: `site:linkedin.com/in "${keyword}" OR site:linkedin.com/company "${keyword}"`,
        resultsPerPage: maxResults,
        maxPagesPerQuery: 10,
      };

      const run = await this.client
        .actor("apify/google-search-scraper")
        .call(input);

      const { items } = await this.client
        .dataset(run.defaultDatasetId)
        .listItems();

      const linkedinResults = items
        .map((item) => item.organicResults || [])
        .flat()
        .filter((r) => r.url.includes("linkedin.com"));

      return linkedinResults;
    } catch (error) {
      console.error("[ApifyService] Error:", error.message);
      throw new Error("Failed to search LinkedIn via Google");
    }
  }
}
