const Customer = require('./customer.js');

const createStripeProxy = require('./create_stripe_proxy.js');

const quickClone = obj => JSON.parse(JSON.stringify(obj));

class CustomerManager {

  static STRIPE_METADATA_PREFIX = 'instpay';
  static USAGE_RECORD_WAIT_TIME = 10 * 1000;  // 10s between createUsageRecord calls

  constructor (secretKey, publishableKey, cachedPlans) {
    this.stripe = createStripeProxy('stripe', require('stripe')(secretKey));
    this.publishableKey = publishableKey;
    this.plans = cachedPlans;
  }

  async findCustomer (email) {
    let customer = new Customer(this.constructor.STRIPE_METADATA_PREFIX, this.stripe, email);
    await customer.syncToStripe();
    return customer;
  }

  async unsubscribeCustomer (customer, existingLineItemCounts) {
    return this.subscribeCustomer(customer, null, null, existingLineItemCounts);
  }

  async subscribeCustomer (customer, planName, lineItemCounts = null, existingLineItemCounts = null, successURL = null, cancelURL = null) {
    if (!(customer instanceof Customer)) {
      throw new Error(`subscribeCustomer requires a valid customer`);
    }
    if ((successURL && !cancelURL) || (!successURL && cancelURL)) {
      throw new Error(`You must provide both successURL and cancelURL if one is provided`);
    }
    const freePlan = this.plans.find(plan => !plan.price);
    let plan = null;
    if (planName === null) {
      // Always allow unsubscribe
      plan = freePlan;
      if (lineItemCounts !== null) {
        throw new Error([
          `Cannot unsubscribe and provide lineItemCounts.`,
          `If you wish to subscribe to a free plan with line items, please use the plan name`
        ].join('\n'));
      }
      lineItemCounts = plan.lineItems
        .filter(lineItem => lineItem.type === 'capacity')
        .reduce((counts, item) => {
          counts[item.name] = 0;
          return counts;
        }, {});
    } else {
      // Only allow subscribe if the plan is enabled
      plan = this.plans.find(plan => plan.name === planName);
      if (plan && !plan.enabled) {
        throw new Error([
          (
            !lineItemCounts
              ? `Can not subscribe to: "${plan.display_name}" (${plan.name})`
              : `Can not alter subscription to: "${plan.display_name}" (${plan.name})`
          ),
          `It is not enabled by the platform administrators.`
        ].join('\n'));
      }
    }
    if (!plan) {
      throw new Error([
        `Invalid plan: "${planName}"`,
        `Valid plans are: "${this.plans.map(plan => plan.name).join('", "')}"`
      ].join('\n'));
    }

    // Cancel any active checkout sessions for this customer before we fetch subscription
    const activeCheckoutSessions = await this.stripe.checkout.sessions.list({
      customer: customer.stripeId,
      status: 'open'
    });
    await Promise.all(activeCheckoutSessions.data.map(session => {
      return this.stripe.checkout.sessions.expire(session.id);
    }));

    const currentPlan = await customer.getCurrentPlan(this.plans);
    if (lineItemCounts) {
      let lineItemsTracker = {};
      plan.lineItems.forEach(lineItem => {
        lineItemsTracker[lineItem.name] = lineItem;
      });
      Object.keys(lineItemCounts).forEach(name => {
        let lineItem = lineItemsTracker[name];
        delete lineItemsTracker[name];
        let count = lineItemCounts[name];
        if (!lineItem) {
          throw new Error(`lineItemCounts: Invalid line item "${name}"`);
        } else if (lineItem.type !== 'capacity') {
          throw new Error(`lineItemCounts: Line item "${name}" invalid type "${lineItem.type}" to supply count for`);
        } else if (!lineItem.settings.price && count > 0) {
          throw new Error(`lineItemCounts: Line item "${name}" is free, should not supply count`);
        } else if (isNaN(count)) {
          throw new Error(`lineItemCounts: Line item "${name}" count must be a number`);
        } else if (parseInt(count) !== parseFloat(count)) {
          throw new Error(`lineItemCounts: Line item "${name}" count must be an integer`);
        } else if (count < 0 || count > 1000) {
          throw new Error(`lineItemCounts: Line item "${name}" count must be between 0 and 1000`);
        }
      });
      let remainingKeys = Object.keys(lineItemsTracker)
        .map(name => lineItemsTracker[name])
        .filter(lineItem => lineItem.type === 'capacity')
        .filter(lineItem => !!lineItem.settings.price);
      if (remainingKeys.length) {
        throw new Error(`lineItemCounts: Customer "${customer.email}" must provide line items "${remainingKeys.map(lineItem => lineItem.name).join('", "')}"`);
      }
      let currentLineItemLookup = {};
      currentPlan.lineItems.forEach(lineItem => {
        currentLineItemLookup[lineItem.name] = lineItem;
      });
      let diffKeys = Object.keys(lineItemCounts)
        .filter(name => {
          let count = lineItemCounts[name];
          let purchasedCount = currentLineItemLookup[name].purchased_count;
          if (count !== purchasedCount) {
            return true;
          } else {
            return false;
          }
        });
      if (!diffKeys.length && currentPlan.stripeData.subscription && planName === currentPlan.name) {
        throw new Error(`lineItemCounts: Customer "${customer.email}" is already subscribed to "${planName}" with those line items`);
      }
    } else if (currentPlan.stripeData.subscription && planName === currentPlan.name) {
      throw new Error(`Customer "${customer.email}" is already subscribed to "${planName}"`);
    }
    // If we provide existingLineItemCounts, check if we're over flag limits
    // Capacity limits are checked further down
    let existingLineItemErrors = {};
    if (existingLineItemCounts) {
      for (const key in existingLineItemCounts) {
        let existingCount = existingLineItemCounts[key];
        let lineItem = plan.lineItems.find(lineItem => lineItem.name === key);
        if (!lineItem) {
          throw new Error(`existingLineItemCounts: Invalid line item "${key}"`);
        } else if (lineItem.type === 'flag') {
          if (typeof lineItem.settings.value === 'number') {
            if (typeof existingCount !== 'number') {
              throw new Error(`existingLineItemCounts: Line item "${key}" (flag) expects a number`);
            } else if (existingCount > lineItem.settings.value) {
              existingLineItemErrors[key] = {expected: lineItem.settings.value, actual: existingCount};
            }
          } else if (existingCount !== lineItem.settings.value) {
            existingLineItemErrors[key] = {expected: lineItem.settings.value, actual: existingCount};
          }
        } else if (lineItem.type === 'capacity') {
          if (typeof existingCount !== 'number') {
            throw new Error(`existingLineItemCounts: Line item "${key}" (capacity) expects a number`);
          }
        } else {
          throw new Error(`existingLineItemCounts: Can not provide value for line item "${key}", must be type "capacity" or "flag"`);
        }
      }
    }

    let subscription = null;
    if (!planName) {
      // If we provide planName = null, just delete the subscription
      if (currentPlan.stripeData && currentPlan.stripeData.subscription) {
        // If we provided existing line item counts now we see if we're over limit
        if (existingLineItemCounts) {
          const lineItems = plan.lineItems.filter(lineItem => {
            return lineItem.type === 'capacity' && (lineItem.name in existingLineItemCounts);
          });
          for (const lineItem of lineItems) {
            let existingCount = existingLineItemCounts[lineItem.name];
            if (existingCount > lineItem.settings.included_count) {
              existingLineItemErrors[lineItem.name] = {expected: lineItem.settings.included_count, actual: existingCount};
            }
          }
        }
        // Only validate existingLineItemErrors on downgrades and equal plan settings
        // Always allow upgrades
        if (
          Object.keys(existingLineItemErrors).length &&
          (!currentPlan.price || !plan.price || currentPlan.price['usd'] >= plan.price['usd'])
        ) {
          let keys = Object.keys(existingLineItemErrors);
          let error = new Error(
            `existingLineItemCounts: You are over plan "${plan.name}" limits.\n` +
            `To change your subscription you must adjust your capacities:\n` +
            keys.map(key => {
              let diff = existingLineItemErrors[key];
              if (typeof diff.expected === 'number') {
                return ` - "${key}" must be reduced from ${diff.actual} to ${diff.expected}`;
              } else {
                return ` - "${key}" must be modified from ${diff.actual} to ${diff.expected}`;
              }
            }).join('\n')
          );
          error.details = existingLineItemErrors;
          throw error;
        }
        // Cancel the subscription
        await this.stripe.subscriptions.cancel(
          currentPlan.stripeData.subscription.id,
          {
            invoice_now: true,
            prorate: true
          }
        );
      }
    } else {
      let planPrice = null;
      if (plan.stripeData) {
        const currency = 'usd';
        planPrice = plan.stripeData.prices.find(price => price.currency === currency);
        if (!planPrice) {
          throw new Error(`No price data found for plan "${plan.name}" + "${currency}" combination`);
        }
      }
      let planEntries = [planPrice]
        .filter(price => !!price)
        .map(price => {
          let data = {
            price: price.id,
            quantity: 1,
            metadata: {
              ...price.metadata
            }
          };
          if (currentPlan && currentPlan.stripeData.subscriptionItem) {
            data.id = currentPlan.stripeData.subscriptionItem.id;
          }
          return data;
        });
      let lineItemEntries = plan.lineItems
        .filter(lineItem => lineItem.type !== 'flag')
        .map(lineItem => {
          let currentLineItem = currentPlan.lineItems
            .find(currentLineItem => currentLineItem.name === lineItem.name);
          if (!lineItem.stripeData) {
            throw new Error(`Missing core price data for "${plan.name}" + "${lineItem.name}"`);
          }
          const currency = 'usd';
          let data;
          let lineItemPrice = lineItem.stripeData.prices.find(price => price.currency === currency);
          if (!lineItemPrice && lineItem.settings.price) {
            throw new Error(`No price data found for new plan "${plan.name}" + "${lineItem.name}" + "${currency}" combination`);
          } else if (!lineItem.settings.price) {
            let currentLineItemPrice = currentLineItem.stripeData.prices.find(price => price.currency === currency);
            if (!currentLineItemPrice && currentLineItem.settings.price) {
              throw new Error(`No price data found for current plan "${plan.name}" + "${currentLineItem.name}" + "${currency}" combination`);
            } else if (!currentLineItemPrice) {
              data = {
                price: null,
                quantity: 0,
                metadata: {}
              };
            } else {
              data = {
                price: currentLineItemPrice.id,
                quantity: 0,
                metadata: {...currentLineItemPrice.metadata}
              }
            }
          } else {
            if (lineItem.type === 'capacity') {
              // If we're setting capacity, set new capacity to the delta...
              let quantity;
              if (lineItemCounts) {
                // If we provided lineItemCounts, set whatever we asked for
                // Otherwise adjust automatically (e.g. plan changes)
                quantity = lineItemCounts[lineItem.name];
              } else if (!lineItem.settings.price) {
                quantity = 0;
              } else {
                quantity = currentLineItem.purchased_count;
                const includedCountDelta = lineItem.settings.included_count -
                  currentLineItem.settings.included_count;
                if (includedCountDelta >= 0) {
                  quantity = Math.max(0, quantity - includedCountDelta);
                }
              }
              // If we provided existing line item counts now we see if we're over limit
              if (existingLineItemCounts && existingLineItemCounts[lineItem.name]) {
                let existingCount = existingLineItemCounts[lineItem.name];
                if (existingCount > quantity + lineItem.settings.included_count) {
                  existingLineItemErrors[lineItem.name] = {expected: quantity + lineItem.settings.included_count, actual: existingCount};
                }
              }
              data = {
                price: lineItemPrice.id,
                quantity: quantity,
                metadata: {...lineItemPrice.metadata}
              };
            } else if (lineItem.type === 'usage') {
              data = {
                price: lineItemPrice.id,
                metadata: {
                  ...lineItemPrice.metadata
                }
              };
            } else {
              throw new Error(`Unknown Line Item type: "${lineItem.type}"`);
            }
          }
          if (currentLineItem && currentLineItem.stripeData.subscriptionItem) {
            data.id = currentLineItem.stripeData.subscriptionItem.id;
          }
          return data;
        })
        .filter(entry => !!entry);
      // Only validate existingLineItemErrors on downgrades and equal plan settings
      // Always allow upgrades
      if (
        Object.keys(existingLineItemErrors).length &&
        (!currentPlan.price || !plan.price || currentPlan.price['usd'] >= plan.price['usd'])
      ) {
        let keys = Object.keys(existingLineItemErrors);
        let error = new Error(
          `existingLineItemCounts: You are over plan "${plan.name}" limits.\n` +
          `To change your subscription you must adjust your capacities:\n` +
          keys.map(key => {
            let diff = existingLineItemErrors[key];
            if (typeof diff.expected === 'number') {
              return ` - "${key}" must be reduced from ${diff.actual} to ${diff.expected}`;
            } else {
              return ` - "${key}" must be modified from ${diff.actual} to ${diff.expected}`;
            }
          }).join('\n')
        );
        error.details = existingLineItemErrors;
        throw error;
      }
      const items = [].concat(planEntries, lineItemEntries);
      let removeItems = items
        .filter(item => item.quantity === 0)
        .filter(item => item.price) // Must have a valid price
        .filter(item => item.id); // Needs to exist already as well
      removeItems.forEach(item => item.deleted = true); // Must delete when updating sub
      let addItems = items
        .filter(item => item.quantity !== 0);
      if (addItems.length) {
        let paymentMethods = await customer.listPaymentMethods();
        if (currentPlan.stripeData && currentPlan.stripeData.subscription) {
          // If we have a current subscription
          if (paymentMethods[0]) {
            let subData = {
              default_payment_method: paymentMethods[0].id,
              description: plan.name,
              items: [].concat(addItems, removeItems),
              proration_behavior: 'always_invoice',
              metadata: customer.serializeStripeMetadata()
            };
            // Only reset billing cycle anchor if main plan changes
            if (currentPlan.name !== plan.name) {
              subData.billing_cycle_anchor = 'now';
            }
            subscription = await this.stripe.subscriptions.update(
              currentPlan.stripeData.subscription.id,
              subData
            );
          } else {
            // No payment method, error
            throw new Error([
             `You must add a default payment method for "${customer.email}" before`,
             `changing your subscription`
            ].join(' '));
          }
        } else {
          // We don't have a current subscription
          // if we have successURL and cancelURL create a checkout session
          if (successURL && cancelURL) {
            let subData = {
              description: plan.name,
              metadata: customer.serializeStripeMetadata()
            };
            subscription = await customer.createCheckoutSession(
              [].concat(addItems, removeItems),
              subData,
              successURL,
              cancelURL
            );
          } else if (paymentMethods[0]) {
            // If there is a payment method, just create the sub
            subscription = await this.stripe.subscriptions.create({
              customer: customer.stripeId,
              default_payment_method: paymentMethods[0].id,
              description: plan.name,
              items: addItems,
              metadata: customer.serializeStripeMetadata()
            });
          } else {
            // throw an error
            throw new Error([
              `You must add a default payment method for "${customer.email}" before`,
              `changing your subscription.`
            ].join(' '));
          }
        }
      } else if (currentPlan.stripeData && currentPlan.stripeData.subscription) {
        // Note: This should never technically happen - no items on a subscription
        //       The path for this should be providing `planName = null` above
        await this.stripe.subscriptions.cancel(
          currentPlan.stripeData.subscription.id,
          {
            invoice_now: true,
            prorate: true
          }
        );
      }
    }
    return subscription;
  }

