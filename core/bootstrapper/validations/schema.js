module.exports = {
  validate: (itemName, Items, itemValidations, extraValues, throwErrors = true, allFieldsRequired = true) => {
    if (!itemName || typeof itemName !== 'string') {
      throw new Error(`Validation requires valid "itemName" string as first parameter`);
    }
    if (!Array.isArray(Items) || !Items.length) {
      throw new Error(`Validation requires non-zero length "Items" array as second parameter`);
    }
    if (!itemValidations || typeof itemValidations !== 'object' || Array.isArray(itemValidations)) {
      throw new Error(`Validation requires valid Object "itemValidations" as third parameter`);
    }
    if (Object.keys(itemValidations).length === 0) {
      throw new Error(`Validation requires valid non-zero sized Object "itemValidations" as third parameter`);
    }
    Object.keys(itemValidations).forEach(key => {
      let validation = itemValidations[key];
      if (typeof validation.validate !== 'function') {
        throw new Error(`"itemValidations"."${key}" must have a valid "validate" function`);
      }
      if (!validation.message || typeof validation.message !== 'string') {
        throw new Error(`"itemValidations"."${key}" must have a valid "message" describing the requirements for the key to pass the validate`);
      }
    });
    allFieldsRequired = !!allFieldsRequired;
    let successItems = Items.filter(Item => {
      let item = {...Item};
      let invalidKeys = [];
      let keyErrors = {};
      let curValidations = {...itemValidations};
      Object.keys(item).forEach(key => {
        if (curValidations[key]) {
          try {
            if (!curValidations[key].validate(item[key], item, extraValues)) {
              keyErrors[key] = curValidations[key].message;
            }
          } catch (e) {
            keyErrors[key] = e.message;
          }
          delete curValidations[key]; // Remove the validate from the pool
        } else {
          invalidKeys.push(key);
        }
      });
      let errors = {};
      if (Object.keys(keyErrors).length) {
        errors.key_errors = keyErrors;
      }
      if (invalidKeys.length) {
        errors.invalid_keys = invalidKeys;
      }
      if (allFieldsRequired && Object.keys(curValidations).length) {
        errors.missing_keys = Object.keys(curValidations);
      }
      if (Object.keys(errors).length) {
        let message = `Error in ${itemName}${item.name ? ` "${item.name}"` : ''}`;
        let firstKey = Object.keys(errors)[0];
        let errorItem = errors[firstKey];
        message += [
          `\n`,
          `  ${firstKey}: `,
          Array.isArray(errorItem)
            ? `"${errorItem.join('", "')}"`
            : `\n` + Object.keys(errorItem).map(errorKey => {
                return `    ${errorKey}: ${errorItem[errorKey]}`;
              }).join('\n')
        ].join('');
        console.error(message);
        if (throwErrors) {
          throw new Error(message);
        } else {
          return false;
        }
      }
      return true;
    });
    if (Items.length === successItems.length) {
      return true;
    } else {
      return false;
    }
  }
};
