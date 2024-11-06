const SchemaValidation = require('./schema.js');

const anyValidation = require('./units/any.js');
const positiveIntegerValidation = require('./units/positive_integer.js');
const stringValidation = require('./units/string.js');
const priceValidation = require('./units/price.js');

module.exports = {
  message: 'Must be a valid settings `line_items` settings object',
  validate: (v, parent, allFieldsRequired = true) => {
    let isObj = v && typeof v === 'object' && !Array.isArray(v);
    switch (parent.type) {
      case 'capacity':
        return isObj && SchemaValidation.validate(
          'Line Items Settings (type: "capacity")',
          [v],
          {
            "price": priceValidation,
            "included_count": positiveIntegerValidation
          },
          null,
          true,
          allFieldsRequired
        );
        break;
      // FIXME: Support for capacity.unique if needed
      // case 'capacity.unique':
      //   return isObj && SchemaValidation.validate(
      //     'Line Items Settings (type: "capacity.unique")',
      //     [v],
      //     {
      //       "price": priceValidation,
      //       "included_count": positiveIntegerValidation,
      //       "unique_name": stringValidation
      //     },
      //     true,
      //     allFieldsRequired
      //   );
      //   break;
      case 'usage':
        return isObj && SchemaValidation.validate(
          'Line Items Settings (type: "usage")',
          [v],
          {
            "price": priceValidation,
            "units": positiveIntegerValidation,
            "free_units": positiveIntegerValidation,
            "unit_name": stringValidation
          },
          null,
          true,
          allFieldsRequired
        );
        break;
      case 'flag':
        return isObj && SchemaValidation.validate(
          'Line Items Settings (type: "flag")',
          [v],
          {
            "value": anyValidation,
            "display_value": stringValidation
          },
          null,
          true,
          allFieldsRequired
        );
      default:
        throw new Error(`No validate found for Line Item type: "${parent.type}"`);
        break;
    }
  }
};
