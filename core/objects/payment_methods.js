/**
 * payments.paymentMethods
 * Make modifications and list payment methods using Stripe checkout
 */
class paymentMethodsObject {

  constructor (customerManager) {
    this.customerManager = customerManager;
  }

  /**
   * Creates a payment method using Stripe checkout
   * @param {string} email Customer email address
   * @param {string} successURL URL to redirect to if the payment method addition is successful
   * @param {string} cancelURL URL to redirect to if the payment method addition is cancelled
   * @returns {object} checkoutSession
   * @returns {string} checkoutSession.stripe_publish_key         Key to use for creating Stripe checkout sessions
   * @returns {string} checkoutSession.stripe_checkout_session_id Checkout session id for use with Stripe's frontend library
   */
  async create (email, successURL, cancelURL) {

    const customer = await this.customerManager.findCustomer(email);
    return {
      stripe_publish_key: this.customerManager.publishableKey,
      ...(await customer.createPaymentMethodSession(successURL, cancelURL)),
    };

  }

  /**
   * Lists all available payment methods for a customer
   * @param {string} email Customer email address
   * @returns {array} paymentMethods
   */
  async list (email) {

    const customer = await this.customerManager.findCustomer(email);
    return customer.listPaymentMethods(true);

  }

  /**
   * Removes a payment method and sets a new default payment method if none set
   * @param {string} email Customer email address
   * @param {string} paymentMethodId The Stripe ID of the payment method to remove
   * @returns {array} paymentMethods List of all existing payment methods
   */
  async remove (email, paymentMethodId) {

    const customer = await this.customerManager.findCustomer(email);
    return customer.removePaymentMethod(paymentMethodId, true);

  }

  /**
   * Changes a payment method to the default payment method for the customer
   * @param {string} email Customer email address
   * @param {string} paymentMethodId The Stripe ID of the payment method to remove
   * @returns {object} paymentMethod Payment method object created
   */
  async setDefault (email, paymentMethodId) {

    const customer = await this.customerManager.findCustomer(email);
    return customer.setDefaultPaymentMethod(paymentMethodId, true);

  }

}

module.exports = paymentMethodsObject;