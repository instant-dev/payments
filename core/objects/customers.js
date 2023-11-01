/**
 * payments.customers
 * Finds and modifies customers, including managing subscriptions
 */
class CustomersObject {

  constructor (customerManager) {
    this.customerManager = customerManager;
  }

  /**
   * Finds or creates a customer with provided email address
   * @param {string} email Customer email address
   * @returns {object} customer
   */
  async find (email) {
  
    let customer = await this.customerManager.findCustomer(email);
    return customer.toJSON();
  
  }

  /**
   * Subscribes to a plan by creating a Stripe checkout session
   * @param {string} email Customer email address
   * @param {string} planName The name of the plan you wish to subscribe to
   * @param {object} lineItemCounts An object containing key-value pairs mapping line item names to *purchased* quantities, if left empty line items will be adjusted automatically to match the new plan
   * @param {object} existingLineItemCounts An object containing key-value pairs mapping to existing line item counts, if provided they are used to validate if within plan limits
   * @param {string} successURL URL to redirect to if the checkout is successful
   * @param {string} cancelURL URL to redirect to if the checkout is cancelled
   * @returns {object} subscription
   */
  async subscribe (email, planName, lineItemCounts = null, existinglineItemCounts = null, successURL = null, cancelURL = null) {

    const customer = await this.customerManager.findCustomer(email);
    const response = await this.customerManager.subscribeCustomer(customer, planName, lineItemCounts, existinglineItemCounts, successURL, cancelURL);
    return {
      stripe_publish_key: this.customerManager.publishableKey,
      ...response
    };

  }

  /**
   * Unsubscribes from active plan
   * @param {string} email Customer email address
   * @param {object} existingLineItemCounts An object containing key-value pairs mapping to existing line item counts, if provided they are used to validate if within plan limits
   * @returns {boolean} canceled
   */
  async unsubscribe (email, existinglineItemCounts = null) {

    const customer = await this.customerManager.findCustomer(email);
    await this.customerManager.unsubscribeCustomer(customer, existinglineItemCounts);
    return true;

  }

};

module.exports = CustomersObject;