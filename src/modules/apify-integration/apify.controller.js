import { ApifyService } from "./apify.service.js";

const service = new ApifyService();

export class ApifyController {
  async searchLinkedin(req, res, next) {
    try {
      const { keyword, maxItems } = req.body;

      if (!keyword) {
        return res.status(400).json({
          success: false,
          message: "Keyword is required",
        });
      }

      const data = await service.searchLinkedinByGoogle(
        keyword,
        maxItems || 10,
      );

      return res.json({
        success: true,
        message: "LinkedIn results via Google fetched",
        total: data.length,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getCompanyEmployees(req, res, next) {
    try {
      const { companyUrl, maxItems } = req.body;

      if (!companyUrl) {
        return res.status(400).json({
          success: false,
          message: "companyUrl is required",
        });
      }

      const data = await service.getCompanyEmployees(
        companyUrl,
        maxItems || 25,
      );

      return res.json({
        success: true,
        message: "Employees fetched successfully",
        total: data.length,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async searchLinkedIn(req, res) {
    try {
      const { companyUrl, maxItems } = req.body;

      if (!companyUrl || companyUrl.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "companyUrl is required",
        });
      }

      const data = await service.getCompanyEmployees1(
        companyUrl,
        maxItems || 50,
      );

      return res.json({
        success: true,
        total: data.length,
        data,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}
