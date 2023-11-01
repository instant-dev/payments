const positiveIntegerTest = require('./positive_integer.js');

module.exports = {
  message: 'Must be either `null` or a valid object of key-value pair representing currencies, currently only "usd" and "eur" are supported',
  validate: v => {
    let isObj = v && typeof v === 'object' && !Array.isArray(v);
    if (isObj) {
      let allowedCurrencies = ['usd', 'eur'];
      let keys = Object.keys(v);
      if (!keys.length) {
        return false;
      } else {
        let validKeys = keys.filter(key => {
          return allowedCurrencies.indexOf(key) > -1 // allowed currency
            && positiveIntegerTest.validate(v[key])
        });
        return validKeys.length === keys.length;
      }
    } else {
      return v === null;
    }
  }
};
