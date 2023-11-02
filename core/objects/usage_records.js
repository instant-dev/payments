/**
 * payments.usageRecords
 * Make changes to usage records
 */
class UsageRecordsObject {

  constructor (customerManager) {
    this.customerManager = customerManager;
  }

  /**
   * Creates a usage record for the customer
   * @param {string} email Customer email address
   * @param {string} lineItemName The name of the Line Item to record usage for
   * @param {float{0,2147483647}} quantity The quantity to record
   * @param {integer{-12,0}} log10Scale Scale factor in which to adjust quantity x 10^n
   * @param {integer{-10,0}} log2Scale Scale factor in which to adjust quantity x 2^n
   * @returns {object} usageRecord
   */
  async create ({email, lineItemName, quantity, log10Scale = 0, log2Scale = 0}) {

    const customer = await this.customerManager.findCustomer(email);
    return await this.customerManager.createCustomerUsageRecord(customer, lineItemName, quantity, log10Scale, log2Scale);

  }

}

module.exports = UsageRecordsObject;