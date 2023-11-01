const quickClone = obj => JSON.parse(JSON.stringify(obj));

class Customer {

  constructor (stripeMetadataPrefix, stripe, email) {
    this.STRIPE_METADATA_PREFIX = stripeMetadataPrefix;
    if (typeof email !== 'string') {
      throw new Error(`Customer "email" must be a string`)
    }
    if (!email) {
      throw new Error(`Customer "email" must be non-empty`)
    }
    if (email.indexOf('@') === -1) {
      throw new Error(`Customer "email" must be valid`)
    }
    this.stripe = stripe;
    this.email = email;
    this.stripeId = null;
    this.currency = null;
    this.stripeDetails = {};
    this.stripeMetadata = {};
    this.stripeData = {
      customer: null,
      subscription: null
    };
  }

  toJSON () {
    return {
      email: this.email,
      stripeData: Object.keys(this.stripeData).reduce((data, key) => {
        if (this.stripeData[key]) {
          data[key] = this.stripeData[key];
        }
        return data;
      }, {})
    }
  }

  serializeStripeMetadata () {
    return {
      ...this.stripeMetadata,
      [this.STRIPE_METADATA_PREFIX]: 'true'
    };
  }

  setStripeMetadata (name, value) {
    if (!value) {
      throw new Error(`Cannot set metadata to empty value`);
    }
    return this.stripeMetadata[`ext:${name}`] = JSON.stringify(value);
  }

  clearStripeMetadata (name) {
    delete this.stripeMetadata[`ext:${name}`];
    return true;
  }

  getStripeMetadata (name, defaultValue) {
    let value = this.stripeMetadata[`ext:${name}`];
    if (value) {
      return JSON.parse(value);
    } else {
      return defaultValue;
    }
  }

