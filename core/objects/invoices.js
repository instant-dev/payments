/**
 * payments.invoices
 * List invoices and upcoming invoices
 */
class InvoicesObject {

  constructor (customerManager) {
    this.customerManager = customerManager;
  }

  /**
     * Lists all invoices for a customer
     * @param {string} email Customer email address
     * @returns {array} invoices
     */
  async list ({email}) {

    const customer = await this.customerManager.findCustomer(email);
    return customer.listInvoices();

  }

  /**
   * Retrieves the upcoming invoice for the current user
   * @param {string} email Customer email address
   * @returns {?object} upcomingInvoice
   */
  async upcoming ({email}) {

    const customer = await this.customerManager.findCustomer(email);
    return customer.getUpcomingInvoice();

  }

};

module.exports = InvoicesObject;