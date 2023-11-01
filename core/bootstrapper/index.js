// Core Library
const CustomerManager = require('../helpers/customer_manager.js');
const STRIPE_METADATA_PREFIX = CustomerManager.STRIPE_METADATA_PREFIX;

// Validations for Plans and Line Items
const SchemaValidations = require('./validations/schema.js');
const PlansValidations = require('./validations/plans.js');
const LineItemsValidations = require('./validations/line_items.js');

const RESULT_CACHE = {};

const setCache = (itemType, uniqueName, value) => {
  RESULT_CACHE[itemType] = RESULT_CACHE[itemType] || {};
  return RESULT_CACHE[itemType][uniqueName] = value;
};

const checkCache = (itemType, uniqueName) => {
  RESULT_CACHE[itemType] = RESULT_CACHE[itemType] || {};
  return RESULT_CACHE[itemType][uniqueName] || null;
};

const quickClone = obj => JSON.parse(JSON.stringify(obj));

// Serialize an object to compare it to another
const serializeObject = (obj) => {
  return obj
    ? Object.keys(obj)
      .sort()
      .map(key => `${JSON.stringify(key)}=${JSON.stringify(obj[key])}`).join(',')
    : null;
};

const isLineItemTemplate = (LineItem, LineItemTemplate) => {
  if (LineItem.type === 'usage') {
    return LineItem.name === LineItemTemplate.name &&
      serializeObject(LineItem.settings.price) === serializeObject(LineItemTemplate.settings.price) &&
      LineItem.settings.units === LineItemTemplate.settings.units &&
      LineItem.settings.free_units === LineItemTemplate.settings.free_units;
  } else {
    return LineItem.name === LineItemTemplate.name &&
      serializeObject(LineItem.settings.price) === serializeObject(LineItemTemplate.settings.price);
  }
};

const createStripeData = (obj, isPlan) => {
  let Plan = isPlan ? obj : null;
  let LineItem = isPlan ? null : obj;
  let displayName, name, metadata, pricing;
  if (Plan) {
    displayName = `Plan: ${Plan.display_name}`;
    name = Plan.name;
    metadata = {
      [STRIPE_METADATA_PREFIX]: 'true',
      [`${STRIPE_METADATA_PREFIX}_product_type`]: 'plan',
      [`${STRIPE_METADATA_PREFIX}_name`]: name
    };
    pricing = Plan.price;
  } else {
    displayName = LineItem.display_name;
    name = LineItem.name;
    metadata = {
      [STRIPE_METADATA_PREFIX]: 'true',
      [`${STRIPE_METADATA_PREFIX}_product_type`]: 'line_item',
      [`${STRIPE_METADATA_PREFIX}_name`]: LineItem.name
    };
    pricing = LineItem.settings.price;
  }
  return {Plan, LineItem, displayName, name, metadata, pricing};
}

const findOrCreateProduct = async (stripe, obj, isPlan) => {
  const {Plan, LineItem, displayName, name, metadata, pricing} = createStripeData(obj, isPlan);
  let product = checkCache('products', name);
  if (product) {
    console.log(`Found cached Stripe product for "${name}"...`);
  } else {
    let productsList = [];
    let productsListResult = {has_more: true};
    while (productsListResult.has_more) {
      let query = {
        active: true,
        limit: 100
      };
      if (productsList.length) {
        query.starting_after = productsList[productsList.length - 1].id;
      }
      productsListResult = await stripe.products.list(query);
      productsList = [].concat(productsList, productsListResult.data);
    }
    productsList = productsList.filter(product => {
      // Check if all metadata keys are identical
      let keys = Object.keys(metadata);
      return keys.length ===
        keys.filter(key => metadata[key] === product.metadata[key]).length;
    });
    if (productsList.length > 1) {
      throw new Error(`Duplicate products (x${productsList.length}) found for "${name}"`);
    }
    product = productsList[0] || null;
    if (product) {
      console.log(`Found saved Stripe product for "${name}"...`);
    }
  }
  let productData = {
    name: displayName,
    metadata: metadata
  };
  if (!product) {
    console.log(`Creating new Stripe product for "${name}"...`);
    product = await stripe.products.create(productData);
  } else if (
    product.name !== productData.name ||
    serializeObject(product.metadata) !== serializeObject(productData.metadata)
  ) {
    console.log(`Updating Stripe product for "${name}"...`);
    product = await stripe.products.update(product.id, productData);
  }
  return setCache('products', name, product);
};

