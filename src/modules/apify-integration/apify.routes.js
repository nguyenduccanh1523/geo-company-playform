import express from "express";
import { ApifyController } from "./apify.controller.js";

const router = express.Router();
const controller = new ApifyController();

router.post("/linkedin/search", controller.searchLinkedin);
router.post("/linkedin/employees", controller.getCompanyEmployees);
router.post("/linkedin/search1", controller.searchLinkedIn.bind(controller));

export default router;