  _updateStripeDetails (data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`updateStripeDetails requires valid data object`);
    }
    let copyData = {...data};
    const allowedProps = ['name', 'description', 'phone', 'shipping'];
    const details = allowedProps.reduce((details, key) => {
      details[key] = copyData[key] || null;
      delete copyData[key];
      return details;
    }, {});
    if (Object.keys(copyData).length) {
      throw new Error([
        `updateStripeDetails disallowed properties: "${Object.keys(copyData).join('", "')}"`,
        `Only supports: "${allowedProps.join('", "')}"`
      ].join('\n'));
    }
    return this.stripeDetails = details;
  }

  async updateStripeDetails (data) {
    this._updateStripeDetails(data);
    return await this.syncToStripe();
  }

  async syncFromStripe () {
    let customers = [];
    let customersResponse = {has_more: true};
    let query = {limit: 100};
    while (customersResponse.has_more) {
      customersResponse = await this.stripe.customers.list({
        email: this.email,
        ...query
      });
      if (customersResponse.data.length) {
        customers = customers.concat(customersResponse.data);
        query.starting_after = customers[customers.length - 1].id;
      }
    }
    let customer = customers.find(customer => customer.metadata[this.STRIPE_METADATA_PREFIX] === 'true');
    if (!customer) {
      customer = customers.find(customer => customer.currency === 'usd');
    }
    if (!customer) {
      customer = customers.find(customer => !customer.currency);
    }
    if (customer) {
      this.stripeId = customer.id;
      this.stripeData.customer = customer;
      this.stripeMetadata = {...customer.metadata};
    } else {
      this.stripeId = null;
      this.stripeData.customer = null;
      this.stripeData.subscription = null;
      this.stripeMetadata = {};
    }
    return this;
  }

  async syncToStripe (force = false) {
    let customer = this.stripeData.customer;
    if (!customer || force) {
      await this.syncFromStripe();
      customer = this.stripeData.customer;
    }
    const metadata = this.serializeStripeMetadata();
    if (!customer) {
      customer = await this.stripe.customers.create({
        email: this.email,
        ...this.stripeDetails,
        metadata: metadata
      });
    } else {
      customer = await this.stripe.customers.update(
        customer.id,
        {
          email: this.email,
          ...this.stripeDetails,
          metadata: metadata
        }
      );
    }
    this.stripeId = customer.id;
    this.stripeData.customer = customer;
    return this;
  }

  async ensureInStripe () {
    if (this.stripeId) {
      return this;
    } else {
      return this.syncToStripe();
    }
  }

  async getCurrentPlan (plans, subscription = null) {
    await this.ensureInStripe();
    if (!Array.isArray(plans)) {
      throw new Error(`Must provide valid plans to getCurrentPlan`);
    }
    if (!subscription) {
      subscription = await this.getSubscription();
    }
    let plan;
    let planSubItem = null;
    let lineSubItems = [];
    if (!subscription) {
      plan = plans.find(plan => plan.price === null);
      if (!plan) {
        throw new Error(`Customer "${customer.stripeData.email}" has no plan, and no free plan found`);
      }
    } else {
      let subscriptionItems = [];
      let subscriptionItemsResponse = {has_more: true};
      let query = {limit: 100};
      while (subscriptionItemsResponse.has_more) {
        subscriptionItemsResponse = await this.stripe.subscriptionItems.list({
          subscription: subscription.id,
          ...query
        });
        if (subscriptionItemsResponse.data.length) {
          subscriptionItems = subscriptionItems.concat(subscriptionItemsResponse.data);
          query.starting_after = subscriptionItems[subscriptionItems.length - 1].id;
        }
      }
      let planSubItems = subscriptionItems.filter(subItem => {
        return subItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_product_type`] === 'plan'
      });
      lineSubItems = subscriptionItems.filter(subItem => {
        return subItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_product_type`] === 'line_item'
      });
      if (planSubItems.length > 1) {
        throw new Error(`Customer "${this.email}" has duplicate plans`);
      } else if (!planSubItems.length) {
        plan = plans.find(plan => plan.price === null);
        if (!plan) {
          throw new Error(`Customer "${this.email}" has no plan, and no free plan found`);
        }
      } else {
        planSubItem = planSubItems[0];
        plan = plans.find(plan => plan.name === planSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_name`]);
        if (!plan) {
          throw new Error(`Customer "${this.email}" has outdated plan: "${planSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_name`]}"`);
        }
      }
    }
    plan = quickClone(plan);
    if (subscription) {
      plan.is_billable = true;
      plan.is_incomplete = subscription.status === 'incomplete';
      plan.is_past_due = subscription.status === 'past_due';
      if (plan.is_incomplete || plan.is_past_due) {
        const latestInvoice = await this.getLatestInvoice(subscription);
        plan.invoice_url = latestInvoice.hosted_invoice_url;
      } else {
        plan.invoice_url = null;
      }
      plan.stripeData.subscription = subscription;
      if (planSubItem) {
        plan.stripeData.subscriptionItem = planSubItem;
      }
    } else {
      plan.is_billable = false;
      plan.is_incomplete = false;
      plan.is_past_due = false;
      plan.invoice_url = null;
    }
    // Populate usageRecords if applicable
    lineSubItems = await Promise.all(
      lineSubItems.map(lineSubItem => {
        if (lineSubItem.price.recurring.usage_type === 'metered') {
          return (async () => {
            let usageRecords = [];
            let usageRecordsResponse = {has_more: true};
            let query = {limit: 100};
            while (usageRecordsResponse.has_more) {
              usageRecordsResponse = await this.stripe.subscriptionItems.listUsageRecordSummaries(
                lineSubItem.id,
                query
              );
              if (usageRecordsResponse.data.length) {
                usageRecords = usageRecords.concat(usageRecordsResponse.data);
                query.starting_after = usageRecords[usageRecords.length - 1].id;
              }
            }
            lineSubItem.usageRecords = usageRecords;
            return lineSubItem;
          })()
        } else {
          return lineSubItem;
        }
      })
    );
    lineSubItems.forEach(lineSubItem => {
      let lineItem = plan.lineItems.find(lineItem => {
        return lineItem.name === lineSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_name`];
      });
      if (!lineItem) {
        throw new Error([
          `Customer "${this.email}" (${this.stripeId})`,
          `has line item "${lineSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_name`]}"`,
          `belonging to "${lineSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_line_item_plan`]}"`,
          `that does not match an existing line item in config`
        ].join(' '));
      } else if (lineItem.is_template && lineSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_line_item_plan`] !== '*') {
        throw new Error([
          `Customer "${this.email}" (${this.stripeId})`,
          `has line item "${lineSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_name`]}" belonging to plan "${lineSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_line_item_plan`]}"`,
          `but they should be using the template line item for their current plan "${plan.name}"`
        ].join(' '));
      } else if (!lineItem.is_template && lineSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_line_item_plan`] !== plan.name) {
        throw new Error([
          `Customer "${this.email}" (${this.stripeId})`,
          `has line item "${lineSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_name`]}" belonging to plan "${lineSubItem.price.metadata[`${this.STRIPE_METADATA_PREFIX}_line_item_plan`]}"`,
          `but they should be using the line item for their current plan "${plan.name}"`
        ].join(' '));
      }
      lineItem.stripeData.subscriptionItem = lineSubItem;
    });
    plan.lineItems.forEach(lineItem => {
      let lineSubItem = lineItem.stripeData
        ? lineItem.stripeData.subscriptionItem
        : null;
      let quantity = lineSubItem
        ? lineSubItem.quantity
        : 0;
      let quantityLookup = {};
      try {
        quantityLookup = lineSubItem
          ? JSON.parse(lineSubItem.metadata.quantity_lookup)
          : {};
      } catch (e) {
        quantityLookup = {};
      }
      if (lineItem.type === 'capacity') {
        lineItem.purchased_count = quantity;
      }
      // FIXME: Support for capacity.unique if needed
      // } else if (lineItem.type === 'capacity.unique') {
      //   lineItem.purchased_count = quantity;
      //   lineItem.purchased_lookup = quantityLookup;
      //   let sum = Object.keys(quantityLookup)
      //     .reduce((sum, key) => {
      //       let count = quantityLookup[key];
      //       return sum += count;
      //     }, 0)
      //   if (sum !== quantity) {
      //     throw new Error([
      //       `Customer "${this.email}" (${this.stripeId})`,
      //       `has line_item quantity mismatch from line_item quantity_lookup`,
      //       `for "${lineItem.name}"`
      //     ].join(' '));
      //   }
      // }
    });
    return plan;
  }

  async createPaymentMethodSession (successURL, cancelURL) {
    if (!successURL || !cancelURL) {
      throw new Error(`You must provide both successURL and cancelURL`);
    }
    await this.ensureInStripe();
    let checkoutSession = await this.stripe.checkout.sessions.create(
      {
        customer: this.stripeId,
        mode: 'setup',
        currency: 'usd',
        payment_method_types: ['card'],
        metadata: {
          [this.STRIPE_METADATA_PREFIX]: 'true'
        },
        success_url: successURL,
        cancel_url: cancelURL
      }
    );
    return {
      stripe_checkout_session_id: checkoutSession.id
    };
  }

  async createCheckoutSession (lineItems, subscriptionData, successURL, cancelURL) {
    if (!successURL || !cancelURL) {
      throw new Error(`You must provide both successURL and cancelURL`);
    }
    await this.ensureInStripe();
    const serializedLineItems = lineItems.map(lineItem => {
      let serializedItem = {...lineItem};
      delete serializedItem.metadata;
      return serializedItem;
    });
    let checkoutSession = await this.stripe.checkout.sessions.create(
      {
        line_items: serializedLineItems,
        subscription_data: subscriptionData,
        customer: this.stripeId,
        mode: 'subscription',
        currency: 'usd',
        payment_method_types: ['card'],
        metadata: {
          [this.STRIPE_METADATA_PREFIX]: 'true'
        },
        success_url: successURL,
        cancel_url: cancelURL
      }
    );
    return {
      stripe_checkout_session_id: checkoutSession.id
    };
  }

  async listPaymentMethods (sanitize = false) {
    await this.ensureInStripe();
    let paymentMethodsList = await this.stripe.paymentMethods.list({customer: this.stripeId});
    let paymentMethods = paymentMethodsList.data.slice();
    let defaultPaymentMethod = paymentMethods.find(paymentMethod => {
      return paymentMethod.metadata.is_default_method === 'true';
    });
    if (!defaultPaymentMethod && paymentMethods.length) {
      await this.setDefaultPaymentMethod(paymentMethods[0].id);
      paymentMethodsList = await this.stripe.paymentMethods.list({customer: this.stripeId});
      paymentMethods = paymentMethodsList.data.slice();
      defaultPaymentMethod = paymentMethods.find(paymentMethod => {
        return paymentMethod.metadata.is_default_method === 'true';
      });
    }
    if (defaultPaymentMethod) {
      // Always put default first
      paymentMethods.splice(paymentMethods.indexOf(defaultPaymentMethod), 1);
      paymentMethods.unshift(defaultPaymentMethod);
    }
    return sanitize
      ? paymentMethods.map(paymentMethod => {
          const {id, billing_details, card, metadata, created} = paymentMethod;
          return {id, billing_details, card, metadata, created};
        })
      : paymentMethods;
  }

  async setDefaultPaymentMethod (id, sanitize = false) {
    await this.ensureInStripe();
    let subscriptionsList = await this.stripe.subscriptions.list({customer: this.stripeId});
    let subscriptions = subscriptionsList.data.filter(subscription => {
      return subscription.metadata[this.STRIPE_METADATA_PREFIX] === 'true';
    });
    let paymentMethodsList = await this.stripe.paymentMethods.list({customer: this.stripeId});
    let paymentMethods = paymentMethodsList.data;
    if (!paymentMethods.find(pm => pm.id === id)) {
      throw new Error(`No corresponding payment method found for Customer "${this.email}"`);
    }
    let paymentMethod = null;
    let subResults = await Promise.all(
      subscriptions.map(sub => {
        return (async () => {
          await this.stripe.subscriptions.update(sub.id, {default_payment_method: id})
        })()
      })
    );
    let paymentMethodResults = await Promise.all(
      paymentMethods.map(method => {
        return (async () => {
          let pm = await this.stripe.paymentMethods.update(
            method.id,
            {
              metadata: {
                is_default_method: method.id === id
              }
            }
          );
          if (method.id === id) {
            paymentMethod = pm;
          }
        })()
      })
    );
    return sanitize
      ? [paymentMethod].map(paymentMethod => {
          const {id, billing_details, card, metadata, created} = paymentMethod;
          return {id, billing_details, card, metadata, created};
        })[0]
      : paymentMethod;
  }

  async removePaymentMethod (id, sanitize = false) {
    let subscription = await this.getSubscription();
    let paymentMethods = await this.listPaymentMethods();
    let paymentMethod = paymentMethods.find(paymentMethod => paymentMethod.id === id);
    if (!paymentMethod) {
      throw new Error(`No corresponding payment method found for Customer "${this.email}", could not remove.`);
    } else if (subscription && paymentMethods.length === 1) {
      throw new Error([
        `Customer "${this.email}" can not remove the last payment method on account with an active subscription.`,
        `Please cancel your active subscription before removing this payment method.`
      ].join('\n'));
    }
    await this.stripe.paymentMethods.detach(id);
    return await this.listPaymentMethods(sanitize);
  }

  async getSubscription () {
    if (this.stripeData.subscription) {
      return this.stripeData.subscription;
    }
    const subscriptionsList = await this.stripe.subscriptions.list({
      customer: this.stripeId
    });
    const subscriptions = subscriptionsList.data;
    let subscription = subscriptions.find(sub => {
      return sub.items &&
        sub.items.data &&
        sub.items.data.length &&
        sub.items.data[0].price.metadata[this.STRIPE_METADATA_PREFIX];
    }) || null;
    if (!subscription || !subscription.default_payment_method) {
      await this.listPaymentMethods();
    }
    if (subscription) {
      this.stripeData.subscription = subscription;
    }
    return subscription;
  }

  async getUpcomingInvoice (subscription = null) {
    if (!subscription) {
      subscription = await this.getSubscription();
    }
    if (subscription) {
      const upcomingInvoice = await this.stripe.invoices.retrieveUpcoming({
        customer: this.stripeId,
        subscription: subscription.id,
        expand: ['subscription']
      });
      return upcomingInvoice;
    } else {
      return null;
    }
  }

  async getLatestInvoice (subscription = null) {
    if (!subscription) {
      subscription = await this.getSubscription();
    }
    if (subscription) {
      const latestInvoice = await this.stripe.invoices.retrieve(subscription.latest_invoice);
      return latestInvoice;
    } else {
      return null;
    }
  }

  async listInvoices (count = 10) {
    count = Math.max(1, Math.min(parseInt(count) || 0, 100));
    let invoices = [];
    let invoicesResponse = {has_more: true};
    let query = {limit: 100};
    while (invoicesResponse.has_more) {
      invoicesResponse = await this.stripe.invoices.list({
        customer: this.stripeId,
        ...query
      });
      if (invoicesResponse.data.length) {
        invoices = invoices.concat(invoicesResponse.data);
        query.starting_after = invoices[invoices.length - 1].id;
      }
    }
    return invoices
      .filter(invoice => invoice.status !== 'draft')
      .slice(0, count);
  }

  async requiresPayment (subscription = null) {
    subscription = subscription || this.stripeData.subscription;
    const invoice = await this.getUpcomingInvoice(subscription);
    const hasPaymentMethod = !!subscription.default_payment_method;
    const invoiceHasAmountDue = invoice && invoice.amount_remaining > 0;
    return !hasPaymentMethod && !!invoiceHasAmountDue;
  }

  async shouldLock (plans, subscription = null) {
    const plan = await this.getCurrentPlan(plans, subscription);
    subscription = this.stripeData.subscription;
    let requiresPayment = await this.requiresPayment(subscription);
    return !plan.price && !!requiresPayment;
  }

}

module.exports = Customer;