const findOrCreatePrices = async (stripe, product, obj, isPlan) => {
  const {Plan, LineItem, displayName, name, metadata, pricing} = createStripeData(obj, isPlan);
  let uniqueName = name;
  if (LineItem) {
    if (LineItem.is_template) {
      metadata[`${STRIPE_METADATA_PREFIX}_line_item_plan`] = '*';
      uniqueName = `*.${name}`;
    } else {
      metadata[`${STRIPE_METADATA_PREFIX}_line_item_plan`] = LineItem.plan_name;
      uniqueName = `${LineItem.plan_name}.${name}`;
    }
  }
  // Plans should always have a price / line item
  let priceLookup = isPlan
    ? (pricing || {'usd': 0})
    : pricing;
  const prices = [];
  if (priceLookup) {
    const currencyKeys = Object.keys(priceLookup);
    for (let i = 0; i < currencyKeys.length; i++) {
      const currency = currencyKeys[i];
      const unitAmount = priceLookup[currency];
      const uniqueNameCurrency = `${uniqueName}:${currency}`;
      let price = checkCache('prices', uniqueNameCurrency);
      if (price) {
        console.log(`Found cached Stripe price for "${uniqueNameCurrency}"...`);
      } else {
        let pricesList = [];
        let pricesListResult = {has_more: true};
        while (pricesListResult.has_more) {
          let query = {
            product: product.id,
            currency: currency,
            active: true,
            limit: 100
          };
          if (pricesList.length) {
            query.starting_after = pricesList[pricesList.length - 1].id;
          }
          pricesListResult = await stripe.prices.list(query);
          pricesList = [].concat(pricesList, pricesListResult.data);
        }
        pricesList = pricesList.filter(product => {
          // Check if all metadata keys are identical
          let keys = Object.keys(metadata);
          return keys.length ===
            keys.filter(key => metadata[key] === product.metadata[key]).length;
        });
        if (pricesList.length > 1) {
          console.error(`Duplicate prices (x${pricesList.length}) found for "${uniqueNameCurrency}"...`);
          await Promise.all(
            pricesList.slice(1).map(price => {
              return (async () => {
                console.error(`Cleaning up price "${price.id}" for "${uniqueNameCurrency}"...`);
                stripe.prices.update(price.id, {active: false});
              })();
            })
          );
        }
        price = pricesList[0] || null;
        if (price) {
          console.log(`Found saved Stripe price for "${uniqueNameCurrency}"...`);
        }
      }
      const formatUnitAmount = (unitAmount) => {
        let str = unitAmount
          .toFixed(12)
          .replace(/^(\d*?)\.(\d*[1-9])?(0+)$/, '$1.$2');
        if (str.endsWith('.')) {
          str = str.slice(0, -1);
        }
        return str;
      };
      let priceData = {
        product: product.id,
        currency: currency,
        unit_amount_decimal: formatUnitAmount(unitAmount),
        billing_scheme: 'per_unit',
        recurring: {
          interval: 'month',
          usage_type: 'licensed'
        },
        nickname: uniqueName,
        metadata: metadata
      };
      if (LineItem && LineItem.type === 'usage') {
        delete priceData.unit_amount_decimal;
        priceData.billing_scheme = 'tiered';
        priceData.recurring.usage_type = 'metered';
        let tiers = [{
          unit_amount_decimal: formatUnitAmount(unitAmount / LineItem.settings.units),
          up_to: 'inf'
        }];
        if (LineItem.settings.free_units) {
          tiers.unshift({
            unit_amount_decimal: formatUnitAmount(0),
            up_to: LineItem.settings.free_units
          });
        }
        priceData.tiers = tiers;
        priceData.tiers_mode = 'graduated';
      }
      if (price) {
        if (
          price.currency !== priceData.currency ||
          (price.unit_amount_decimal || null) !== (priceData.unit_amount_decimal || null) ||
          price.billing_scheme !== priceData.billing_scheme ||
          serializeObject(price.tiers) !== serializeObject(price.tiers) ||
          (price.tiers_mode || null) !== (priceData.tiers_mode || null) ||
          price.recurring.interval !== priceData.recurring.interval ||
          price.recurring.usage_type !== priceData.recurring.usage_type
        ) {
          console.log(`Deactivating old Stripe price for "${uniqueName}.${price.currency}"...`);
          await stripe.prices.update(price.id, {active: false});
          console.log(`Archived old Stripe price for "${uniqueName}.${price.currency}"!`);
          console.log(`Creating new Stripe price for "${uniqueNameCurrency}"...`);
          price = await stripe.prices.create(priceData);
        } else {
          console.log(`Found existing Stripe price for "${uniqueNameCurrency}"...`);
        }
      } else {
        console.log(`Creating new Stripe price for "${uniqueNameCurrency}"...`);
        price = await stripe.prices.create(priceData);
      }
      prices.push(setCache('prices', uniqueNameCurrency, price));
    }
  }
  return prices;
};

