/**
 * MAPPER UTILITY
 *
 * Chuyển đổi giữa Entity ↔ DTO
 *
 * Sử dụng:
 * const dto = Mapper.toPaginatedResponseDto(companies, 20, 0);
 */

export class Mapper {
  /**
   * Chuyển đổi mảng entities thành mảng DTOs
   */
  static toArray(entities, dtoClass) {
    if (!Array.isArray(entities)) {
      return [];
    }
    return entities.map((entity) => new dtoClass(entity));
  }

  /**
   * Chuyển đổi paginated response
   */
  static toPaginatedResponseDto(entities, limit, offset, dtoClass) {
    const dtos = this.toArray(entities, dtoClass);

    return {
      items: dtos,
      pagination: {
        limit,
        offset,
        count: dtos.length,
      },
    };
  }

  /**
   * Chuyển đổi object với nested mappings
   */
  static toNestedObject(data, mapping) {
    const result = {};

    Object.entries(mapping).forEach(([key, config]) => {
      if (typeof config === "string") {
        // Simple mapping: { newKey: 'oldKey' }
        result[key] = data[config];
      } else if (typeof config === "function") {
        // Transformer function: { newKey: (data) => transform(data) }
        result[key] = config(data);
      } else if (typeof config === "object") {
        // Nested mapping: { coordinates: { lat: 'lat', lng: 'lng' } }
        result[key] = this.toNestedObject(data, config);
      }
    });

    return result;
  }

  /**
   * Chuyển đổi mảng objects
   */
  static toArray(items, mapping) {
    return items.map((item) => this.toNestedObject(item, mapping));
  }

  /**
   * Chỉ lấy các fields cần thiết từ object
   */
  static pick(obj, keys) {
    const result = {};
    keys.forEach((key) => {
      if (key in obj) {
        result[key] = obj[key];
      }
    });
    return result;
  }

  /**
   * Loại bỏ các fields không cần
   */
  static omit(obj, keys) {
    const result = { ...obj };
    keys.forEach((key) => {
      delete result[key];
    });
    return result;
  }

  /**
   * Chuyển đổi flat object thành nested object
   * VD: { 'user.name': 'John' } → { user: { name: 'John' } }
   */
  static toNestedFromFlat(flatObj) {
    const result = {};

    Object.entries(flatObj).forEach(([key, value]) => {
      const keys = key.split(".");
      let current = result;

      keys.forEach((k, index) => {
        if (index === keys.length - 1) {
          current[k] = value;
        } else {
          current[k] = current[k] || {};
          current = current[k];
        }
      });
    });

    return result;
  }
}
