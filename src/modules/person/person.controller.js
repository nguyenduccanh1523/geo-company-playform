/**
 * PERSON CONTROLLER
 */

import { PersonService } from "./person.service.js";
import {
  PersonResponseDto,
  PersonDetailDto,
} from "./dto/person-response.dto.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("PersonController");

export class PersonController {
  /**
   * POST /api/people
   */
  static async createPerson(req, res, next) {
    try {
      const person = await PersonService.createPerson(req.body);
      const response = new PersonResponseDto(person);

      res.status(201).json({
        success: true,
        data: response,
        message: "Person created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/people/:id
   */
  static async getPerson(req, res, next) {
    try {
      const { id } = req.params;

      const person = await PersonService.getPerson(id);
      const response = new PersonResponseDto(person);

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/people/:id/details
   */
  static async getPersonDetails(req, res, next) {
    try {
      const { id } = req.params;

      const details = await PersonService.getPersonDetails(id);

      res.json({
        success: true,
        data: {
          person: new PersonResponseDto(details.person),
          companies: details.companies.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/people
   */
  static async listPeople(req, res, next) {
    try {
      const { name, email, title, status, limit = 20, offset = 0 } = req.query;

      const result = await PersonService.searchPeople(
        { name, email, title, status },
        { limit: Math.min(parseInt(limit), 100), offset: parseInt(offset) },
      );

      const responses = result.people.map((p) => new PersonResponseDto(p));

      res.json({
        success: true,
        data: responses,
        pagination: {
          limit: result.limit,
          offset: result.offset,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/people/by-email/:email
   */
  static async getByEmail(req, res, next) {
    try {
      const { email } = req.params;

      const person = await PersonService.getPersonByEmail(email);
      const response = new PersonResponseDto(person);

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/people/:id
   */
  static async updatePerson(req, res, next) {
    try {
      const { id } = req.params;

      const person = await PersonService.updatePerson(id, req.body);
      const response = new PersonResponseDto(person);

      res.json({
        success: true,
        data: response,
        message: "Person updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/people/:id
   */
  static async deletePerson(req, res, next) {
    try {
      const { id } = req.params;

      await PersonService.deletePerson(id);

      res.json({
        success: true,
        message: "Person deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/people/:id/archive
   */
  static async archivePerson(req, res, next) {
    try {
      const { id } = req.params;

      const person = await PersonService.archivePerson(id);
      const response = new PersonResponseDto(person);

      res.json({
        success: true,
        data: response,
        message: "Person archived successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/people/import
   */
  static async importPeople(req, res, next) {
    try {
      const { people } = req.body;

      if (!people || !Array.isArray(people)) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "people array is required",
          },
        });
      }

      const result = await PersonService.importPeople(people);

      res.status(201).json({
        success: true,
        data: {
          count: result.count,
          people: result.people.map((p) => new PersonResponseDto(p)),
        },
        message: `${result.count} people imported successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
}
