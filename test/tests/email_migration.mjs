import chai from 'chai';
const expect = chai.expect;

import loadStripe from 'stripe';
const stripe = loadStripe(process.env.STRIPE_SECRET_KEY);

import InstantPayments from '../../core/index.js';

export const name = 'Email migration tests';
export default async function (setupResult) {

  let payments;
  const ts = new Date().valueOf();

  it('can bootstrap and instantiate payments for migration tests', async function () {

    this.timeout(20000);

    let cache;
    ({cache} = await InstantPayments.bootstrap(
      process.env.STRIPE_SECRET_KEY,
      './_instant/payments/plans.json',
      './_instant/payments/line_items.json'
    ));

    InstantPayments.writeCache('./test_cache.json', 'test', cache);

    payments = new InstantPayments(
      process.env.STRIPE_SECRET_KEY,
      process.env.STRIPE_PUBLISHABLE_KEY,
      './test_cache.json'
    );

    expect(payments).to.exist;

  });

  it('supports string email (backwards compat) and auto-sets _unique_email metadata', async function () {

    this.timeout(10000);

    const email = `test+string_${ts}@instant.dev`;
    let customer = await payments.customers.find({email});

    expect(customer).to.exist;
    expect(customer.email).to.equal(email);
    expect(customer.uniqueEmail).to.equal(email);
    expect(customer.billingEmail).to.equal(email);
    expect(customer.stripeData.customer).to.exist;
    expect(customer.stripeData.customer.email).to.equal(email);
    expect(customer.stripeData.customer.metadata.instpay_unique_email).to.equal(email);

  });

  it('creates customer with object email { unique_email, billing_email }', async function () {

    this.timeout(10000);

    const uniqueEmail = `test+obj_unique_${ts}@instant.dev`;
    const billingEmail = `test+obj_billing_${ts}@instant.dev`;

    let customer = await payments.customers.find({
      email: {unique_email: uniqueEmail, billing_email: billingEmail}
    });

    expect(customer).to.exist;
    expect(customer.email).to.equal(billingEmail);
    expect(customer.uniqueEmail).to.equal(uniqueEmail);
    expect(customer.billingEmail).to.equal(billingEmail);
    expect(customer.stripeData.customer).to.exist;
    expect(customer.stripeData.customer.email).to.equal(billingEmail);
    expect(customer.stripeData.customer.metadata.instpay_unique_email).to.equal(uniqueEmail);

  });

  it('auto-migrates unmigrated customer when unique_email === billing_email', async function () {

    this.timeout(10000);

    const email = `test+samemigrate_${ts}@instant.dev`;

    // Simulate pre-migration customer: has instpay metadata but no _unique_email
    const stripeCustomer = await stripe.customers.create({
      email: email,
      metadata: {instpay: 'true'}
    });

    let customer = await payments.customers.find({
      email: {unique_email: email, billing_email: email}
    });

    expect(customer).to.exist;
    expect(customer.email).to.equal(email);
    expect(customer.stripeData.customer).to.exist;
    expect(customer.stripeData.customer.id).to.equal(stripeCustomer.id);
    expect(customer.stripeData.customer.email).to.equal(email);
    expect(customer.stripeData.customer.metadata.instpay_unique_email).to.equal(email);

  });

  it('auto-migrates unmigrated customer with different billing_email', async function () {

    this.timeout(10000);

    const uniqueEmail = `test+diffmigrate_${ts}@instant.dev`;
    const billingEmail = `test+diffbilling_${ts}@instant.dev`;

    // Simulate pre-migration customer under the old (unique) email
    const stripeCustomer = await stripe.customers.create({
      email: uniqueEmail,
      metadata: {instpay: 'true'}
    });

    let customer = await payments.customers.find({
      email: {unique_email: uniqueEmail, billing_email: billingEmail}
    });

    expect(customer).to.exist;
    expect(customer.email).to.equal(billingEmail);
    expect(customer.stripeData.customer).to.exist;
    expect(customer.stripeData.customer.id).to.equal(stripeCustomer.id);
    expect(customer.stripeData.customer.email).to.equal(billingEmail);
    expect(customer.stripeData.customer.metadata.instpay_unique_email).to.equal(uniqueEmail);

  });

  it('finds migrated customer on subsequent lookups without re-migration', async function () {

    this.timeout(10000);

    const uniqueEmail = `test+postmig_${ts}@instant.dev`;
    const billingEmail = `test+postbill_${ts}@instant.dev`;
    const emailObj = {unique_email: uniqueEmail, billing_email: billingEmail};

    // Create unmigrated customer, then trigger migration
    await stripe.customers.create({
      email: uniqueEmail,
      metadata: {instpay: 'true'}
    });

    let customer1 = await payments.customers.find({email: emailObj});

    // Second lookup: should find via billingEmail + _unique_email metadata directly
    let customer2 = await payments.customers.find({email: emailObj});

    expect(customer2).to.exist;
    expect(customer2.stripeData.customer.id).to.equal(customer1.stripeData.customer.id);
    expect(customer2.stripeData.customer.email).to.equal(billingEmail);
    expect(customer2.stripeData.customer.metadata.instpay_unique_email).to.equal(uniqueEmail);

  });

  it('distinguishes multiple customers with same billing_email by unique_email', async function () {

    this.timeout(15000);

    const uniqueEmail1 = `test+multi1_${ts}@instant.dev`;
    const uniqueEmail2 = `test+multi2_${ts}@instant.dev`;
    const billingEmail = `test+multibill_${ts}@instant.dev`;

    // Create two pre-migrated customers sharing the same billing email
    const stripeCustomer1 = await stripe.customers.create({
      email: billingEmail,
      metadata: {instpay: 'true', instpay_unique_email: uniqueEmail1}
    });
    const stripeCustomer2 = await stripe.customers.create({
      email: billingEmail,
      metadata: {instpay: 'true', instpay_unique_email: uniqueEmail2}
    });

    let customer1 = await payments.customers.find({
      email: {unique_email: uniqueEmail1, billing_email: billingEmail}
    });
    expect(customer1).to.exist;
    expect(customer1.stripeData.customer.id).to.equal(stripeCustomer1.id);
    expect(customer1.uniqueEmail).to.equal(uniqueEmail1);

    let customer2 = await payments.customers.find({
      email: {unique_email: uniqueEmail2, billing_email: billingEmail}
    });
    expect(customer2).to.exist;
    expect(customer2.stripeData.customer.id).to.equal(stripeCustomer2.id);
    expect(customer2.uniqueEmail).to.equal(uniqueEmail2);

    expect(customer1.stripeData.customer.id).to.not.equal(customer2.stripeData.customer.id);

  });

  it('retrieves current plan using object email after migration', async function () {

    this.timeout(10000);

    const uniqueEmail = `test+planmig_${ts}@instant.dev`;
    const billingEmail = `test+planbill_${ts}@instant.dev`;
    const emailObj = {unique_email: uniqueEmail, billing_email: billingEmail};

    // Create unmigrated customer, trigger migration via plan lookup
    await stripe.customers.create({
      email: uniqueEmail,
      metadata: {instpay: 'true'}
    });

    let planResult = await payments.plans.current({email: emailObj});

    expect(planResult).to.exist;
    expect(planResult.currentPlan).to.exist;
    expect(planResult.currentPlan.is_billable).to.equal(false);

  });

  it('updates billing email via updateEmail without altering unique email', async function () {

    this.timeout(10000);

    const uniqueEmail = `test+chgeml_${ts}@instant.dev`;
    const billingEmail = `test+chgbill_${ts}@instant.dev`;
    const newBillingEmail = `test+chgnew_${ts}@instant.dev`;

    // Create a customer with object email
    let customer = await payments.customers.find({
      email: {unique_email: uniqueEmail, billing_email: billingEmail}
    });

    expect(customer.stripeData.customer.email).to.equal(billingEmail);
    const customerId = customer.stripeData.customer.id;

    let updated = await payments.customers.updateEmail({
      email: {unique_email: uniqueEmail, billing_email: billingEmail},
      toEmail: newBillingEmail
    });

    expect(updated).to.exist;
    expect(updated.stripeData.customer.id).to.equal(customerId);
    expect(updated.email).to.equal(newBillingEmail);
    expect(updated.billingEmail).to.equal(newBillingEmail);
    expect(updated.uniqueEmail).to.equal(uniqueEmail);
    expect(updated.stripeData.customer.email).to.equal(newBillingEmail);
    expect(updated.stripeData.customer.metadata.instpay_unique_email).to.equal(uniqueEmail);

    // Verify lookup works with the new billing email
    let found = await payments.customers.find({
      email: {unique_email: uniqueEmail, billing_email: newBillingEmail}
    });

    expect(found.stripeData.customer.id).to.equal(customerId);
    expect(found.email).to.equal(newBillingEmail);

  });

};
