const lineItemsSettingsValidation = require('./line_items_settings.js');
const priceValidation = require('./units/price.js');
const booleanValidation = require('./units/boolean.js');
const stringValidation = require('./units/string.js');

module.exports = {
  'name': {
    message: 'Must be a string, start with a letter, and only contain A-z, 0-9, - and _',
    validate: v => {
      return v && typeof v === 'string' && v.match(/^[a-z][a-z0-9\-\_]*$/i)
    },
  },
  'display_name': {
    message: 'Must be a string and be > 0 in length',
    validate: v => v && typeof v === 'string'
  },
  'account_type': stringValidation,
  'enabled': booleanValidation,
  'visible': booleanValidation,
  'price': priceValidation,
  'line_items_settings': {
    message: 'Must be an Object',
    validate: (v, parent, extraValues) => {
      const LineItems = extraValues.LineItems;
      let isObj = v && typeof v === 'object' && !Array.isArray(v);
      if (!isObj) {
        return false;
      } else {
        let keys = Object.keys(v);
        let validKeys = keys.filter(key => {
          let lineItem = LineItems.find(lineItem => lineItem.name === key);
          if (!lineItem) {
            throw new Error(`Could not find Line Item "${key}"`);
          }
          if (lineItemsSettingsValidation.validate(v[key], lineItem, false)) {
            return true;
          } else {
            throw new Error(`Error in Line Item Settings "${key}": ${lineItemsSettingsValidation.message}`);
          }
        });
        return validKeys.length === keys.length;
      }
    }
  }
};