  async getStripeSecret (customer, name, defaultValue = null) {
    let secret;
    try {
      secret = await this.stripe.apps.secrets.find({
        name: `${this.constructor.STRIPE_METADATA_PREFIX}_secret:${name}`,
        scope: {
          type: 'user',
          user: `stripe:${customer.stripeId}`
        },
        expand: ['payload']
      });
    } catch (e) {
      if (e.message.startsWith('No such secret')) {
        return defaultValue;
      } else {
        throw e;
      }
    }
    return JSON.parse(secret.payload);
  }

  async setStripeSecret (customer, name, value = null) {
    if (value === null) {
      throw new Error(`Cannot setStripeSecret to null, try clearStripeSecret instead`);
    }
    return this.stripe.apps.secrets.create({
      name: `${this.constructor.STRIPE_METADATA_PREFIX}_secret:${name}`,
      scope: {
        type: 'user',
        user: `stripe:${customer.stripeId}`
      },
      payload: JSON.stringify(value)
    });
  }

  async clearStripeSecret (customer, name) {
    return this.stripe.apps.secrets.deleteWhere({
      name: `${this.constructor.STRIPE_METADATA_PREFIX}_secret:${name}`,
      scope: {
        type: 'user',
        user: `stripe:${customer.stripeId}`
      },
    });
  }

