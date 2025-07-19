// Stripe configuration for account connection
export const STRIPE_CONFIG = {
  publishableKey: process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_TYooMQauvdEDq54NiTphI7jx', // Replace with your Stripe publishable key
  
  // For testing purposes - these would be real Stripe connected account flow in production
  connectUrls: {
    express: 'https://connect.stripe.com/express/oauth/authorize',
    standard: 'https://connect.stripe.com/oauth/authorize'
  }
};

// Mock Stripe API calls for development
export const mockStripeAPI = {
  // Simulate creating a connected account
  createAccount: async (accountType, userInfo) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id: `acct_${Math.random().toString(36).substr(2, 9)}`,
          type: accountType,
          email: userInfo.email,
          requirements: {
            currently_due: [],
            disabled_reason: null
          },
          charges_enabled: true,
          payouts_enabled: true
        });
      }, 2000);
    });
  },

  // Simulate linking a bank account
  linkBankAccount: async (accountId, bankInfo) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id: `ba_${Math.random().toString(36).substr(2, 9)}`,
          account: accountId,
          bank_name: bankInfo.bankName,
          last4: bankInfo.accountNumber.slice(-4),
          routing_number: bankInfo.routingNumber,
          status: 'verified'
        });
      }, 1500);
    });
  },

  // Simulate linking a card
  linkCard: async (accountId, cardInfo) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id: `card_${Math.random().toString(36).substr(2, 9)}`,
          account: accountId,
          brand: cardInfo.brand || 'visa',
          last4: cardInfo.number.slice(-4),
          exp_month: cardInfo.expMonth,
          exp_year: cardInfo.expYear,
          status: 'verified'
        });
      }, 1500);
    });
  }
};
