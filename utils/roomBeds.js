/**
 * Normalize the beds list sent on room create and update.
 * Accepts an array or a JSON string (multipart forms send a string).
 * @param {*} value
 * @returns {Array<{ bed_type: string, bed_count: number }>}
 */
const parseRoomBeds = (value) => {
  if (value === undefined || value === null || value === '') return [];

  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch (_) {
      throw new Error('beds must be a JSON array of objects with bed_type and bed_count.');
    }
  }

  if (!Array.isArray(list)) {
    throw new Error('beds must be an array.');
  }
  if (list.length > 20) {
    throw new Error('A room can have at most 20 bed entries.');
  }

  return list.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`beds[${index}] must be an object with bed_type and bed_count.`);
    }
    const bedType = String(item.bed_type || '').trim();
    const bedCount = Number(item.bed_count);
    if (!bedType || bedType.length > 100) {
      throw new Error(`beds[${index}].bed_type is required and must be at most 100 characters.`);
    }
    if (!Number.isInteger(bedCount) || bedCount < 1 || bedCount > 50) {
      throw new Error(`beds[${index}].bed_count must be a whole number from 1 to 50.`);
    }
    return { bed_type: bedType, bed_count: bedCount };
  });
};

module.exports = {
  parseRoomBeds,
};
