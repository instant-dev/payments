import chai from 'chai';
const expect = chai.expect;

import fs from 'fs';

import loadStripe from 'stripe';
const stripe = loadStripe(process.env.STRIPE_SECRET_KEY);

import InstantPayments from '../../core/index.js';

export const name = 'Main tests';
export default async function (setupResult) {

  let payments;
  let plans;
  let Plans;
  let LineItems;
  let email = `test+${new Date().valueOf()}@instant.dev`;
  let stripeCustomer = null;
  let stripePaymentMethod = null;
  let subId = null;

  it ('can bootstrap plans', async function () {

    this.timeout(20000);

    const t0 = new Date().valueOf();

    console.log(`Bootstrapping plans...`);

    let cache;
    ({cache, Plans, LineItems} = await InstantPayments.bootstrap(
      process.env.STRIPE_SECRET_KEY,
      './test/fixtures/plans.json',
      './test/fixtures/line_items.json'
    ));

    plans = cache;

    const t = new Date().valueOf() - t0;
    console.log(`Bootstrapping plans took ${t} ms!`);

    // Check plans
    expect(plans).to.exist;
    expect(plans.length).to.equal(Plans.length);
    
    // Check each plan
    for (let i = 0; i < plans.length; i++) {

      const plan = plans[i];
      const TemplatePlan = Plans[i];
      
      // Main settings copied over
      expect(plan.name).to.equal(TemplatePlan.name);
      expect(plan.display_name).to.equal(TemplatePlan.display_name);
      expect(plan.enabled).to.equal(TemplatePlan.enabled);
      expect(plan.visible).to.equal(TemplatePlan.visible);
      expect(plan.price).to.deep.equal(TemplatePlan.price);

      // stripeData available
      expect(plan.stripeData).to.exist;
      expect(plan.stripeData.product).to.exist;
      expect(plan.stripeData.product.object).to.equal('product');
      expect(plan.stripeData.product.active).to.equal(true);
      expect(plan.stripeData.product.name).to.equal(`Plan: ${plan.display_name}`);
      expect(plan.stripeData.product.metadata).to.exist;
      expect(plan.stripeData.product.metadata[`instpay`]).to.equal('true');
      expect(plan.stripeData.product.metadata[`instpay_name`]).to.equal(plan.name);
      expect(plan.stripeData.product.metadata[`instpay_product_type`]).to.equal('plan');

      expect(plan.stripeData.prices).to.exist;
      expect(plan.stripeData.prices.length).to.equal(1);
      expect(plan.stripeData.prices[0].object).to.equal('price');
      expect(plan.stripeData.prices[0].active).to.equal(true);
      expect(plan.stripeData.prices[0].currency).to.equal('usd');
      expect(plan.stripeData.prices[0].unit_amount).to.equal(plan.price ? plan.price['usd'] : 0);
      expect(plan.stripeData.prices[0].nickname).to.equal(plan.name);
      expect(plan.stripeData.prices[0].type).to.equal('recurring');
      expect(plan.stripeData.prices[0].product).to.equal(plan.stripeData.product.id);

      // Check line items
      expect(plan.lineItems).to.exist;
      expect(plan.lineItems.length).to.equal(LineItems.length);

      // Check each line item
      for (let j = 0; j < plan.lineItems.length; j++) {

        const lineItem = plan.lineItems[j];
        const TemplateLineItem = LineItems[j];

        expect(lineItem.name).to.equal(TemplateLineItem.name);
        expect(lineItem.display_name).to.equal(TemplateLineItem.display_name);
        expect(lineItem.description).to.equal(TemplateLineItem.description);
        expect(lineItem.type).to.equal(TemplateLineItem.type);
        expect(lineItem.plan_name).to.equal(plan.name);
        
        // Validate settings inherited from plan
        expect(lineItem.settings).to.exist;
        if (TemplatePlan.line_item_settings?.[lineItem.name]) {
          for (const key in plan.line_item_settings[lineItem.name]) {
            expect(lineItem.settings[key]).to.exist;
            expect(lineItem.settings[key]).to.deep.equal(TemplatePlan.line_item_settings[lineItem.name][key]);
          }
        }

        // Validate settings has correct properties
        if (lineItem.type === 'capacity') {

          expect(lineItem.settings).to.haveOwnProperty('price');
          expect(lineItem.settings['included_count']).to.be.a('number');

          // stripeData available
          expect(lineItem.stripeData).to.exist;
          expect(lineItem.stripeData.product).to.exist;
          expect(lineItem.stripeData.product.object).to.equal('product');
          expect(lineItem.stripeData.product.active).to.equal(true);
          expect(lineItem.stripeData.product.name).to.equal(lineItem.display_name);
          expect(lineItem.stripeData.product.metadata).to.exist;
          expect(lineItem.stripeData.product.metadata[`instpay`]).to.equal('true');
          expect(lineItem.stripeData.product.metadata[`instpay_name`]).to.equal(lineItem.name);
          expect(lineItem.stripeData.product.metadata[`instpay_product_type`]).to.equal('line_item');

          if (!lineItem.settings.price) {

            expect(lineItem.stripeData.prices.length).to.equal(0);

          } else {

            expect(lineItem.stripeData.prices.length).to.equal(1);
            expect(lineItem.stripeData.prices[0].object).to.equal('price');
            expect(lineItem.stripeData.prices[0].active).to.equal(true);
            expect(lineItem.stripeData.prices[0].currency).to.equal('usd');
            expect(lineItem.stripeData.prices[0].unit_amount).to.equal(lineItem.settings.price ? lineItem.settings.price['usd'] : 0);
            expect(lineItem.stripeData.prices[0].nickname).to.equal(lineItem.is_template ? `*.${lineItem.name}` : `${lineItem.plan_name}.${lineItem.name}`);
            expect(lineItem.stripeData.prices[0].type).to.equal('recurring');
            expect(lineItem.stripeData.prices[0].product).to.equal(lineItem.stripeData.product.id);

            expect(lineItem.stripeData.prices[0].billing_scheme).to.equal('per_unit');
            expect(lineItem.stripeData.prices[0].recurring).to.exist;
            expect(lineItem.stripeData.prices[0].recurring.usage_type).to.equal('licensed');

            expect(lineItem.stripeData.prices[0].metadata[`instpay`]).to.equal('true');
            expect(lineItem.stripeData.prices[0].metadata[`instpay_name`]).to.equal(lineItem.name);
            expect(lineItem.stripeData.prices[0].metadata[`instpay_product_type`]).to.equal('line_item');

          }

        } else if (lineItem.type === 'usage') {

          expect(lineItem.settings).to.haveOwnProperty('price');
          expect(lineItem.settings['unit_name']).to.be.a('string');
          expect(lineItem.settings['units']).to.be.a('number');
          expect(lineItem.settings['free_units']).to.be.a('number');

          // stripeData available
          expect(lineItem.stripeData).to.exist;
          expect(lineItem.stripeData.product).to.exist;
          expect(lineItem.stripeData.product.object).to.equal('product');
          expect(lineItem.stripeData.product.active).to.equal(true);
          expect(lineItem.stripeData.product.name).to.equal(lineItem.display_name);
          expect(lineItem.stripeData.product.metadata).to.exist;
          expect(lineItem.stripeData.product.metadata[`instpay`]).to.equal('true');
          expect(lineItem.stripeData.product.metadata[`instpay_name`]).to.equal(lineItem.name);
          expect(lineItem.stripeData.product.metadata[`instpay_product_type`]).to.equal('line_item');

          expect(lineItem.stripeData.prices).to.exist;
          expect(lineItem.stripeData.prices.length).to.equal(1);
          expect(lineItem.stripeData.prices[0].object).to.equal('price');
          expect(lineItem.stripeData.prices[0].active).to.equal(true);
          expect(lineItem.stripeData.prices[0].currency).to.equal('usd');
          expect(lineItem.stripeData.prices[0].unit_amount).to.equal(null);
          expect(lineItem.stripeData.prices[0].nickname).to.equal(lineItem.is_template ? `*.${lineItem.name}` : `${lineItem.plan_name}.${lineItem.name}`);
          expect(lineItem.stripeData.prices[0].type).to.equal('recurring');
          expect(lineItem.stripeData.prices[0].product).to.equal(lineItem.stripeData.product.id);

          expect(lineItem.stripeData.prices[0].billing_scheme).to.equal('tiered');
          expect(lineItem.stripeData.prices[0].recurring).to.exist;
          expect(lineItem.stripeData.prices[0].recurring.usage_type).to.equal('metered');

          expect(lineItem.stripeData.prices[0].metadata[`instpay`]).to.equal('true');
          expect(lineItem.stripeData.prices[0].metadata[`instpay_name`]).to.equal(lineItem.name);
          expect(lineItem.stripeData.prices[0].metadata[`instpay_product_type`]).to.equal('line_item');

        } else if (lineItem.type === 'flag') {

          expect(lineItem.settings).to.haveOwnProperty('value');
          expect(lineItem.settings['display_value']).to.be.a('string');

        } else {

          throw new Error(`Invalid line item type: "${lineItem.type}"`);

        }

      }

    }

  });

  it('can write plans to file', async () => {

    InstantPayments.writeCache('./test_cache.json', 'test', plans);

    expect(fs.existsSync('./test_cache.json')).to.equal(true);

  });

  it('can instantiate payments', async () => {

    payments = new InstantPayments(
      process.env.STRIPE_SECRET_KEY,
      process.env.STRIPE_PUBLISHABLE_KEY,
      './test_cache.json'
    );

    expect(payments).to.exist;

  });

  it('can retrieve a customer', async () => {

    let customer = await payments.customers.find(email);
    stripeCustomer = customer.stripeData.customer;

    expect(customer).to.exist;
    expect(customer.email).to.equal(email);
    expect(customer.stripeData).to.exist;
    expect(customer.stripeData.customer).to.exist;
    expect(customer.stripeData.customer.email).to.equal(email);
    expect(customer.stripeData.subscription).to.not.exist;

  });

  it('can not subscribe to a free tier without a payment method', async function () {

    this.timeout(5000);

    let error;

    try {
      await payments.customers.subscribe(email, 'free_plan');
    } catch (e) {
      error = e;
    }

    expect(error).to.exist;
    expect(error.message).to.contain('You must add a default payment method');

  });

  it('can not subscribe to a free tier without a payment method if only one of successURL or cancelURL exists', async function () {

    this.timeout(5000);

    let error;

    try {
      await payments.customers.subscribe(email, 'free_plan', null, null, 'https://example.com/success');
    } catch (e) {
      error = e;
    }

    expect(error).to.exist;
    expect(error.message).to.contain('You must provide both successURL and cancelURL');

  });

  it('creates a checkout session without a payment method but with successURL and cancelURL', async function () {

    this.timeout(5000);

    let subResult = await payments.customers.subscribe(email, 'free_plan', null, null, 'https://example.com/success', 'https://example.com/failure');

    expect(subResult).to.exist;
    expect(subResult.stripe_publish_key).to.exist;
    expect(subResult.stripe_checkout_session_id).to.exist;

  });

  it('should show all subscription plans', async function () {

    let planList = await payments.plans.list(email);

    expect(planList).to.exist;
    expect(planList).to.deep.equal(plans);

  });

  it('should show the current subscription plan', async function () {

    let planResult = await payments.plans.current(email);

    expect(planResult).to.exist;
    expect(planResult.currentPlan).to.exist;
    expect(planResult.plans).to.deep.equal(plans);

    expect(planResult.currentPlan.name === plans[0].name);
    expect(planResult.currentPlan.stripeData.subscription).to.not.exist;

    expect(planResult.currentPlan.is_billable).to.equal(false);
    expect(planResult.currentPlan.is_incomplete).to.equal(false);
    expect(planResult.currentPlan.is_past_due).to.equal(false);
    expect(planResult.currentPlan.invoice_url).to.equal(null);

  });

  it('should show the current subscription plan billing status', async function () {

    let planResult = await payments.plans.billingStatus(email);

    expect(planResult).to.exist;
    expect(planResult.currentPlan).to.exist;

    expect(planResult.currentPlan.is_billable).to.equal(false);
    expect(planResult.currentPlan.is_incomplete).to.equal(false);
    expect(planResult.currentPlan.is_past_due).to.equal(false);
    expect(planResult.currentPlan.invoice_url).to.equal(null);

  });

  it('can unsubscribe always, even when no sub exists', async function () {

    let unsubResult = await payments.customers.unsubscribe(email);

    expect(unsubResult).to.exist;
    expect(unsubResult).to.equal(true);

  });

  it('adds a payment method via stripe library', async function () {

    const paymentMethod = await stripe.customers.createSource(
      stripeCustomer.id,
      {source: `tok_visa`}
    );

    expect(paymentMethod).to.exist;
    expect(paymentMethod.object).to.equal('card');

  });

  it('should list customer payment methods', async function () {

    this.timeout(5000);

    let paymentMethods = await payments.paymentMethods.list(email);
    stripePaymentMethod = paymentMethods[0];

    expect(paymentMethods).to.exist;
    expect(paymentMethods.length).to.equal(1);
    expect(paymentMethods[0].card).to.exist;
    expect(paymentMethods[0].card.brand).to.equal('visa');
    expect(paymentMethods[0].metadata['is_default_method']).to.equal('true');

  });

  it('can subscribe to free tier without going through checkout', async function () {

    this.timeout(5000);

    let subscription = await payments.customers.subscribe(email, 'free_plan');
    subId = subscription.id;

    expect(subscription).to.exist;
    expect(subscription.object).to.equal('subscription');
    expect(subscription.status).to.equal('active');
    expect(subscription.customer).to.equal(stripeCustomer.id);

    expect(subscription.items).to.exist;
    expect(subscription.items.total_count).to.equal(2);
    expect(subscription.items.data.length).to.equal(2);
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'free_plan')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'execution_time')).to.exist;

  });

  it('should show the current subscription plan', async function () {

    let planResult = await payments.plans.current(email);

    expect(planResult).to.exist;
    expect(planResult.currentPlan).to.exist;
    expect(planResult.plans).to.deep.equal(plans);
    
    expect(planResult.currentPlan.name === plans[0].name);
    expect(planResult.currentPlan.stripeData.subscription).to.exist;
    expect(planResult.currentPlan.stripeData.subscription.id).to.equal(subId);
    
    expect(planResult.currentPlan.is_billable).to.equal(true);
    expect(planResult.currentPlan.is_incomplete).to.equal(false);
    expect(planResult.currentPlan.is_past_due).to.equal(false);
    expect(planResult.currentPlan.invoice_url).to.equal(null);

  });

  it('should create a usage record successfully', async function () {

    this.timeout(5000);

    const GBs = 100;
    const MBms = (GBs * 1024 * 1000);
    const overflow = 100;

    let usageResult = await payments.usageRecords.create(email, 'execution_time', MBms + overflow, -3, -10);

    expect(usageResult).to.exist;

    expect(usageResult.newRecord).to.exist;
    expect(usageResult.newRecord.units).to.equal(100);
    expect(usageResult.newRecord.remainder).to.exist;
    expect(usageResult.newRecord.remainder.decimal).to.be.greaterThan(0);
    expect(usageResult.newRecord.remainder.quantity).to.equal(100);
    expect(usageResult.newRecord.remainder.log10Scale).to.equal(-3);
    expect(usageResult.newRecord.remainder.log2Scale).to.equal(-10);

    expect(usageResult.rolloverRecord).to.exist;
    expect(usageResult.rolloverRecord.units).to.equal(0);
    expect(usageResult.rolloverRecord.remainder).to.exist;
    expect(usageResult.rolloverRecord.remainder.decimal).to.equal(0);
    expect(usageResult.rolloverRecord.remainder.quantity).to.equal(0);
    expect(usageResult.rolloverRecord.remainder.log10Scale).to.equal(0);
    expect(usageResult.rolloverRecord.remainder.log2Scale).to.equal(0);

    expect(usageResult.mergedRecord).to.exist;
    expect(usageResult.mergedRecord).to.deep.equal(usageResult.newRecord);

    expect(usageResult.stripeData).to.exist;
    expect(usageResult.stripeData.usageRecord).to.exist;
    expect(usageResult.stripeData.usageRecord.quantity).to.equal(100);

  });

  it('fail to create another usage record immediately due to time conflict', async function () {

    const GBs = 267;
    const MBms = (GBs * 1024 * 1000);
    const overflow = 233;

    let error;

    try {
      await payments.usageRecords.create(email, 'execution_time', MBms + overflow, -3, -10);
    } catch (e) {
      error = e;
    }

    expect(error).to.exist;
    expect(error.message).to.contain('"execution_time" can only be updated every 10000 ms');

  });

  it('should create another usage record successfully with overflow', async function () {

    this.timeout(5000);

    // override
    payments.customerManager.constructor.USAGE_RECORD_WAIT_TIME = 0;

    const GBs = 267;
    const MBms = (GBs * 1024 * 1000);
    const overflow = 233;

    let usageResult = await payments.usageRecords.create(email, 'execution_time', MBms + overflow, -3, -10);

    expect(usageResult).to.exist;

    expect(usageResult.newRecord).to.exist;
    expect(usageResult.newRecord.units).to.equal(267);
    expect(usageResult.newRecord.remainder).to.exist;
    expect(usageResult.newRecord.remainder.decimal).to.be.greaterThan(0);
    expect(usageResult.newRecord.remainder.quantity).to.equal(233);
    expect(usageResult.newRecord.remainder.log10Scale).to.equal(-3);
    expect(usageResult.newRecord.remainder.log2Scale).to.equal(-10);

    expect(usageResult.rolloverRecord).to.exist;
    expect(usageResult.rolloverRecord.units).to.equal(0);
    expect(usageResult.rolloverRecord.remainder).to.exist;
    expect(usageResult.rolloverRecord.remainder.decimal).to.be.greaterThan(0);
    expect(usageResult.rolloverRecord.remainder.quantity).to.equal(100);
    expect(usageResult.rolloverRecord.remainder.log10Scale).to.equal(-3);
    expect(usageResult.rolloverRecord.remainder.log2Scale).to.equal(-10);

    expect(usageResult.mergedRecord).to.exist;
    expect(usageResult.mergedRecord.units).to.equal(267);
    expect(usageResult.mergedRecord.remainder).to.exist;
    expect(usageResult.mergedRecord.remainder.decimal).to.be.greaterThan(0);
    expect(usageResult.mergedRecord.remainder.quantity).to.equal(333);
    expect(usageResult.mergedRecord.remainder.log10Scale).to.equal(-3);
    expect(usageResult.mergedRecord.remainder.log2Scale).to.equal(-10);

    expect(usageResult.stripeData).to.exist;
    expect(usageResult.stripeData.usageRecord).to.exist;
    expect(usageResult.stripeData.usageRecord.quantity).to.equal(267);

  });

  it('should fail to add line items to plan if not all provided', async function () {

    this.timeout(5000);

    let error;

    try {
      await payments.customers.subscribe(email, 'free_plan', {collaborator_seats: 4});
    } catch (e) {
      error = e;
    }

    expect(error).to.exist;
    expect(error.message).to.contain('must provide line items');
    expect(error.message).to.contain('"projects"');
    expect(error.message).to.contain('"environments"');
    expect(error.message).to.contain('"linked_apps"');
    expect(error.message).to.contain('"hostnames"');

  });

  it('should add line items to plan', async function () {

    this.timeout(5000);

    let subscription = await payments.customers.subscribe(
      email,
      'free_plan',
      {
        collaborator_seats: 4,
        projects: 15,
        environments: 2,
        linked_apps: 0,
        hostnames: 0
      }
    );

    expect(subscription).to.exist;
    expect(subscription.items).to.exist;
    expect(subscription.items.total_count).to.equal(5);
    expect(subscription.items.data.length).to.equal(5);
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'free_plan')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'execution_time')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'collaborator_seats')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'projects')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'environments')).to.exist;

  });

  it('should retrieve updated plan details with new line items set properly', async function () {

    let planResult = await payments.plans.current(email);

    expect(planResult).to.exist;
    expect(planResult.currentPlan).to.exist;
    expect(planResult.plans).to.deep.equal(plans);

    expect(planResult.currentPlan.name).to.equal('free_plan');

    let lineItem;
    
    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'collaborator_seats');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(4);

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'projects');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(15);

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'environments');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(2);

    expect(planResult.currentPlan.is_billable).to.equal(true);
    expect(planResult.currentPlan.is_incomplete).to.equal(false);
    expect(planResult.currentPlan.is_past_due).to.equal(false);
    expect(planResult.currentPlan.invoice_url).to.equal(null);

  });

  it('should modify line items for plans', async function () {

    this.timeout(5000);

    let subscription = await payments.customers.subscribe(
      email,
      'free_plan',
      {
        collaborator_seats: 6,
        projects: 12,
        environments: 10,
        linked_apps: 1,
        hostnames: 0
      }
    );

    expect(subscription).to.exist;
    expect(subscription.items).to.exist;
    expect(subscription.items.total_count).to.equal(6);
    expect(subscription.items.data.length).to.equal(6);
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'free_plan')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'execution_time')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'collaborator_seats')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'projects')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'environments')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'linked_apps')).to.exist;

  });

  it('should retrieve further modified plan details with new line items set properly', async function () {

    this.timeout(5000);

    let planResult = await payments.plans.current(email);

    expect(planResult).to.exist;
    expect(planResult.currentPlan).to.exist;
    expect(planResult.plans).to.deep.equal(plans);

    expect(planResult.currentPlan.name).to.equal('free_plan');

    let lineItem;
    
    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'collaborator_seats');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(6);

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'projects');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(12);

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'environments');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(10);

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'linked_apps');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(1);

    expect(planResult.currentPlan.is_billable).to.equal(true);
    expect(planResult.currentPlan.is_incomplete).to.equal(false);
    expect(planResult.currentPlan.is_past_due).to.equal(false);
    expect(planResult.currentPlan.invoice_url).to.equal(null);

  });

  it('should upgrade plan and automatically update line items', async function () {

    this.timeout(5000);

    let subscription = await payments.customers.subscribe(
      email,
      'business_plan'
    );

    expect(subscription).to.exist;
    expect(subscription.items).to.exist;
    expect(subscription.items.total_count).to.equal(3);
    expect(subscription.items.data.length).to.equal(3);
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'business_plan')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'execution_time')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'collaborator_seats')).to.exist;

  });

  it('should retrieve upgraded plan line items set properly', async function () {

    this.timeout(5000);

    let planResult = await payments.plans.current(email);

    expect(planResult).to.exist;
    expect(planResult.currentPlan).to.exist;
    expect(planResult.plans).to.deep.equal(plans);

    expect(planResult.currentPlan.name).to.equal('business_plan');

    let lineItem;
    
    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'collaborator_seats');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(3); // Was 2 free + 6, now should be 5 free + 3

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'projects');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(0);

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'environments');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(0);

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'linked_apps');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(0);

    expect(planResult.currentPlan.is_billable).to.equal(true);
    expect(planResult.currentPlan.is_incomplete).to.equal(false);
    expect(planResult.currentPlan.is_past_due).to.equal(false);
    expect(planResult.currentPlan.invoice_url).to.equal(null);

  });

  it('should downgrade plan and automatically update line items', async function () {

    this.timeout(5000);

    let subscription = await payments.customers.subscribe(
      email,
      'standard_plan'
    );

    expect(subscription).to.exist;
    expect(subscription.items).to.exist;
    expect(subscription.items.total_count).to.equal(3);
    expect(subscription.items.data.length).to.equal(3);
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'standard_plan')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'execution_time')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'collaborator_seats')).to.exist;

  });

  it('should retrieve downgraded plan line items set properly', async function () {

    let planResult = await payments.plans.current(email);

    expect(planResult).to.exist;
    expect(planResult.currentPlan).to.exist;
    expect(planResult.plans).to.deep.equal(plans);

    expect(planResult.currentPlan.name).to.equal('standard_plan');

    let lineItem;
    
    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'collaborator_seats');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(3);

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'projects');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(0);

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'environments');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(0);

    lineItem = planResult.currentPlan.lineItems.find(lineItem => lineItem.name === 'linked_apps');
    expect(lineItem).to.exist;
    expect(lineItem.purchased_count).to.equal(0);

    expect(planResult.currentPlan.is_billable).to.equal(true);
    expect(planResult.currentPlan.is_incomplete).to.equal(false);
    expect(planResult.currentPlan.is_past_due).to.equal(false);
    expect(planResult.currentPlan.invoice_url).to.equal(null);

  });

  it('should list invoices successfully', async function () {

    let invoices = await payments.invoices.list(email);

    expect(invoices).to.exist;
    expect(invoices.length).to.equal(5);
    expect(invoices[4].total).to.equal(0); // free_plan
    expect(invoices[3].total).to.equal(16500); // free_plan w line items
    expect(invoices[2].total).to.equal(7000); // free_plan update
    expect(invoices[1].total).to.equal(16534); // upgrade to business_plan
    expect(invoices[0].total).to.equal(-23000); // downgrade to standard_plan

  });

  it('should list upcoming invoice', async function () {

    let invoice = await payments.invoices.upcoming(email);

    expect(invoice).to.exist;
    expect(invoice.billing_reason).to.equal('upcoming');
    expect(invoice.lines.data.length).to.equal(3); // same as line items above

  });

  it('should refuse to delete default payment method if there is an active subscription', async function () {

    let error;

    try {
      await payments.paymentMethods.remove(email, stripePaymentMethod.id);
    } catch (e) {
      error = e;
    }

    expect(error).to.exist;
    expect(error.message).to.contain('can not remove the last payment method on account with an active subscription');

  });

  it('adds a new payment method via stripe library that will fail to charge', async function () {

    const paymentMethod = await stripe.customers.createSource(
      stripeCustomer.id,
      {source: `tok_chargeCustomerFail`}
    );

    expect(paymentMethod).to.exist;
    expect(paymentMethod.object).to.equal('card');

  });

  it('lists new payment methods then sets a new one', async function () {

    this.timeout(5000);

    let paymentMethods = await payments.paymentMethods.list(email);
    let newPaymentMethod = paymentMethods[1];

    expect(paymentMethods).to.exist;
    expect(paymentMethods.length).to.equal(2);
    expect(paymentMethods[1].metadata['is_default_method']).to.not.exist;

    let paymentMethod = await payments.paymentMethods.setDefault(email, newPaymentMethod.id);

    expect(paymentMethod).to.exist;
    expect(paymentMethod.id).to.equal(newPaymentMethod.id);
    expect(paymentMethod.metadata['is_default_method']).to.equal('true');

  });

  it('sets a the default payment method back to the original', async function () {

    this.timeout(5000);

    let paymentMethod = await payments.paymentMethods.setDefault(email, stripePaymentMethod.id);

    expect(paymentMethod).to.exist;
    expect(paymentMethod.id).to.equal(stripePaymentMethod.id);
    expect(paymentMethod.metadata['is_default_method']).to.equal('true');

  });

  it('should now successfully delete the payment method on active subscription and set other to default', async function () {

    this.timeout(5000);

    let paymentMethods = await payments.paymentMethods.remove(email, stripePaymentMethod.id);

    expect(paymentMethods).to.exist;
    expect(paymentMethods.length).to.equal(1);
    expect(paymentMethods[0].id).to.not.equal(stripePaymentMethod.id);
    expect(paymentMethods[0].metadata['is_default_method']).to.equal('true');

    // Reset our cached method
    stripePaymentMethod = paymentMethods[0];

  });

  it('should fail to upgrade when a provided line item count is free', async function () {

    this.timeout(5000);

    let error;

    try {
      await payments.customers.subscribe(
        email,
        'business_plan',
        {
          collaborator_seats: 100,
          projects: 10,
          environments: 0,
          linked_apps: 0,
          hostnames: 0
        }
      );
    } catch (e) {
      error = e;
    }

    expect(error).to.exist;
    expect(error.message).to.contain('Line item "projects" is free, should not supply count');

  });

  it('should upgrade plan back to business with a major charge using bad credit card', async function () {

    this.timeout(5000);

    let subscription = await payments.customers.subscribe(
      email,
      'business_plan',
      {
        collaborator_seats: 100,
        projects: 0,
        environments: 0,
        linked_apps: 0,
        hostnames: 0
      }
    );

    expect(subscription).to.exist;
    expect(subscription.items).to.exist;
    expect(subscription.items.total_count).to.equal(3);
    expect(subscription.items.data.length).to.equal(3);
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'business_plan')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'execution_time')).to.exist;
    expect(subscription.items.data.find(item => item.metadata['instpay_name'] === 'collaborator_seats')).to.exist;

  });

  it('should find billing status is past_due now that charge has failed', async function () {

    this.timeout(5000);

    let planResult = await payments.plans.billingStatus(email);

    expect(planResult).to.exist;
    expect(planResult.currentPlan).to.exist;

    expect(planResult.currentPlan.is_billable).to.equal(true);
    expect(planResult.currentPlan.is_incomplete).to.equal(false);
    expect(planResult.currentPlan.is_past_due).to.equal(true);
    expect(planResult.currentPlan.invoice_url).to.exist;

  });

  it('should fail to cancel the subscription if you\'re over usage', async function () {

    this.timeout(5000);

    let error;
    
    try {
      await payments.customers.unsubscribe(email, {collaborator_seats: 7, projects: 22, memory: 1024});
    } catch (e) {
      error = e;
    }

    expect(error).to.exist;
    expect(error.message).to.contain(`"collaborator_seats" must be reduced from 7 to 2`);
    expect(error.message).to.contain(`"projects" must be reduced from 22 to 10`);
    expect(error.message).to.contain(`"memory" must be reduced from 1024 to 512`);
    expect(error.details).to.exist;
    expect(error.details['collaborator_seats']).to.deep.equal({expected: 2, actual: 7});
    expect(error.details['projects']).to.deep.equal({expected: 10, actual: 22});
    expect(error.details['memory']).to.deep.equal({expected: 512, actual: 1024});

  });

  it('should cancel the subscription', async function () {

    this.timeout(5000);

    let unsubResult = await payments.customers.unsubscribe(email);

    expect(unsubResult).to.equal(true);

  });

  it('should show plan as "free_plan" and empty', async function () {

    let planResult = await payments.plans.current(email);

    expect(planResult).to.exist;
    expect(planResult.currentPlan).to.exist;
    expect(planResult.plans).to.deep.equal(plans);

    expect(planResult.currentPlan.name === plans[0].name);
    expect(planResult.currentPlan.stripeData.subscription).to.not.exist;

    expect(planResult.currentPlan.is_billable).to.equal(false);
    expect(planResult.currentPlan.is_incomplete).to.equal(false);
    expect(planResult.currentPlan.is_past_due).to.equal(false);
    expect(planResult.currentPlan.invoice_url).to.equal(null);

  });

  it('should allow for removal of final payment method with no active sub', async function () {

    this.timeout(5000);

    let paymentMethods = await payments.paymentMethods.remove(email, stripePaymentMethod.id);

    expect(paymentMethods.length).to.equal(0);

  });

  it('should fail to create a new payment method checkout session if successURL or cancelURL are not provided', async function () {

    let error;

    try {
      await payments.paymentMethods.create(email);
    } catch (e) {
      error = e;
    }

    expect(error).to.exist;
    expect(error.message).to.contain('successURL');
    expect(error.message).to.contain('cancelURL');

  });

  it('should successfully create new payment method checkout session', async function () {

    let checkoutSession = await payments.paymentMethods.create(email, 'https://example.com/success', 'https://example.com/failure');

    expect(checkoutSession).to.exist;
    expect(checkoutSession.stripe_publish_key).to.exist;
    expect(checkoutSession.stripe_checkout_session_id).to.exist;

  });

};
