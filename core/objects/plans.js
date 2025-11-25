/**
 * payments.plans
 * List plans and find details about the customer's current plan
 */
class PlansObject {

  constructor (customerManager) {
    this.customerManager = customerManager;
  }

  /**
   * Lists all available plans by category
   * @param {string} account_type Account type to filter plans by
   * @returns {array} plans Available plans
   */
  async list ({ account_type = null } = {}) {

    if (account_type === null) {
      return this.customerManager.plans;
    } else {
      return this.customerManager.plans.filter(plan => plan.account_type === account_type || plan.account_type === '*');
    }

  }

  /**
   * Retrieves the plan a customer is currently subscribed to
   * @param {string} email Customer email address
   * @returns {object} planResult             Plan customer is currently subscribed to
   * @returns {object} planResult.currentPlan Current Subscription plan
   * @returns {array}  planResult.plans       All available plans
   */
  async current ({ email, account_type = null } = {}) {

    const customer = await this.customerManager.findCustomer(email);
    const plan = await customer.getCurrentPlan(this.customerManager.plans);
    const plans = account_type === null
      ? this.customerManager.plans
      : this.customerManager.plans.filter(plan => plan.account_type === account_type || plan.account_type === '*');
    return {
      currentPlan: plan,
      plans: plans
    };

  }

  /**
   * Retrieves the billing status of the current customer plan
   * @param {string} email Customer email address
   * @returns {object}  planResult                           Plan customer is currently subscribed to
   * @returns {object}  planResult.currentPlan               Current Subscription plan billable summary
   * @returns {boolean} planResult.currentPlan.is_billable   is the plan billable?
   * @returns {boolean} planResult.currentPlan.is_incomplete is the subscription complete?
   * @returns {boolean} planResult.currentPlan.is_past_due   is the subscription past due?
   * @returns {string}  planResult.currentPlan.invoice_url   URL of the invoice, if incomplete or past due
   */
  async billingStatus ({email}) {

    const customer = await this.customerManager.findCustomer(email);
    const subscription = await customer.getSubscription();

    const data = {
      currentPlan: {
        is_billable: !!subscription,
        is_incomplete: subscription ? subscription.status === 'incomplete' : false,
        is_past_due: subscription ? subscription.status === 'past_due' : false,
        invoice_url: null
      }
    };

    if (data.currentPlan.is_incomplete || data.currentPlan.is_past_due) {
      const latestInvoice = await customer.getLatestInvoice(subscription);
      data.currentPlan.invoice_url = latestInvoice.hosted_invoice_url;
    }

    return data;

  }

}

module.exports = PlansObject;