/**
 * PERSON SERVICE
 */

import { PersonRepository } from "./person.repository.js";
import { CreatePersonDto } from "./dto/create-person.dto.js";
import {
  BusinessException,
  NotFoundException,
  ConflictException,
} from "../../shared/exceptions/base.exception.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("PersonService");

export class PersonService {
  /**
   * ✅ CREATE
   */
  static async createPerson(createPersonDto) {
    try {
      logger.info(
        `Creating person: ${createPersonDto.first_name} ${createPersonDto.last_name}`,
      );

      const validatedDto = CreatePersonDto.from(createPersonDto);

      // Check if email already exists
      if (validatedDto.email) {
        const existing = await PersonRepository.findByEmail(validatedDto.email);
        if (existing) {
          throw new ConflictException(
            "EMAIL_ALREADY_EXISTS",
            `Person with email ${validatedDto.email} already exists`,
          );
        }
      }

      const person = await PersonRepository.create(validatedDto.toDatabase());

      logger.info(`Person created: ${person.id}`);
      return person;
    } catch (error) {
      logger.error(`Error creating person: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ READ
   */
  static async getPerson(id) {
    try {
      const person = await PersonRepository.findById(id);

      if (!person) {
        throw new NotFoundException("Person", `id: ${id}`);
      }

      return person;
    } catch (error) {
      logger.error(`Error getting person: ${error.message}`);
      throw error;
    }
  }

  static async searchPeople(
    filters = {},
    pagination = { limit: 20, offset: 0 },
  ) {
    try {
      logger.info(`Searching people with filters: ${JSON.stringify(filters)}`);

      const people = await PersonRepository.findAll(filters, pagination);
      const total = await PersonRepository.count(filters);

      return {
        people,
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        hasMore: pagination.offset + pagination.limit < total,
      };
    } catch (error) {
      logger.error(`Error searching people: ${error.message}`);
      throw error;
    }
  }

  static async getPersonByEmail(email) {
    try {
      const person = await PersonRepository.findByEmail(email);

      if (!person) {
        throw new NotFoundException("Person", `email: ${email}`);
      }

      return person;
    } catch (error) {
      logger.error(`Error getting person by email: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ UPDATE
   */
  static async updatePerson(id, updateData) {
    try {
      logger.info(`Updating person: ${id}`);

      const person = await PersonRepository.findById(id);
      if (!person) {
        throw new NotFoundException("Person", `id: ${id}`);
      }

      // If email is being updated, check for duplicates
      if (updateData.email && updateData.email !== person.email) {
        const existing = await PersonRepository.findByEmail(updateData.email);
        if (existing) {
          throw new ConflictException(
            "EMAIL_ALREADY_EXISTS",
            `Person with email ${updateData.email} already exists`,
          );
        }
      }

      const updated = await PersonRepository.update(id, updateData);

      logger.info(`Person updated: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error updating person: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ DELETE
   */
  static async deletePerson(id) {
    try {
      logger.info(`Deleting person: ${id}`);

      const person = await PersonRepository.findById(id);
      if (!person) {
        throw new NotFoundException("Person", `id: ${id}`);
      }

      const success = await PersonRepository.delete(id);

      if (!success) {
        throw new BusinessException("DELETE_FAILED", "Failed to delete person");
      }

      logger.info(`Person deleted: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting person: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ ARCHIVE
   */
  static async archivePerson(id) {
    try {
      logger.info(`Archiving person: ${id}`);

      const person = await PersonRepository.findById(id);
      if (!person) {
        throw new NotFoundException("Person", `id: ${id}`);
      }

      const updated = await PersonRepository.archive(id);

      logger.info(`Person archived: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error archiving person: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ BULK IMPORT
   */
  static async importPeople(people) {
    try {
      if (!Array.isArray(people) || people.length === 0) {
        throw new BusinessException(
          "INVALID_INPUT",
          "People array is required and must not be empty",
        );
      }

      logger.info(`Importing ${people.length} people`);

      const imported = await PersonRepository.bulkCreate(people);

      logger.info(`Successfully imported ${imported.length} people`);
      return {
        count: imported.length,
        people: imported,
      };
    } catch (error) {
      logger.error(`Error importing people: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ GET PERSON WITH RELATED DATA
   */
  static async getPersonDetails(id) {
    try {
      const person = await PersonRepository.findById(id);
      if (!person) {
        throw new NotFoundException("Person", `id: ${id}`);
      }

      const companies = await PersonRepository.getCompanies(id);

      return {
        person,
        companies,
      };
    } catch (error) {
      logger.error(`Error getting person details: ${error.message}`);
      throw error;
    }
  }
}