  calculateUsage (quantity, log10Scale = 0, log2Scale = 0) {
    quantity = Math.max(0, parseInt(quantity) || 0);
    log10Scale = Math.max(-10, Math.min(log10Scale, 0));
    log2Scale = Math.max(-10, Math.min(log2Scale, 0));
    let factor10 = Math.pow(10, -log10Scale);
    let factor2 = Math.pow(2, -log2Scale);
    let units = Math.floor(quantity / (factor10 * factor2));
    let remainder = quantity % (factor10 * factor2);
    return {
      units,
      remainder: {
        decimal: remainder * Math.pow(10, log10Scale) * Math.pow(2, log2Scale),
        quantity: remainder,
        log10Scale: log10Scale,
        log2Scale: log2Scale
      }
    }
  }

  addUsage (usageA, usageB) {
    usageA = quickClone(usageA);
    usageB = quickClone(usageB);
    let units = (usageA.units || 0) + (usageB.units || 0);
    let log10Scale = Math.min(usageA.remainder.log10Scale, usageB.remainder.log10Scale);
    let log2Scale = Math.min(usageA.remainder.log2Scale, usageB.remainder.log2Scale);
    let remainder = [usageA.remainder, usageB.remainder]
      .map(remainder => {
        remainder.quantity = remainder.quantity *
          Math.pow(10, remainder.log10Scale - log10Scale) *
          Math.pow(2, remainder.log2Scale - log2Scale);
        remainder.log10Scale = log10Scale;
        remainder.log2Scale = log10Scale;
        return remainder;
      })
      .reduce((remainder, r) => {
        remainder.quantity += r.quantity;
        remainder.decimal = remainder.quantity * Math.pow(10, log10Scale) * Math.pow(2, log2Scale);
        return remainder;
      }, {
        decimal: 0,
        quantity: 0,
        log10Scale: log10Scale,
        log2Scale: log2Scale
      });
    return this.calculateUsage(
      units * Math.pow(10, -log10Scale) * Math.pow(2, -log2Scale) + remainder.quantity,
      log10Scale,
      log2Scale
    );
  }

