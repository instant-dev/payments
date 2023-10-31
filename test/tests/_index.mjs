import chai from 'chai';
const expect = chai.expect;

export const name = 'Main tests';
export default async function (setupResult) {

  it('should find true = true', () => {

    expect(true).to.equal(true);

  });

};
