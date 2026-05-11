import mongoose from 'mongoose';

const termsSectionSchema = new mongoose.Schema({
  number: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  }
});

const termsOfServiceSchema = new mongoose.Schema({
  termsOfServiceTitle: {
    type: String,
    default: 'Terms of Service',
    trim: true
  },
  termsOfServiceLastUpdated: {
    type: String,
    default: () => new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  },
  termsImportantNotice: {
    type: String,
    default: 'These Terms of Service govern your use of our website and services. By using our website, you acknowledge that you have read, understood, and agree to be bound by these terms.'
  },
  termsUserRequirements: [{
    type: String,
    default: [
      'You must be at least 18 years old to place an order',
      'Payment processing is handled by secure third-party providers',
      'All product images are for illustrative purposes only',
      'Shipping times are estimates and not guarantees',
      'We reserve the right to refuse service to anyone'
    ]
  }],
  termsSections: [termsSectionSchema],
  termsIntellectualProperty: {
    type: String,
    default: 'All content on this Website, including text, graphics, logos, images, and software, is the property of our company or its content suppliers and is protected by copyright and other intellectual property laws.'
  },
  termsLimitationLiability: {
    type: String,
    default: 'To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Website.'
  },
  termsChangesNotice: {
    type: String,
    default: 'We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the new Terms of Service on this page and updating the "Last updated" date.'
  },
  termsContactInfo: {
    type: String,
    default: 'Questions about the Terms of Service should be sent to us at the contact information provided in our website footer.'
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

const Terms = mongoose.model('Terms', termsOfServiceSchema);
export default Terms;