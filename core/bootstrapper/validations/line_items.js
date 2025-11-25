const lineItemsSettingsValidation = require('./line_items_settings.js');

module.exports = {
  'name': {
    message: 'Must be a string, start with a letter, and only contain A-z, 0-9, - and _',
    validate: v => {
      return v && typeof v === 'string' && v.match(/^[a-z][a-z0-9\-\_]*$/i)
    },
  },
  'category': {
    message: 'Must be a string and be > 0 in length',
    validate: v => v && typeof v === 'string'
  },
  'display_name': {
    message: 'Must be a string and be > 0 in length',
    validate: v => v && typeof v === 'string'
  },
  'description': {
    message: 'Must be a string and be > 0 in length',
    validate: v => v && typeof v === 'string'
  },
  'type': {
    message: 'Must be one of: "capacity", "usage", "flag"',
    validate: v => ['capacity', 'usage', 'flag'].indexOf(v) >= 0
  },
  'settings': {
    message: 'Must be a valid settings `line_items` settings object',
    validate: (v, parent) => {
      let isObj = v && typeof v === 'object' && !Array.isArray(v);
      return isObj && lineItemsSettingsValidation.validate(v, parent);
    }
  }
};