  async createCustomerUsageRecord (customer, lineItemName, quantity, log10Scale = 0, log2Scale = 0) {
    const [plan, usageDetails] = await Promise.all([
      customer.getCurrentPlan(this.plans),
      this.getStripeSecret(
        customer,
        `${this.constructor.STRIPE_METADATA_PREFIX}_usage_remainder:${lineItemName}`,
        {
          time: 0,
          remainder: this.calculateUsage(0).remainder
        }
      )
    ]);
    const lineItem = plan.lineItems.find(lineItem => lineItem.name === lineItemName);
    if (!lineItem) {
      throw new Error(`createUsageRecord: Line item "${lineItemName}" could not be found`);
    } else if (lineItem.type !== 'usage') {
      throw new Error([
        `createUsageRecord: Line item "${lineItemName}" is of type "${lineItem.type}",`,
        `but must be of type "usage"`
      ].join(' '));
    } else if (!lineItem.stripeData) {
      throw new Error([
        `createUsageRecord: Line item "${lineItemName}" has no matching billing data`
      ].join(' '));
    } else if (!lineItem.stripeData.subscriptionItem) {
      throw new Error([
        `createUsageRecord: Line item "${lineItemName}" has no matching subscription data`
      ].join(' '));
    }
    let time = usageDetails.time;
    let remainder = usageDetails.remainder;
    let delta = new Date().valueOf() - time;
    if (delta < this.constructor.USAGE_RECORD_WAIT_TIME) {
      throw new Error([
        `createUsageRecord: Line item "${lineItemName}" can only be updated`,
        `every ${this.constructor.USAGE_RECORD_WAIT_TIME} ms. Please try again in ${this.constructor.USAGE_RECORD_WAIT_TIME - delta} ms.`
      ].join(' '));
    }
    let newRecord = this.calculateUsage(quantity, log10Scale, log2Scale);
    let mergedRecord = this.addUsage(newRecord, {remainder});
    let usageRecord = null;
    if (mergedRecord.units) {
      usageRecord = await this.stripe.subscriptionItems.createUsageRecord(
        lineItem.stripeData.subscriptionItem.id,
        {quantity: mergedRecord.units}
      );
    }
    await this.setStripeSecret(
      customer,
      `${this.constructor.STRIPE_METADATA_PREFIX}_usage_remainder:${lineItemName}`,
      {
        time: new Date().valueOf(),
        remainder: mergedRecord.remainder
      }
    );
    return {
      newRecord: newRecord,
      rolloverRecord: {
        units: 0,
        remainder: {...remainder}
      },
      mergedRecord: {
        units: mergedRecord.units,
        remainder: {...mergedRecord.remainder}
      },
      stripeData: {usageRecord}
    };
  }

};

module.exports = CustomerManager;