module.exports = {
  bootstrap: async (stripe, Plans, LineItems) => {

    // First, validate Plans and LineItems
    SchemaValidations.validate('LineItems', LineItems, LineItemsValidations);
    SchemaValidations.validate('Plan', Plans, PlansValidations, {LineItems});

    // Runs mutations here, so copy objects
    Plans = Plans.slice();
    LineItems = LineItems.slice();

    // Queue up tasks in parallel
    let productTasks = [];

    // Create products first
    for (let i = 0; i < Plans.length; i++) {
      // Runs mutations here, so copy objects
      Plans[i] = quickClone(Plans[i]);
      productTasks.push(
        [
          async (Plan) => {
            let planProduct = await findOrCreateProduct(stripe, Plan, true);
            Plan.stripeData = {product: planProduct};
          },
          Plans[i]
        ]
      );
    }
    for (let i = 0; i < LineItems.length; i++) {
      // Runs mutations here, so copy objects
      let LineItem = LineItems[i] = quickClone(LineItems[i]);
      if (LineItem.type !== 'flag') {
        productTasks.push(
          [
            async (LineItem) => {
              if (LineItem.type !== 'flag') {
                let itemProduct = await findOrCreateProduct(stripe, LineItem);
                LineItem.stripeData = {product: itemProduct};
              }
            },
            LineItem
          ]
        );
      }
    }

    // Execute tasks
    await Promise.all(productTasks.map(task => task[0](task[1])));

    // Now setup plans object
    let plans = Plans.map(PlanTemplate => {
      let plan = quickClone(PlanTemplate);
      let lineItemsSettings = quickClone(PlanTemplate.line_items_settings);
      delete plan.line_items_settings;
      plan.lineItems = LineItems.map(LineItemTemplate => {
        let lineItem = quickClone(LineItemTemplate);
        lineItem.settings = {
          ...lineItem.settings,
          ...(lineItemsSettings[lineItem.name] || {})
        };
        lineItem.plan_name = plan.name;
        lineItem.is_template = isLineItemTemplate(lineItem, LineItemTemplate);
        return lineItem;
      });
      return plan;
    });

    for (let i = 0; i < plans.length; i++) {
      let plan = plans[i];
      let planPrice = await findOrCreatePrices(stripe, plan.stripeData.product, plan, true);
      plan.stripeData.prices = planPrice;
      for (let j = 0; j < plan.lineItems.length; j++) {
        let lineItem = plan.lineItems[j];
        if (lineItem.stripeData && lineItem.stripeData.product) {
          let itemPrice = await findOrCreatePrices(stripe, lineItem.stripeData.product, lineItem);
          lineItem.stripeData.prices = itemPrice;
        }
      }
    }

    return plans;

  }
};
